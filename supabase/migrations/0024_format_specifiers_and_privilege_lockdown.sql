-- ==============================================================================
-- UNB Premium — Migration 0024: Format Specifiers, Cross-Writer RPC Lockdown
--                             & Safe Column-Level UPDATE Grants
-- ==============================================================================
-- Description:
--   1. Enforces PostgreSQL format() standard across canonical financial RPCs:
--      format() only supports %s, %I, %L, %% and positional/width forms.
--      All numeric and date formatting is standardized with explicit casts /
--      to_char() into %s placeholders.
--
--   2. Re-creates canonical financial functions under the 0023 security model:
--      - SET search_path = ''
--      - SQL syntax constructs UNQUALIFIED (coalesce, greatest, least, nullif, current_user)
--      - Real pg_catalog functions QUALIFIED (pg_catalog.now, pg_catalog.btrim,
--        pg_catalog.round, pg_catalog.to_char, pg_catalog.jsonb_build_object, etc.)
--      Functions re-issued:
--        - public.verify_order_payment(uuid, uuid, text)
--        - public.admin_force_verify(uuid, text)
--        - public.confirm_commission_settlement(uuid, numeric, uuid, text)
--        - public.generate_commission_invoice(uuid, timestamptz, timestamptz)
--        - public.get_writer_unpaid_commission(uuid)
--        - public.reconcile_writer_unpaid_commission(uuid)
--
--   3. Internal Cross-Writer RPC Lockdown:
--      - reconcile_writer_unpaid_commission and get_writer_unpaid_commission are
--        internal helper RPCs not called directly by the frontend.
--      - REVOKE EXECUTE FROM PUBLIC, anon, authenticated.
--      - Functions remain callable by SECURITY DEFINER routines (which run as owner).
--      - Added explicit defense inside the function body rejecting callers who
--        are neither the owner author nor a platform administrator.
--
--   4. Two-Layer Client Mutation Defense (Column-Level UPDATE Grants):
--      Restricts direct UPDATE privileges for role "authenticated" to safe,
--      user-editable columns only. Even before BEFORE UPDATE protection triggers
--      fire, PostgreSQL table privilege checks reject unauthorized column edits.
--      - profiles: safe columns (full_name, username, avatar_url)
--      - writer_profiles: safe columns (pen_name_urdu, pen_name_english, bio_urdu, bio_english, agreement_accepted_at)
--      - novels: safe columns (title_urdu, title_english, synopsis_urdu, description_urdu, cover_url, cover_public_id, price_pkr, language, rights_declaration_accepted)
-- ==============================================================================


-- ==============================================================================
-- SECTION 1: CANONICAL FINANCIAL FUNCTIONS (search_path = '', qualified catalog fns)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1.1 verify_order_payment
-- ------------------------------------------------------------------------------
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

    IF v_submission.reviewer_status != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be verified: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);
    v_commission_pkr := pg_catalog.round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update Payment Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'verified',
        reviewer_note = nullif(pg_catalog.btrim(p_writer_note), ''),
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_submission_id;

    -- 2. Update Order
    UPDATE public.orders
    SET status = 'verified',
        verified_at = pg_catalog.now(),
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        updated_at = pg_catalog.now()
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
            granted_at = pg_catalog.now()
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
            SET granted_at = pg_catalog.now()
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
                pg_catalog.now(),
                false,
                NULL
            )
            ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false DO UPDATE SET
                order_id = EXCLUDED.order_id,
                granted_at = pg_catalog.now(),
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
            coalesce(pg_catalog.btrim(p_writer_note), 'Direct reader payment confirmed by writer.'),
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
        pg_catalog.now()
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

COMMENT ON FUNCTION public.verify_order_payment(uuid, uuid, text) IS
'Authoritatively verifies a reader direct payment submission, grants reader access entitlement, writes immutable sales ledger entry, and reconciles writer unpaid commission balance.';

REVOKE ALL ON FUNCTION public.verify_order_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_order_payment(uuid, uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 1.2 admin_force_verify
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

    IF p_admin_note IS NULL OR pg_catalog.btrim(p_admin_note) = '' THEN
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

        RETURN pg_catalog.jsonb_build_object(
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
    v_commission_pkr := pg_catalog.round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update submission if present
    IF v_submission.id IS NOT NULL THEN
        UPDATE public.payment_submissions
        SET reviewer_status = 'verified',
            reviewer_note = 'Admin force-verified: ' || pg_catalog.btrim(p_admin_note),
            reviewed_by = v_caller_id,
            reviewed_at = pg_catalog.now()
        WHERE id = v_submission.id;
    END IF;

    -- 2. Update any related dispute
    UPDATE public.disputes
    SET status = 'resolved_for_reader',
        resolution_note = pg_catalog.btrim(p_admin_note),
        admin_resolution_notes = pg_catalog.btrim(p_admin_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE order_id = p_order_id AND status::text IN ('open', 'under_review');

    -- 3. Update Order
    UPDATE public.orders
    SET status = 'verified',
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
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
            granted_at = pg_catalog.now()
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
            pg_catalog.now(),
            false,
            NULL
        )
        ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false DO UPDATE SET
            order_id = EXCLUDED.order_id,
            granted_at = pg_catalog.now(),
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
            'Admin force-verified: ' || pg_catalog.btrim(p_admin_note),
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
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'note', p_admin_note,
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

COMMENT ON FUNCTION public.admin_force_verify(uuid, text) IS
'Administrative force-verification with partial unique index conflict matching and idempotent safe retries.';

REVOKE ALL ON FUNCTION public.admin_force_verify(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_force_verify(uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 1.3 confirm_commission_settlement
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_commission_settlement(
    p_invoice_id uuid,
    p_amount_pkr numeric,
    p_report_id uuid DEFAULT NULL,
    p_admin_note text DEFAULT NULL
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
    v_payment_id uuid;
    v_remaining numeric(12,2);
    v_new_settled numeric(12,2);
    v_new_status public.commission_invoice_status;
    v_new_unpaid numeric(12,2);
    v_is_paused boolean;
    v_tid text := 'ADMIN-CONFIRMED';
    v_proof text := NULL;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can confirm commission settlements.';
    END IF;

    IF p_amount_pkr <= 0 THEN
        RAISE EXCEPTION 'Settlement confirmation amount must be positive. Provided: %', p_amount_pkr;
    END IF;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF v_invoice.id IS NULL THEN
        RAISE EXCEPTION 'Commission invoice not found: %', p_invoice_id;
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

    -- If a specific report is referenced, validate and link it
    IF p_report_id IS NOT NULL THEN
        SELECT * INTO v_report
        FROM public.commission_payment_reports
        WHERE id = p_report_id AND invoice_id = p_invoice_id
        FOR UPDATE;

        IF v_report.id IS NOT NULL THEN
            v_tid := v_report.transaction_reference;
            v_proof := v_report.screenshot_path;

            UPDATE public.commission_payment_reports
            SET status = 'confirmed',
                admin_note = nullif(pg_catalog.btrim(p_admin_note), ''),
                reviewed_by = v_caller_id,
                reviewed_at = pg_catalog.now()
            WHERE id = p_report_id;
        END IF;
    END IF;

    v_new_settled := v_invoice.amount_settled_pkr + p_amount_pkr;
    IF v_new_settled >= v_invoice.total_commission_owed_pkr THEN
        v_new_status := 'settled'::public.commission_invoice_status;
    ELSE
        v_new_status := 'partially_paid'::public.commission_invoice_status;
    END IF;

    -- Update invoice settlement figures
    UPDATE public.commission_invoices
    SET amount_settled_pkr = v_new_settled,
        status = v_new_status,
        settled_by_admin_id = v_caller_id,
        settled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id;

    -- Record confirmed commission payment
    INSERT INTO public.commission_payments (
        invoice_id,
        writer_id,
        amount_pkr,
        payment_method,
        transaction_reference,
        confirmed_by,
        confirmed_at,
        notes,
        created_at
    ) VALUES (
        p_invoice_id,
        v_invoice.writer_id,
        p_amount_pkr,
        coalesce(v_report.payment_method, 'bank_transfer'::public.payment_method_type),
        v_tid,
        v_caller_id,
        pg_catalog.now(),
        coalesce(pg_catalog.btrim(p_admin_note), 'Commission payment confirmed by admin.'),
        pg_catalog.now()
    )
    RETURNING id INTO v_payment_id;

    -- Recalculate author commission balance and automatic pause status
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_invoice.writer_id);

    SELECT is_orders_paused_for_commission INTO v_is_paused
    FROM public.writer_profiles
    WHERE id = v_invoice.writer_id;

    -- Notify writer of settlement
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
        'کمیشن ادائیگی کی تصدیق (Commission Payment Confirmed)',
        'آپ کی کمیشن ادائیگی بمبلغ PKR ' || p_amount_pkr || ' کی تصدیق ہو چکی ہے۔ انوائس: ' || v_invoice.invoice_number,
        'آپ کے کمیشن کی ادائیگی قبول کر لی گئی ہے۔ نیا واجب الادا کمیشن: PKR ' || v_new_unpaid,
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

    -- Audit log entry
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
        pg_catalog.jsonb_build_object('amount_settled_pkr', v_invoice.amount_settled_pkr, 'status', v_invoice.status),
        pg_catalog.jsonb_build_object(
            'amount_settled_pkr', v_new_settled,
            'status', v_new_status,
            'payment_id', v_payment_id,
            'amount_pkr', p_amount_pkr,
            'new_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_is_paused
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'payment_id', v_payment_id,
        'amount_settled_pkr', v_new_settled,
        'invoice_status', v_new_status,
        'writer_id', v_invoice.writer_id,
        'new_unpaid_commission', v_new_unpaid,
        'is_orders_paused_for_commission', v_is_paused
    );
END;
$$;

COMMENT ON FUNCTION public.confirm_commission_settlement(uuid, numeric, uuid, text) IS
'Admin confirms verified receipt of writer commission settlement funds, records payment, updates invoice status, and reconciles writer pause state.';

REVOKE ALL ON FUNCTION public.confirm_commission_settlement(uuid, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_commission_settlement(uuid, numeric, uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 1.4 generate_commission_invoice
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_commission_invoice(
    p_writer_id uuid,
    p_period_start timestamptz,
    p_period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoice_id uuid;
    v_invoice_num text;
    v_due_days integer;
    v_due_date timestamptz;
    v_total_gross numeric(12,2) := 0.00;
    v_total_comm numeric(12,2) := 0.00;
    v_sales_count integer := 0;
    v_entries_count integer := 0;
    r_entry record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can generate commission invoices.';
    END IF;

    IF p_period_end <= p_period_start THEN
        RAISE EXCEPTION 'Period end date must be after period start date.';
    END IF;

    SELECT coalesce(invoice_due_days, 7) INTO v_due_days
    FROM public.platform_settings
    WHERE id = 1;

    v_due_date := pg_catalog.now() + (v_due_days || ' days')::interval;

    -- Aggregate eligible ledger entries that are uninvoiced
    SELECT
        pg_catalog.count(*),
        pg_catalog.count(CASE WHEN entry_type = 'sale_verified' THEN 1 END),
        coalesce(pg_catalog.sum(gross_amount_pkr), 0.00),
        coalesce(pg_catalog.sum(platform_commission_pkr), 0.00)
    INTO v_entries_count, v_sales_count, v_total_gross, v_total_comm
    FROM public.sales_ledger l
    WHERE l.writer_id = p_writer_id
      AND l.created_at >= p_period_start
      AND l.created_at <= p_period_end
      AND NOT EXISTS (
          SELECT 1 FROM public.commission_invoice_lines cil
          WHERE cil.ledger_entry_id = l.id
            AND cil.is_voided = false
      );

    IF v_entries_count = 0 THEN
        RAISE EXCEPTION 'No uninvoiced ledger entries found for this author in the chosen period.';
    END IF;

    IF v_total_comm <= 0 THEN
        RAISE EXCEPTION 'Net commission for this billing period is PKR % (must be strictly positive to bill author; refunds/adjustments offset sales).', v_total_comm;
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

    -- Notify writer
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
        'کمیشن انوائس جاری ہو گئی (Commission Invoice Issued)',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا کمیشن: PKR ' || v_total_comm || '۔ آخری تاریخ: ' || pg_catalog.to_char(v_due_date AT TIME ZONE 'Asia/Karachi', 'DD-MM-YYYY') || '۔',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا کمیشن: PKR ' || v_total_comm || '۔',
        '/writer/commission/' || v_invoice_id,
        pg_catalog.jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_num, 'amount_pkr', v_total_comm),
        false,
        pg_catalog.now()
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
        'total_gross_pkr', v_total_gross,
        'total_commission_owed_pkr', v_total_comm,
        'sales_count', v_sales_count,
        'due_date', v_due_date
    );
END;
$$;

COMMENT ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz) IS
'Generates a formal commission billing invoice from uninvoiced sales ledger entries for an author within a specified period.';

REVOKE ALL ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz) TO authenticated;


-- ==============================================================================
-- SECTION 2: INTERNAL CROSS-WRITER RPCS LOCKDOWN
--   reconcile_writer_unpaid_commission & get_writer_unpaid_commission:
--     1. Restrict PostgREST execution: REVOKE EXECUTE FROM authenticated.
--        Callable only internally by SECURITY DEFINER routines (which run as postgres).
--     2. Inside function: Reject callers who are neither the author nor admin.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 2.1 get_writer_unpaid_commission
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_total_ledger_comm numeric(12,2);
    v_total_paid numeric(12,2);
BEGIN
    v_caller_id := auth.uid();

    -- Strict authorization check: If called from an API context, reject any cross-writer caller
    IF current_user IN ('authenticated', 'anon', 'authenticator') THEN
        IF v_caller_id IS NULL OR (v_caller_id != p_writer_id AND NOT public.is_admin()) THEN
            RAISE EXCEPTION 'Access denied: You can only inspect your own commission balance.';
        END IF;
    ELSIF v_caller_id IS NOT NULL THEN
        IF v_caller_id != p_writer_id AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access denied: You can only inspect your own commission balance.';
        END IF;
    END IF;

    SELECT coalesce(pg_catalog.sum(platform_commission_pkr), 0.00)
    INTO v_total_ledger_comm
    FROM public.sales_ledger
    WHERE writer_id = p_writer_id;

    SELECT coalesce(pg_catalog.sum(amount_pkr), 0.00)
    INTO v_total_paid
    FROM public.commission_payments
    WHERE writer_id = p_writer_id;

    RETURN greatest(0.00, v_total_ledger_comm - v_total_paid);
END;
$$;

COMMENT ON FUNCTION public.get_writer_unpaid_commission(uuid) IS
'Internal financial calculation returning gross unpaid commission minus confirmed payments. Strictly locked down from direct client execution.';

REVOKE ALL ON FUNCTION public.get_writer_unpaid_commission(uuid) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------
-- 2.2 reconcile_writer_unpaid_commission
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_actual_unpaid numeric(12,2);
    v_limit numeric(12,2);
    v_is_paused boolean;
    v_last_settlement timestamptz;
BEGIN
    v_caller_id := auth.uid();

    -- Strict authorization check: If called from an API context, reject any cross-writer caller
    IF current_user IN ('authenticated', 'anon', 'authenticator') THEN
        IF v_caller_id IS NULL OR (v_caller_id != p_writer_id AND NOT public.is_admin()) THEN
            RAISE EXCEPTION 'Access denied: You can only reconcile your own account.';
        END IF;
    ELSIF v_caller_id IS NOT NULL THEN
        IF v_caller_id != p_writer_id AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access denied: You can only reconcile your own account.';
        END IF;
    END IF;

    v_actual_unpaid := public.get_writer_unpaid_commission(p_writer_id);

    SELECT unpaid_commission_limit INTO v_limit
    FROM public.writer_profiles
    WHERE id = p_writer_id;

    IF v_limit IS NULL OR v_limit <= 0 THEN
        v_limit := 5000.00;
    END IF;

    v_is_paused := (v_actual_unpaid >= v_limit);

    UPDATE public.writer_profiles
    SET current_unpaid_commission = v_actual_unpaid,
        is_orders_paused_for_commission = v_is_paused,
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    SELECT pg_catalog.max(confirmed_at) INTO v_last_settlement
    FROM public.commission_payments
    WHERE writer_id = p_writer_id;

    IF v_last_settlement IS NULL THEN
        v_last_settlement := '2000-01-01 00:00:00+00'::timestamptz;
    END IF;

    -- 80% Threshold Warning notification
    IF v_actual_unpaid >= (0.80 * v_limit) AND v_actual_unpaid < v_limit THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE user_id = p_writer_id
              AND type = 'commission_threshold_warning'
              AND created_at >= v_last_settlement
        ) THEN
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
                'commission_threshold_warning',
                'تنبيه کمیشن حد (80% Commission Threshold)',
                'آپ کا واجب الادا کمیشن (PKR ' || v_actual_unpaid || ') حد (' || v_limit || ') کے 80 فیصد تک پہنچ چکا ہے۔ براہِ کرم معطلی سے بچنے کے لیے ادائیگی کریں۔',
                'آپ کا واجب الادا کمیشن حد کے قریب پہنچ چکا ہے۔',
                '/writer/commission',
                pg_catalog.jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                pg_catalog.now()
            );
        END IF;
    END IF;

    -- 100% Threshold Exceeded notification
    IF v_actual_unpaid >= v_limit THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE user_id = p_writer_id
              AND type = 'commission_limit_exceeded'
              AND created_at >= v_last_settlement
        ) THEN
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
                'commission_limit_exceeded',
                'ناولوں کے آرڈرز عارضی طور پر موقوف (Orders Paused)',
                'آپ کا واجب الادا کمیشن (PKR ' || v_actual_unpaid || ') مقررہ حد (' || v_limit || ') سے تجاوز کر گیا ہے۔ نئے قارئین کے لیے آرڈرز موقوف کر دیے گئے ہیں۔',
                'کمیشن کلیئر ہوتے ہی آپ کے ناولز کے آرڈرز خودکار طریقے سے بحال ہو جائیں گے۔',
                '/writer/commission',
                pg_catalog.jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                pg_catalog.now()
            );
        END IF;
    END IF;

    RETURN v_actual_unpaid;
END;
$$;

COMMENT ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) IS
'Authoritatively synchronizes writer unpaid commission balance from the sales ledger and sets order pause state. Strictly locked down from direct client execution.';

REVOKE ALL ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) FROM PUBLIC, anon, authenticated;


-- ==============================================================================
-- SECTION 3: COLUMN-LEVEL DIRECT UPDATE PRIVILEGE LOCKDOWN
--   Defense-in-depth: Even before BEFORE UPDATE triggers execute, PostgreSQL
--   table privilege grants restrict client UPDATE queries to safe, user-editable
--   columns. Modifying protected columns (e.g. role, status, commission balance)
--   is rejected at the table privilege level (SQLSTATE 42501).
-- ==============================================================================

-- 3.1 profiles: Authenticated clients may only update display name, username, and avatar
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
    full_name,
    username,
    avatar_url
) ON public.profiles TO authenticated;

-- 3.2 writer_profiles: Authors may only update pen names, bios, and agreement timestamp
REVOKE UPDATE ON public.writer_profiles FROM authenticated;
GRANT UPDATE (
    pen_name_urdu,
    pen_name_english,
    bio_urdu,
    bio_english,
    agreement_accepted_at
) ON public.writer_profiles TO authenticated;

-- 3.3 novels: Direct updates restricted to novel metadata; status and slug protected
REVOKE UPDATE ON public.novels FROM authenticated;
GRANT UPDATE (
    title_urdu,
    title_english,
    synopsis_urdu,
    description_urdu,
    cover_url,
    cover_public_id,
    price_pkr,
    language,
    rights_declaration_accepted
) ON public.novels TO authenticated;
