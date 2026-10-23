# SQL Runtime Validation & Database Verification Protocol

## 1. Overview & Rationale
In PostgreSQL, procedural code (`PL/pgSQL`) does not validate referenced table names, column names, record fields, or data types at migration execution time (`CREATE OR REPLACE FUNCTION`). Statements inside functions are only parsed and planned dynamically when the function is first executed in a live session.

Consequently, migrations can report successful execution in the Supabase SQL Editor and unit tests may pass, while critical customer flows (e.g. checkout, order creation, chapter viewing, admin management) fail with runtime exceptions:
- `operator does not exist: public.order_status = text`
- `column "payment_method" of relation "orders" does not exist`
- `record "v_novel" has no field "cover_image_url"`
- `column "title_english" of relation "chapters" does not exist`

To eliminate this class of runtime errors, this repository enforces **mandatory AST-level SQL validation** using `plpgsql_check` and the unified verification suite `supabase/tests/00_post_migration_verification.sql`.

---

## 2. Enabling `plpgsql_check` in Supabase
`plpgsql_check` is an official PostgreSQL extension that parses PL/pgSQL functions into an Abstract Syntax Tree (AST), checks every column reference, operator signature, variable assignment, and SQL statement against the active database catalog, and reports errors without requiring live test data.

### Option A: Via Supabase Dashboard (Recommended)
1. Open your project in the **Supabase Dashboard**.
2. Navigate to **Database** (left navigation bar) > **Extensions**.
3. In the search box, type `plpgsql_check`.
4. Toggle the switch to **ON**.
5. Select schema `extensions` when prompted.

### Option B: Via SQL Editor
Run the following idempotent SQL statement as `postgres` or `service_role`:
```sql
CREATE EXTENSION IF NOT EXISTS plpgsql_check WITH SCHEMA extensions;
```

---

## 3. Mandatory Rule: Post-Migration Verification Execution
> [!IMPORTANT]
> **No database change or migration task is considered DONE until `supabase/tests/00_post_migration_verification.sql` has been executed in the Supabase SQL Editor and reports `OVERALL VERIFICATION STATUS: PASS` with `Failed: 0`.**

### Execution Steps
1. Open the Supabase **SQL Editor**.
2. Open or paste the full contents of [`supabase/tests/00_post_migration_verification.sql`](file:///e:/git-workstation/urdu-fiction-marketplace/supabase/tests/00_post_migration_verification.sql).
3. Click **Run** (Ctrl+Enter / Cmd+Enter).
4. Review the results grid. Scroll to the last row:
   ```
   id: 999999
   check_category: SUMMARY
   check_name: OVERALL VERIFICATION STATUS
   status: PASS
   details: Total: 56 | Passed: 56 | Failed: 0 | Warnings: 0
   ```

### What `00_post_migration_verification.sql` Validates
1. **Core Tables**: Verifies that all 29 public tables exist.
2. **Ground Truth Column Invariants**:
   - `orders`: `payment_method` is absent; `novel_title_snapshot`, `amount_pkr`, `applied_commission_rate`, `calculated_commission_pkr`, `calculated_writer_share_pkr` exist.
   - `novels`: `cover_url` exists; `cover_image_url` is absent.
   - `chapters`: `title_urdu` exists; `title_english` is absent.
   - `payment_submissions`: `is_duplicate_tid_flagged` and `screenshot_path` exist; `is_duplicate_tid` is absent.
   - `sales_ledger`: `writer_net_pkr`, `platform_commission_pkr`, `commission_invoice_id` exist; `writer_payout_pkr` and `is_reconciled` are absent.
3. **Enum Values**: Validates that new values `partially_paid` and `void` are registered in `commission_status`.
4. **Function Overload Hygiene**: Confirms obsolete signatures of `approve_novel` and `update_platform_settings` are dropped.
5. **Privilege Lockdown**: Ensures `anon` and `authenticated` have zero `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` privileges on financial tables (`orders`, `payment_submissions`, `commission_invoices`, `sales_ledger`, `audit_logs`).
6. **Function Grants**: Ensures internal RPCs cannot be executed by `anon`.
7. **Row-Level Security (RLS)**: Validates that `relrowsecurity = true` on every public base table.
8. **SECURITY DEFINER Integrity**: Confirms every `SECURITY DEFINER` function explicitly sets `search_path`.
9. **Append-Only Immutability**: Asserts immutability triggers on `sales_ledger` and `audit_logs`.
10. **Storage Privacy**: Verifies `payment-proofs` bucket is private (`public = false`).
11. **plpgsql_check AST Analysis**: Executes `plpgsql_check_function_tb` over every public function and trigger to ensure zero runtime errors.

---

## 4. Troubleshooting plpgsql_check Findings
If `plpgsql_check` reports an error on a function:
1. Note the function signature and the error message reported in the `details` column of the test results.
2. Cross-reference the referenced object with [`docs/SCHEMA_SNAPSHOT.md`](file:///e:/git-workstation/urdu-fiction-marketplace/docs/SCHEMA_SNAPSHOT.md).
3. If an enum comparison failed: cast the enum to text or cast the parameter to the enum type (e.g. `o.status::text = p_status` or `o.status = p_status::order_status`).
4. If a column was reported missing: check whether the column was renamed in an earlier migration (e.g. `writer_payout_pkr` vs `writer_net_pkr`).
5. Update the fix migration and re-run `00_post_migration_verification.sql`.
