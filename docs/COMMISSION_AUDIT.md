# Commission, Ledger & Settlement Security Audit

## 1. Executive Summary
This audit inspects the financial ledger, commission invoicing, payment reporting, and settlement mechanics across migrations `0002_orders_and_financial_ledger.sql`, `0006_security_and_financial_hardening.sql`, `0007_gap_fixes_and_storage_hardening.sql`, `0010_dispute_and_writer_status_hardening.sql`, and `0016_reader_and_admin_orders.sql`.

The audit was conducted prior to authoring Migration `0017_commission_and_statements.sql`. Five critical vulnerabilities and design flaws were identified in the existing schema and RPC implementations.

---

## 2. Detailed Findings & Evidence

### Problem 1: `generate_commission_invoice` Violates Append-Only Ledger Trigger
- **Severity**: Critical (100% Runtime Failure)
- **Citations**:
  - `0006_security_and_financial_hardening.sql` (Lines 249–260):
    ```sql
    CREATE TRIGGER trg_sales_ledger_prevent_mutation
        BEFORE UPDATE OR DELETE ON public.sales_ledger
        FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();
    REVOKE UPDATE, DELETE ON public.sales_ledger FROM PUBLIC, anon, authenticated;
    ```
  - `0006_security_and_financial_hardening.sql` (Lines 1267–1272):
    ```sql
    -- Link unsettled ledger rows to this invoice
    UPDATE public.sales_ledger
    SET commission_invoice_id = v_invoice_id
    WHERE writer_id = p_writer_id
      AND commission_invoice_id IS NULL
      AND created_at >= p_period_start
      AND created_at <= p_period_end;
    ```
- **Analysis**:
  Even though `generate_commission_invoice` is a `SECURITY DEFINER` function, the database trigger `trg_sales_ledger_prevent_mutation` fires on **any** `UPDATE` on `public.sales_ledger` and immediately raises:
  `'Append-only violation: Direct UPDATE and DELETE operations are strictly prohibited on sales_ledger.'`
  As a result, calling `generate_commission_invoice` will always abort with an unhandled exception.
- **Architectural Solution**:
  The append-only trigger must NOT be relaxed or bypassed. Instead of mutating `public.sales_ledger.commission_invoice_id`, the relational link must be moved out of `sales_ledger` into an independent mapping table:
  ```sql
  CREATE TABLE public.commission_invoice_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id uuid NOT NULL REFERENCES public.commission_invoices(id) ON DELETE RESTRICT,
      ledger_entry_id uuid NOT NULL REFERENCES public.sales_ledger(id) ON DELETE RESTRICT,
      commission_pkr numeric(12,2) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
  );
  ```
  A partial unique index or foreign key integrity ensures that a ledger entry can belong to at most one active (non-voided) invoice. `sales_ledger.commission_invoice_id` remains in the schema but unused.

---

### Problem 2: Unrestricted Execution of Balance RPCs Leaks Writer Financials
- **Severity**: High (Data Exposure & Privacy Breach)
- **Citations**:
  - `0006_security_and_financial_hardening.sql` (Lines 319–338):
    ```sql
    CREATE OR REPLACE FUNCTION public.get_writer_unpaid_commission(p_writer_id uuid)
    RETURNS numeric(12,2)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
        SELECT greatest(
            0.00,
            (SELECT coalesce(pg_catalog.sum(platform_commission_pkr), 0.00) FROM public.sales_ledger WHERE writer_id = p_writer_id)
            - (SELECT coalesce(pg_catalog.sum(amount_pkr), 0.00) FROM public.commission_payments WHERE writer_id = p_writer_id)
        );
    $$;
    ```
  - `0006_security_and_financial_hardening.sql` (Lines 2301–2304):
    ```sql
    REVOKE EXECUTE ON FUNCTION public.get_writer_unpaid_commission(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.get_writer_unpaid_commission(uuid) TO authenticated;
    ```
- **Analysis**:
  `get_writer_unpaid_commission` is granted to `authenticated` and contains no caller identity check (`auth.uid()`). Any authenticated user (including regular readers or competing writers) can supply any writer's UUID and inspect their exact unpaid commission balance.
  Similarly, `reconcile_writer_unpaid_commission(p_writer_id uuid)` is granted to all authenticated users without authorization checks.
- **Architectural Solution**:
  1. Revoke `EXECUTE` on raw `get_writer_unpaid_commission` and `reconcile_writer_unpaid_commission` from `PUBLIC` and `authenticated`.
  2. Allow internal calls only from other `SECURITY DEFINER` functions or wrap with an explicit role/owner guard:
     `IF auth.uid() != p_writer_id AND NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;`
  3. Expose writer earnings strictly through caller-isolated RPCs (`get_my_sales_summary`, `get_my_ledger`).

---

### Problem 3: `confirm_commission_settlement` Overpayment, Double Confirmation & Void Handling Gaps
- **Severity**: High (Financial Ledger Corruption)
- **Citations**:
  - `0006_security_and_financial_hardening.sql` (Lines 1452–1461):
    ```sql
    UPDATE public.commission_invoices
    SET amount_settled_pkr = amount_settled_pkr + p_amount_pkr,
        status = CASE 
            WHEN (amount_settled_pkr + p_amount_pkr) >= total_commission_owed_pkr 
            THEN 'settled'::public.commission_invoice_status 
            ELSE 'payment_reported'::public.commission_invoice_status 
        END,
        settled_by_admin_id = v_caller_id,
        settled_at = pg_catalog.now()
    WHERE id = p_invoice_id;
    ```
- **Analysis**:
  1. **No Overpayment Validation**: The function blindly increments `amount_settled_pkr` without checking whether `p_amount_pkr <= (total_commission_owed_pkr - amount_settled_pkr)`. An accidental extra digit in the admin's input could mark an invoice settled for far more than owed and erroneously reduce the writer's total ledger balance.
  2. **Double Confirmation**: The function does not guard against `v_invoice.status = 'settled'`. An admin confirming a payment twice would generate multiple `commission_payments` rows, inflating settled amounts.
  3. **Voided Invoice Settling**: The function does not check if an invoice has been voided.
  4. **Wrong Partial Status**: When partially paid, status is reset to `payment_reported` instead of `partially_paid` (or distinguishing partial settlement from unverified writer reports).
- **Architectural Solution**:
  1. Validate `p_amount_pkr > 0` AND `p_amount_pkr <= (v_invoice.total_commission_owed_pkr - v_invoice.amount_settled_pkr)`.
  2. Reject settlement if `v_invoice.status` is `'settled'` or `'void'`.
  3. Support explicit status transitions: if remaining balance > 0 -> `'partially_paid'`, if remaining balance = 0 -> `'settled'`.
  4. Associate settlement with a verified `commission_payment_reports` row (or explicit admin settlement note).

---

### Problem 4: `report_commission_payment` Overwrites Single Transaction Record & Loses Audit History
- **Severity**: High (Auditability & Disputed Payment Loss)
- **Citations**:
  - `0006_security_and_financial_hardening.sql` (Lines 1375–1380):
    ```sql
    UPDATE public.commission_invoices
    SET status = 'payment_reported',
        writer_reported_tid = p_tid,
        writer_reported_screenshot_url = p_screenshot_path,
        created_at = created_at
    WHERE id = p_invoice_id;
    ```
- **Analysis**:
  1. **Loss of History**: `writer_reported_tid` and `writer_reported_screenshot_url` are flat columns on `commission_invoices`. If a writer makes an installment payment, or if an admin rejects a proof and the writer resubmits, the previous TID and deposit slip URL are permanently overwritten.
  2. **Amount Discarded**: `report_commission_payment` accepts `p_amount_pkr`, but never writes it to any table column—it is only logged in an ephemeral audit log JSON payload!
  3. **No Duplicate TID Detection**: Unlike reader order payments which enforce duplicate TID warnings (`check_duplicate_tid_before_insert`), commission payment reports have no duplicate reference checks.
- **Architectural Solution**:
  Create an independent table `public.commission_payment_reports`:
  - `(id, invoice_id, writer_id, amount_pkr, transaction_reference, screenshot_path, writer_note, status, admin_note, reviewed_by, reviewed_at, created_at)`
  - Track `is_duplicate_tid` across historical commission reports.
  - Implement atomic RPC `report_commission_payment` to insert into this table without overwriting past submissions.
  - Implement admin RPC `reject_commission_report(p_report_id, p_reason)`.

---

### Problem 5: Missing Refund Offset Tracking, Manual Adjustment Invariants & Timezone Drift
- **Severity**: Medium-High (Accounting Inconsistencies)
- **Analysis & Citations**:
  1. **Uninvoiced Refund Handling**:
     `sales_ledger` has entry types `sale_verified`, `refund_adjustment`, and `manual_correction`. When a reader dispute results in a refund (`record_refund_adjustment`), a negative ledger row is inserted.
     In `generate_commission_invoice`, if refunds occurred in the target period, they should offset positive sales. However, if unbilled refunds exceed unbilled sales (`v_comm <= 0`), the invoice cannot be generated, leaving those negative entries unlinked.
     Invoice generation must aggregate all unbilled entries (sales, refunds, and adjustments) and clearly enforce that an invoice must have a net positive balance (`total_commission_owed_pkr > 0`) to be issued.
  2. **Manual Adjustment Check Constraint**:
     `public.sales_ledger` defines `CHECK (gross_amount_pkr = platform_commission_pkr + writer_net_pkr)`.
     For a platform commission manual adjustment where no customer sale occurred (`gross_amount_pkr = 0.00`), `writer_net_pkr` must be exactly `-1 * platform_commission_pkr`. Any adjustment RPC must guarantee this constraint.
  3. **Asia/Karachi Billing Periods**:
     Pakistan Standard Time (PKT, UTC+5) governs tax and commercial periods. Querying by UTC dates creates 5-hour cutoff discrepancies at month boundaries (e.g. sales made at 1:00 AM on the 1st of a month PKT falling into the previous month in UTC). All invoicing period calculations must normalize timestamps to `Asia/Karachi`.
  4. **Threshold Notifications & Overdue Rules**:
     Prior migrations lacked automated threshold alerts (80% and 100% of unpaid commission limit) and lacked structured overdue handling. Writers with unpaid invoices past due dates continued transacting indefinitely unless manually paused.

---

## 3. Action Plan for Migration `0017_commission_and_statements.sql`
1. **New Relational Entities**:
   - `public.commission_invoice_lines`
   - `public.commission_payment_reports`
   - `public.platform_payment_methods`
2. **Schema Enhancements**:
   - Add enum values `'partially_paid'` and `'void'` to `commission_invoice_status`.
   - Add `due_date`, `voided_at`, `voided_by`, `void_reason` to `commission_invoices`.
   - Add `invoice_due_days` and `overdue_grace_days` to `platform_settings`.
3. **Hardened RPCs**:
   - `preview_commission_invoice` & `generate_commission_invoice` (lines-based, Karachi time, atomic).
   - `void_commission_invoice` (frees lines, prevents voiding settled invoices).
   - `report_commission_payment` (writes to reports table, TID validation, duplicate detection).
   - `confirm_commission_settlement` (overpayment validation, idempotency, updates report status).
   - `reject_commission_report` (admin rejection with mandatory reason).
   - `record_commission_adjustment` (preserves gross=comm+net check, audit-logged).
   - `apply_overdue_rules` (preview or apply order pause for overdue writers).
   - `get_platform_payment_instructions` (gated strictly to writers with open invoices and admins).
   - Isolated caller read RPCs (`get_my_sales_summary`, `get_my_ledger`, `get_my_invoices`, `get_my_invoice`, `admin_commission_overview`, `admin_list_invoices`, `admin_get_invoice`, `admin_list_commission_reports`).
