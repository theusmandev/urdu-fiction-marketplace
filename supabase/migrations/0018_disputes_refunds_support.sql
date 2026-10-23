-- =============================================================================
-- Migration 0018: Disputes, Refund Adjustments, Email Outbox, Reminders & Support
-- Step 5.2 Architecture & Security Definer Hardening
-- =============================================================================

-- 1. SCHEMA ADDITIONS ON EXISTING TABLES

-- 1a. platform_settings: Dispute wait hours and verification reminder hours
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'min_dispute_wait_hours'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD COLUMN min_dispute_wait_hours integer NOT NULL DEFAULT 24
            CHECK (min_dispute_wait_hours >= 0 AND min_dispute_wait_hours <= 168);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'verification_reminder_hours'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD COLUMN verification_reminder_hours integer NOT NULL DEFAULT 12
            CHECK (verification_reminder_hours >= 1 AND verification_reminder_hours <= 168);
    END IF;
END $$;

-- 2. NEW TABLES

-- 2a. dispute_messages: Multi-party discussion between reader, writer, and admin
CREATE TABLE IF NOT EXISTS public.dispute_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    author_role text NOT NULL CHECK (author_role IN ('reader', 'writer', 'admin')),
    body text NOT NULL CHECK (char_length(body) <= 2000 AND char_length(trim(body)) > 0),
    attachment_path text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON public.dispute_messages(dispute_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_author_time ON public.dispute_messages(author_id, created_at DESC);

ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;

-- 2b. refund_requests: Author or reader formal off-platform refund requests
CREATE TABLE IF NOT EXISTS public.refund_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    requester_role text NOT NULL CHECK (requester_role IN ('writer', 'reader')),
    reason text NOT NULL CHECK (char_length(trim(reason)) > 0),
    evidence_note text,
    evidence_path text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note text,
    reviewed_by uuid REFERENCES public.profiles(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index ensuring at most ONE pending request per order
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_pending_order
    ON public.refund_requests (order_id)
    WHERE (status = 'pending');

CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON public.refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_requester ON public.refund_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON public.refund_requests(status, created_at DESC);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- 2c. support_requests: Direct customer & writer support ticketing
CREATE TABLE IF NOT EXISTS public.support_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    category text NOT NULL CHECK (category IN ('order', 'payment', 'account', 'content', 'other')),
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    subject text NOT NULL CHECK (char_length(trim(subject)) > 0 AND char_length(subject) <= 120),
    body text NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 2000),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_requests_user ON public.support_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_requests_status ON public.support_requests(status, created_at DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

-- 2d. support_messages: Communication history on support requests
CREATE TABLE IF NOT EXISTS public.support_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.support_requests(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    author_role text NOT NULL CHECK (author_role IN ('reader', 'writer', 'admin')),
    body text NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_request ON public.support_messages(request_id, created_at ASC);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- 2e. notification_preferences: Email enablement settings per user
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    email_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- 2f. email_outbox: Asynchronous, audit-logged email transmission queue
CREATE TABLE IF NOT EXISTS public.email_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    template text NOT NULL,
    subject text NOT NULL,
    body_text text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    dedupe_key text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON public.email_outbox (created_at ASC) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_email_outbox_user ON public.email_outbox (user_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON public.email_outbox (status, created_at DESC);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. RLS POLICIES FOR NEW ENTITIES
-- -----------------------------------------------------------------------------

-- dispute_messages RLS: Participants & admins can view; insert via add_dispute_message RPC only
DROP POLICY IF EXISTS "dispute_messages_select_participants" ON public.dispute_messages;
CREATE POLICY "dispute_messages_select_participants" ON public.dispute_messages
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin() OR
        EXISTS (
            SELECT 1 FROM public.disputes d
            JOIN public.orders o ON o.id = d.order_id
            WHERE d.id = dispute_messages.dispute_id
              AND (o.reader_id = auth.uid() OR o.writer_id = auth.uid())
        )
    );

-- refund_requests RLS: Requester, order author, and admins can view
DROP POLICY IF EXISTS "refund_requests_select_policy" ON public.refund_requests;
CREATE POLICY "refund_requests_select_policy" ON public.refund_requests
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin() OR
        requested_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = refund_requests.order_id
              AND (o.reader_id = auth.uid() OR o.writer_id = auth.uid())
        )
    );

-- support_requests RLS: Owner and admins
DROP POLICY IF EXISTS "support_requests_select_policy" ON public.support_requests;
CREATE POLICY "support_requests_select_policy" ON public.support_requests
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin() OR user_id = auth.uid()
    );

-- support_messages RLS: Ticket owner and admins
DROP POLICY IF EXISTS "support_messages_select_policy" ON public.support_messages;
CREATE POLICY "support_messages_select_policy" ON public.support_messages
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin() OR
        EXISTS (
            SELECT 1 FROM public.support_requests sr
            WHERE sr.id = support_messages.request_id
              AND sr.user_id = auth.uid()
        )
    );

-- notification_preferences RLS: Owner can view and update own row
DROP POLICY IF EXISTS "notification_preferences_own_row" ON public.notification_preferences;
CREATE POLICY "notification_preferences_own_row" ON public.notification_preferences
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- email_outbox RLS: Admins only for inspection
DROP POLICY IF EXISTS "email_outbox_admin_only" ON public.email_outbox;
CREATE POLICY "email_outbox_admin_only" ON public.email_outbox
    FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. STORAGE POLICY ENHANCEMENTS FOR PAYMENT-PROOFS BUCKET
-- -----------------------------------------------------------------------------

-- Drop and recreate storage policies on payment-proofs to support dispute attachments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS "authenticated_dispute_proofs_upload" ON storage.objects;
        CREATE POLICY "authenticated_dispute_proofs_upload" ON storage.objects
            FOR INSERT
            TO authenticated
            WITH CHECK (
                bucket_id = 'payment-proofs' AND
                (
                    public.is_admin() OR
                    -- Dispute message attachment: folder matches dispute_id and user is participant
                    EXISTS (
                        SELECT 1 FROM public.disputes d
                        JOIN public.orders o ON o.id = d.order_id
                        WHERE d.id::text = (storage.foldername(name))[1]
                          AND (o.reader_id = auth.uid() OR o.writer_id = auth.uid())
                    ) OR
                    -- Refund request evidence: folder matches order_id and user is participant
                    EXISTS (
                        SELECT 1 FROM public.orders o
                        WHERE o.id::text = (storage.foldername(name))[1]
                          AND (o.reader_id = auth.uid() OR o.writer_id = auth.uid())
                    )
                )
            );

        DROP POLICY IF EXISTS "authenticated_dispute_proofs_select" ON storage.objects;
        CREATE POLICY "authenticated_dispute_proofs_select" ON storage.objects
            FOR SELECT
            TO authenticated
            USING (
                bucket_id = 'payment-proofs' AND
                (
                    public.is_admin() OR
                    EXISTS (
                        SELECT 1 FROM public.disputes d
                        JOIN public.orders o ON o.id = d.order_id
                        WHERE d.id::text = (storage.foldername(name))[1]
                          AND (o.reader_id = auth.uid() OR o.writer_id = auth.uid())
                    ) OR
                    EXISTS (
                        SELECT 1 FROM public.orders o
                        WHERE o.id::text = (storage.foldername(name))[1]
                          AND (o.reader_id = auth.uid() OR o.writer_id = auth.uid())
                    )
                )
            );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. EMAIL OUTBOX HELPER (enqueue_email_for_notification)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_email_for_notification(
    p_user_id uuid,
    p_template text,
    p_subject text,
    p_body_text text,
    p_dedupe_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user record;
    v_prefs record;
    v_is_critical boolean;
    v_outbox_id uuid;
    v_status text := 'pending';
BEGIN
    -- 1. Check user exists, active, and has confirmed email
    SELECT id, email, is_active INTO v_user
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_user.id IS NULL OR coalesce(v_user.is_active, true) = false THEN
        RETURN NULL;
    END IF;

    -- 2. Determine if event is critical
    -- Critical events are always sent even if user turned general emails off
    v_is_critical := p_template IN (
        'payment_verified',
        'payment_rejected',
        'invoice_issued',
        'invoice_overdue',
        'dispute_opened',
        'dispute_message',
        'dispute_resolved',
        'refund_approved',
        'refund_rejected',
        'writer_approved',
        'writer_rejected',
        'novel_approved',
        'novel_rejected'
    );

    -- 3. Check notification preferences
    SELECT email_enabled INTO v_prefs
    FROM public.notification_preferences
    WHERE user_id = p_user_id;

    IF v_prefs.email_enabled IS FALSE AND NOT v_is_critical THEN
        v_status := 'skipped';
    END IF;

    -- 4. Deduplication: Check if dedupe_key already exists
    IF p_dedupe_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = p_dedupe_key) THEN
            RETURN NULL;
        END IF;
    END IF;

    -- 5. Insert into outbox
    INSERT INTO public.email_outbox (
        user_id,
        template,
        subject,
        body_text,
        status,
        dedupe_key,
        created_at
    ) VALUES (
        p_user_id,
        p_template,
        p_subject,
        p_body_text,
        v_status,
        p_dedupe_key,
        now()
    )
    RETURNING id INTO v_outbox_id;

    RETURN v_outbox_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_email_for_notification(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_email_for_notification(uuid, text, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. HARDENED open_dispute RPC (WITH MIN_DISPUTE_WAIT_HOURS ENFORCEMENT)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_dispute(
    p_order_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_dispute_id uuid;
    v_notify_target uuid;
    v_window_days integer;
    v_min_wait_hours integer;
    v_reference_time timestamptz;
    v_submission_time timestamptz;
    v_elapsed_hours numeric;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A clear dispute reason is required.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.reader_id != v_caller_id AND v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only participants in this transaction can open a dispute.';
    END IF;

    -- Allow only for orders in payment_submitted, rejected, or verified
    IF v_order.status NOT IN ('payment_submitted', 'rejected', 'verified') THEN
        RAISE EXCEPTION 'Disputes can only be opened for orders in payment_submitted, rejected, or verified status (current status: %).', v_order.status;
    END IF;

    -- Fetch platform settings
    SELECT dispute_window_days, min_dispute_wait_hours
    INTO v_window_days, v_min_wait_hours
    FROM public.platform_settings
    WHERE id = 1;

    v_window_days := coalesce(v_window_days, 30);
    v_min_wait_hours := coalesce(v_min_wait_hours, 24);

    -- 1. Enforce minimum dispute wait time on payment_submitted orders
    IF v_order.status = 'payment_submitted' AND NOT public.is_admin() THEN
        SELECT created_at INTO v_submission_time
        FROM public.payment_submissions
        WHERE order_id = p_order_id
        ORDER BY created_at DESC
        LIMIT 1;

        v_submission_time := coalesce(v_submission_time, v_order.created_at);
        v_elapsed_hours := extract(epoch FROM (now() - v_submission_time)) / 3600.0;

        IF v_elapsed_hours < v_min_wait_hours THEN
            RAISE EXCEPTION 'Please wait at least % hours after payment submission to give the author time to verify the deposit (elapsed: % hours).',
                v_min_wait_hours, round(v_elapsed_hours, 1);
        END IF;
    END IF;

    -- 2. Enforce dispute window on verified orders
    IF v_order.status = 'verified' THEN
        v_reference_time := coalesce(v_order.verified_at, v_order.created_at);
        IF v_reference_time < (now() - (v_window_days || ' days')::interval) THEN
            RAISE EXCEPTION 'The dispute window for this order has expired (% days limit).', v_window_days;
        END IF;
    END IF;

    -- 3. De-duplicate: Ensure no open dispute exists
    IF EXISTS (
        SELECT 1 FROM public.disputes
        WHERE order_id = p_order_id AND status IN ('open', 'under_review')
    ) THEN
        RAISE EXCEPTION 'An open dispute already exists for this order.';
    END IF;

    -- 4. Create dispute record
    INSERT INTO public.disputes (
        order_id,
        raised_by_id,
        opened_by,
        reason,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        v_caller_id,
        v_caller_id,
        trim(p_reason),
        'open',
        now(),
        now()
    )
    RETURNING id INTO v_dispute_id;

    -- Update order status if payment_submitted or rejected
    IF v_order.status IN ('payment_submitted', 'rejected') THEN
        UPDATE public.orders
        SET status = 'disputed',
            updated_at = now()
        WHERE id = p_order_id;
    ELSE
        UPDATE public.orders
        SET updated_at = now()
        WHERE id = p_order_id;
    END IF;

    -- Notification & Email to other party
    v_notify_target := CASE WHEN v_caller_id = v_order.reader_id THEN v_order.writer_id ELSE v_order.reader_id END;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_notify_target,
        'dispute_opened',
        'Dispute Opened on Order #' || v_order.order_number,
        'A formal dispute has been raised regarding order #' || v_order.order_number || '. Please review and respond with evidence.',
        trim(p_reason),
        '/disputes/' || v_dispute_id,
        jsonb_build_object('order_id', p_order_id, 'dispute_id', v_dispute_id),
        false,
        now()
    );

    PERFORM public.enqueue_email_for_notification(
        v_notify_target,
        'dispute_opened',
        'Action Required: Dispute Opened on Order #' || v_order.order_number,
        'A formal dispute has been opened for order #' || v_order.order_number || '. Reason: ' || trim(p_reason) || E'\n\nPlease visit your dashboard to inspect evidence and respond.'
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        CASE WHEN public.is_admin() THEN 'admin' WHEN v_caller_id = v_order.writer_id THEN 'writer' ELSE 'reader' END,
        'open_dispute',
        'dispute',
        v_dispute_id,
        jsonb_build_object('order_id', p_order_id, 'reason', p_reason),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'dispute_id', v_dispute_id,
        'order_id', p_order_id,
        'status', 'open'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. DISPUTE MESSAGING RPC (add_dispute_message)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_dispute_message(
    p_dispute_id uuid,
    p_body text,
    p_attachment_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_dispute record;
    v_order record;
    v_role text;
    v_message_id uuid;
    v_notify_target uuid;
    v_recent_msg_count integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_body IS NULL OR trim(p_body) = '' THEN
        RAISE EXCEPTION 'Message body cannot be empty.';
    END IF;

    IF char_length(p_body) > 2000 THEN
        RAISE EXCEPTION 'Message body cannot exceed 2000 characters.';
    END IF;

    -- Validate dispute
    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_dispute.order_id;

    -- Determine caller role and authorize
    IF public.is_admin() THEN
        v_role := 'admin';
    ELSIF v_caller_id = v_order.reader_id THEN
        v_role := 'reader';
    ELSIF v_caller_id = v_order.writer_id THEN
        v_role := 'writer';
    ELSE
        RAISE EXCEPTION 'Unauthorized: Only participants in this dispute or administrators can post messages.';
    END IF;

    -- Validate attachment path: must start with dispute_id/
    IF p_attachment_path IS NOT NULL AND trim(p_attachment_path) != '' THEN
        IF NOT (p_attachment_path LIKE (p_dispute_id::text || '/%')) THEN
            RAISE EXCEPTION 'Attachment path must be within the dispute folder (%/...).', p_dispute_id;
        END IF;
    END IF;

    -- Rate limiting: Max 20 messages per user per hour
    SELECT count(*) INTO v_recent_msg_count
    FROM public.dispute_messages
    WHERE author_id = v_caller_id AND created_at > now() - interval '1 hour';

    IF v_recent_msg_count >= 20 THEN
        RAISE EXCEPTION 'Rate limit exceeded: You cannot post more than 20 dispute messages per hour.';
    END IF;

    -- Insert message
    INSERT INTO public.dispute_messages (
        dispute_id,
        author_id,
        author_role,
        body,
        attachment_path,
        created_at
    ) VALUES (
        p_dispute_id,
        v_caller_id,
        v_role,
        trim(p_body),
        nullif(trim(p_attachment_path), ''),
        now()
    )
    RETURNING id INTO v_message_id;

    -- If dispute was open and message author is admin, move status to under_review
    IF v_role = 'admin' AND v_dispute.status = 'open' THEN
        UPDATE public.disputes
        SET status = 'under_review',
            updated_at = now()
        WHERE id = p_dispute_id;
    ELSE
        UPDATE public.disputes
        SET updated_at = now()
        WHERE id = p_dispute_id;
    END IF;

    -- Notify the other participant(s)
    IF v_role = 'reader' THEN
        v_notify_target := v_order.writer_id;
    ELSIF v_role = 'writer' THEN
        v_notify_target := v_order.reader_id;
    ELSE
        -- Admin: notify both reader and writer
        v_notify_target := v_order.reader_id;
        INSERT INTO public.notifications (
            user_id, type, title, message, body, link, entity_refs, is_read, created_at
        ) VALUES (
            v_order.writer_id,
            'dispute_message',
            'Support message on Order #' || v_order.order_number,
            'An administrator added a message to your dispute thread.',
            substring(trim(p_body) from 1 for 150),
            '/writer/disputes/' || p_dispute_id,
            jsonb_build_object('dispute_id', p_dispute_id, 'order_id', v_order.id),
            false,
            now()
        );
    END IF;

    IF v_notify_target IS NOT NULL THEN
        INSERT INTO public.notifications (
            user_id, type, title, message, body, link, entity_refs, is_read, created_at
        ) VALUES (
            v_notify_target,
            'dispute_message',
            'New message on Dispute #' || substring(p_dispute_id::text from 1 for 8),
            'A new message was posted regarding order #' || v_order.order_number || '.',
            substring(trim(p_body) from 1 for 150),
            CASE WHEN v_notify_target = v_order.writer_id THEN '/writer/disputes/' || p_dispute_id ELSE '/disputes/' || p_dispute_id END,
            jsonb_build_object('dispute_id', p_dispute_id, 'order_id', v_order.id),
            false,
            now()
        );

        PERFORM public.enqueue_email_for_notification(
            v_notify_target,
            'dispute_message',
            'New message on Order #' || v_order.order_number || ' Dispute',
            'A new message has been posted to your dispute thread for order #' || v_order.order_number || E'.\n\nPlease visit the platform to review and reply.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_message_id,
        'dispute_id', p_dispute_id,
        'author_role', v_role,
        'created_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_dispute_message(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_dispute_message(uuid, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. ATOMIC DISPUTE RESOLUTION OUTCOMES (ADMIN ONLY)
-- -----------------------------------------------------------------------------

-- 8a. resolve_dispute_for_reader_verify: Payment confirmed real; force-verifies order
CREATE OR REPLACE FUNCTION public.resolve_dispute_for_reader_verify(
    p_dispute_id uuid,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_dispute record;
    v_order record;
    v_submission record;
    v_writer record;
    v_settings record;
    v_rate numeric(5,2);
    v_commission_pkr numeric(10,2);
    v_writer_share_pkr numeric(10,2);
    v_entitlement_id uuid;
    v_ledger_id uuid;
    v_new_unpaid numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can resolve disputes.';
    END IF;

    IF p_note IS NULL OR trim(p_note) = '' THEN
        RAISE EXCEPTION 'A mandatory administrative justification note is required to verify reader payment.';
    END IF;

    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    IF v_dispute.status NOT IN ('open', 'under_review') THEN
        RAISE EXCEPTION 'Dispute is already resolved (status: %).', v_dispute.status;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_dispute.order_id
    FOR UPDATE;

    IF v_order.status NOT IN ('payment_submitted', 'rejected', 'disputed') THEN
        RAISE EXCEPTION 'Order cannot be verified in current status: %', v_order.status;
    END IF;

    -- Invariant: Reader must not already hold active entitlement
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id
          AND novel_id = v_order.novel_id
          AND is_revoked = false
    ) THEN
        RAISE EXCEPTION 'Reader already holds an active entitlement for this novel.';
    END IF;

    -- Invariant: A sale_verified ledger row must not already exist
    IF EXISTS (
        SELECT 1 FROM public.sales_ledger
        WHERE order_id = v_order.id AND entry_type = 'sale_verified'
    ) THEN
        RAISE EXCEPTION 'A sale_verified ledger entry already exists for this order.';
    END IF;

    -- Latest submission
    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE order_id = v_order.id
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);
    v_commission_pkr := round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update submission
    IF v_submission.id IS NOT NULL THEN
        UPDATE public.payment_submissions
        SET reviewer_status = 'verified',
            reviewer_note = 'Dispute verified: ' || trim(p_note),
            reviewed_by = v_caller_id,
            reviewed_at = now()
        WHERE id = v_submission.id;
    END IF;

    -- 2. Update order
    UPDATE public.orders
    SET status = 'verified',
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        verified_at = now(),
        updated_at = now()
    WHERE id = v_order.id;

    -- 3. Create purchase entitlement
    INSERT INTO public.purchase_entitlements (
        reader_id,
        novel_id,
        order_id,
        created_at
    ) VALUES (
        v_order.reader_id,
        v_order.novel_id,
        v_order.id,
        now()
    )
    RETURNING id INTO v_entitlement_id;

    -- 4. Create immutable sales ledger row
    INSERT INTO public.sales_ledger (
        order_id,
        writer_id,
        reader_id,
        novel_id,
        entry_type,
        gross_amount_pkr,
        commission_rate,
        platform_commission_pkr,
        writer_net_pkr,
        notes,
        created_at
    ) VALUES (
        v_order.id,
        v_order.writer_id,
        v_order.reader_id,
        v_order.novel_id,
        'sale_verified',
        v_order.amount_pkr,
        v_rate,
        v_commission_pkr,
        v_writer_share_pkr,
        'Verified via dispute resolution: ' || trim(p_note),
        now()
    )
    RETURNING id INTO v_ledger_id;

    -- 5. Reconcile author commission
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    -- 6. Close dispute
    UPDATE public.disputes
    SET status = 'resolved_for_reader',
        resolution_note = trim(p_note),
        admin_resolution_notes = trim(p_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = now(),
        updated_at = now()
    WHERE id = p_dispute_id;

    -- 7. Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'resolve_dispute_for_reader_verify', 'dispute', p_dispute_id,
        jsonb_build_object('order_id', v_order.id, 'entitlement_id', v_entitlement_id, 'ledger_id', v_ledger_id, 'note', p_note),
        now()
    );

    -- 8. Notifications & Emails to reader and writer
    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_order.reader_id,
        'dispute_resolved',
        'Dispute Resolved: Payment Verified',
        'Your dispute on order #' || v_order.order_number || ' has been resolved. Payment was verified and access to the novel is unlocked.',
        trim(p_note),
        '/library',
        jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', 'resolved_for_reader'),
        false,
        now()
    );

    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_order.writer_id,
        'dispute_resolved',
        'Dispute Resolved: Order Verified by Admin',
        'The administrator verified payment for order #' || v_order.order_number || '. Chapter access has been granted and platform commission accrued.',
        trim(p_note),
        '/writer/orders',
        jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', 'resolved_for_reader'),
        false,
        now()
    );

    PERFORM public.enqueue_email_for_notification(
        v_order.reader_id,
        'payment_verified',
        'Access Granted: Order #' || v_order.order_number || ' Verified',
        'Your payment dispute for order #' || v_order.order_number || ' was verified by the platform. You now have full access to read the novel in your library.'
    );

    PERFORM public.enqueue_email_for_notification(
        v_order.writer_id,
        'dispute_resolved',
        'Dispute Resolved: Order #' || v_order.order_number || ' Verified',
        'The platform has verified payment for order #' || v_order.order_number || '. Note: ' || trim(p_note)
    );

    RETURN jsonb_build_object(
        'success', true,
        'dispute_id', p_dispute_id,
        'order_id', v_order.id,
        'outcome', 'resolved_for_reader_verify',
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_dispute_for_reader_verify(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute_for_reader_verify(uuid, text) TO authenticated;

-- 8b. resolve_dispute_refund: Author returned money off-platform; records ledger adjustment & revokes access
CREATE OR REPLACE FUNCTION public.resolve_dispute_refund(
    p_dispute_id uuid,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_dispute record;
    v_order record;
    v_orig_ledger record;
    v_adj_id uuid;
    v_new_unpaid numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can record dispute refund adjustments.';
    END IF;

    IF p_note IS NULL OR trim(p_note) = '' THEN
        RAISE EXCEPTION 'A mandatory administrative note is required for refund resolution.';
    END IF;

    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    IF v_dispute.status NOT IN ('open', 'under_review') THEN
        RAISE EXCEPTION 'Dispute is already resolved (status: %).', v_dispute.status;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_dispute.order_id
    FOR UPDATE;

    -- Only VERIFIED orders can receive a refund adjustment
    IF v_order.status != 'verified' THEN
        RAISE EXCEPTION 'Only verified orders can be refunded (current status: %).', v_order.status;
    END IF;

    -- Fetch original verified ledger entry
    SELECT * INTO v_orig_ledger
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified';

    IF v_orig_ledger.id IS NULL THEN
        RAISE EXCEPTION 'Original sale_verified ledger entry not found for order: %', v_order.id;
    END IF;

    -- Guard against duplicate refunds
    IF EXISTS (
        SELECT 1 FROM public.sales_ledger
        WHERE order_id = v_order.id AND entry_type = 'refund_adjustment'
    ) THEN
        RAISE EXCEPTION 'A refund adjustment has already been recorded for this order.';
    END IF;

    -- 1. Insert negative reversal in sales_ledger
    INSERT INTO public.sales_ledger (
        order_id,
        writer_id,
        reader_id,
        novel_id,
        entry_type,
        gross_amount_pkr,
        commission_rate,
        platform_commission_pkr,
        writer_net_pkr,
        original_ledger_entry_id,
        notes,
        created_at
    ) VALUES (
        v_order.id,
        v_order.writer_id,
        v_order.reader_id,
        v_order.novel_id,
        'refund_adjustment',
        -1 * v_orig_ledger.gross_amount_pkr,
        v_orig_ledger.commission_rate,
        -1 * v_orig_ledger.platform_commission_pkr,
        -1 * v_orig_ledger.writer_net_pkr,
        v_orig_ledger.id,
        'Dispute refund adjustment: ' || trim(p_note),
        now()
    )
    RETURNING id INTO v_adj_id;

    -- 2. Revoke active purchase entitlement
    UPDATE public.purchase_entitlements
    SET is_revoked = true,
        revoked_reason = 'Dispute refund: ' || trim(p_note)
    WHERE order_id = v_order.id;

    -- 3. Update order status to refunded_adjusted
    UPDATE public.orders
    SET status = 'refunded_adjusted',
        updated_at = now()
    WHERE id = v_order.id;

    -- 4. Reconcile author commission
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    -- 5. Close dispute
    UPDATE public.disputes
    SET status = 'resolved_for_reader',
        resolution_note = trim(p_note),
        admin_resolution_notes = trim(p_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = now(),
        updated_at = now()
    WHERE id = p_dispute_id;

    -- 6. Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'resolve_dispute_refund', 'dispute', p_dispute_id,
        jsonb_build_object('order_id', v_order.id, 'adjustment_id', v_adj_id, 'note', p_note),
        now()
    );

    -- 7. Notifications & Emails
    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_order.reader_id,
        'dispute_resolved',
        'Dispute Resolved: Refund Recorded',
        'The refund for order #' || v_order.order_number || ' has been approved. Reading access has been removed.',
        trim(p_note),
        '/orders',
        jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', 'resolved_for_reader'),
        false,
        now()
    );

    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_order.writer_id,
        'dispute_resolved',
        'Refund Adjustment Processed for Order #' || v_order.order_number,
        'A negative commission adjustment of PKR ' || v_orig_ledger.platform_commission_pkr || ' was applied to your ledger. Reading access for the reader was revoked.',
        trim(p_note),
        '/writer/earnings',
        jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', 'resolved_for_reader'),
        false,
        now()
    );

    PERFORM public.enqueue_email_for_notification(
        v_order.reader_id,
        'dispute_resolved',
        'Refund Processed for Order #' || v_order.order_number,
        'Your dispute has been resolved with a refund adjustment. Reading access has been removed. Note: ' || trim(p_note)
    );

    PERFORM public.enqueue_email_for_notification(
        v_order.writer_id,
        'dispute_resolved',
        'Commission Credit Applied: Order #' || v_order.order_number || ' Refunded',
        'Order #' || v_order.order_number || ' has been recorded as refunded. Platform commission has been credited back to your balance.'
    );

    RETURN jsonb_build_object(
        'success', true,
        'dispute_id', p_dispute_id,
        'order_id', v_order.id,
        'outcome', 'resolve_dispute_refund',
        'adjustment_id', v_adj_id,
        'new_unpaid_commission_pkr', v_new_unpaid
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_dispute_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute_refund(uuid, text) TO authenticated;

-- 8c. resolve_dispute_for_writer: Payment claim unproven; leaves order rejected
CREATE OR REPLACE FUNCTION public.resolve_dispute_for_writer(
    p_dispute_id uuid,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_dispute record;
    v_order record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can resolve disputes.';
    END IF;

    IF p_note IS NULL OR trim(p_note) = '' THEN
        RAISE EXCEPTION 'A mandatory administrative note is required to resolve in favor of writer.';
    END IF;

    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    IF v_dispute.status NOT IN ('open', 'under_review') THEN
        RAISE EXCEPTION 'Dispute is already resolved (status: %).', v_dispute.status;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_dispute.order_id
    FOR UPDATE;

    -- If order was disputed from payment_submitted/rejected, transition to rejected
    IF v_order.status = 'disputed' THEN
        UPDATE public.orders
        SET status = 'rejected',
            rejected_reason = 'Dispute resolved in favor of writer: ' || trim(p_note),
            updated_at = now()
        WHERE id = v_order.id;
    ELSE
        UPDATE public.orders
        SET updated_at = now()
        WHERE id = v_order.id;
    END IF;

    -- Close dispute
    UPDATE public.disputes
    SET status = 'resolved_for_writer',
        resolution_note = trim(p_note),
        admin_resolution_notes = trim(p_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = now(),
        updated_at = now()
    WHERE id = p_dispute_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'resolve_dispute_for_writer', 'dispute', p_dispute_id,
        jsonb_build_object('order_id', v_order.id, 'note', p_note),
        now()
    );

    -- Notifications & Emails
    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_order.reader_id,
        'dispute_resolved',
        'Dispute Resolved: Claim Unconfirmed',
        'Your dispute on order #' || v_order.order_number || ' was reviewed. The proof was insufficient or payment was not received.',
        trim(p_note),
        '/orders',
        jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', 'resolved_for_writer'),
        false,
        now()
    );

    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_order.writer_id,
        'dispute_resolved',
        'Dispute Resolved in Your Favor',
        'The dispute for order #' || v_order.order_number || ' has been closed in your favor.',
        trim(p_note),
        '/writer/orders',
        jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', 'resolved_for_writer'),
        false,
        now()
    );

    PERFORM public.enqueue_email_for_notification(
        v_order.reader_id,
        'dispute_resolved',
        'Dispute Closed: Order #' || v_order.order_number,
        'Your dispute regarding order #' || v_order.order_number || ' was closed following administrator review. Note: ' || trim(p_note)
    );

    RETURN jsonb_build_object(
        'success', true,
        'dispute_id', p_dispute_id,
        'order_id', v_order.id,
        'outcome', 'resolved_for_writer'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_dispute_for_writer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute_for_writer(uuid, text) TO authenticated;

-- 8d. close_dispute: Dismisses dispute without outcome
CREATE OR REPLACE FUNCTION public.close_dispute(
    p_dispute_id uuid,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_dispute record;
    v_order record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can close disputes.';
    END IF;

    IF p_note IS NULL OR trim(p_note) = '' THEN
        RAISE EXCEPTION 'A mandatory note is required to close a dispute.';
    END IF;

    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    IF v_dispute.status NOT IN ('open', 'under_review') THEN
        RAISE EXCEPTION 'Dispute is already closed (status: %).', v_dispute.status;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_dispute.order_id
    FOR UPDATE;

    IF v_order.status = 'disputed' THEN
        UPDATE public.orders
        SET status = 'rejected',
            rejected_reason = 'Dispute closed without resolution: ' || trim(p_note),
            updated_at = now()
        WHERE id = v_order.id;
    END IF;

    UPDATE public.disputes
    SET status = 'closed',
        resolution_note = trim(p_note),
        admin_resolution_notes = trim(p_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = now(),
        updated_at = now()
    WHERE id = p_dispute_id;

    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'close_dispute', 'dispute', p_dispute_id,
        jsonb_build_object('order_id', v_order.id, 'note', p_note),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'dispute_id', p_dispute_id,
        'status', 'closed'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_dispute(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. DISPUTES INSPECTION RPCS (NO EMAILS EXPOSED)
-- -----------------------------------------------------------------------------

-- 9a. get_my_disputes: Participants listing
CREATE OR REPLACE FUNCTION public.get_my_disputes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_res jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'dispute_id', d.id,
                'order_id', o.id,
                'order_number', o.order_number,
                'novel_title', o.novel_title_snapshot,
                'amount_pkr', o.amount_pkr,
                'status', d.status,
                'reason', d.reason,
                'resolution_note', d.resolution_note,
                'resolved_at', d.resolved_at,
                'created_at', d.created_at,
                'is_opened_by_me', (d.raised_by_id = v_caller_id),
                'other_party_name', CASE
                    WHEN v_caller_id = o.reader_id THEN wp.pen_name_english
                    ELSE coalesce(p_reader.full_name, 'Reader')
                END,
                'messages_count', (
                    SELECT count(*) FROM public.dispute_messages dm WHERE dm.dispute_id = d.id
                ),
                'last_message_at', (
                    SELECT max(created_at) FROM public.dispute_messages dm WHERE dm.dispute_id = d.id
                )
            )
            ORDER BY d.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_res
    FROM public.disputes d
    JOIN public.orders o ON o.id = d.order_id
    JOIN public.writer_profiles wp ON wp.id = o.writer_id
    JOIN public.profiles p_reader ON p_reader.id = o.reader_id
    WHERE o.reader_id = v_caller_id OR o.writer_id = v_caller_id;

    RETURN v_res;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_disputes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_disputes() TO authenticated;

-- 9b. get_dispute: Participant & admin single dispute inspector
CREATE OR REPLACE FUNCTION public.get_dispute(
    p_dispute_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_dispute record;
    v_order record;
    v_messages jsonb;
    v_submissions jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    SELECT o.*,
           wp.pen_name_english,
           wp.pen_name_urdu,
           coalesce(p.full_name, 'Reader') AS reader_display_name
    INTO v_order
    FROM public.orders o
    JOIN public.writer_profiles wp ON wp.id = o.writer_id
    JOIN public.profiles p ON p.id = o.reader_id
    WHERE o.id = v_dispute.order_id;

    IF NOT public.is_admin() AND v_order.reader_id != v_caller_id AND v_order.writer_id != v_caller_id THEN
        RAISE EXCEPTION 'Unauthorized: You are not a participant in this dispute.';
    END IF;

    -- Fetch messages
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', dm.id,
                'author_id', dm.author_id,
                'author_role', dm.author_role,
                'author_name', CASE
                    WHEN dm.author_role = 'admin' THEN 'UNB Support'
                    WHEN dm.author_id = v_order.writer_id THEN v_order.pen_name_english
                    ELSE v_order.reader_display_name
                END,
                'body', dm.body,
                'attachment_path', dm.attachment_path,
                'created_at', dm.created_at,
                'is_by_me', (dm.author_id = v_caller_id)
            )
            ORDER BY dm.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_messages
    FROM public.dispute_messages dm
    WHERE dm.dispute_id = p_dispute_id;

    -- Fetch payment submissions on this order (for evidence inspection)
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', ps.id,
                'transaction_reference_tid', ps.transaction_reference_tid,
                'screenshot_url', ps.screenshot_url,
                'paid_amount_claimed_pkr', ps.paid_amount_claimed_pkr,
                'sender_account_name', ps.sender_account_name,
                'reader_note', ps.reader_note,
                'reviewer_status', ps.reviewer_status,
                'reviewer_note', ps.reviewer_note,
                'created_at', ps.created_at
            )
            ORDER BY ps.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_submissions
    FROM public.payment_submissions ps
    WHERE ps.order_id = v_order.id;

    RETURN jsonb_build_object(
        'dispute', jsonb_build_object(
            'id', v_dispute.id,
            'status', v_dispute.status,
            'reason', v_dispute.reason,
            'resolution_note', v_dispute.resolution_note,
            'admin_resolution_notes', CASE WHEN public.is_admin() THEN v_dispute.admin_resolution_notes ELSE NULL END,
            'resolved_at', v_dispute.resolved_at,
            'created_at', v_dispute.created_at,
            'updated_at', v_dispute.updated_at
        ),
        'order', jsonb_build_object(
            'id', v_order.id,
            'order_number', v_order.order_number,
            'novel_title', v_order.novel_title_snapshot,
            'amount_pkr', v_order.amount_pkr,
            'status', v_order.status,
            'reader_display_name', v_order.reader_display_name,
            'writer_pen_name', v_order.pen_name_english,
            'writer_pen_name_urdu', v_order.pen_name_urdu,
            'created_at', v_order.created_at,
            'verified_at', v_order.verified_at
        ),
        'messages', v_messages,
        'submissions', v_submissions,
        'caller_role', CASE
            WHEN public.is_admin() THEN 'admin'
            WHEN v_caller_id = v_order.writer_id THEN 'writer'
            ELSE 'reader'
        END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dispute(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dispute(uuid) TO authenticated;

-- 9c. admin_list_disputes: Paginated admin dispute inspection
CREATE OR REPLACE FUNCTION public.admin_list_disputes(
    p_status text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 25,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_total integer;
    v_disputes jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only administrators can list disputes.';
    END IF;

    SELECT count(*) INTO v_total
    FROM public.disputes d
    JOIN public.orders o ON o.id = d.order_id
    JOIN public.writer_profiles wp ON wp.id = o.writer_id
    JOIN public.profiles pr ON pr.id = o.reader_id
    WHERE (
        p_status IS NULL OR p_status = 'all' OR
        (p_status = 'open' AND d.status = 'open') OR
        (p_status = 'under_review' AND d.status = 'under_review') OR
        (p_status = 'active' AND d.status IN ('open', 'under_review')) OR
        (p_status = 'resolved' AND d.status IN ('resolved_for_reader', 'resolved_for_writer', 'closed'))
    )
    AND (
        p_search IS NULL OR trim(p_search) = '' OR
        o.order_number ILIKE ('%' || trim(p_search) || '%') OR
        wp.pen_name_english ILIKE ('%' || trim(p_search) || '%') OR
        wp.pen_name_urdu ILIKE ('%' || trim(p_search) || '%') OR
        pr.full_name ILIKE ('%' || trim(p_search) || '%')
    );

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'dispute_id', d.id,
                'order_id', o.id,
                'order_number', o.order_number,
                'novel_title', o.novel_title_snapshot,
                'amount_pkr', o.amount_pkr,
                'status', d.status,
                'reason', d.reason,
                'resolution_note', d.resolution_note,
                'resolved_at', d.resolved_at,
                'created_at', d.created_at,
                'writer_pen_name', wp.pen_name_english,
                'reader_name', coalesce(pr.full_name, 'Reader'),
                'messages_count', (
                    SELECT count(*) FROM public.dispute_messages dm WHERE dm.dispute_id = d.id
                ),
                'is_stuck', (
                    d.status IN ('open', 'under_review') AND d.created_at < now() - interval '3 days'
                )
            )
            ORDER BY d.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_disputes
    FROM (
        SELECT d.*, o.order_number, o.novel_title_snapshot, o.amount_pkr, o.writer_id, o.reader_id
        FROM public.disputes d
        JOIN public.orders o ON o.id = d.order_id
        JOIN public.writer_profiles wp ON wp.id = o.writer_id
        JOIN public.profiles pr ON pr.id = o.reader_id
        WHERE (
            p_status IS NULL OR p_status = 'all' OR
            (p_status = 'open' AND d.status = 'open') OR
            (p_status = 'under_review' AND d.status = 'under_review') OR
            (p_status = 'active' AND d.status IN ('open', 'under_review')) OR
            (p_status = 'resolved' AND d.status IN ('resolved_for_reader', 'resolved_for_writer', 'closed'))
        )
        AND (
            p_search IS NULL OR trim(p_search) = '' OR
            o.order_number ILIKE ('%' || trim(p_search) || '%') OR
            wp.pen_name_english ILIKE ('%' || trim(p_search) || '%') OR
            wp.pen_name_urdu ILIKE ('%' || trim(p_search) || '%') OR
            pr.full_name ILIKE ('%' || trim(p_search) || '%')
        )
        ORDER BY d.created_at ASC
        LIMIT coalesce(p_limit, 25)
        OFFSET coalesce(p_offset, 0)
    ) d
    JOIN public.orders o ON o.id = d.order_id
    JOIN public.writer_profiles wp ON wp.id = o.writer_id
    JOIN public.profiles pr ON pr.id = o.reader_id;

    RETURN jsonb_build_object(
        'total_count', v_total,
        'disputes', v_disputes
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_disputes(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_disputes(text, text, integer, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. REFUND REQUESTS WORKFLOW (request_refund, approve, reject)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_refund(
    p_order_id uuid,
    p_reason text,
    p_evidence_note text DEFAULT NULL,
    p_evidence_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_role text;
    v_request_id uuid;
    v_window_days integer;
    v_ref_time timestamptz;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A clear reason for the refund request is required.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.status != 'verified' THEN
        RAISE EXCEPTION 'Only verified orders can be refunded (current status: %).', v_order.status;
    END IF;

    -- Authorize: Writer or Reader
    IF v_caller_id = v_order.writer_id THEN
        v_role := 'writer';
    ELSIF v_caller_id = v_order.reader_id THEN
        v_role := 'reader';
        -- Enforce dispute window for reader refund requests
        SELECT dispute_window_days INTO v_window_days FROM public.platform_settings WHERE id = 1;
        v_window_days := coalesce(v_window_days, 30);
        v_ref_time := coalesce(v_order.verified_at, v_order.created_at);

        IF v_ref_time < (now() - (v_window_days || ' days')::interval) THEN
            RAISE EXCEPTION 'The refund request window has expired (% days limit).', v_window_days;
        END IF;
    ELSIF public.is_admin() THEN
        v_role := 'writer';
    ELSE
        RAISE EXCEPTION 'Unauthorized: You are not a party to this order.';
    END IF;

    -- Check if pending request exists
    IF EXISTS (
        SELECT 1 FROM public.refund_requests
        WHERE order_id = p_order_id AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'A pending refund request already exists for this order.';
    END IF;

    -- Validate evidence path: must start with order_id/
    IF p_evidence_path IS NOT NULL AND trim(p_evidence_path) != '' THEN
        IF NOT (p_evidence_path LIKE (p_order_id::text || '/%')) THEN
            RAISE EXCEPTION 'Evidence path must reside in the order folder (%/...).', p_order_id;
        END IF;
    END IF;

    INSERT INTO public.refund_requests (
        order_id,
        requested_by,
        requester_role,
        reason,
        evidence_note,
        evidence_path,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        v_caller_id,
        v_role,
        trim(p_reason),
        nullif(trim(p_evidence_note), ''),
        nullif(trim(p_evidence_path), ''),
        'pending',
        now(),
        now()
    )
    RETURNING id INTO v_request_id;

    -- Notify other party
    IF v_role = 'writer' THEN
        INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
        VALUES (
            v_order.reader_id,
            'refund_requested',
            'Author Reported Refund on Order #' || v_order.order_number,
            'The author has reported a refund for your order. Platform administrators are reviewing the request.',
            trim(p_reason),
            '/orders',
            jsonb_build_object('order_id', p_order_id, 'request_id', v_request_id),
            false,
            now()
        );
    ELSE
        INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
        VALUES (
            v_order.writer_id,
            'refund_requested',
            'Reader Requested Refund on Order #' || v_order.order_number,
            'The reader requested a refund for order #' || v_order.order_number || '. Reason: ' || trim(p_reason),
            trim(p_reason),
            '/writer/orders',
            jsonb_build_object('order_id', p_order_id, 'request_id', v_request_id),
            false,
            now()
        );
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at)
    VALUES (
        v_caller_id, v_role, 'request_refund', 'refund_request', v_request_id,
        jsonb_build_object('order_id', p_order_id, 'role', v_role, 'reason', p_reason),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', v_request_id,
        'order_id', p_order_id,
        'status', 'pending'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_refund(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, text, text, text) TO authenticated;

-- Admin: approve_refund_request
CREATE OR REPLACE FUNCTION public.approve_refund_request(
    p_request_id uuid,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_req record;
    v_order record;
    v_orig_ledger record;
    v_adj_id uuid;
    v_new_unpaid numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can approve refund requests.';
    END IF;

    IF p_note IS NULL OR trim(p_note) = '' THEN
        RAISE EXCEPTION 'A mandatory administrative note is required.';
    END IF;

    SELECT * INTO v_req
    FROM public.refund_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_req.id IS NULL THEN
        RAISE EXCEPTION 'Refund request not found: %', p_request_id;
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Refund request is not pending (status: %).', v_req.status;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_req.order_id
    FOR UPDATE;

    IF v_order.status != 'verified' THEN
        RAISE EXCEPTION 'Order is no longer verified (status: %).', v_order.status;
    END IF;

    SELECT * INTO v_orig_ledger
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified';

    IF v_orig_ledger.id IS NULL THEN
        RAISE EXCEPTION 'Original sale_verified entry not found for order: %', v_order.id;
    END IF;

    -- 1. Insert negative reversal in sales_ledger
    INSERT INTO public.sales_ledger (
        order_id,
        writer_id,
        reader_id,
        novel_id,
        entry_type,
        gross_amount_pkr,
        commission_rate,
        platform_commission_pkr,
        writer_net_pkr,
        original_ledger_entry_id,
        notes,
        created_at
    ) VALUES (
        v_order.id,
        v_order.writer_id,
        v_order.reader_id,
        v_order.novel_id,
        'refund_adjustment',
        -1 * v_orig_ledger.gross_amount_pkr,
        v_orig_ledger.commission_rate,
        -1 * v_orig_ledger.platform_commission_pkr,
        -1 * v_orig_ledger.writer_net_pkr,
        v_orig_ledger.id,
        'Refund request approved: ' || trim(p_note),
        now()
    )
    RETURNING id INTO v_adj_id;

    -- 2. Revoke entitlement
    UPDATE public.purchase_entitlements
    SET is_revoked = true,
        revoked_reason = 'Refund approved: ' || trim(p_note)
    WHERE order_id = v_order.id;

    -- 3. Set order status
    UPDATE public.orders
    SET status = 'refunded_adjusted',
        updated_at = now()
    WHERE id = v_order.id;

    -- 4. Reconcile writer unpaid balance
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    -- 5. Mark refund request approved
    UPDATE public.refund_requests
    SET status = 'approved',
        admin_note = trim(p_note),
        reviewed_by = v_caller_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    -- 6. Audit log
    INSERT INTO public.audit_logs (actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at)
    VALUES (
        v_caller_id, 'admin', 'approve_refund_request', 'refund_request', p_request_id,
        jsonb_build_object('order_id', v_order.id, 'adjustment_id', v_adj_id, 'note', p_note),
        now()
    );

    -- 7. Notifications & Emails
    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_order.reader_id,
        'refund_approved',
        'Refund Approved for Order #' || v_order.order_number,
        'The refund request for order #' || v_order.order_number || ' was approved. Reading access has been removed.',
        trim(p_note),
        '/orders',
        jsonb_build_object('order_id', v_order.id, 'request_id', p_request_id),
        false,
        now()
    );

    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_order.writer_id,
        'refund_approved',
        'Refund Request Approved: Order #' || v_order.order_number,
        'The refund has been approved. A negative platform commission credit of PKR ' || v_orig_ledger.platform_commission_pkr || ' was applied to your ledger.',
        trim(p_note),
        '/writer/earnings',
        jsonb_build_object('order_id', v_order.id, 'request_id', p_request_id),
        false,
        now()
    );

    PERFORM public.enqueue_email_for_notification(
        v_order.reader_id,
        'refund_approved',
        'Refund Approved: Order #' || v_order.order_number,
        'The refund for order #' || v_order.order_number || ' has been approved. Reading access has been removed. Note: ' || trim(p_note)
    );

    PERFORM public.enqueue_email_for_notification(
        v_order.writer_id,
        'refund_approved',
        'Refund Approved: Order #' || v_order.order_number,
        'The refund for order #' || v_order.order_number || ' has been approved. Commission credit has been applied to your ledger balance.'
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'order_id', v_order.id,
        'status', 'approved',
        'adjustment_id', v_adj_id,
        'new_unpaid_commission_pkr', v_new_unpaid
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_refund_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_refund_request(uuid, text) TO authenticated;

-- Admin: reject_refund_request
CREATE OR REPLACE FUNCTION public.reject_refund_request(
    p_request_id uuid,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_req record;
    v_order record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can reject refund requests.';
    END IF;

    IF p_note IS NULL OR trim(p_note) = '' THEN
        RAISE EXCEPTION 'A mandatory administrative note is required to reject a refund request.';
    END IF;

    SELECT * INTO v_req
    FROM public.refund_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_req.id IS NULL THEN
        RAISE EXCEPTION 'Refund request not found: %', p_request_id;
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Refund request is not pending (status: %).', v_req.status;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_req.order_id;

    UPDATE public.refund_requests
    SET status = 'rejected',
        admin_note = trim(p_note),
        reviewed_by = v_caller_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    -- Audit log
    INSERT INTO public.audit_logs (actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at)
    VALUES (
        v_caller_id, 'admin', 'reject_refund_request', 'refund_request', p_request_id,
        jsonb_build_object('order_id', v_order.id, 'note', p_note),
        now()
    );

    -- Notify requester
    INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
    VALUES (
        v_req.requested_by,
        'refund_rejected',
        'Refund Request Rejected: Order #' || v_order.order_number,
        'Your refund request for order #' || v_order.order_number || ' was not approved.',
        trim(p_note),
        CASE WHEN v_req.requester_role = 'writer' THEN '/writer/orders' ELSE '/orders' END,
        jsonb_build_object('order_id', v_order.id, 'request_id', p_request_id),
        false,
        now()
    );

    PERFORM public.enqueue_email_for_notification(
        v_req.requested_by,
        'refund_rejected',
        'Refund Request Declined: Order #' || v_order.order_number,
        'Your refund request for order #' || v_order.order_number || ' has been declined. Admin note: ' || trim(p_note)
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'status', 'rejected'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_refund_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_refund_request(uuid, text) TO authenticated;

-- Admin: admin_list_refund_requests
CREATE OR REPLACE FUNCTION public.admin_list_refund_requests(
    p_status text DEFAULT NULL,
    p_limit integer DEFAULT 25,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_total integer;
    v_items jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only administrators can list refund requests.';
    END IF;

    SELECT count(*) INTO v_total
    FROM public.refund_requests rr
    WHERE (p_status IS NULL OR p_status = 'all' OR rr.status = p_status);

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', rr.id,
                'order_id', o.id,
                'order_number', o.order_number,
                'novel_title', o.novel_title_snapshot,
                'amount_pkr', o.amount_pkr,
                'writer_pen_name', wp.pen_name_english,
                'reader_name', coalesce(pr.full_name, 'Reader'),
                'requested_by_role', rr.requester_role,
                'reason', rr.reason,
                'evidence_note', rr.evidence_note,
                'evidence_path', rr.evidence_path,
                'status', rr.status,
                'admin_note', rr.admin_note,
                'created_at', rr.created_at,
                'reviewed_at', rr.reviewed_at
            )
            ORDER BY rr.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_items
    FROM (
        SELECT rr.*
        FROM public.refund_requests rr
        WHERE (p_status IS NULL OR p_status = 'all' OR rr.status = p_status)
        ORDER BY rr.created_at DESC
        LIMIT coalesce(p_limit, 25)
        OFFSET coalesce(p_offset, 0)
    ) rr
    JOIN public.orders o ON o.id = rr.order_id
    JOIN public.writer_profiles wp ON wp.id = o.writer_id
    JOIN public.profiles pr ON pr.id = o.reader_id;

    RETURN jsonb_build_object(
        'total_count', v_total,
        'requests', v_items
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_refund_requests(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_refund_requests(text, integer, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 11. SUPPORT HELPDESK WORKFLOW (create, reply, close, list)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_support_request(
    p_category text,
    p_subject text,
    p_body text,
    p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_req_id uuid;
    v_role text;
    v_daily_count integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_category NOT IN ('order', 'payment', 'account', 'content', 'other') THEN
        RAISE EXCEPTION 'Invalid support request category: %', p_category;
    END IF;

    IF p_subject IS NULL OR trim(p_subject) = '' THEN
        RAISE EXCEPTION 'Subject is required.';
    END IF;

    IF char_length(p_subject) > 120 THEN
        RAISE EXCEPTION 'Subject cannot exceed 120 characters.';
    END IF;

    IF p_body IS NULL OR trim(p_body) = '' THEN
        RAISE EXCEPTION 'Message body is required.';
    END IF;

    IF char_length(p_body) > 2000 THEN
        RAISE EXCEPTION 'Message body cannot exceed 2000 characters.';
    END IF;

    -- Rate limiting: Max 5 tickets per day per user
    SELECT count(*) INTO v_daily_count
    FROM public.support_requests
    WHERE user_id = v_caller_id AND created_at > now() - interval '1 day';

    IF v_daily_count >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: You cannot submit more than 5 support requests per day.';
    END IF;

    -- Validate optional order_id belongs to caller
    IF p_order_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.orders
            WHERE id = p_order_id AND (reader_id = v_caller_id OR writer_id = v_caller_id)
        ) AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Invalid order reference.';
        END IF;
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_id;

    -- Insert request
    INSERT INTO public.support_requests (
        user_id,
        category,
        order_id,
        subject,
        body,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_caller_id,
        p_category,
        p_order_id,
        trim(p_subject),
        trim(p_body),
        'open',
        now(),
        now()
    )
    RETURNING id INTO v_req_id;

    -- Insert opening message into thread
    INSERT INTO public.support_messages (
        request_id,
        author_id,
        author_role,
        body,
        created_at
    ) VALUES (
        v_req_id,
        v_caller_id,
        coalesce(v_role, 'reader'),
        trim(p_body),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', v_req_id,
        'status', 'open'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_support_request(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_support_request(text, text, text, uuid) TO authenticated;

-- add_support_message
CREATE OR REPLACE FUNCTION public.add_support_message(
    p_request_id uuid,
    p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_req record;
    v_role text;
    v_msg_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_body IS NULL OR trim(p_body) = '' THEN
        RAISE EXCEPTION 'Message body cannot be empty.';
    END IF;

    IF char_length(p_body) > 2000 THEN
        RAISE EXCEPTION 'Message body cannot exceed 2000 characters.';
    END IF;

    SELECT * INTO v_req
    FROM public.support_requests
    WHERE id = p_request_id;

    IF v_req.id IS NULL THEN
        RAISE EXCEPTION 'Support request not found: %', p_request_id;
    END IF;

    IF NOT public.is_admin() AND v_req.user_id != v_caller_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only reply to your own support requests.';
    END IF;

    IF public.is_admin() THEN
        v_role := 'admin';
    ELSE
        SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_id;
        v_role := coalesce(v_role, 'reader');
    END IF;

    INSERT INTO public.support_messages (
        request_id,
        author_id,
        author_role,
        body,
        created_at
    ) VALUES (
        p_request_id,
        v_caller_id,
        v_role,
        trim(p_body),
        now()
    )
    RETURNING id INTO v_msg_id;

    -- Update ticket status
    IF v_role = 'admin' THEN
        UPDATE public.support_requests
        SET status = 'answered',
            updated_at = now()
        WHERE id = p_request_id;

        -- Notify user
        INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
        VALUES (
            v_req.user_id,
            'support_reply',
            'Support replied: ' || v_req.subject,
            'An administrator replied to your support request.',
            substring(trim(p_body) from 1 for 150),
            '/support/' || p_request_id,
            jsonb_build_object('request_id', p_request_id),
            false,
            now()
        );
    ELSE
        UPDATE public.support_requests
        SET status = 'open',
            updated_at = now()
        WHERE id = p_request_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_msg_id,
        'created_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_support_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_support_message(uuid, text) TO authenticated;

-- close_support_request
CREATE OR REPLACE FUNCTION public.close_support_request(
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_req record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_req FROM public.support_requests WHERE id = p_request_id;
    IF v_req.id IS NULL THEN
        RAISE EXCEPTION 'Support request not found: %', p_request_id;
    END IF;

    IF NOT public.is_admin() AND v_req.user_id != v_caller_id THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    UPDATE public.support_requests
    SET status = 'closed',
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'status', 'closed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_support_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_support_request(uuid) TO authenticated;

-- get_my_support_requests
CREATE OR REPLACE FUNCTION public.get_my_support_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_items jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', sr.id,
                'category', sr.category,
                'subject', sr.subject,
                'status', sr.status,
                'created_at', sr.created_at,
                'updated_at', sr.updated_at,
                'messages_count', (SELECT count(*) FROM public.support_messages sm WHERE sm.request_id = sr.id),
                'last_message_at', (SELECT max(created_at) FROM public.support_messages sm WHERE sm.request_id = sr.id)
            )
            ORDER BY sr.updated_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_items
    FROM public.support_requests sr
    WHERE sr.user_id = v_caller_id;

    RETURN v_items;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_support_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_support_requests() TO authenticated;

-- get_support_request
CREATE OR REPLACE FUNCTION public.get_support_request(
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_req record;
    v_messages jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT sr.*,
           coalesce(p.full_name, 'User') AS user_name,
           o.order_number
    INTO v_req
    FROM public.support_requests sr
    JOIN public.profiles p ON p.id = sr.user_id
    LEFT JOIN public.orders o ON o.id = sr.order_id
    WHERE sr.id = p_request_id;

    IF v_req.id IS NULL THEN
        RAISE EXCEPTION 'Support request not found: %', p_request_id;
    END IF;

    IF NOT public.is_admin() AND v_req.user_id != v_caller_id THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', sm.id,
                'author_id', sm.author_id,
                'author_role', sm.author_role,
                'author_name', CASE WHEN sm.author_role = 'admin' THEN 'UNB Support' ELSE v_req.user_name END,
                'body', sm.body,
                'created_at', sm.created_at,
                'is_by_me', (sm.author_id = v_caller_id)
            )
            ORDER BY sm.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_messages
    FROM public.support_messages sm
    WHERE sm.request_id = p_request_id;

    RETURN jsonb_build_object(
        'request', jsonb_build_object(
            'id', v_req.id,
            'category', v_req.category,
            'subject', v_req.subject,
            'status', v_req.status,
            'order_id', v_req.order_id,
            'order_number', v_req.order_number,
            'user_name', v_req.user_name,
            'created_at', v_req.created_at,
            'updated_at', v_req.updated_at
        ),
        'messages', v_messages
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_support_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_support_request(uuid) TO authenticated;

-- admin_list_support_requests
CREATE OR REPLACE FUNCTION public.admin_list_support_requests(
    p_status text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_limit integer DEFAULT 25,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total integer;
    v_items jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrators only.';
    END IF;

    SELECT count(*) INTO v_total
    FROM public.support_requests sr
    WHERE (p_status IS NULL OR p_status = 'all' OR sr.status = p_status)
      AND (p_category IS NULL OR p_category = 'all' OR sr.category = p_category);

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', sr.id,
                'category', sr.category,
                'subject', sr.subject,
                'status', sr.status,
                'user_name', coalesce(p.full_name, 'User'),
                'order_number', o.order_number,
                'created_at', sr.created_at,
                'updated_at', sr.updated_at,
                'messages_count', (SELECT count(*) FROM public.support_messages sm WHERE sm.request_id = sr.id)
            )
            ORDER BY sr.updated_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_items
    FROM (
        SELECT sr.*
        FROM public.support_requests sr
        WHERE (p_status IS NULL OR p_status = 'all' OR sr.status = p_status)
          AND (p_category IS NULL OR p_category = 'all' OR sr.category = p_category)
        ORDER BY sr.updated_at DESC
        LIMIT coalesce(p_limit, 25)
        OFFSET coalesce(p_offset, 0)
    ) sr
    JOIN public.profiles p ON p.id = sr.user_id
    LEFT JOIN public.orders o ON o.id = sr.order_id;

    RETURN jsonb_build_object(
        'total_count', v_total,
        'requests', v_items
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_support_requests(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_support_requests(text, text, integer, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 12. SCHEDULED REMINDERS RPC (run_scheduled_reminders)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_scheduled_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_settings record;
    v_reminder_hours integer;
    v_enqueued integer := 0;
    v_order record;
    v_inv record;
    v_disp record;
    v_admin record;
    v_dedupe text;
BEGIN
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
    v_reminder_hours := coalesce(v_settings.verification_reminder_hours, 12);

    -- 1. Payment submitted older than verification_reminder_hours (to writer)
    FOR v_order IN
        SELECT o.id, o.order_number, o.writer_id, o.created_at
        FROM public.orders o
        WHERE o.status = 'payment_submitted'
          AND o.created_at < now() - (v_reminder_hours || ' hours')::interval
          AND o.created_at >= now() - interval '24 hours'
    LOOP
        v_dedupe := 'reminder:order:' || v_reminder_hours || 'h:' || v_order.id;
        IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = v_dedupe) THEN
            INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
            VALUES (
                v_order.writer_id,
                'verification_reminder',
                'Pending Payment Verification: Order #' || v_order.order_number,
                'A reader submitted payment for order #' || v_order.order_number || ' over ' || v_reminder_hours || ' hours ago. Please check your bank and verify.',
                'Order #' || v_order.order_number,
                '/writer/orders',
                jsonb_build_object('order_id', v_order.id),
                false,
                now()
            );

            PERFORM public.enqueue_email_for_notification(
                v_order.writer_id,
                'verification_reminder',
                'Action Needed: Verify Payment for Order #' || v_order.order_number,
                'A reader submitted payment for order #' || v_order.order_number || ' over ' || v_reminder_hours || ' hours ago. Please inspect your account and verify the order.',
                v_dedupe
            );
            v_enqueued := v_enqueued + 1;
        END IF;
    END LOOP;

    -- 2. Payment submitted older than 24 hours (second reminder to writer)
    FOR v_order IN
        SELECT o.id, o.order_number, o.writer_id, o.created_at
        FROM public.orders o
        WHERE o.status = 'payment_submitted'
          AND o.created_at < now() - interval '24 hours'
          AND o.created_at >= now() - interval '48 hours'
    LOOP
        v_dedupe := 'reminder:order:24h:' || v_order.id;
        IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = v_dedupe) THEN
            INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
            VALUES (
                v_order.writer_id,
                'verification_reminder',
                'URGENT: Verify Payment for Order #' || v_order.order_number,
                'Payment submission for order #' || v_order.order_number || ' is pending verification for 24+ hours.',
                'Order #' || v_order.order_number,
                '/writer/orders',
                jsonb_build_object('order_id', v_order.id),
                false,
                now()
            );

            PERFORM public.enqueue_email_for_notification(
                v_order.writer_id,
                'verification_reminder',
                'URGENT: Order #' || v_order.order_number || ' Pending Verification (24h)',
                'Order #' || v_order.order_number || ' has been waiting for your verification for over 24 hours. If unverified, the reader may open a dispute.',
                v_dedupe
            );
            v_enqueued := v_enqueued + 1;
        END IF;
    END LOOP;

    -- 3. Payment submitted older than 48 hours (alert to platform admins)
    FOR v_order IN
        SELECT o.id, o.order_number, o.created_at
        FROM public.orders o
        WHERE o.status = 'payment_submitted'
          AND o.created_at < now() - interval '48 hours'
    LOOP
        v_dedupe := 'reminder:order:stuck48h:' || v_order.id;
        IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = v_dedupe) THEN
            FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
                INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
                VALUES (
                    v_admin.id,
                    'stuck_order_alert',
                    'Stuck Order Alert: #' || v_order.order_number,
                    'Order #' || v_order.order_number || ' has remained in payment_submitted for over 48 hours without author action.',
                    'Order #' || v_order.order_number,
                    '/admin/orders',
                    jsonb_build_object('order_id', v_order.id),
                    false,
                    now()
                );
            END LOOP;
            -- Register dedupe
            INSERT INTO public.email_outbox (user_id, template, subject, body_text, status, dedupe_key, created_at)
            VALUES (
                (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1),
                'stuck_order_alert',
                'Admin Alert: Stuck Order #' || v_order.order_number,
                'Order #' || v_order.order_number || ' is stuck for 48+ hours.',
                'skipped',
                v_dedupe,
                now()
            );
            v_enqueued := v_enqueued + 1;
        END IF;
    END LOOP;

    -- 4. Invoice due in 2 days (reminder to writer)
    FOR v_inv IN
        SELECT id, invoice_number, writer_id, due_date
        FROM public.commission_invoices
        WHERE status IN ('invoiced', 'open', 'partially_paid')
          AND due_date IS NOT NULL
          AND due_date > now()
          AND due_date <= now() + interval '2 days'
    LOOP
        v_dedupe := 'reminder:invoice:due2d:' || v_inv.id;
        IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = v_dedupe) THEN
            INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
            VALUES (
                v_inv.writer_id,
                'invoice_due_reminder',
                'Commission Invoice Due Soon: ' || v_inv.invoice_number,
                'Your platform commission invoice ' || v_inv.invoice_number || ' is due in 2 days.',
                'Invoice ' || v_inv.invoice_number,
                '/writer/commission/' || v_inv.id,
                jsonb_build_object('invoice_id', v_inv.id),
                false,
                now()
            );

            PERFORM public.enqueue_email_for_notification(
                v_inv.writer_id,
                'invoice_due_reminder',
                'Reminder: Commission Invoice ' || v_inv.invoice_number || ' Due in 2 Days',
                'Your platform commission invoice ' || v_inv.invoice_number || ' is due in 2 days. Please submit payment to prevent order disruption.',
                v_dedupe
            );
            v_enqueued := v_enqueued + 1;
        END IF;
    END LOOP;

    -- 5. Stagnant dispute open for >3 days with no admin action (alert to admins)
    FOR v_disp IN
        SELECT d.id, o.order_number
        FROM public.disputes d
        JOIN public.orders o ON o.id = d.order_id
        WHERE d.status IN ('open', 'under_review')
          AND d.created_at < now() - interval '3 days'
    LOOP
        v_dedupe := 'reminder:dispute:3d:' || v_disp.id;
        IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = v_dedupe) THEN
            FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
                INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
                VALUES (
                    v_admin.id,
                    'stagnant_dispute_alert',
                    'Stagnant Dispute Alert: Order #' || v_disp.order_number,
                    'Dispute on order #' || v_disp.order_number || ' has been open for 3+ days without resolution.',
                    'Dispute #' || substring(v_disp.id::text from 1 for 8),
                    '/admin/disputes/' || v_disp.id,
                    jsonb_build_object('dispute_id', v_disp.id),
                    false,
                    now()
                );
            END LOOP;

            INSERT INTO public.email_outbox (user_id, template, subject, body_text, status, dedupe_key, created_at)
            VALUES (
                (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1),
                'stagnant_dispute_alert',
                'Admin Alert: Stagnant Dispute #' || substring(v_disp.id::text from 1 for 8),
                'Dispute for order #' || v_disp.order_number || ' has been open for >3 days.',
                'skipped',
                v_dedupe,
                now()
            );
            v_enqueued := v_enqueued + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'enqueued_reminders', v_enqueued
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_scheduled_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_scheduled_reminders() TO authenticated;

-- -----------------------------------------------------------------------------
-- 13. UPDATE PLATFORM SETTINGS (WITH MIN_DISPUTE_WAIT & VERIFICATION_REMINDER)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_platform_settings(
    p_default_commission_rate numeric DEFAULT NULL,
    p_unpaid_commission_threshold_pkr numeric DEFAULT NULL,
    p_min_novel_price_pkr numeric DEFAULT NULL,
    p_max_novel_price_pkr numeric DEFAULT NULL,
    p_payment_verification_window_hours integer DEFAULT NULL,
    p_dispute_window_days integer DEFAULT NULL,
    p_max_orders_per_hour integer DEFAULT NULL,
    p_max_chapter_reads_per_window integer DEFAULT NULL,
    p_chapter_read_window_minutes integer DEFAULT NULL,
    p_invoice_due_days integer DEFAULT NULL,
    p_overdue_grace_days integer DEFAULT NULL,
    p_min_dispute_wait_hours integer DEFAULT NULL,
    p_verification_reminder_hours integer DEFAULT NULL,
    p_support_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_old_settings jsonb;
    v_new_settings jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only administrators can update platform settings.';
    END IF;

    SELECT to_jsonb(s) INTO v_old_settings
    FROM public.platform_settings s
    WHERE id = 1;

    -- Validations
    IF p_default_commission_rate IS NOT NULL AND (p_default_commission_rate < 0 OR p_default_commission_rate > 100) THEN
        RAISE EXCEPTION 'Commission rate must be between 0 and 100.';
    END IF;

    IF p_min_novel_price_pkr IS NOT NULL AND p_min_novel_price_pkr < 50 THEN
        RAISE EXCEPTION 'Minimum novel price must be at least 50 PKR.';
    END IF;

    IF p_invoice_due_days IS NOT NULL AND (p_invoice_due_days < 1 OR p_invoice_due_days > 90) THEN
        RAISE EXCEPTION 'Invoice due days must be between 1 and 90.';
    END IF;

    IF p_overdue_grace_days IS NOT NULL AND (p_overdue_grace_days < 0 OR p_overdue_grace_days > 60) THEN
        RAISE EXCEPTION 'Overdue grace days must be between 0 and 60.';
    END IF;

    IF p_min_dispute_wait_hours IS NOT NULL AND (p_min_dispute_wait_hours < 0 OR p_min_dispute_wait_hours > 168) THEN
        RAISE EXCEPTION 'Min dispute wait hours must be between 0 and 168.';
    END IF;

    IF p_verification_reminder_hours IS NOT NULL AND (p_verification_reminder_hours < 1 OR p_verification_reminder_hours > 168) THEN
        RAISE EXCEPTION 'Verification reminder hours must be between 1 and 168.';
    END IF;

    UPDATE public.platform_settings
    SET default_commission_rate = coalesce(p_default_commission_rate, default_commission_rate),
        unpaid_commission_threshold_pkr = coalesce(p_unpaid_commission_threshold_pkr, unpaid_commission_threshold_pkr),
        min_novel_price_pkr = coalesce(p_min_novel_price_pkr, min_novel_price_pkr),
        max_novel_price_pkr = coalesce(p_max_novel_price_pkr, max_novel_price_pkr),
        payment_verification_window_hours = coalesce(p_payment_verification_window_hours, payment_verification_window_hours),
        dispute_window_days = coalesce(p_dispute_window_days, dispute_window_days),
        max_orders_per_hour = coalesce(p_max_orders_per_hour, max_orders_per_hour),
        max_chapter_reads_per_window = coalesce(p_max_chapter_reads_per_window, max_chapter_reads_per_window),
        chapter_read_window_minutes = coalesce(p_chapter_read_window_minutes, chapter_read_window_minutes),
        invoice_due_days = coalesce(p_invoice_due_days, invoice_due_days),
        overdue_grace_days = coalesce(p_overdue_grace_days, overdue_grace_days),
        min_dispute_wait_hours = coalesce(p_min_dispute_wait_hours, min_dispute_wait_hours),
        verification_reminder_hours = coalesce(p_verification_reminder_hours, verification_reminder_hours),
        support_email = coalesce(nullif(trim(p_support_email), ''), support_email),
        updated_at = now()
    WHERE id = 1;

    SELECT to_jsonb(s) INTO v_new_settings
    FROM public.platform_settings s
    WHERE id = 1;

    INSERT INTO public.audit_logs (actor_id, actor_role, action_type, entity_type, entity_id, previous_state, new_state, created_at)
    VALUES (v_caller_id, 'admin', 'update_platform_settings', 'platform_settings', '1', v_old_settings, v_new_settings, now());

    RETURN jsonb_build_object('success', true, 'settings', v_new_settings);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, integer, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 14. EMAIL OUTBOX & NOTIFICATION PREFERENCES RPCs
-- -----------------------------------------------------------------------------

-- 14a. claim_pending_emails_for_sending: Dedicated queue claimer for background cron
CREATE OR REPLACE FUNCTION public.claim_pending_emails_for_sending(
    p_batch_size integer DEFAULT 25
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    recipient_email text,
    template text,
    subject text,
    body_text text,
    attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT eo.id,
           eo.user_id,
           p.email::text AS recipient_email,
           eo.template,
           eo.subject,
           eo.body_text,
           eo.attempts
    FROM public.email_outbox eo
    JOIN public.profiles p ON p.id = eo.user_id
    WHERE eo.status = 'pending' AND eo.attempts < 5
    ORDER BY eo.created_at ASC
    LIMIT greatest(1, least(coalesce(p_batch_size, 25), 100));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pending_emails_for_sending(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_emails_for_sending(integer) TO authenticated;

-- 14b. record_email_delivery_result: Updates status after SMTP attempt
CREATE OR REPLACE FUNCTION public.record_email_delivery_result(
    p_email_id uuid,
    p_success boolean,
    p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_success THEN
        UPDATE public.email_outbox
        SET status = 'sent',
            sent_at = now(),
            last_error = NULL
        WHERE id = p_email_id;
    ELSE
        UPDATE public.email_outbox
        SET attempts = attempts + 1,
            last_error = substring(trim(p_error) from 1 for 500),
            status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END
        WHERE id = p_email_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_email_delivery_result(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_email_delivery_result(uuid, boolean, text) TO authenticated;

-- 14c. get_email_outbox_stats: For admin dashboard health card
CREATE OR REPLACE FUNCTION public.get_email_outbox_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pending integer;
    v_sent integer;
    v_failed integer;
    v_skipped integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrators only.';
    END IF;

    SELECT count(*) FILTER (WHERE status = 'pending'),
           count(*) FILTER (WHERE status = 'sent'),
           count(*) FILTER (WHERE status = 'failed'),
           count(*) FILTER (WHERE status = 'skipped')
    INTO v_pending, v_sent, v_failed, v_skipped
    FROM public.email_outbox;

    RETURN jsonb_build_object(
        'pending_count', coalesce(v_pending, 0),
        'sent_count', coalesce(v_sent, 0),
        'failed_count', coalesce(v_failed, 0),
        'skipped_count', coalesce(v_skipped, 0)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_email_outbox_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_outbox_stats() TO authenticated;

-- 14d. retry_failed_emails: Admin action to reset failed emails back to pending
CREATE OR REPLACE FUNCTION public.retry_failed_emails(
    p_max_retry integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_retried integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrators only.';
    END IF;

    WITH targeted AS (
        SELECT id
        FROM public.email_outbox
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT greatest(1, least(coalesce(p_max_retry, 50), 200))
    )
    UPDATE public.email_outbox eo
    SET status = 'pending',
        attempts = 0,
        last_error = NULL
    FROM targeted
    WHERE eo.id = targeted.id;

    GET DIAGNOSTICS v_retried = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'retried_count', v_retried
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retry_failed_emails(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_failed_emails(integer) TO authenticated;

-- 14e. get_my_notification_preferences & update_notification_preferences
CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_enabled boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT email_enabled INTO v_enabled
    FROM public.notification_preferences
    WHERE user_id = v_caller_id;

    RETURN jsonb_build_object(
        'email_enabled', coalesce(v_enabled, true)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_notification_preferences() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_notification_preferences(
    p_email_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    INSERT INTO public.notification_preferences (user_id, email_enabled, updated_at)
    VALUES (v_caller_id, coalesce(p_email_enabled, true), now())
    ON CONFLICT (user_id) DO UPDATE
    SET email_enabled = EXCLUDED.email_enabled,
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'email_enabled', coalesce(p_email_enabled, true));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_notification_preferences(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_notification_preferences(boolean) TO authenticated;

