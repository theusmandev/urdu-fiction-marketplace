-- ==============================================================================
-- UNB Premium — Migration 0028: Admin Get Invoice RPC
-- Description:
--   Provisions the authoritative public.admin_get_invoice(p_invoice_id uuid)
--   SECURITY DEFINER function for administrative inspection of commission invoices.
--
-- Security Invariants:
--   - Restricted strictly to platform administrators via public.is_admin().
--   - search_path is set to empty string ('').
--   - SQL syntax constructs (coalesce, trim, nullif) are UNQUALIFIED.
--   - Catalog functions (pg_catalog.now, pg_catalog.jsonb_*) are QUALIFIED.
--   - Function privileges revoked from PUBLIC and anon, granted to authenticated.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoice record;
    v_writer record;
    v_lines jsonb;
    v_payments jsonb;
    v_reports jsonb;
    v_invoice_obj jsonb;
    v_grace_days integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can inspect invoice details.';
    END IF;

    SELECT coalesce(overdue_grace_days, 3) INTO v_grace_days
    FROM public.platform_settings
    WHERE id = 1;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = p_invoice_id;

    IF v_invoice.id IS NULL THEN
        RAISE EXCEPTION 'Commission invoice not found: %', p_invoice_id;
    END IF;

    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_invoice.writer_id;

    -- Lines (Sales ledger details)
    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', cil.id,
                'ledger_entry_id', l.id,
                'order_number', o.order_number,
                'novel_title', coalesce(o.novel_title_snapshot, n.title_english, n.title_urdu, 'Correction'),
                'reader_display_name', coalesce(p.full_name, p.username, 'Reader'),
                'entry_type', l.entry_type,
                'gross_amount_pkr', l.gross_amount_pkr,
                'commission_rate', l.commission_rate,
                'commission_pkr', cil.commission_pkr,
                'writer_net_pkr', l.writer_net_pkr,
                'created_at', cil.created_at
            )
            ORDER BY cil.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_lines
    FROM public.commission_invoice_lines cil
    JOIN public.sales_ledger l ON l.id = cil.ledger_entry_id
    LEFT JOIN public.orders o ON o.id = l.order_id
    LEFT JOIN public.novels n ON n.id = l.novel_id
    LEFT JOIN public.profiles p ON p.id = l.reader_id
    WHERE cil.invoice_id = p_invoice_id;

    -- Confirmed Payments (Admin recorded settlements)
    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', cp.id,
                'amount_pkr', cp.amount_pkr,
                'transaction_reference', cp.transaction_reference,
                'screenshot_url', cp.screenshot_url,
                'confirmed_at', cp.confirmed_at,
                'payment_date', cp.created_at,
                'notes', cp.notes
            )
            ORDER BY cp.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_payments
    FROM public.commission_payments cp
    WHERE cp.invoice_id = p_invoice_id;

    -- Writer Submitted Payment Reports
    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', cpr.id,
                'amount_pkr', cpr.amount_pkr,
                'transaction_reference', cpr.transaction_reference,
                'screenshot_path', cpr.screenshot_path,
                'writer_note', cpr.writer_note,
                'status', cpr.status,
                'is_duplicate_tid', cpr.is_duplicate_tid,
                'admin_note', cpr.admin_note,
                'created_at', cpr.created_at,
                'reviewed_at', cpr.reviewed_at
            )
            ORDER BY cpr.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_reports
    FROM public.commission_payment_reports cpr
    WHERE cpr.invoice_id = p_invoice_id;

    v_invoice_obj := pg_catalog.jsonb_build_object(
        'id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'writer_id', v_invoice.writer_id,
        'pen_name_english', coalesce(v_writer.pen_name_english, ''),
        'pen_name_urdu', coalesce(v_writer.pen_name_urdu, ''),
        'period_start', v_invoice.period_start,
        'period_end', v_invoice.period_end,
        'total_sales_count', v_invoice.total_sales_count,
        'total_gross_pkr', v_invoice.total_gross_pkr,
        'total_commission_owed_pkr', v_invoice.total_commission_owed_pkr,
        'amount_settled_pkr', v_invoice.amount_settled_pkr,
        'remaining_owed_pkr', v_invoice.total_commission_owed_pkr - v_invoice.amount_settled_pkr,
        'status', v_invoice.status,
        'due_date', v_invoice.due_date,
        'is_overdue', (v_invoice.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid') AND v_invoice.due_date IS NOT NULL AND pg_catalog.now() > (v_invoice.due_date + (v_grace_days || ' days')::interval)),
        'voided_at', v_invoice.voided_at,
        'void_reason', v_invoice.void_reason,
        'writer_reported_tid', v_invoice.writer_reported_tid,
        'writer_reported_screenshot_url', v_invoice.writer_reported_screenshot_url,
        'settled_at', v_invoice.settled_at,
        'created_at', v_invoice.created_at,
        'updated_at', v_invoice.updated_at
    );

    RETURN pg_catalog.jsonb_build_object(
        'invoice', v_invoice_obj,
        'lines', v_lines,
        'payments', v_payments,
        'reports', v_reports
    );
END;
$$;

COMMENT ON FUNCTION public.admin_get_invoice(uuid) IS
'Authoritative RPC for platform administrators to inspect detailed commission invoice statements with lines, confirmed payments, and reported submissions.';

REVOKE ALL ON FUNCTION public.admin_get_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_invoice(uuid) TO authenticated;
