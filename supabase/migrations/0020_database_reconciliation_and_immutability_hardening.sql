-- ==============================================================================
-- UNB Premium — Migration 0020: Database Reconciliation & Immutability Hardening
-- Description:
--   1. Clean up stale overloaded signatures for update_platform_settings.
--   2. Authoritative update_platform_settings reading/writing real platform_settings
--      columns (default_unpaid_commission_limit, etc.) and supporting parameter
--      aliases without runtime schema mismatch errors.
--   3. Corrected verify_order_payment with partial unique index matching on
--      purchase_entitlements ((reader_id, novel_id) WHERE is_revoked = false) and
--      sales_ledger ((order_id) WHERE entry_type = 'sale_verified'), idempotent retry.
--   4. Corrected admin_force_verify with partial index alignment and idempotency.
--   5. Corrected resolve_dispute_for_reader_verify fixing non-existent created_at
--      column on purchase_entitlements (using real column granted_at) and partial
--      unique index conflict target.
--   6. Immutability triggers on sales_ledger and audit_logs (BEFORE UPDATE OR DELETE
--      and BEFORE TRUNCATE) raising exceptions with search_path set.
--   7. Explicit privilege lockdowns on functions and tables.
-- Idempotency: All DDL guarded with IF EXISTS / DROP ... IF EXISTS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: CLEAN UP STALE FUNCTION OVERLOADS
-- ------------------------------------------------------------------------------

-- Drop all previous update_platform_settings overloads to eliminate ambiguity
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, numeric, text);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, integer, text);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer);


-- ------------------------------------------------------------------------------
-- SECTION 2: CANONICAL update_platform_settings (Reconciled with Real Columns)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_platform_settings(
    p_default_commission_rate numeric DEFAULT NULL,
    p_default_unpaid_commission_limit numeric DEFAULT NULL,
    p_min_novel_price_pkr integer DEFAULT NULL,
    p_max_novel_price_pkr numeric DEFAULT NULL,
    p_dispute_window_days integer DEFAULT NULL,
    p_max_orders_per_hour integer DEFAULT NULL,
    p_max_chapter_reads_per_window integer DEFAULT NULL,
    p_chapter_read_window_minutes integer DEFAULT NULL,
    p_invoice_due_days integer DEFAULT NULL,
    p_overdue_grace_days integer DEFAULT NULL,
    p_min_dispute_wait_hours integer DEFAULT NULL,
    p_verification_reminder_hours integer DEFAULT NULL,
    p_support_email text DEFAULT NULL,
    p_unpaid_commission_threshold_pkr numeric DEFAULT NULL,
    p_payment_verification_window_hours integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_old_settings jsonb;
    v_new_settings jsonb;
    v_effective_unpaid_limit numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can update platform settings.';
    END IF;

    -- Resolve unpaid commission limit alias if legacy parameter was passed
    v_effective_unpaid_limit := coalesce(p_default_unpaid_commission_limit, p_unpaid_commission_threshold_pkr);

    -- Capture old settings for audit log
    SELECT to_jsonb(s) INTO v_old_settings
    FROM public.platform_settings s
    WHERE id = 1;

    -- Domain Validations against schema check constraints
    IF p_default_commission_rate IS NOT NULL AND (p_default_commission_rate < 0 OR p_default_commission_rate > 100) THEN
        RAISE EXCEPTION 'Commission rate must be between 0 and 100.';
    END IF;

    IF v_effective_unpaid_limit IS NOT NULL AND v_effective_unpaid_limit < 0 THEN
        RAISE EXCEPTION 'Default unpaid commission limit must be non-negative.';
    END IF;

    IF p_min_novel_price_pkr IS NOT NULL AND (p_min_novel_price_pkr < 50 OR p_min_novel_price_pkr > 5000) THEN
        RAISE EXCEPTION 'Minimum novel price must be between 50 and 5000 PKR.';
    END IF;

    IF p_max_novel_price_pkr IS NOT NULL AND (p_max_novel_price_pkr < 50 OR p_max_novel_price_pkr > 5000) THEN
        RAISE EXCEPTION 'Maximum novel price must be between 50 and 5000 PKR.';
    END IF;

    IF p_dispute_window_days IS NOT NULL AND (p_dispute_window_days < 1 OR p_dispute_window_days > 90) THEN
        RAISE EXCEPTION 'Dispute window days must be between 1 and 90.';
    END IF;

    IF p_max_orders_per_hour IS NOT NULL AND (p_max_orders_per_hour < 1 OR p_max_orders_per_hour > 100) THEN
        RAISE EXCEPTION 'Max orders per hour must be between 1 and 100.';
    END IF;

    IF p_max_chapter_reads_per_window IS NOT NULL AND (p_max_chapter_reads_per_window < 1 OR p_max_chapter_reads_per_window > 1000) THEN
        RAISE EXCEPTION 'Max chapter reads per window must be between 1 and 1000.';
    END IF;

    IF p_chapter_read_window_minutes IS NOT NULL AND (p_chapter_read_window_minutes < 1 OR p_chapter_read_window_minutes > 1440) THEN
        RAISE EXCEPTION 'Chapter read window minutes must be between 1 and 1440.';
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

    -- Update strictly the authoritative columns of public.platform_settings
    UPDATE public.platform_settings
    SET default_commission_rate = coalesce(p_default_commission_rate, default_commission_rate),
        default_unpaid_commission_limit = coalesce(v_effective_unpaid_limit, default_unpaid_commission_limit),
        min_novel_price_pkr = coalesce(p_min_novel_price_pkr, min_novel_price_pkr),
        max_novel_price_pkr = coalesce(p_max_novel_price_pkr, max_novel_price_pkr),
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

    -- Fetch newly persisted state
    SELECT to_jsonb(s) INTO v_new_settings
    FROM public.platform_settings s
    WHERE id = 1;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, previous_state, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'update_platform_settings', 'platform_settings', '1', v_old_settings, v_new_settings, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Platform settings successfully updated.',
        'settings', v_new_settings
    );
END;
$$;

COMMENT ON FUNCTION public.update_platform_settings IS
'Authoritative single procedure to configure platform-wide settings with audit logging.';

REVOKE ALL ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 3: CANONICAL verify_order_payment (With Partial Unique Index Predicates)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_writer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    -- Idempotency check: If order is ALREADY verified, return existing details safely without duplicate records
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

        RETURN jsonb_build_object(
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

    IF v_submission.reviewer_status != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be verified: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);
    v_commission_pkr := round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update Payment Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'verified',
        reviewer_note = trim(p_writer_note),
        reviewed_by = v_caller_id,
        reviewed_at = now()
    WHERE id = p_submission_id;

    -- 2. Update Order
    UPDATE public.orders
    SET status = 'verified',
        verified_at = now(),
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        updated_at = now()
    WHERE id = p_order_id;

    -- 3. Upsert Purchase Entitlement with partial unique index predicate
    SELECT id INTO v_entitlement_id
    FROM public.purchase_entitlements
    WHERE order_id = v_order.id
    LIMIT 1;

    IF v_entitlement_id IS NOT NULL THEN
        UPDATE public.purchase_entitlements
        SET is_revoked = false,
            revoked_reason = NULL,
            granted_at = now()
        WHERE id = v_entitlement_id;
    ELSE
        SELECT id INTO v_entitlement_id
        FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id
          AND novel_id = v_order.novel_id
          AND is_revoked = false
        LIMIT 1;

        IF v_entitlement_id IS NOT NULL THEN
            UPDATE public.purchase_entitlements
            SET granted_at = now()
            WHERE id = v_entitlement_id;
        ELSE
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
                now(),
                false,
                NULL
            )
            ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false DO UPDATE SET
                order_id = EXCLUDED.order_id,
                granted_at = now(),
                revoked_reason = NULL
            RETURNING id INTO v_entitlement_id;
        END IF;
    END IF;

    -- 4. Record Immutable Entry in Sales Ledger (Partial index predicate matching)
    SELECT id INTO v_ledger_id
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified'
    LIMIT 1;

    IF v_ledger_id IS NULL THEN
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
            coalesce(trim(p_writer_note), 'Direct reader payment confirmed by writer.'),
            now()
        )
        ON CONFLICT (order_id) WHERE entry_type = 'sale_verified' DO NOTHING
        RETURNING id INTO v_ledger_id;

        IF v_ledger_id IS NULL THEN
            SELECT id INTO v_ledger_id
            FROM public.sales_ledger
            WHERE order_id = v_order.id AND entry_type = 'sale_verified';
        END IF;
    END IF;

    -- 5. Reconcile commission balance
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 6. Notify Reader
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
        now()
    );

    -- 7. Audit Log
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
        jsonb_build_object('status', v_order.status),
        jsonb_build_object(
            'status', 'verified',
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id,
        'current_unpaid_commission', v_new_unpaid,
        'is_orders_paused_for_commission', v_paused
    );
END;
$$;

COMMENT ON FUNCTION public.verify_order_payment(uuid, uuid, text) IS
'Authoritative procedure for author/admin payment verification with partial unique index conflict matching and idempotent safe retries.';

REVOKE ALL ON FUNCTION public.verify_order_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_order_payment(uuid, uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 4: CANONICAL admin_force_verify (With Partial Index Predicates)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_force_verify(
    p_order_id uuid,
    p_admin_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    -- Idempotency check: If already verified, return existing details safely
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

        RETURN jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused,
            'message', 'Order is already verified.'
        );
    END IF;

    -- Only allow orders in payment_submitted, rejected, or disputed
    IF v_order.status::text NOT IN ('payment_submitted', 'rejected', 'disputed') THEN
        RAISE EXCEPTION 'Order is not in a force-verifiable state (current status: %).', v_order.status;
    END IF;

    -- Invariant: Reader must not already hold an active entitlement for this novel
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id
          AND novel_id = v_order.novel_id
          AND is_revoked = false
          AND order_id != v_order.id
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
    v_commission_pkr := round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update submission if present
    IF v_submission.id IS NOT NULL THEN
        UPDATE public.payment_submissions
        SET reviewer_status = 'verified',
            reviewer_note = 'Admin force-verified: ' || trim(p_admin_note),
            reviewed_by = v_caller_id,
            reviewed_at = now()
        WHERE id = v_submission.id;
    END IF;

    -- 2. Update any related dispute
    UPDATE public.disputes
    SET status = 'resolved_for_reader',
        resolution_note = trim(p_admin_note),
        admin_resolution_notes = trim(p_admin_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND status::text IN ('open', 'under_review');

    -- 3. Update Order
    UPDATE public.orders
    SET status = 'verified',
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        verified_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    -- 4. Grant Purchase Entitlement with partial unique index conflict matching
    SELECT id INTO v_entitlement_id
    FROM public.purchase_entitlements
    WHERE order_id = v_order.id
    LIMIT 1;

    IF v_entitlement_id IS NOT NULL THEN
        UPDATE public.purchase_entitlements
        SET is_revoked = false,
            revoked_reason = NULL,
            granted_at = now()
        WHERE id = v_entitlement_id;
    ELSE
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
            now(),
            false,
            NULL
        )
        ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false DO UPDATE SET
            order_id = EXCLUDED.order_id,
            granted_at = now(),
            revoked_reason = NULL
        RETURNING id INTO v_entitlement_id;
    END IF;

    -- 5. Record Immutable Entry in Sales Ledger (Partial index matching)
    SELECT id INTO v_ledger_id
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified'
    LIMIT 1;

    IF v_ledger_id IS NULL THEN
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
            now()
        )
        ON CONFLICT (order_id) WHERE entry_type = 'sale_verified' DO NOTHING
        RETURNING id INTO v_ledger_id;

        IF v_ledger_id IS NULL THEN
            SELECT id INTO v_ledger_id
            FROM public.sales_ledger
            WHERE order_id = v_order.id AND entry_type = 'sale_verified';
        END IF;
    END IF;

    -- 6. Reconcile commission balance
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 7. Notifications
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'ادائیگی کی تصدیق ہو گئی! (Admin Force-Verified)',
        'انتظامیہ نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ ناول آپ کی لائبریری میں دستیاب ہے۔',
        '/library',
        false,
        now()
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
        jsonb_build_object('status', v_order.status),
        jsonb_build_object(
            'status', 'verified',
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'note', p_admin_note,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id,
        'current_unpaid_commission', v_new_unpaid,
        'is_orders_paused_for_commission', v_paused
    );
END;
$$;

COMMENT ON FUNCTION public.admin_force_verify(uuid, text) IS
'Administrative force-verification with partial unique index conflict matching and idempotent safe retries.';

REVOKE ALL ON FUNCTION public.admin_force_verify(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_force_verify(uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 5: CANONICAL resolve_dispute_for_reader_verify (Fixing created_at & Conflict)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_dispute_for_reader_verify(
    p_dispute_id uuid,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    IF v_dispute.status::text NOT IN ('open', 'under_review') THEN
        RAISE EXCEPTION 'Dispute is already resolved (status: %).', v_dispute.status;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_dispute.order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Associated order not found: %', v_dispute.order_id;
    END IF;

    IF v_order.status::text NOT IN ('payment_submitted', 'rejected', 'disputed') THEN
        RAISE EXCEPTION 'Order cannot be verified in current status: %', v_order.status;
    END IF;

    -- Invariant: Reader must not already hold active entitlement
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id
          AND novel_id = v_order.novel_id
          AND is_revoked = false
          AND order_id != v_order.id
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

    -- 3. Create purchase entitlement (Using authoritative column granted_at and partial index conflict)
    SELECT id INTO v_entitlement_id
    FROM public.purchase_entitlements
    WHERE order_id = v_order.id
    LIMIT 1;

    IF v_entitlement_id IS NOT NULL THEN
        UPDATE public.purchase_entitlements
        SET is_revoked = false,
            revoked_reason = NULL,
            granted_at = now()
        WHERE id = v_entitlement_id;
    ELSE
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
            now(),
            false,
            NULL
        )
        ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false DO UPDATE SET
            order_id = EXCLUDED.order_id,
            granted_at = now(),
            revoked_reason = NULL
        RETURNING id INTO v_entitlement_id;
    END IF;

    -- 4. Create immutable sales ledger row (Using partial index conflict matching)
    SELECT id INTO v_ledger_id
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified'
    LIMIT 1;

    IF v_ledger_id IS NULL THEN
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
        ON CONFLICT (order_id) WHERE entry_type = 'sale_verified' DO NOTHING
        RETURNING id INTO v_ledger_id;

        IF v_ledger_id IS NULL THEN
            SELECT id INTO v_ledger_id
            FROM public.sales_ledger
            WHERE order_id = v_order.id AND entry_type = 'sale_verified';
        END IF;
    END IF;

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
        v_caller_id, 'admin', 'resolve_dispute_for_reader_verify', 'dispute', p_dispute_id::text,
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

COMMENT ON FUNCTION public.resolve_dispute_for_reader_verify(uuid, text) IS
'Authoritative procedure for administrative dispute verification with corrected granted_at column and partial unique index matching.';

REVOKE ALL ON FUNCTION public.resolve_dispute_for_reader_verify(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute_for_reader_verify(uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 6: APPEND-ONLY IMMUTABILITY TRIGGERS (Recreated Idempotently)
-- ------------------------------------------------------------------------------

-- Unified tamper-prevention trigger function
CREATE OR REPLACE FUNCTION public.prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Append-only violation: Direct % operations are strictly prohibited on %.', TG_OP, TG_TABLE_NAME;
END;
$$;

COMMENT ON FUNCTION public.prevent_append_only_mutation() IS
'Enforces strict append-only immutability by rejecting direct UPDATE, DELETE, and TRUNCATE operations.';

-- Row-level protection on sales_ledger
DROP TRIGGER IF EXISTS trg_sales_ledger_prevent_mutation ON public.sales_ledger;
DROP TRIGGER IF EXISTS trg_immutable_sales_ledger ON public.sales_ledger;
CREATE TRIGGER trg_sales_ledger_prevent_mutation
    BEFORE UPDATE OR DELETE ON public.sales_ledger
    FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

-- Statement-level truncate protection on sales_ledger
DROP TRIGGER IF EXISTS trg_sales_ledger_prevent_truncate ON public.sales_ledger;
CREATE TRIGGER trg_sales_ledger_prevent_truncate
    BEFORE TRUNCATE ON public.sales_ledger
    FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_append_only_mutation();

-- Row-level protection on audit_logs
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_mutation ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_mutation
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

-- Statement-level truncate protection on audit_logs
DROP TRIGGER IF EXISTS trg_audit_logs_prevent_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_truncate
    BEFORE TRUNCATE ON public.audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_append_only_mutation();

-- Revoke mutation privileges from client roles
REVOKE UPDATE, DELETE, TRUNCATE ON public.sales_ledger FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 7: EXPLICIT LOCKDOWN OF REMAINING WRITER / READER / ADMIN RPCs
-- ------------------------------------------------------------------------------

-- Ensure get_checkout_options is strictly authenticated-only
REVOKE ALL ON FUNCTION public.get_checkout_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_options(uuid) TO authenticated;
