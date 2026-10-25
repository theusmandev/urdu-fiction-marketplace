-- ==============================================================================
-- Migration 0025: Commission Settlement Real Columns & Novel Price Hardening
--
-- PURPOSE:
-- 1. Commission Invoices schema hardening:
--    - Add updated_at column to public.commission_invoices (idempotent)
--    - Add trg_commission_invoices_set_updated_at BEFORE UPDATE trigger
--      to guarantee updated_at is maintained on every invoice modification.
--
-- 2. Re-create public.confirm_commission_settlement:
--    - Set search_path = '' and SECURITY DEFINER
--    - Operate strictly against real columns of:
--        * public.commission_invoices (including updated_at)
--        * public.commission_payments (invoice_id, writer_id, amount_pkr,
--          transaction_reference, screenshot_url, confirmed_by_admin_id,
--          confirmed_at, notes, created_at)
--        * public.commission_payment_reports (status, admin_note, reviewed_by, reviewed_at)
--        * public.notifications
--        * public.audit_logs
--    - Reject overpayment (amount_pkr > remaining balance)
--    - Reject double confirmation on settled invoice (amount_settled >= total_owed or status = 'settled')
--    - Reject double confirmation on payment report (v_report.status != 'pending')
--    - Update invoice status: 'settled' when fully paid, 'partially_paid' when partly paid
--    - Insert immutable commission_payments row
--    - Trigger author balance reconciliation (reconcile_writer_unpaid_commission)
--    - Insert Urdu-localized writer notification and admin audit log entry
--    - Return jsonb with both writer_unpaid_balance_pkr and new_unpaid_commission keys
--
-- 3. Hardening novels.price_pkr column update grant:
--    - Revoke price_pkr from direct UPDATE grant on public.novels for authenticated
--    - Enforce that price changes must use the audited update_novel RPC
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COMMISSION INVOICES: ADD updated_at AND BEFORE UPDATE TRIGGER
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commission_invoices'
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.commission_invoices
            ADD COLUMN updated_at timestamptz NOT NULL DEFAULT pg_catalog.now();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_commission_invoices_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_invoices_set_updated_at ON public.commission_invoices;
CREATE TRIGGER trg_commission_invoices_set_updated_at
    BEFORE UPDATE ON public.commission_invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_commission_invoices_updated_at();

COMMENT ON FUNCTION public.trg_commission_invoices_updated_at() IS
'Maintains updated_at timestamp on public.commission_invoices modifications.';


-- ------------------------------------------------------------------------------
-- 2. CANONICAL confirm_commission_settlement RPC
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

    -- Refuse double confirmation on already settled invoice
    IF v_invoice.status = 'settled' OR v_invoice.amount_settled_pkr >= v_invoice.total_commission_owed_pkr THEN
        RAISE EXCEPTION 'Invoice % is already fully settled.', v_invoice.invoice_number;
    END IF;

    -- Refuse overpayment
    v_remaining := v_invoice.total_commission_owed_pkr - v_invoice.amount_settled_pkr;
    IF p_amount_pkr > v_remaining THEN
        RAISE EXCEPTION 'Settlement amount (PKR %) exceeds remaining unpaid invoice balance of PKR %.', p_amount_pkr, v_remaining;
    END IF;

    -- Validate and link payment report if supplied
    IF p_report_id IS NOT NULL THEN
        SELECT * INTO v_report
        FROM public.commission_payment_reports
        WHERE id = p_report_id AND invoice_id = p_invoice_id
        FOR UPDATE;

        IF v_report.id IS NULL THEN
            RAISE EXCEPTION 'Commission payment report % not found for invoice %.', p_report_id, p_invoice_id;
        END IF;

        IF v_report.status != 'pending' THEN
            RAISE EXCEPTION 'Commission payment report % has already been reviewed (current status: %).', p_report_id, v_report.status;
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

    -- Update invoice settlement figures and timestamps
    UPDATE public.commission_invoices
    SET amount_settled_pkr = v_new_settled,
        status = v_new_status,
        settled_by_admin_id = v_caller_id,
        settled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_invoice_id;

    -- Insert into immutable commission_payments ledger
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
        coalesce(nullif(pg_catalog.btrim(p_admin_note), ''), 'Commission payment confirmed by admin.'),
        pg_catalog.now()
    )
    RETURNING id INTO v_payment_id;

    -- Recalculate author commission balance and automatic pause status
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_invoice.writer_id);

    SELECT is_orders_paused_for_commission INTO v_is_paused
    FROM public.writer_profiles
    WHERE id = v_invoice.writer_id;

    -- Notify writer of verified settlement
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
            'amount_settled_pkr', v_invoice.amount_settled_pkr,
            'status', v_invoice.status
        ),
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
        'amount_confirmed_pkr', p_amount_pkr,
        'amount_settled_pkr', v_new_settled,
        'total_settled_pkr', v_new_settled,
        'invoice_status', v_new_status,
        'writer_id', v_invoice.writer_id,
        'writer_unpaid_balance_pkr', v_new_unpaid,
        'new_unpaid_commission', v_new_unpaid,
        'is_orders_paused', v_is_paused,
        'is_orders_paused_for_commission', v_is_paused
    );
END;
$$;

COMMENT ON FUNCTION public.confirm_commission_settlement(uuid, numeric, uuid, text) IS
'Admin confirms verified receipt of writer commission settlement funds, records payment, updates invoice status, and reconciles writer pause state.';

REVOKE ALL ON FUNCTION public.confirm_commission_settlement(uuid, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_commission_settlement(uuid, numeric, uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 3. NOVELS: REVOKE DIRECT price_pkr UPDATE GRANT FROM authenticated
-- ------------------------------------------------------------------------------
-- Authors must use public.update_novel() RPC for price adjustments.
-- Direct client updates via PostgREST are restricted to safe presentation metadata.
REVOKE UPDATE ON public.novels FROM authenticated;
GRANT UPDATE (
    title_urdu,
    title_english,
    synopsis_urdu,
    description_urdu,
    cover_url,
    cover_public_id,
    language,
    rights_declaration_accepted
) ON public.novels TO authenticated;
