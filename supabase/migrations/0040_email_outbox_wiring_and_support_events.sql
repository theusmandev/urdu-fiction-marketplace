-- =============================================================================
-- Migration 0040: Transactional Email Outbox Wiring & Support Desk Events
-- =============================================================================
-- This migration wires all missing platform lifecycle events into the
-- asynchronous, audit-logged public.email_outbox queue:
--   1. enqueue_email_for_notification: Expands critical templates list
--   2. submit_payment: Queues notification email to author upon reader TID submission
--   3. verify_order_payment: Queues critical access unlock email to reader upon verification
--   4. reject_order_payment: Queues rejection reason email to reader
--   5. mark_tip_not_received: Queues deposit issue notification to reader
--   6. generate_commission_invoice: Queues platform fee invoice email to author
--   7. confirm_commission_settlement: Queues platform fee payment confirmation email to author
--   8. reject_commission_report: Queues platform fee proof rejection email to author
--   9. approve_writer: Queues onboarding approval email to applicant
--  10. reject_writer: Queues application decline email to applicant
--  11. approve_novel: Queues publication approval email to author
--  12. reject_novel: Queues editorial feedback email to author
--  13. create_support_request: Queues alert email to active administrators
--  14. add_support_message: Queues reply notification to ticket owner or administrators
--
-- Strict Non-Sensitive Email Invariant:
-- Enqueued emails NEVER include writer/reader bank account numbers, IBANs,
-- raw transaction reference IDs (TIDs), or screenshot paths.
-- User-Facing Terminology Invariant:
-- User-visible text strictly uses "Platform fee" / "پلیٹ فارم فیس" (never commission).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENQUEUE EMAIL HELPER (Expands critical templates)
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
    -- 1. Check user exists, active, and has confirmed profile
    SELECT id, email, is_active INTO v_user
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_user.id IS NULL OR coalesce(v_user.is_active, true) = false THEN
        RETURN NULL;
    END IF;

    -- 2. Determine if event is critical
    -- Critical events are always queued even if user turned general promotional emails off
    v_is_critical := p_template IN (
        'payment_verified',
        'payment_rejected',
        'order_payment_submitted',
        'invoice_issued',
        'invoice_overdue',
        'invoice_settled',
        'invoice_payment_rejected',
        'dispute_opened',
        'dispute_message',
        'dispute_resolved',
        'refund_approved',
        'refund_rejected',
        'writer_approved',
        'writer_rejected',
        'novel_approved',
        'novel_rejected',
        'support_reply',
        'support_ticket_created',
        'support_message_received'
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
        pg_catalog.now()
    )
    RETURNING id INTO v_outbox_id;

    RETURN v_outbox_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_email_for_notification(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_email_for_notification(uuid, text, text, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. SUBMIT PAYMENT (Reader submits proof -> Notifies writer via in-app & email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_payment(
    p_order_id uuid,
    p_tid text,
    p_screenshot_path text,
    p_claimed_amount numeric DEFAULT NULL,
    p_sender_name text DEFAULT NULL,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_clean_tid text;
    v_clean_path text;
    v_norm_tid text;
    v_claimed_amount numeric(10,2);
    v_clean_sender text;
    v_clean_note text;
    v_existing_recent_id uuid;
    v_submission_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit payment.';
    END IF;

    -- 1. TID validation: 6 to 40 characters of letters, digits, dash, underscore
    IF p_tid IS NULL OR trim(p_tid) = '' THEN
        RAISE EXCEPTION 'Transaction reference (TID) is required.';
    END IF;

    v_clean_tid := trim(p_tid);
    IF v_clean_tid !~ '^[a-zA-Z0-9_-]{6,40}$' THEN
        RAISE EXCEPTION 'Transaction reference (TID) must be 6 to 40 characters containing only letters, numbers, hyphens, and underscores.';
    END IF;

    -- 2. Screenshot storage path validation: must start with '<order_id>/', no path traversal
    IF p_screenshot_path IS NULL OR trim(p_screenshot_path) = '' THEN
        RAISE EXCEPTION 'Screenshot proof storage path is required.';
    END IF;

    v_clean_path := trim(p_screenshot_path);

    IF v_clean_path LIKE '%..%' OR v_clean_path LIKE '%/%/%' THEN
        RAISE EXCEPTION 'Invalid screenshot path format. Path traversal is strictly prohibited.';
    END IF;

    IF v_clean_path !~ ('^' || p_order_id::text || '/[a-zA-Z0-9._-]+$') THEN
        RAISE EXCEPTION 'Screenshot path must be scoped to the order folder (%/<filename>).', p_order_id;
    END IF;

    -- 3. Lock and inspect order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.reader_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the reader who created this order can submit payment.';
    END IF;

    IF v_order.status NOT IN ('pending_payment', 'rejected') THEN
        RAISE EXCEPTION 'Payment cannot be submitted for order in status: %', v_order.status;
    END IF;

    -- 4. Claimed amount validation: positive, <= 10x order amount
    v_claimed_amount := coalesce(p_claimed_amount, v_order.amount_pkr);
    IF v_claimed_amount <= 0 OR v_claimed_amount > (v_order.amount_pkr * 10) THEN
        RAISE EXCEPTION 'Claimed payment amount must be positive and cannot exceed 10x the order amount.';
    END IF;

    -- 5. Field length boundaries
    IF p_sender_name IS NOT NULL THEN
        v_clean_sender := trim(p_sender_name);
        IF length(v_clean_sender) > 100 THEN
            RAISE EXCEPTION 'Sender account name cannot exceed 100 characters.';
        END IF;
    ELSE
        v_clean_sender := NULL;
    END IF;

    IF p_note IS NOT NULL THEN
        v_clean_note := trim(p_note);
        IF length(v_clean_note) > 500 THEN
            RAISE EXCEPTION 'Reader note cannot exceed 500 characters.';
        END IF;
    ELSE
        v_clean_note := NULL;
    END IF;

    -- 6. Normalized TID for idempotency and duplicate checking
    v_norm_tid := pg_catalog.upper(pg_catalog.regexp_replace(v_clean_tid, '[^a-zA-Z0-9]', '', 'g'));

    -- Idempotent retry check: same order, same normalized TID within last 60 seconds
    SELECT id INTO v_existing_recent_id
    FROM public.payment_submissions
    WHERE order_id = p_order_id
      AND normalized_tid = v_norm_tid
      AND created_at >= (pg_catalog.now() - interval '60 seconds')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_recent_id IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'submission_id', v_existing_recent_id,
            'is_retry', true
        );
    END IF;

    -- 7. Ensure at most one pending submission per order
    IF EXISTS (
        SELECT 1 FROM public.payment_submissions
        WHERE order_id = p_order_id
          AND reviewer_status = 'pending'
    ) THEN
        RAISE EXCEPTION 'A payment submission is already pending verification for this order. Please wait for the author to review your submission.';
    END IF;

    -- 8. Insert payment submission
    INSERT INTO public.payment_submissions (
        order_id,
        reader_id,
        writer_id,
        transaction_reference_tid,
        screenshot_url,
        screenshot_path,
        paid_amount_claimed_pkr,
        sender_account_name,
        reader_note,
        reviewer_status,
        created_at
    ) VALUES (
        p_order_id,
        v_order.reader_id,
        v_order.writer_id,
        v_clean_tid,
        v_clean_path,
        v_clean_path,
        v_claimed_amount,
        v_clean_sender,
        v_clean_note,
        'pending',
        pg_catalog.now()
    )
    RETURNING id INTO v_submission_id;

    -- 9. Update order status to payment_submitted
    UPDATE public.orders
    SET status = 'payment_submitted',
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 10. In-app notification for writer
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
        v_order.writer_id,
        'order_payment_submitted',
        'New Payment Proof Received',
        'Reader submitted TID ' || v_clean_tid || ' for order ' || v_order.order_number,
        'Please verify receipt of PKR ' || v_claimed_amount || ' in your account and confirm access for order ' || v_order.order_number || '.',
        '/writer/orders',
        pg_catalog.jsonb_build_object(
            'order_id', p_order_id,
            'order_number', v_order.order_number,
            'submission_id', v_submission_id
        ),
        false,
        pg_catalog.now()
    );

    -- 11. Transactional email outbox for writer
    PERFORM public.enqueue_email_for_notification(
        v_order.writer_id,
        'order_payment_submitted',
        'New Payment Proof Received — Order #' || v_order.order_number || ' | UNB Premium',
        'A reader has submitted payment proof for Order #' || v_order.order_number || E'.\n\nPlease check your receiving bank account and verify the order in your Writer Studio to unlock novel access.',
        'order_payment_submitted:' || v_submission_id::text
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'submission_id', v_submission_id,
        'is_retry', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_payment(uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_payment(uuid, text, text, numeric, text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. VERIFY ORDER PAYMENT (Writer confirms payment -> Notifies reader via email & unlocks novel)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_writer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
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
    v_paused boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to verify payment.';
    END IF;

    -- Fetch order with row-lock
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the receiving author or platform administrator can verify receipt.';
    END IF;

    -- Idempotency check: If order is ALREADY verified, return existing details safely
    IF v_order.status::text = 'verified' THEN
        SELECT id INTO v_entitlement_id
        FROM public.purchase_entitlements
        WHERE order_id = v_order.id
        LIMIT 1;

        IF v_entitlement_id IS NULL THEN
            SELECT id INTO v_entitlement_id
            FROM public.purchase_entitlements
            WHERE reader_id = v_order.reader_id
              AND novel_id = v_order.novel_id
              AND is_revoked = false
            LIMIT 1;
        END IF;

        SELECT id INTO v_ledger_id
        FROM public.sales_ledger
        WHERE order_id = v_order.id
          AND entry_type = 'sale_verified'
        LIMIT 1;

        SELECT current_unpaid_commission, is_orders_paused_for_commission
        INTO v_new_unpaid, v_paused
        FROM public.writer_profiles
        WHERE id = v_order.writer_id;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused,
            'message', 'Order payment is already verified.'
        );
    END IF;

    IF v_order.status::text != 'payment_submitted' THEN
        RAISE EXCEPTION 'Order cannot be verified in current status: %. Only orders in status payment_submitted can be verified.', v_order.status;
    END IF;

    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE id = p_submission_id AND order_id = p_order_id
    FOR UPDATE;

    IF v_submission.id IS NULL THEN
        RAISE EXCEPTION 'Payment submission not found for order: %', p_order_id;
    END IF;

    IF v_submission.reviewer_status::text != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be verified: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    -- 1. Determine platform fee rate
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);
    v_commission_pkr := pg_catalog.round((v_order.amount_pkr * (v_rate / 100.00)), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 2. Update Submission & Order
    UPDATE public.payment_submissions
    SET reviewer_status = 'verified',
        reviewer_note = nullif(pg_catalog.btrim(p_writer_note), ''),
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_submission_id;

    UPDATE public.orders
    SET status = 'verified',
        commission_rate = v_rate,
        commission_pkr = v_commission_pkr,
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 3. Grant Purchase Entitlement
    INSERT INTO public.purchase_entitlements (
        order_id,
        reader_id,
        novel_id,
        granted_at,
        is_revoked
    ) VALUES (
        v_order.id,
        v_order.reader_id,
        v_order.novel_id,
        pg_catalog.now(),
        false
    )
    ON CONFLICT (reader_id, novel_id) DO UPDATE
    SET is_revoked = false,
        granted_at = pg_catalog.now(),
        revoked_at = NULL,
        revocation_reason = NULL,
        order_id = v_order.id
    RETURNING id INTO v_entitlement_id;

    IF v_entitlement_id IS NULL THEN
        SELECT id INTO v_entitlement_id
        FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id AND novel_id = v_order.novel_id;
    END IF;

    -- 4. Financial Ledger Entry
    SELECT id INTO v_ledger_id
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified';

    IF v_ledger_id IS NULL THEN
        INSERT INTO public.sales_ledger (
            order_id,
            writer_id,
            reader_id,
            novel_id,
            entry_type,
            gross_amount_pkr,
            platform_commission_rate,
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
            coalesce(nullif(pg_catalog.btrim(p_writer_note), ''), 'Direct reader payment confirmed by writer.'),
            pg_catalog.now()
        )
        ON CONFLICT (order_id) WHERE entry_type = 'sale_verified' DO NOTHING
        RETURNING id INTO v_ledger_id;

        IF v_ledger_id IS NULL THEN
            SELECT id INTO v_ledger_id
            FROM public.sales_ledger
            WHERE order_id = v_order.id AND entry_type = 'sale_verified';
        END IF;
    END IF;

    -- 5. Reconcile platform fee balance
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 6. In-app notification for Reader
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'ادائیگی کی تصدیق ہو گئی! (Payment Verified)',
        'مصنف نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ ناول آپ کی لائبریری میں دستیاب ہے۔',
        '/library',
        false,
        pg_catalog.now()
    );

    -- 7. Transactional email outbox for Reader (critical event)
    PERFORM public.enqueue_email_for_notification(
        v_order.reader_id,
        'payment_verified',
        'Novel Unlocked: Order #' || v_order.order_number || ' Verified | UNB Premium',
        'Great news! Your payment for Order #' || v_order.order_number || E' has been confirmed by the author.\n\nYour novel is now unlocked and available in your personal library. Happy reading!',
        'payment_verified:' || v_order.id::text
    );

    -- 8. Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        CASE WHEN public.is_admin() THEN 'admin' ELSE 'writer' END,
        'VERIFY_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object(
            'status', 'verified',
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id,
        'current_unpaid_commission', v_new_unpaid,
        'is_orders_paused_for_commission', v_paused
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_order_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_order_payment(uuid, uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. REJECT ORDER PAYMENT (Writer declines payment proof -> Notifies reader via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_submission record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_rejection_reason IS NULL OR pg_catalog.btrim(p_rejection_reason) = '' THEN
        RAISE EXCEPTION 'A clear rejection reason is required.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    IF v_order.status::text != 'payment_submitted' THEN
        RAISE EXCEPTION 'Order cannot be rejected in current status: %. Only orders in status payment_submitted can be rejected.', v_order.status;
    END IF;

    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE id = p_submission_id AND order_id = p_order_id
    FOR UPDATE;

    IF v_submission.id IS NULL THEN
        RAISE EXCEPTION 'Payment submission not found for order: %', p_order_id;
    END IF;

    IF v_submission.reviewer_status::text != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be rejected: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    -- Update Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'rejected',
        reviewer_note = pg_catalog.btrim(p_rejection_reason),
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_submission_id;

    -- Update Order
    UPDATE public.orders
    SET status = 'rejected',
        rejected_reason = pg_catalog.btrim(p_rejection_reason),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- In-app notification for Reader
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'ادائیگی تصدیق مسترد ہو گئی (Payment Verification Rejected)',
        'مصنف نے آپ کی بھیجی گئی رسید کو مسترد کیا ہے۔ وجہ: ' || pg_catalog.btrim(p_rejection_reason),
        '/orders/' || v_order.order_number,
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for Reader (critical event)
    PERFORM public.enqueue_email_for_notification(
        v_order.reader_id,
        'payment_rejected',
        'Payment Verification Declined — Order #' || v_order.order_number || ' | UNB Premium',
        'The author was unable to verify your payment deposit for Order #' || v_order.order_number || E'.\n\nReason: ' || pg_catalog.btrim(p_rejection_reason) || E'\n\nPlease check your bank statement or resubmit updated payment proof on your order page.',
        'payment_rejected:' || p_submission_id::text
    );

    -- Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        CASE WHEN public.is_admin() THEN 'admin' ELSE 'writer' END,
        'REJECT_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object('status', 'rejected', 'reason', pg_catalog.btrim(p_rejection_reason)),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(uuid, uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. MARK TIP NOT RECEIVED (Author reports deposit missing -> Notifies reader via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_tip_not_received(
    p_tip_id uuid,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id     uuid;
    v_is_admin      boolean;
    v_tip           record;
    v_note          text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    IF NOT v_is_admin AND v_tip.writer_id != v_caller_id THEN
        RAISE EXCEPTION 'Access denied: Only the tip recipient author or an admin can mark not received.';
    END IF;

    IF v_tip.status = 'not_received' THEN
        RETURN pg_catalog.to_jsonb(v_tip);
    END IF;

    IF v_tip.status != 'payment_submitted' THEN
        RAISE EXCEPTION 'Tip cannot be marked not received in % status.', v_tip.status;
    END IF;

    v_note := pg_catalog.substring(pg_catalog.btrim(coalesce(p_note, '')), 1, 500);

    UPDATE public.tips
    SET status = 'not_received',
        writer_reply = v_note,
        open_slot = NULL,
        not_received_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_tip_id
    RETURNING * INTO v_tip;

    -- In-app notification for reader
    INSERT INTO public.notifications (
        user_id, type, title, message, body, link, entity_refs, is_read, created_at
    ) VALUES (
        v_tip.reader_id,
        'tip_not_received',
        'Tip payment deposit could not be verified',
        coalesce(nullif(v_note, ''), 'The author was unable to verify the deposit in their account. If you believe this is an error, please contact support.'),
        'Deposit verification issue.',
        '/tips',
        pg_catalog.jsonb_build_object('tip_id', v_tip.id, 'tip_number', v_tip.tip_number),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for reader
    PERFORM public.enqueue_email_for_notification(
        v_tip.reader_id,
        'tip_not_received',
        'Tip Payment Verification Issue — ' || v_tip.tip_number || ' | UNB Premium',
        'The author was unable to verify the appreciation deposit in their bank account for tip ' || v_tip.tip_number || E'.\n\nNote from author: ' || coalesce(nullif(v_note, ''), 'Deposit could not be verified.') || E'\n\nIf you have questions, please reach out via platform support.',
        'tip_not_received:' || v_tip.id::text
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, CASE WHEN v_is_admin THEN 'admin' ELSE 'writer' END,
        'mark_tip_not_received', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object('tip_number', v_tip.tip_number, 'status', 'not_received', 'note', v_note),
        pg_catalog.now()
    );

    RETURN pg_catalog.to_jsonb(v_tip);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_tip_not_received(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_tip_not_received(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. GENERATE COMMISSION INVOICE (Platform fee invoice issued -> Notifies writer via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_commission_invoice(
    p_writer_id uuid,
    p_period_start timestamptz,
    p_period_end timestamptz,
    p_due_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_writer record;
    v_settings record;
    v_due_date timestamptz;
    v_sales_count integer := 0;
    v_total_gross numeric(12,2) := 0.00;
    v_total_comm numeric(12,2) := 0.00;
    v_invoice_num text;
    v_invoice_id uuid;
    r_entry record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can generate platform fee invoices.';
    END IF;

    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = p_writer_id;
    IF v_writer.id IS NULL THEN
        RAISE EXCEPTION 'Author profile not found: %', p_writer_id;
    END IF;

    IF p_period_start >= p_period_end THEN
        RAISE EXCEPTION 'Invalid billing period: start time must precede end time.';
    END IF;

    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
    v_due_date := coalesce(p_due_date, pg_catalog.now() + (coalesce(v_settings.invoice_grace_period_days, 7) || ' days')::interval);

    -- Calculate net platform fee totals
    SELECT
        coalesce(pg_catalog.count(*), 0),
        coalesce(pg_catalog.sum(gross_amount_pkr), 0.00),
        coalesce(pg_catalog.sum(platform_commission_pkr), 0.00)
    INTO v_sales_count, v_total_gross, v_total_comm
    FROM public.sales_ledger l
    WHERE l.writer_id = p_writer_id
      AND l.created_at >= p_period_start
      AND l.created_at <= p_period_end
      AND NOT EXISTS (
          SELECT 1 FROM public.commission_invoice_lines cil
          WHERE cil.ledger_entry_id = l.id
            AND cil.is_voided = false
      );

    IF v_total_comm <= 0 THEN
        RAISE EXCEPTION 'Net platform fee for this billing period is PKR % (must be strictly positive to bill author; refunds/adjustments offset sales).', v_total_comm;
    END IF;

    -- Generate invoice number: INV-YYYYMM-XXXXXX
    v_invoice_num := 'INV-' || pg_catalog.to_char(p_period_end AT TIME ZONE 'Asia/Karachi', 'YYYYMM') || '-' || pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    -- Insert commission invoice
    INSERT INTO public.commission_invoices (
        invoice_number,
        writer_id,
        period_start,
        period_end,
        total_sales_count,
        total_gross_pkr,
        total_commission_owed_pkr,
        amount_settled_pkr,
        status,
        due_date,
        created_at
    ) VALUES (
        v_invoice_num,
        p_writer_id,
        p_period_start,
        p_period_end,
        v_sales_count,
        v_total_gross,
        v_total_comm,
        0.00,
        'invoiced',
        v_due_date,
        pg_catalog.now()
    )
    RETURNING id INTO v_invoice_id;

    -- Insert invoice lines mapping each eligible ledger entry to this invoice
    FOR r_entry IN (
        SELECT l.id AS ledger_id, l.platform_commission_pkr
        FROM public.sales_ledger l
        WHERE l.writer_id = p_writer_id
          AND l.created_at >= p_period_start
          AND l.created_at <= p_period_end
          AND NOT EXISTS (
              SELECT 1 FROM public.commission_invoice_lines cil
              WHERE cil.ledger_entry_id = l.id
                AND cil.is_voided = false
          )
    ) LOOP
        INSERT INTO public.commission_invoice_lines (
            invoice_id,
            ledger_entry_id,
            commission_pkr,
            is_voided,
            created_at
        ) VALUES (
            v_invoice_id,
            r_entry.ledger_id,
            r_entry.platform_commission_pkr,
            false,
            pg_catalog.now()
        );
    END LOOP;

    -- In-app notification for writer
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
        p_writer_id,
        'invoice_generated',
        'پلیٹ فارم فیس انوائس جاری ہو گئی (Platform Fee Invoice Issued)',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا پلیٹ فارم فیس: PKR ' || v_total_comm || '۔ آخری تاریخ: ' || pg_catalog.to_char(v_due_date AT TIME ZONE 'Asia/Karachi', 'DD-MM-YYYY') || '۔',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا پلیٹ فارم فیس: PKR ' || v_total_comm || '۔',
        '/writer/commission/' || v_invoice_id,
        pg_catalog.jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_num, 'amount_pkr', v_total_comm),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for writer (critical event)
    PERFORM public.enqueue_email_for_notification(
        p_writer_id,
        'invoice_issued',
        'Platform Fee Invoice Issued — ' || v_invoice_num || ' | UNB Premium',
        'Your monthly platform fee invoice ' || v_invoice_num || ' has been generated.' || E'\n\nTotal platform fee due: PKR ' || v_total_comm || E'\nDue Date: ' || pg_catalog.to_char(v_due_date AT TIME ZONE 'Asia/Karachi', 'DD-MM-YYYY') || E'\n\nPlease view your invoice and submit payment verification via your Writer Studio.',
        'invoice_issued:' || v_invoice_id::text
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'GENERATE_COMMISSION_INVOICE',
        'commission_invoices',
        v_invoice_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'invoice_id', v_invoice_id,
            'invoice_number', v_invoice_num,
            'writer_id', p_writer_id,
            'total_gross_pkr', v_total_gross,
            'total_commission_owed_pkr', v_total_comm,
            'sales_count', v_sales_count,
            'due_date', v_due_date
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'total_commission_owed_pkr', v_total_comm,
        'sales_count', v_sales_count,
        'due_date', v_due_date
    );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz, timestamptz) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. CONFIRM COMMISSION SETTLEMENT (Admin verifies platform fee -> Notifies writer via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_commission_settlement(
    p_invoice_id uuid,
    p_amount_pkr numeric,
    p_admin_note text DEFAULT NULL,
    p_report_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoice record;
    v_report record;
    v_new_settled numeric(12,2);
    v_remaining numeric(12,2);
    v_new_status public.commission_invoice_status;
    v_payment_id uuid;
    v_new_unpaid numeric(12,2);
    v_is_paused boolean;
    v_tid text := NULL;
    v_proof text := NULL;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can confirm platform fee settlements.';
    END IF;

    IF p_amount_pkr <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be strictly positive (got PKR %).', p_amount_pkr;
    END IF;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF v_invoice.id IS NULL THEN
        RAISE EXCEPTION 'Platform fee invoice not found: %', p_invoice_id;
    END IF;

    IF v_invoice.status = 'void' THEN
        RAISE EXCEPTION 'Cannot confirm settlement on a voided invoice.';
    END IF;

    IF v_invoice.status = 'settled' OR v_invoice.amount_settled_pkr >= v_invoice.total_commission_owed_pkr THEN
        RAISE EXCEPTION 'Invoice % is already fully settled.', v_invoice.invoice_number;
    END IF;

    v_remaining := v_invoice.total_commission_owed_pkr - v_invoice.amount_settled_pkr;
    IF p_amount_pkr > v_remaining THEN
        RAISE EXCEPTION 'Settlement amount (PKR %) exceeds remaining unpaid invoice balance of PKR %.', p_amount_pkr, v_remaining;
    END IF;

    IF p_report_id IS NOT NULL THEN
        SELECT * INTO v_report
        FROM public.commission_payment_reports
        WHERE id = p_report_id AND invoice_id = p_invoice_id
        FOR UPDATE;

        IF v_report.id IS NULL THEN
            RAISE EXCEPTION 'Platform fee payment report % not found for invoice %.', p_report_id, p_invoice_id;
        END IF;

        IF v_report.status != 'pending' THEN
            RAISE EXCEPTION 'Platform fee payment report % has already been reviewed (current status: %).', p_report_id, v_report.status;
        END IF;

        v_tid := v_report.transaction_reference;
        v_proof := v_report.screenshot_path;

        UPDATE public.commission_payment_reports
        SET status = 'confirmed',
            admin_note = nullif(pg_catalog.btrim(p_admin_note), ''),
            reviewed_by = v_caller_id,
            reviewed_at = pg_catalog.now()
        WHERE id = p_report_id;
    END IF;

    v_new_settled := v_invoice.amount_settled_pkr + p_amount_pkr;
    IF v_new_settled >= v_invoice.total_commission_owed_pkr THEN
        v_new_status := 'settled'::public.commission_invoice_status;
    ELSE
        v_new_status := 'partially_paid'::public.commission_invoice_status;
    END IF;

    UPDATE public.commission_invoices
    SET amount_settled_pkr = v_new_settled,
        status = v_new_status,
        settled_by_admin_id = v_caller_id,
        settled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id;

    INSERT INTO public.commission_payments (
        invoice_id,
        writer_id,
        amount_pkr,
        transaction_reference,
        screenshot_url,
        confirmed_by_admin_id,
        confirmed_at,
        notes,
        created_at
    ) VALUES (
        p_invoice_id,
        v_invoice.writer_id,
        p_amount_pkr,
        v_tid,
        v_proof,
        v_caller_id,
        pg_catalog.now(),
        coalesce(nullif(pg_catalog.btrim(p_admin_note), ''), 'Platform fee payment confirmed by admin.'),
        pg_catalog.now()
    )
    RETURNING id INTO v_payment_id;

    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_invoice.writer_id);

    SELECT is_orders_paused_for_commission INTO v_is_paused
    FROM public.writer_profiles
    WHERE id = v_invoice.writer_id;

    -- In-app notification for writer
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
        v_invoice.writer_id,
        'commission_settled',
        'پلیٹ فارم فیس ادائیگی کی تصدیق (Platform Fee Payment Confirmed)',
        'آپ کی پلیٹ فارم فیس ادائیگی بمبلغ PKR ' || p_amount_pkr || ' کی تصدیق ہو چکی ہے۔ انوائس: ' || v_invoice.invoice_number,
        'آپ کی پلیٹ فارم فیس کی ادائیگی قبول کر لی گئی ہے۔ نئی واجب الادا پلیٹ فارم فیس: PKR ' || v_new_unpaid,
        '/writer/commission/' || p_invoice_id,
        pg_catalog.jsonb_build_object(
            'invoice_id', p_invoice_id,
            'payment_id', v_payment_id,
            'amount_pkr', p_amount_pkr,
            'remaining_balance', v_new_unpaid
        ),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for writer
    PERFORM public.enqueue_email_for_notification(
        v_invoice.writer_id,
        'invoice_settled',
        'Platform Fee Payment Confirmed — ' || v_invoice.invoice_number || ' | UNB Premium',
        'Your platform fee payment of PKR ' || p_amount_pkr || ' for invoice ' || v_invoice.invoice_number || ' has been confirmed.' || E'\n\nRemaining platform fee balance: PKR ' || v_new_unpaid || E'\n\nThank you for keeping your account in good standing.',
        'invoice_settled:' || v_payment_id::text
    );

    -- Record in immutable audit logs
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'CONFIRM_COMMISSION_SETTLEMENT',
        'commission_invoices',
        p_invoice_id::text,
        pg_catalog.jsonb_build_object(
            'status', v_invoice.status,
            'amount_settled_pkr', v_invoice.amount_settled_pkr
        ),
        pg_catalog.jsonb_build_object(
            'status', v_new_status,
            'amount_settled_pkr', v_new_settled,
            'payment_id', v_payment_id,
            'amount_pkr', p_amount_pkr,
            'remaining_commission_owed_pkr', v_new_unpaid,
            'is_orders_paused_for_commission', v_is_paused,
            'report_id', p_report_id
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'payment_id', v_payment_id,
        'amount_settled_pkr', v_new_settled,
        'status', v_new_status,
        'remaining_commission_owed_pkr', v_new_unpaid,
        'is_orders_paused_for_commission', v_is_paused
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_commission_settlement(uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_commission_settlement(uuid, numeric, text, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. REJECT COMMISSION REPORT (Admin rejects platform fee proof -> Notifies writer via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_commission_report(
    p_report_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_report record;
    v_invoice record;
    v_has_pending boolean;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can reject platform fee reports.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to reject a platform fee report.';
    END IF;

    SELECT * INTO v_report
    FROM public.commission_payment_reports
    WHERE id = p_report_id
    FOR UPDATE;

    IF v_report.id IS NULL THEN
        RAISE EXCEPTION 'Platform fee payment report not found: %', p_report_id;
    END IF;

    IF v_report.status != 'pending' THEN
        RAISE EXCEPTION 'Only pending payment reports can be rejected (current status: %).', v_report.status;
    END IF;

    UPDATE public.commission_payment_reports
    SET status = 'rejected',
        admin_note = trim(p_reason),
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_report_id;

    SELECT EXISTS (
        SELECT 1 FROM public.commission_payment_reports
        WHERE invoice_id = v_report.invoice_id
          AND status = 'pending'
    ) INTO v_has_pending;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = v_report.invoice_id;

    IF NOT v_has_pending AND v_invoice.status = 'payment_reported' THEN
        UPDATE public.commission_invoices
        SET status = CASE
            WHEN amount_settled_pkr > 0 THEN 'partially_paid'::public.commission_invoice_status
            ELSE 'invoiced'::public.commission_invoice_status
        END
        WHERE id = v_report.invoice_id;
    END IF;

    -- In-app notification for writer
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
        v_report.writer_id,
        'commission_report_rejected',
        'پلیٹ فارم فیس رپورٹ مسترد (Platform Fee Payment Report Rejected)',
        'انوائس کے لیے آپ کی جمع کردہ پلیٹ فارم فیس کی رسید مسترد کر دی گئی ہے۔ وجہ: ' || trim(p_reason),
        'پلیٹ فارم فیس کی رسید مسترد کر دی گئی ہے۔ وجہ: ' || trim(p_reason),
        '/writer/commission/' || v_report.invoice_id,
        pg_catalog.jsonb_build_object('report_id', p_report_id, 'invoice_id', v_report.invoice_id, 'reason', trim(p_reason)),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for writer
    PERFORM public.enqueue_email_for_notification(
        v_report.writer_id,
        'invoice_payment_rejected',
        'Platform Fee Payment Proof Declined — ' || v_invoice.invoice_number || ' | UNB Premium',
        'Your submitted platform fee payment proof for invoice ' || v_invoice.invoice_number || ' was declined.' || E'\n\nReason: ' || trim(p_reason) || E'\n\nPlease review your payment receipt and resubmit via your Writer Studio.',
        'invoice_payment_rejected:' || p_report_id::text
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'REJECT_COMMISSION_PAYMENT_REPORT',
        'commission_payment_reports',
        p_report_id::text,
        pg_catalog.jsonb_build_object('status', 'pending'),
        pg_catalog.jsonb_build_object(
            'status', 'rejected',
            'reason', trim(p_reason),
            'invoice_id', v_report.invoice_id
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'report_id', p_report_id,
        'invoice_id', v_report.invoice_id,
        'status', 'rejected'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_commission_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_commission_report(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. APPROVE WRITER (Admin approves author onboarding -> Notifies writer via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_writer(p_writer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can approve writers.';
    END IF;

    UPDATE public.writer_profiles
    SET status = 'approved',
        approved_by = v_caller_id,
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    UPDATE public.profiles
    SET role = 'writer',
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    -- In-app notification for writer
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
        p_writer_id,
        'writer_approved',
        'مصنف اکاؤنٹ منظور ہو گیا! (Writer Account Approved)',
        'مبارک ہو! آپ کا رائٹر پروفائل منظور ہو چکا ہے۔ اب آپ ناولز شائع کر سکتے ہیں۔',
        'مبارک ہو! آپ کا رائٹر پروفائل منظور ہو چکا ہے۔ اب آپ ناولز شائع کر سکتے ہیں۔',
        '/writer/dashboard',
        pg_catalog.jsonb_build_object('writer_id', p_writer_id),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for writer (critical event)
    PERFORM public.enqueue_email_for_notification(
        p_writer_id,
        'writer_approved',
        'Welcome to UNB Premium Writer Studio! — Application Approved',
        'Congratulations! Your author application has been approved by the editorial team.' || E'\n\nYou can now access your Writer Studio, set up your payment receiving methods, and publish your novels for readers.',
        'writer_approved:' || p_writer_id::text
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'APPROVE_WRITER',
        'writer_profiles',
        p_writer_id::text,
        NULL,
        pg_catalog.jsonb_build_object('status', 'approved'),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'writer_id', p_writer_id, 'status', 'approved');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_writer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_writer(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10. REJECT WRITER (Admin declines author onboarding -> Notifies applicant via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_writer(
    p_writer_id uuid,
    p_reason text
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can reject writers.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to reject a writer.';
    END IF;

    UPDATE public.writer_profiles
    SET status = 'rejected',
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    -- In-app notification for writer
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
        p_writer_id,
        'writer_rejected',
        'مصنف درخواست مسترد (Writer Application Rejected)',
        'آپ کی مصنف درخواست مسترد کر دی گئی ہے۔ وجہ: ' || trim(p_reason),
        trim(p_reason),
        '/contact',
        pg_catalog.jsonb_build_object('writer_id', p_writer_id, 'reason', trim(p_reason)),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for writer (critical event)
    PERFORM public.enqueue_email_for_notification(
        p_writer_id,
        'writer_rejected',
        'Author Application Status Update — UNB Premium',
        'Thank you for your interest in publishing on UNB Premium. After reviewing your application, our team was unable to approve it at this time.' || E'\n\nReason: ' || trim(p_reason) || E'\n\nIf you have questions, please contact our support team.',
        'writer_rejected:' || p_writer_id::text
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'REJECT_WRITER',
        'writer_profiles',
        p_writer_id::text,
        NULL,
        pg_catalog.jsonb_build_object('status', 'rejected', 'reason', trim(p_reason)),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'writer_id', p_writer_id, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_writer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_writer(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 11. APPROVE NOVEL (Admin approves novel -> Notifies author via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_novel(p_novel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can approve novels.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    UPDATE public.novels
    SET status = 'published',
        published_at = coalesce(published_at, pg_catalog.now()),
        moderation_reason = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    -- In-app notification for author
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
        v_novel.writer_id,
        'novel_published',
        'ناول شائع ہو گیا! (Novel Published)',
        'آپ کا ناول "' || v_novel.title_urdu || '" اب مارکیٹ پلیس پر لائیو اور خریداری کے لیے دستیاب ہے۔',
        'آپ کا ناول "' || v_novel.title_urdu || '" اب مارکیٹ پلیس پر لائیو اور خریداری کے لیے دستیاب ہے۔',
        '/novels/' || v_novel.slug,
        pg_catalog.jsonb_build_object('novel_id', p_novel_id),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for author (critical event)
    PERFORM public.enqueue_email_for_notification(
        v_novel.writer_id,
        'novel_approved',
        'Novel Approved & Published — ' || v_novel.title_urdu || ' | UNB Premium',
        'Congratulations! Your novel "' || v_novel.title_urdu || '" has been approved by our editorial team and is now live on the marketplace for readers to purchase and enjoy.',
        'novel_approved:' || p_novel_id::text
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'APPROVE_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', v_novel.status),
        pg_catalog.jsonb_build_object('status', 'published'),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'novel_id', p_novel_id, 'status', 'published');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_novel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_novel(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 12. REJECT NOVEL (Admin rejects novel -> Notifies author via email)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_novel(
    p_novel_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can reject novels.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A rejection reason is required.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    UPDATE public.novels
    SET status = 'rejected',
        moderation_reason = trim(p_reason),
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    -- In-app notification for author
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
        v_novel.writer_id,
        'novel_rejected',
        'ناول اشاعت مسترد (Novel Moderation Rejected)',
        'آپ کے ناول "' || v_novel.title_urdu || '" کی اشاعت مسترد کر دی گئی ہے۔ وجہ: ' || trim(p_reason),
        trim(p_reason),
        '/writer/novels',
        pg_catalog.jsonb_build_object('novel_id', p_novel_id, 'reason', trim(p_reason)),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for author (critical event)
    PERFORM public.enqueue_email_for_notification(
        v_novel.writer_id,
        'novel_rejected',
        'Novel Moderation Update — ' || v_novel.title_urdu || ' | UNB Premium',
        'Your novel submission "' || v_novel.title_urdu || '" was not approved for publication at this time.' || E'\n\nEditorial feedback: ' || trim(p_reason) || E'\n\nPlease review our content guidelines, make necessary revisions in your Writer Studio, and resubmit.',
        'novel_rejected:' || p_novel_id::text
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'REJECT_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', v_novel.status),
        pg_catalog.jsonb_build_object('status', 'rejected', 'reason', trim(p_reason)),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'novel_id', p_novel_id, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_novel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_novel(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 13. CREATE SUPPORT REQUEST (User opens ticket -> Notifies active admins)
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
    v_admin record;
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
    WHERE user_id = v_caller_id AND created_at > pg_catalog.now() - interval '1 day';

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
        pg_catalog.now(),
        pg_catalog.now()
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
        pg_catalog.now()
    );

    -- Notify active administrators via in-app & email outbox
    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND coalesce(is_active, true) = true LOOP
        INSERT INTO public.notifications (
            user_id, type, title, message, body, link, entity_refs, is_read, created_at
        ) VALUES (
            v_admin.id,
            'support_ticket_created',
            'New Support Ticket: ' || trim(p_subject),
            'A new customer support ticket has been submitted.',
            substring(trim(p_body) from 1 for 150),
            '/admin/support/' || v_req_id,
            pg_catalog.jsonb_build_object('request_id', v_req_id),
            false,
            pg_catalog.now()
        );

        PERFORM public.enqueue_email_for_notification(
            v_admin.id,
            'support_ticket_created',
            'New Support Ticket — ' || trim(p_subject) || ' | UNB Admin',
            'A new customer support ticket has been submitted.' || E'\n\nSubject: ' || trim(p_subject) || E'\nCategory: ' || p_category || E'\n\nMessage:\n' || trim(p_body) || E'\n\nPlease view and respond in the Admin Support Desk.',
            'support_ticket_created:' || v_req_id::text || ':' || v_admin.id::text
        );
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'request_id', v_req_id,
        'status', 'open'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_request(text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_support_request(text, text, text, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 14. ADD SUPPORT MESSAGE (Thread reply -> Notifies user or administrators via email)
-- -----------------------------------------------------------------------------
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
    v_admin record;
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
        pg_catalog.now()
    )
    RETURNING id INTO v_msg_id;

    -- If Admin replied -> notify user
    IF v_role = 'admin' THEN
        UPDATE public.support_requests
        SET status = 'answered',
            updated_at = pg_catalog.now()
        WHERE id = p_request_id;

        -- In-app notification for user
        INSERT INTO public.notifications (
            user_id, type, title, message, body, link, entity_refs, is_read, created_at
        ) VALUES (
            v_req.user_id,
            'support_reply',
            'Support replied: ' || v_req.subject,
            'An administrator replied to your support request.',
            substring(trim(p_body) from 1 for 150),
            '/support/' || p_request_id,
            pg_catalog.jsonb_build_object('request_id', p_request_id),
            false,
            pg_catalog.now()
        );

        -- Transactional email outbox for user (critical event)
        PERFORM public.enqueue_email_for_notification(
            v_req.user_id,
            'support_reply',
            'Support Reply: ' || v_req.subject || ' | UNB Premium',
            'A member of our support team has replied to your request: "' || v_req.subject || E'".\n\nReply:\n' || trim(p_body) || E'\n\nPlease view the full conversation and reply directly in your Support Desk.',
            'support_reply:' || v_msg_id::text
        );
    ELSE
        -- If User replied -> set status open and notify active administrators
        UPDATE public.support_requests
        SET status = 'open',
            updated_at = pg_catalog.now()
        WHERE id = p_request_id;

        FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND coalesce(is_active, true) = true LOOP
            INSERT INTO public.notifications (
                user_id, type, title, message, body, link, entity_refs, is_read, created_at
            ) VALUES (
                v_admin.id,
                'support_message_received',
                'User Reply on Ticket: ' || v_req.subject,
                'A user posted a reply to support ticket #' || substring(p_request_id::text from 1 for 8),
                substring(trim(p_body) from 1 for 150),
                '/admin/support/' || p_request_id,
                jsonb_build_object('request_id', p_request_id),
                false,
                pg_catalog.now()
            );

            PERFORM public.enqueue_email_for_notification(
                v_admin.id,
                'support_message_received',
                'User Reply on Support Ticket — ' || v_req.subject || ' | UNB Admin',
                'The user has posted a reply to support ticket "' || v_req.subject || E'".\n\nUser Message:\n' || trim(p_body) || E'\n\nPlease review and reply in the Admin Support Desk.',
                'support_message_received:' || v_msg_id::text || ':' || v_admin.id::text
            );
        END LOOP;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'message_id', v_msg_id,
        'created_at', pg_catalog.now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.add_support_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_support_message(uuid, text) TO authenticated;

