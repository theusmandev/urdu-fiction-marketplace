-- ==============================================================================
-- UNB Premium — Migration 0010: Dispute & Writer Status Gap Fixes (Step 1.2e)
-- Description:
--   1. Partial Unique Index: Recreate uq_orders_reader_novel_active to cover 'disputed'
--      alongside 'pending_payment', 'payment_submitted', 'rejected'.
--   2. create_order: Include 'disputed' in open-order check.
--   3. admin_force_verify: Raise exception if reader already holds an active entitlement
--      for the novel, or if a sale_verified ledger row already exists for the order.
--      Also resolve any associated open dispute.
--   4. platform_settings: Add column dispute_window_days integer default 30.
--   5. open_dispute: Allow only for orders in payment_submitted, rejected, or verified;
--      enforce dispute window from platform_settings; for verified orders, maintain
--      verified status and track dispute solely in disputes.status ('open').
--   6. resolve_dispute: Preserve verified status for verified orders without overwriting
--      to rejected; never create a second entitlement or ledger row.
--   7. writer_profiles trigger & apply_as_writer: Non-admin may only transition status
--      from 'rejected' to 'pending_approval' when invoked through apply_as_writer
--      (verified via transaction-local setting app.writer_reapply). Suspended or
--      approved writers can never self-update their status.
--   8. Security hardening: Permissions granted to authenticated role.
-- Idempotency: All DDL statements are guarded with IF EXISTS / IF NOT EXISTS.
-- Compatibility: Supabase CLI (supabase db push) and Supabase SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: PLATFORM SETTINGS DISPUTE WINDOW
-- ------------------------------------------------------------------------------

ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS dispute_window_days integer NOT NULL DEFAULT 30;


-- ------------------------------------------------------------------------------
-- SECTION 2: PARTIAL UNIQUE INDEX ON ACTIVE, REJECTED & DISPUTED ORDERS
-- ------------------------------------------------------------------------------

-- Include 'disputed' in partial unique index so readers cannot open a second order
-- for a novel while an existing disputed order is awaiting resolution.
DROP INDEX IF EXISTS public.uq_orders_reader_novel_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_reader_novel_active
    ON public.orders (reader_id, novel_id)
    WHERE status IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed');


-- ------------------------------------------------------------------------------
-- SECTION 3: CREATE ORDER RPC (INCLUDES 'disputed' IN OPEN-ORDER CHECK)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order(
    p_novel_id uuid,
    p_payment_method_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
    v_writer record;
    v_method record;
    v_default_rate numeric(5,2);
    v_applied_rate numeric(5,2);
    v_commission_pkr numeric(10,2);
    v_writer_share_pkr numeric(10,2);
    v_order_number text;
    v_order_id uuid;
    v_instructions jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create an order.';
    END IF;

    -- Fetch novel
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.status != 'published' THEN
        RAISE EXCEPTION 'Novel is not available for purchase (status: %).', v_novel.status;
    END IF;

    -- Self-purchase check: Writer cannot purchase their own novel
    IF v_novel.writer_id = v_caller_id THEN
        RAISE EXCEPTION 'Authors cannot purchase their own novels.';
    END IF;

    -- Fetch writer profile
    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_novel.writer_id;

    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RAISE EXCEPTION 'Writer is currently not eligible to receive orders.';
    END IF;

    IF v_writer.is_orders_paused_for_commission THEN
        RAISE EXCEPTION 'Orders for this author are currently paused due to accrued commission limit.';
    END IF;

    -- Check if reader already owns an active entitlement
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND is_revoked = false
    ) THEN
        RAISE EXCEPTION 'You already hold an active purchase entitlement for this novel.';
    END IF;

    -- Check if reader already has an open, rejected, or disputed order for this novel
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND status IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed')
    ) THEN
        RAISE EXCEPTION 'An active, rejected, or disputed order for this novel already exists in your account. Please resolve your existing order before placing a new one.';
    END IF;

    -- Fetch and validate writer payment method
    SELECT * INTO v_method
    FROM public.writer_payment_methods
    WHERE id = p_payment_method_id
      AND writer_id = v_novel.writer_id
      AND is_active = true;

    IF v_method.id IS NULL THEN
        RAISE EXCEPTION 'Selected payment method is invalid or inactive.';
    END IF;

    -- Snapshot payment instructions
    v_instructions := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Fetch default commission rate from platform_settings
    SELECT default_commission_rate INTO v_default_rate
    FROM public.platform_settings
    WHERE id = 1;

    v_default_rate := coalesce(v_default_rate, 20.00);

    -- Authoritative rate calculation
    v_applied_rate := coalesce(v_writer.custom_commission_rate, v_default_rate);

    -- Round commission and writer share
    v_commission_pkr := pg_catalog.round((v_novel.price_pkr * v_applied_rate / 100.0), 2);
    v_writer_share_pkr := v_novel.price_pkr - v_commission_pkr;

    -- Generate unique human-readable order number
    v_order_number := 'ORD-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || pg_catalog.upper(substr(pg_catalog.gen_random_uuid()::text, 1, 8));

    -- Insert order
    INSERT INTO public.orders (
        order_number,
        reader_id,
        writer_id,
        novel_id,
        amount_pkr,
        payment_method,
        payment_instructions_snapshot,
        applied_commission_rate,
        calculated_commission_pkr,
        calculated_writer_share_pkr,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_order_number,
        v_caller_id,
        v_novel.writer_id,
        p_novel_id,
        v_novel.price_pkr,
        v_method.method_type::text::public.payment_method_type,
        v_instructions,
        v_applied_rate,
        v_commission_pkr,
        v_writer_share_pkr,
        'pending_payment',
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING id INTO v_order_id;

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
        'reader',
        'CREATE_ORDER',
        'orders',
        v_order_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'order_number', v_order_number,
            'novel_id', p_novel_id,
            'amount_pkr', v_novel.price_pkr,
            'writer_id', v_novel.writer_id,
            'status', 'pending_payment'
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'amount_pkr', v_novel.price_pkr,
        'payment_instructions', v_instructions,
        'status', 'pending_payment'
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 4: ADMIN FORCE-VERIFY RPC (HARDENED AGAINST DOUBLE SALES & DUPLICATES)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_force_verify(
    p_order_id uuid,
    p_admin_note text
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
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can force-verify orders.';
    END IF;

    IF p_admin_note IS NULL OR trim(p_admin_note) = '' THEN
        RAISE EXCEPTION 'An admin note is required to force-verify an order.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Only allow orders in payment_submitted, rejected, or disputed
    IF v_order.status NOT IN ('payment_submitted', 'rejected', 'disputed') THEN
        RAISE EXCEPTION 'Order is not in a force-verifiable state (current status: %).', v_order.status;
    END IF;

    -- Invariant: Reader must not already hold an active entitlement for this novel
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id
          AND novel_id = v_order.novel_id
          AND is_revoked = false
    ) THEN
        RAISE EXCEPTION 'Reader already holds an active entitlement for this novel.';
    END IF;

    -- Invariant: A sale_verified ledger entry must not already exist for this order
    IF EXISTS (
        SELECT 1 FROM public.sales_ledger
        WHERE order_id = v_order.id
          AND entry_type = 'sale_verified'
    ) THEN
        RAISE EXCEPTION 'A sale_verified ledger entry already exists for this order.';
    END IF;

    -- Fetch latest payment submission
    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Determine authoritative commission rate at verification time
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);
    v_commission_pkr := pg_catalog.round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update Payment Submission if present
    IF v_submission.id IS NOT NULL THEN
        UPDATE public.payment_submissions
        SET reviewer_status = 'verified',
            reviewer_note = 'Admin force-verified: ' || trim(p_admin_note),
            reviewed_by = v_caller_id,
            reviewed_at = pg_catalog.now()
        WHERE id = v_submission.id;
    END IF;

    -- 2. If an open dispute exists on this order, resolve it in favor of reader
    UPDATE public.disputes
    SET status = 'resolved_for_reader',
        resolution_note = 'Resolved via admin force verification: ' || trim(p_admin_note),
        admin_resolution_notes = 'Resolved via admin force verification: ' || trim(p_admin_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE order_id = p_order_id AND status IN ('open', 'under_review');

    -- 3. Update Order
    UPDATE public.orders
    SET status = 'verified',
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 4. Grant Purchase Entitlement
    INSERT INTO public.purchase_entitlements (
        reader_id,
        novel_id,
        order_id,
        granted_at,
        is_revoked,
        revoked_reason
    ) VALUES (
        v_order.reader_id,
        v_order.novel_id,
        v_order.id,
        pg_catalog.now(),
        false,
        NULL
    )
    RETURNING id INTO v_entitlement_id;

    -- 5. Record Immutable Entry in Sales Ledger
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
        'Admin force-verified: ' || trim(p_admin_note),
        pg_catalog.now()
    )
    RETURNING id INTO v_ledger_id;

    -- 6. Reconcile Writer Accrued Unpaid Commission from Ledger
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 7. Send Notifications
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
    ) VALUES 
    (
        v_order.reader_id,
        'order_verified',
        'ادائیگی کی تصدیق ہو گئی (Payment Verified)',
        'ایڈمن نے آپ کی کتاب تک رسائی بحال کر دی ہے۔ (Novel access granted by admin)',
        trim(p_admin_note),
        '/novels/' || v_order.novel_id,
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'novel_id', v_order.novel_id),
        false,
        pg_catalog.now()
    ),
    (
        v_order.writer_id,
        'order_verified',
        'آرڈر تصدیق (Admin Force-Verified)',
        'ایڈمن نے آرڈر نمبر ' || v_order.order_number || ' کی ادائیگی کی تصدیق کر دی ہے۔',
        trim(p_admin_note),
        '/writer/orders',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'novel_id', v_order.novel_id),
        false,
        pg_catalog.now()
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
        'admin',
        'ADMIN_FORCE_VERIFY',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object(
            'status', 'verified',
            'note', trim(p_admin_note),
            'rate', v_rate,
            'commission_pkr', v_commission_pkr,
            'writer_share_pkr', v_writer_share_pkr,
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id,
        'current_unpaid_commission', v_new_unpaid,
        'is_orders_paused_for_commission', coalesce(v_paused, false)
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 5: OPEN DISPUTE RPC (HARDENED WINDOW & STATUS HANDLING)
-- ------------------------------------------------------------------------------

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
    v_reference_time timestamptz;
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

    -- Dispute window validation from platform_settings
    SELECT dispute_window_days INTO v_window_days
    FROM public.platform_settings
    WHERE id = 1;

    v_window_days := coalesce(v_window_days, 30);
    v_reference_time := coalesce(v_order.verified_at, v_order.created_at);

    IF v_reference_time < (pg_catalog.now() - (v_window_days || ' days')::interval) THEN
        RAISE EXCEPTION 'The dispute window for this order has expired (% days limit).', v_window_days;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.disputes
        WHERE order_id = p_order_id AND status IN ('open', 'under_review')
    ) THEN
        RAISE EXCEPTION 'An open dispute already exists for this order.';
    END IF;

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
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING id INTO v_dispute_id;

    -- For payment_submitted or rejected orders, update order status to 'disputed'.
    -- For verified orders, preserve 'verified' status so reader does not lose entitlement
    -- during review. The dispute is tracked in disputes.status ('open').
    IF v_order.status IN ('payment_submitted', 'rejected') THEN
        UPDATE public.orders
        SET status = 'disputed',
            updated_at = pg_catalog.now()
        WHERE id = p_order_id;
    ELSE
        UPDATE public.orders
        SET updated_at = pg_catalog.now()
        WHERE id = p_order_id;
    END IF;

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
        'تنازعہ درج کیا گیا (Dispute Raised)',
        'آرڈر نمبر ' || v_order.order_number || ' پر تنازعہ کھولا گیا ہے۔',
        'آرڈر نمبر ' || v_order.order_number || ' پر تنازعہ کھولا گیا ہے۔ وجہ: ' || trim(p_reason),
        '/library/orders',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'dispute_id', v_dispute_id),
        false,
        pg_catalog.now()
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
        CASE WHEN public.is_admin() THEN 'admin' WHEN v_caller_id = v_order.writer_id THEN 'writer' ELSE 'reader' END,
        'OPEN_DISPUTE',
        'disputes',
        v_dispute_id::text,
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'prior_order_status', v_order.status),
        pg_catalog.jsonb_build_object('dispute_id', v_dispute_id, 'reason', trim(p_reason)),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispute_id', v_dispute_id,
        'status', 'open',
        'order_status', CASE WHEN v_order.status IN ('payment_submitted', 'rejected') THEN 'disputed' ELSE v_order.status END
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 6: RESOLVE DISPUTE RPC (NO DOUBLE ENTITLEMENTS / SAFE OUTCOMES)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_dispute(
    p_dispute_id uuid,
    p_resolution text,
    p_resolution_note text
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

    IF p_resolution NOT IN ('resolved_for_reader', 'resolved_for_writer', 'closed') THEN
        RAISE EXCEPTION 'Invalid dispute resolution option: %', p_resolution;
    END IF;

    IF p_resolution_note IS NULL OR trim(p_resolution_note) = '' THEN
        RAISE EXCEPTION 'A resolution note is required.';
    END IF;

    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_dispute.order_id
    FOR UPDATE;

    -- Update dispute status and notes
    UPDATE public.disputes
    SET status = p_resolution::public.dispute_status,
        resolution_note = trim(p_resolution_note),
        admin_resolution_notes = trim(p_resolution_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_dispute_id;

    -- OUTCOME LOGIC:
    -- Invariant: resolve_dispute never creates an entitlement or ledger row directly.
    -- If the order was in 'disputed' (opened from payment_submitted or rejected):
    IF v_order.status = 'disputed' THEN
        IF p_resolution = 'resolved_for_writer' THEN
            UPDATE public.orders
            SET status = 'rejected',
                rejected_reason = 'Dispute resolved in favor of writer: ' || trim(p_resolution_note),
                updated_at = pg_catalog.now()
            WHERE id = v_order.id;
        ELSIF p_resolution = 'resolved_for_reader' THEN
            -- Order remains in 'disputed' for explicit admin action (admin_force_verify).
            -- This ensures no automatic entitlement or ledger row creation without verification checks.
            UPDATE public.orders
            SET updated_at = pg_catalog.now()
            WHERE id = v_order.id;
        ELSIF p_resolution = 'closed' THEN
            UPDATE public.orders
            SET status = 'rejected',
                rejected_reason = 'Dispute closed without resolution: ' || trim(p_resolution_note),
                updated_at = pg_catalog.now()
            WHERE id = v_order.id;
        END IF;
    ELSE
        -- If order is 'verified':
        -- Preserve 'verified' status. Do NOT overwrite to 'rejected'.
        -- Any financial reversal must occur via explicit record_refund_adjustment RPC.
        UPDATE public.orders
        SET updated_at = pg_catalog.now()
        WHERE id = v_order.id;
    END IF;

    -- Notify reader and writer
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
    ) VALUES 
    (
        v_order.reader_id,
        'dispute_resolved',
        'تنازعہ حل ہو گیا (Dispute Resolved)',
        'آرڈر نمبر ' || v_order.order_number || ' پر تنازعہ حل کر دیا گیا ہے۔ نتیجہ: ' || p_resolution,
        trim(p_resolution_note),
        '/library/orders',
        pg_catalog.jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', p_resolution),
        false,
        pg_catalog.now()
    ),
    (
        v_order.writer_id,
        'dispute_resolved',
        'تنازعہ حل ہو گیا (Dispute Resolved)',
        'آرڈر نمبر ' || v_order.order_number || ' پر تنازعہ حل کر دیا گیا ہے۔ نتیجہ: ' || p_resolution,
        trim(p_resolution_note),
        '/writer/orders',
        pg_catalog.jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', p_resolution),
        false,
        pg_catalog.now()
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
        'admin',
        'RESOLVE_DISPUTE',
        'disputes',
        p_dispute_id::text,
        pg_catalog.jsonb_build_object('status', v_dispute.status),
        pg_catalog.jsonb_build_object('resolution', p_resolution, 'note', trim(p_resolution_note)),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispute_id', p_dispute_id,
        'resolution', p_resolution
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 7: WRITER APPLICATION & REAPPLICATION TRIGGER HARDENING
-- ------------------------------------------------------------------------------

-- Update trigger function so non-admin may ONLY change status from 'rejected' to 'pending_approval'
-- when called through apply_as_writer (verified via transaction-local setting 'app.writer_reapply').
-- Suspended or approved writers can NEVER change their own status.
CREATE OR REPLACE FUNCTION public.trg_protect_writer_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_db_admin boolean;
BEGIN
    v_is_db_admin := (auth.uid() IS NULL AND pg_catalog.current_setting('role', true) NOT IN ('authenticated', 'anon'));

    IF NOT v_is_db_admin AND NOT public.is_admin() THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            -- Non-admin can ONLY change status from 'rejected' to 'pending_approval',
            -- and ONLY when called through apply_as_writer (app.writer_reapply = '1').
            -- Suspended, approved, or pending writers are strictly forbidden from changing status.
            IF NOT (
                OLD.status = 'rejected' AND
                NEW.status = 'pending_approval' AND
                OLD.id = auth.uid() AND
                pg_catalog.current_setting('app.writer_reapply', true) = '1'
            ) THEN
                RAISE EXCEPTION 'Unauthorized: Writer approval status can only be modified by administrators or via the formal reapplication process.';
            END IF;
        END IF;
        IF NEW.custom_commission_rate IS DISTINCT FROM OLD.custom_commission_rate THEN
            RAISE EXCEPTION 'Unauthorized: Writer custom commission rate is managed by administrators.';
        END IF;
        IF NEW.unpaid_commission_limit IS DISTINCT FROM OLD.unpaid_commission_limit THEN
            RAISE EXCEPTION 'Unauthorized: Unpaid commission limit is managed by administrators.';
        END IF;
        IF NEW.current_unpaid_commission IS DISTINCT FROM OLD.current_unpaid_commission THEN
            RAISE EXCEPTION 'Unauthorized: Unpaid commission balance is managed exclusively by ledger reconciliation.';
        END IF;
        IF NEW.is_orders_paused_for_commission IS DISTINCT FROM OLD.is_orders_paused_for_commission THEN
            RAISE EXCEPTION 'Unauthorized: Order pause state is automated based on accrued commission threshold.';
        END IF;
        IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
            RAISE EXCEPTION 'Unauthorized: Approver reference is managed by administrators.';
        END IF;
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Unauthorized: Writer profile identifier is immutable.';
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

-- apply_as_writer RPC: sets transaction-local setting 'app.writer_reapply' to '1'
CREATE OR REPLACE FUNCTION public.apply_as_writer(
    p_pen_name_urdu text,
    p_pen_name_english text,
    p_bio_urdu text DEFAULT NULL,
    p_bio_english text DEFAULT NULL,
    p_accept_agreement boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_existing record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_accept_agreement IS NOT TRUE THEN
        RAISE EXCEPTION 'You must accept the writer platform agreement to apply.';
    END IF;

    IF p_pen_name_urdu IS NULL OR trim(p_pen_name_urdu) = '' THEN
        RAISE EXCEPTION 'Urdu pen name is required.';
    END IF;

    IF p_pen_name_english IS NULL OR trim(p_pen_name_english) = '' THEN
        RAISE EXCEPTION 'English pen name is required.';
    END IF;

    SELECT * INTO v_existing
    FROM public.writer_profiles
    WHERE id = v_caller_id;

    IF v_existing.id IS NOT NULL THEN
        IF v_existing.status != 'rejected' THEN
            RAISE EXCEPTION 'A writer application already exists for your account with status: %', v_existing.status;
        END IF;

        -- Set transaction-local setting so trigger allows reapplication transition
        PERFORM pg_catalog.set_config('app.writer_reapply', '1', true);

        -- Reapplication for rejected writer
        UPDATE public.writer_profiles
        SET pen_name_urdu = trim(p_pen_name_urdu),
            pen_name_english = trim(p_pen_name_english),
            bio_urdu = trim(p_bio_urdu),
            bio_english = trim(p_bio_english),
            status = 'pending_approval',
            agreement_accepted_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_caller_id;
    ELSE
        -- Fresh application
        INSERT INTO public.writer_profiles (
            id,
            pen_name_urdu,
            pen_name_english,
            bio_urdu,
            bio_english,
            status,
            agreement_accepted_at,
            created_at,
            updated_at
        ) VALUES (
            v_caller_id,
            trim(p_pen_name_urdu),
            trim(p_pen_name_english),
            trim(p_bio_urdu),
            trim(p_bio_english),
            'pending_approval',
            pg_catalog.now(),
            pg_catalog.now(),
            pg_catalog.now()
        );
    END IF;

    -- Audit Log (never modifies profiles.role; approve_writer handles role upgrade)
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
        'reader',
        'APPLY_AS_WRITER',
        'writer_profiles',
        v_caller_id::text,
        CASE WHEN v_existing.id IS NOT NULL THEN pg_catalog.jsonb_build_object('status', v_existing.status) ELSE NULL END,
        pg_catalog.jsonb_build_object(
            'status', 'pending_approval',
            'pen_name_urdu', trim(p_pen_name_urdu),
            'pen_name_english', trim(p_pen_name_english)
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'writer_id', v_caller_id,
        'status', 'pending_approval'
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 8: PERMISSIONS
-- ------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.create_order(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_force_verify(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_force_verify(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.open_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_as_writer(text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_as_writer(text, text, text, text, boolean) TO authenticated;
