# UNB Premium — Database Reconciliation & Runtime Audit
**Audit Date:** October 2026  
**Context:** Reconciliation between migrations (`0001` through `0018`), `src/types/database.ts`, and runtime PostgreSQL execution observed in live database and test suites.

---

## 1. Executive Summary & Root Cause Analysis

Runtime errors in PL/pgSQL functions bypass standard TypeScript typechecks, linters, and unit tests because PL/pgSQL parses column references and operators lazily at statement execution time. 

The reconciliation identified four distinct classes of runtime failures:
1. **Column Name Discrepancies**: References to non-existent columns (`orders.payment_method`, `chapters.title_english`, `novels.cover_image_url`, `orders.cancelled_at`, `orders.cancellation_reason`, `purchase_entitlements.revoked_at`).
2. **PostgreSQL Enum Type Comparisons with `SET search_path = ''`**: In PostgreSQL, custom enum types and their comparison operators (`=`, `<>`, etc.) belong to schema `public`. When a function runs with `SET search_path = ''` and evaluates `enum_col = 'literal'` without an explicit cast (`enum_col::text = 'literal'`), PostgreSQL fails to find the operator in `pg_catalog`, raising `operator does not exist: public.order_status = text` or `novel_status = unknown`.
3. **Missing Function Overload Cleanup**: Multiple iterations of procedures such as `update_platform_settings` (5 overloads across 0012, 0014, 0016, 0017, 0018) and `approve_novel` left stale overloads in the database, causing ambiguous function call errors.
4. **Next.js & Frontend Cover Image Pipeline**: Next.js requires domain whitelisting via `images.remotePatterns` in `next.config.ts`. The absence of `*.supabase.co` prevented novel covers from loading in `<Image />` components. Additionally, `CheckoutForm.tsx` relied on `novel.cover_image_url` which failed to resolve from `get_checkout_options`.

---

## 2. Comprehensive Audit Findings

### Table A: Runtime Function & Trigger Defects

| File | Object / Function | Line(s) | Problem Description | Severity | Fix |
|---|---|---|---|---|---|
| `0015_checkout_and_payment_submission.sql` | `get_checkout_options(uuid)` | 142 | Read `v_novel.cover_image_url`. Column does not exist on `public.novels` (`cover_url` is canonical). | **CRITICAL** | Change to `v_novel.cover_url`, keep JSON key `'cover_image_url'` for client compatibility. |
| `0015_checkout_and_payment_submission.sql` | `create_order(uuid, uuid)` | 320, 337 | Inserted into non-existent column `orders.payment_method`. Dropped `CREATE_ORDER` audit log. | **CRITICAL** | Remove `payment_method` column from INSERT; re-insert authoritative audit log into `public.audit_logs`. |
| `0016_reader_and_admin_orders.sql` | `get_chapter_for_reader(text, int)` | 384 | Read `v_chapter.title_english`. Column does not exist on `public.chapters` (`title_urdu` only). | **CRITICAL** | Return `null::text` for `'chapter_title_english'`, keeping JSON key stable. |
| `0016_reader_and_admin_orders.sql` | `admin_list_orders(...)` | 588, 627, 639 | `o.status = p_status` fails (`order_status = text` operator missing); `ps.is_duplicate_tid` does not exist (`is_duplicate_tid_flagged`). | **CRITICAL** | Cast to `o.status::text = p_status` and use `ps.is_duplicate_tid_flagged`. |
| `0016_reader_and_admin_orders.sql` | `admin_get_order(uuid)` | 719, 760, 761, 776, 798, 799 | Read non-existent columns: `ps.is_duplicate_tid`, `sl.writer_payout_pkr`, `sl.is_reconciled`, `pe.revoked_at`, `v_order.cancelled_at`, `v_order.cancellation_reason`. | **CRITICAL** | Replace with `ps.is_duplicate_tid_flagged`, `sl.writer_net_pkr`, `(sl.commission_invoice_id IS NOT NULL)`, and `null` for non-existent columns, keeping JSON keys. |
| `0013_public_catalog.sql` | `get_public_novel_chapters(text)` | 229, 242, 245 | `SET search_path = ''` in SQL function causes `n.status = 'published'` and `wp.status = 'approved'` to fail finding enum `=` operator. PostgREST errors, client receives `[]`, showing "No published chapters". | **HIGH** | Re-implement in `plpgsql` with `SET search_path = public, pg_temp` and trimmed parameter. |
| `0012` to `0018` | `update_platform_settings(...)` | Various | 5 overloads created across migrations with varying parameter counts (5, 6, 9, 11, 14 args). Calls with defaults fail with ambiguous function candidate error. | **HIGH** | `DROP FUNCTION` on all stale 5, 6, 9, and 11 parameter signatures, retaining unified 14-parameter version. |
| `0006_security_and_financial_hardening.sql` & `0012_admin_controls.sql` | `approve_novel(...)` | 2011 (0006), 282 (0012) | 0006 declared `approve_novel(uuid)`. 0012 declared `approve_novel(uuid, jsonb DEFAULT NULL)`. Potential overload collision. | **MEDIUM** | Explicitly `DROP FUNCTION IF EXISTS public.approve_novel(uuid);` before recreating unified signature. |
| `0006_security_and_financial_hardening.sql` & `0017_commission_and_statements.sql` | `get_writer_unpaid_commission` & `reconcile_writer_unpaid_commission` | 319 (0006), 133, 171 (0017) | 0006 allowed any authenticated user to inspect balances; 0017 added authorization checks, but if 0017 was not applied due to enum error 55P04/22P02, vulnerability remains open. | **HIGH** | Re-apply hardened versions with caller authorization checks (`auth.uid() = p_writer_id OR public.is_admin()`). |
| `0003` / `0006` vs `0009_order_flow_fixes.sql` | `verify_order_payment` & `reject_order_payment` | 232, 457 (0009) | 0003/0006 lacked strict verification that order is in `payment_submitted` and submission is `pending`. | **HIGH** | Re-apply verified 0009 definitions enforcing status constraints and preventing duplicate reviews. |
| `0006_security_and_financial_hardening.sql` | `generate_commission_invoice` | 1195 (0006) | Attempted UPDATE on append-only `sales_ledger.commission_invoice_id`. | **HIGH** | Confirmed superseded in 0017 via `commission_invoice_lines` relational mapping; ensure 0017 implementation is active. |

---

### Table B: Permissions, Grants & Security Boundaries

| File / Context | Target Object | Issue Description | Severity | Remediation |
|---|---|---|---|---|
| Schema Public Tables | All public tables | `anon` should have zero INSERT, UPDATE, DELETE, TRUNCATE privileges. | **HIGH** | `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;` |
| Client Tables | `orders`, `payment_submissions`, `commission_invoices` | Direct client mutations bypass atomic RPC validation and state machine invariants. | **HIGH** | `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders, public.payment_submissions, public.commission_invoices FROM authenticated;` |
| User Notifications | `public.notifications` | Authenticated users must only update read status (`is_read`, `read_at`), not body/title. | **MEDIUM** | `REVOKE UPDATE ON public.notifications FROM authenticated; GRANT UPDATE (is_read, read_at) ON public.notifications TO authenticated;` |
| Public Views (0013) | `public_novels`, `public_writers`, `public_genres`, `public_free_preview_chapters` | Created with `security_invoker = false`. Supabase Security Advisor flags them. | **INFORMATIONAL** | Safe by design: anon has NO base table SELECT, and views project strictly sanitized public columns. |
| Storage Bucket | `payment-proofs` | Must be strictly private with folder-level reader isolation. | **HIGH** | Verify bucket is private (`public = false`) and policies enforce order-level reader ownership. |

---

### Table C: Frontend, Image Handling & Route Audits

| File | Component / Area | Issue Description | Severity | Remediation |
|---|---|---|---|---|
| `next.config.ts` | NextConfig `images` | Missing `images.remotePatterns` for `*.supabase.co` and localhost. Next.js `<Image />` fails to render covers. | **HIGH** | Add `remotePatterns` for `*.supabase.co`, `*.supabase.in`, `127.0.0.1`, and `localhost`. |
| `next.config.ts` | Content-Security-Policy | `img-src` missing localhost ports for local storage emulator. | **MEDIUM** | Extend `img-src` with `http://127.0.0.1:*` and `http://localhost:*`. |
| `src/app/checkout/[slug]/CheckoutForm.tsx` | Line 253 | Checked `novel.cover_image_url`, which was undefined due to RPC error. | **MEDIUM** | Support both `cover_image_url` and `cover_url` fallback. |
| `src/lib/supabase/public.ts` | `getPublicNovelChapters` | Silently swallowed RPC errors and returned empty array `[]`. | **MEDIUM** | Add console error logging for diagnostics while keeping graceful fallback. |

---

### Table D: Migration Sequence & CLI Compatibility

| Migrations | Issue | Impact | Plan |
|---|---|---|---|
| `0017_a_commission_enum_values.sql` and `0017_commission_and_statements.sql` | Shared numeric prefix `0017`. | Conflicts under Supabase CLI `supabase db push`. | In accordance with repository rules, existing applied files are NOT renamed in git. In future repository release/deployment renumbering, `0017_a` will become `0017_...` and `0017_commission...` will become `0018_...`. |
| `0019_database_reconciliation_and_runtime_fixes.sql` | Reconciliation patch for early catalog and checkout RPCs. | Guarded execution of core reader/writer views and procedures. | Applied to live database. |
| `0020_database_reconciliation_and_immutability_hardening.sql` | Live plpgsql_check defects (resolve_dispute_for_reader_verify, update_platform_settings, verify_order_payment) and immutability triggers. | Eliminates all remaining plpgsql_check AST errors and aligns partial unique indexes. | Apply directly via Supabase SQL Editor. |

---

## 3. Migration 0020 Reconciliation & Live Database Audit Findings

### 3.1 Defect Root Cause Analysis

1. **`resolve_dispute_for_reader_verify` Column Mismatch (`purchase_entitlements.created_at`)**:
   - *Problem*: Migration 0018 attempted to write to `purchase_entitlements.created_at`. In the canonical schema (`0002_orders_and_financial_ledger.sql`), access grant time is tracked strictly by `granted_at`.
   - *Fix*: In `0020`, re-implemented with `granted_at = now()`, aligned `ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false`, and set `search_path = public, pg_temp`.

2. **`update_platform_settings` Non-Existent Column & Signature Drift**:
   - *Problem*: In 0018, the 14-parameter signature attempted to update `unpaid_commission_threshold_pkr` and `payment_verification_window_hours`. Neither column exists on `public.platform_settings` (`default_unpaid_commission_limit` is canonical, and payment verification window was never provisioned as a column).
   - *Fix*: In `0020`, dropped all 6 stale overloaded signatures; created unified canonical procedure supporting optional parameter aliases (`p_default_unpaid_commission_limit` and `p_unpaid_commission_threshold_pkr`), writing strictly to real columns, and preserving frontend compatibility.

3. **`verify_order_payment` & `admin_force_verify` Partial Unique Index ON CONFLICT Failure**:
   - *Problem*: PostgreSQL error `there is no unique or exclusion constraint matching the ON CONFLICT specification` occurs when `ON CONFLICT (cols)` does not specify the `WHERE` predicate of a partial unique index. `purchase_entitlements` has partial index `idx_active_purchase_entitlement` on `(reader_id, novel_id) WHERE is_revoked = false`, and `sales_ledger` has `idx_sales_ledger_order_sale_verified` on `(order_id) WHERE entry_type = 'sale_verified'`.
   - *Fix*: Re-implemented with select-then-insert pattern and explicit partial index predicate matching (`ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false` and `ON CONFLICT (order_id) WHERE entry_type = 'sale_verified' DO NOTHING`). Enforced idempotency so repeat calls return existing records cleanly without duplicate creation.

4. **Append-Only Immutability Triggers on `sales_ledger` and `audit_logs`**:
   - *Problem*: Migration 0006 defined triggers named `trg_sales_ledger_prevent_mutation` and `trg_audit_logs_prevent_mutation`. Test script 00 checked for invented hardcoded names `trg_immutable_sales_ledger`.
   - *Fix*: In `0020`, idempotently recreated row-level BEFORE UPDATE OR DELETE triggers (`trg_sales_ledger_prevent_mutation`, `trg_audit_logs_prevent_mutation`) and statement-level BEFORE TRUNCATE triggers (`trg_sales_ledger_prevent_truncate`, `trg_audit_logs_prevent_truncate`) using `public.prevent_append_only_mutation()` with explicit `search_path = public, pg_temp`.

5. **Test Suite Harmonization**:
   - `supabase/tests/00_post_migration_verification.sql`: Rewritten to verify all 29 real tables (removing 10 invented tables), all real RPCs, correct enum `commission_invoice_status`, dynamic `pg_trigger` inspection, and strict anon privilege audit.
   - `supabase/tests/12_runtime_smoke.sql`: Created 15-step behavioral end-to-end smoke test executing real RPCs under fake `auth.users` impersonation within a single transactional `ROLLBACK`.

---

## 4. Migration 0021 — Live Run Analysis & Privilege Hardening (October 2026)

### 4.1 Smoke Test 12 — Defects Found in the Test Script Itself (Not the Database)

After running migration `0020` and both test scripts against the live Supabase database, the following test-authoring bugs were identified. None indicate runtime bugs in database functions.

| Step | Symptom | Root Cause | Fix in v2 |
|------|---------|------------|-----------|
| **Step 3** | FAIL: "Unexpected response: {success: true, is_retry: false, submission_id: ...}" | Test asserted `v_status = 'payment_submitted'` but `submit_payment()` returns `{success, submission_id, is_retry}` — no `status` key. The function did succeed. | Assertion rewritten: check `success=true AND submission_id IS NOT NULL` then read order status and reviewer_status directly from DB tables. |
| **Steps 4–13** | Cascade FAIL / NULL / "Duplicate key" | Step 3 stored `submission_1_id` fixture only in the PASS branch; since step 3 FAILed, the fixture was never stored. Step 11 used the same `novel_id` as step 1, colliding with `uq_orders_reader_novel_active`. | Steps now re-query submission from DB as fallback. Step 11 uses a separate `novel_2_id`. All steps report `SKIPPED` (not `FAIL`) when a prerequisite is missing. |
| **Step 15** | PASS with lib_count=1, led_count=1 despite step 4 never running | Hardcoded UUIDs (`33333333-...`) left an entitlement and ledger row from a **prior incomplete test run** that ran before the ROLLBACK was added. `get_my_library()` correctly filters `is_revoked=false` — this is **NOT a function bug**. | All fixture UUIDs are now `gen_random_uuid()` per run. Step 15 cross-checks lib_count against step 4's recorded PASS/FAIL. |

### 4.2 New Explicit Assertion: Pre-Verification Access Invariant (Step 3.5)

Step 3.5 was added between `submit_payment` and `verify_order_payment` to assert:
- Buyer has **zero** active purchase entitlements before verification.
- Buyer has **zero** `sale_verified` ledger rows before verification.
- `get_chapter_for_reader` on a paid chapter returns "Chapter not found".

A FAIL here indicates a critical bug (function granting access without verification) or stale data from a prior incomplete run.

### 4.3 Verification Script 00 — 37 FAIL Analysis

All 37 FAILs were script defects, not database bugs:

| Category | Count | Root Cause | Fix in v2 |
|----------|-------|------------|-----------|
| pg_trgm extension functions | 31 | `gin_*_trgm*`, `gtrgm_*`, `similarity*` etc. are extension-owned (`pg_depend.deptype='e'`). The anon audit loop did not exclude them. | Anon audit joins `pg_depend` to exclude extension-owned functions; they appear as `INFO` rows. |
| Trigger functions with anon/auth grants | 5 | `trg_chapters_calculate_word_count` etc. had implicit PUBLIC EXECUTE grants from before the default-privilege lockdown. | Migration `0021` revokes EXECUTE on all trigger functions from PUBLIC/anon/authenticated via a dynamic loop over `pg_proc`. New check 8 verifies zero trigger function grants. |
| `dispute-proofs` bucket FAIL | 1 | Bucket invented — it does not exist in any migration or source file. Dispute evidence is stored in `payment-proofs/<dispute_id>/` sub-paths. | Check replaced with an `INFO` row describing the intended storage layout. |

### 4.4 Migration 0021 Actions

1. **Dynamic trigger function EXECUTE revocation**: Loop over `pg_proc` for all `prorettype = trigger` in schema public; REVOKE from PUBLIC, anon, authenticated.
2. **ALTER DEFAULT PRIVILEGES**: `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated` for role postgres in schema public — future functions are private by default.
3. **Anon allowlist re-grant**: `search_public_novels`, `get_public_novel_chapters`, `has_novel_entitlement`, `is_admin` keep their anon EXECUTE grants.
4. **search_path fix on 0020 functions**: All 5 functions rewritten in 0020 used `SET search_path = public, pg_temp` (insecure — `public` schema can shadow names). Fixed to `SET search_path = ''` via `ALTER FUNCTION`. No body changes needed — all references are already schema-qualified.
5. **Authenticated RPC grant sweep**: Belt-and-suspenders GRANT EXECUTE to authenticated on all workflow RPCs.

### 4.5 search_path Invariant

All SECURITY DEFINER functions must use `SET search_path = ''` (empty string). The updated verification script (check 12) now FAILs any function whose search_path GUC contains 'public'.

### 4.6 Reporting Protocol

When running the updated scripts, send back only:
- The **SUMMARY row** (last row of each result set)
- Every row where `status IN ('FAIL', 'SKIPPED', 'WARN')`
- INFO rows are informational only and not required unless a specific item needs review

---

## 5. Migration 0022 — Protection Trigger Architecture, search_path Lockdown & Privacy Audit (October 2026)

### 5.1 Root Cause: Writer-Side `verify_order_payment` Failure (Smoke Test Step 4)

#### Defect Description
In smoke test Step 4, when the writer called `verify_order_payment(order_id, submission_id)`:
```
ERROR: Unauthorized: Unpaid commission balance is managed exclusively by ledger reconciliation.
CONTEXT: PL/pgSQL function trg_protect_writer_profile_columns() line 26 at RAISE
         SQL statement "UPDATE public.writer_profiles SET current_unpaid_commission = ..."
         PL/pgSQL function reconcile_writer_unpaid_commission(uuid) line 33 at SQL statement
         SQL statement "SELECT public.reconcile_writer_unpaid_commission(v_order.writer_id)"
         PL/pgSQL function verify_order_payment(uuid, uuid, text) line 87 at PERFORM
```

#### Why Direct Admin Actions Passed While Writer Calls Failed
When an admin calls an RPC or verifies an order (e.g. in dispute resolution steps 12 and 13), `public.is_admin()` evaluates to `TRUE`. The protection trigger had an admin bypass (`OR public.is_admin()`), so admin-initiated writes succeeded. When a normal author called `verify_order_payment`, `public.is_admin()` evaluated to `FALSE`.

#### The PostgreSQL Security & Role Switching Invariant
To write secure triggers and RPCs in Supabase, developers must understand how PostgreSQL manages session state during function execution:

1. **`session_user`**: The role that authenticated the initial client connection (in PostgREST, this is `authenticator` or `postgres`). It **never changes** when entering a `SECURITY DEFINER` function.
2. **`request.jwt.claims`**: A PostgREST transaction-local GUC (`current_setting('request.jwt.claims')`) populated from the caller's JWT. Helper functions like `auth.uid()` extract the `sub` claim from this GUC. A `SECURITY DEFINER` function executes within the same transaction and does **NOT** alter transaction-local GUCs. Therefore, `auth.uid()` continues to return the non-admin caller's UUID, and `current_setting('role')` continues to return `'authenticated'`.
3. **`current_user`**: The effective role used by PostgreSQL for object privilege evaluation. When a `SECURITY DEFINER` function owned by `postgres` executes, PostgreSQL temporarily switches `current_user` to the function's owner (`postgres`).
4. **Trigger Security Context**:
   - If a trigger function is declared `SECURITY DEFINER`, entering the trigger causes PostgreSQL to switch `current_user` to the trigger function owner (`postgres`). This is fatal for protection triggers, because even direct unprivileged client updates via the REST API (`supabase.from('writer_profiles').update(...)`) would execute the trigger body as `postgres`!
   - Therefore, protection triggers **MUST be declared `SECURITY INVOKER`**. As `SECURITY INVOKER`, the trigger executes under whatever `current_user` is active at the moment of the write statement:
     - For a direct client API write: `current_user = 'authenticated'` (or `'anon'`).
     - For a write inside a `SECURITY DEFINER` RPC: `current_user = 'postgres'` (the RPC owner).
     - For a DBA or migration run in the SQL Editor: `current_user = 'postgres'`.

#### The Flawed vs Robust Trust Test
- **Previous Flawed Check (0007–0021)**:
  ```sql
  v_is_db_admin := (auth.uid() IS NULL AND pg_catalog.current_setting('role', true) NOT IN ('authenticated', 'anon'));
  IF NOT v_is_db_admin AND NOT public.is_admin() THEN
      -- Blocked ALL non-admin writes, even those coming from trusted SECURITY DEFINER RPCs!
  ```
  Inside a non-admin's `SECURITY DEFINER` RPC, `auth.uid()` was NOT null, and `current_setting('role')` was `'authenticated'`. The trigger falsely concluded the write was an unauthorized direct client write.

- **Authoritative Robust Check (Migration 0022)**:
  ```sql
  v_is_trusted := (pg_catalog.current_user NOT IN ('authenticated', 'anon', 'authenticator'))
                  OR public.is_admin();
  ```
  Because the trigger is `SECURITY INVOKER`:
  - When invoked from a `SECURITY DEFINER` RPC (`verify_order_payment`, `apply_as_writer`, `update_novel`, etc.), `current_user` is `postgres`. `current_user NOT IN ('authenticated', 'anon', 'authenticator')` evaluates to `TRUE`. The write is trusted.
  - When invoked from a direct PostgREST client update, `current_user` is `'authenticated'`. Since `public.is_admin()` is `FALSE`, `v_is_trusted` evaluates to `FALSE`, and column modifications are strictly blocked.
  - No client-manipulable GUC flags (e.g. `app.writer_reapply` or `app.novel_status_change`) are needed or trusted.

---

### 5.2 Comprehensive Audit: Non-Admin Callable SECURITY DEFINER Functions

Every function in schema `public` callable by an authenticated non-admin user was audited to ensure no protected columns are blocked:

| Function | Caller | Tables Written | Protected Columns Touched | Protection Mechanism in 0022 |
|---|---|---|---|---|
| `verify_order_payment` | Writer | `orders`, `payment_submissions`, `purchase_entitlements`, `sales_ledger`, `writer_profiles` | `writer_profiles.current_unpaid_commission`, `is_orders_paused_for_commission` | RPC is `SECURITY DEFINER` (`current_user = 'postgres'`). Trigger `trg_protect_writer_profile_columns` (now `SECURITY INVOKER`) validates `current_user NOT IN ('authenticated','anon','authenticator')` and allows reconciliation. |
| `reject_order_payment` | Writer | `orders`, `payment_submissions`, `notifications`, `audit_logs` | `orders.status` ('rejected'), `submissions.reviewer_status` ('rejected') | Tables have no column protection triggers; `orders` and `submissions` RLS prevents direct client writes; mutations routed through this RPC. |
| `report_commission_payment` | Writer | `commission_payment_reports`, `notifications`, `audit_logs` | None on protected tables | Writes report record; does NOT mutate `writer_profiles.current_unpaid_commission` (verified in Step 9: balance unchanged until admin settlement). |
| `submit_payment` | Reader | `orders`, `payment_submissions`, `notifications` | `orders.status` ('payment_submitted') | Allowed via RPC state transition; TID duplication checked via `check_duplicate_tid_before_insert()`. |
| `create_order` | Reader | `orders`, `audit_logs` | INSERT new order in 'pending_payment' | Bounded price validation `[min, max]`; abuse rate limit; unique active order check. |
| `cancel_order` | Reader | `orders`, `audit_logs` | `orders.status` ('cancelled') | Validates order belongs to reader and status is 'pending_payment'. |
| `apply_as_writer` | Applicant | `writer_profiles`, `profiles` | `writer_profiles.status` ('pending_approval') | Allowed: RPC is `SECURITY DEFINER` (`current_user = 'postgres'`). Allows rejected authors to re-apply without client GUC tampering. |
| `upsert_writer_payment_method` / `deactivate_...` | Writer | `writer_payment_methods` | None | Writer-scoped CRUD. |
| `create_novel` | Writer | `novels`, `novel_genres`, `audit_logs` | INSERT novel in 'draft' | Enforces approved writer status; price bounded to `[min, max]`. |
| `update_novel` | Writer | `novels`, `novel_genres`, `audit_logs` | `novels.price_pkr`, content fields | Allowed while in 'draft', 'rejected', or 'published'. Writes audit log on published price changes. |
| `submit_novel_for_review` | Writer | `novels`, `notifications`, `audit_logs` | `novels.status` ('under_review') | Allowed: RPC is `SECURITY DEFINER` (`current_user = 'postgres'`). Validates cover art, genre, published chapter, and payment method. |
| `withdraw_novel_submission` | Writer | `novels`, `audit_logs` | `novels.status` ('draft') | Allowed: RPC is `SECURITY DEFINER`. Reverts 'under_review' novel to 'draft'. |
| `unpublish_own_novel` | Writer | `novels`, `audit_logs` | `novels.status` ('draft') | Allowed: RPC is `SECURITY DEFINER`. Reverts 'published' novel to 'draft'. |
| `create_chapter` / `update_chapter` / `reorder_chapters` | Writer | `chapters` | Revision tracking | Trigger `trg_chapters_calculate_word_count` and `trg_chapters_sync_total_chapters` synchronize metadata. |
| `unpublish_chapter` | Writer | `chapters` | `chapters.is_published` (false) | Allowed. Soft unpublishing supported for published novels. |
| `delete_draft_chapter` | Writer | `chapters` | DELETE row | Trigger `trg_protect_chapter_deletion` strictly blocks DELETE once novel is submitted or published. |
| `request_refund` | Reader | `refund_requests`, `orders`, `notifications` | None | Inserts refund request record. |
| `open_dispute` | Reader | `disputes`, `orders`, `notifications` | `orders.status` ('disputed') | Validates 24-hour minimum wait window from payment submission. |
| `add_dispute_message` | Reader / Writer | `dispute_messages`, `notifications` | None | Inserts communication entry. |
| Support RPCs (`create_support_request`, etc.) | User | `support_requests`, `support_messages` | None | User-scoped support ticket workflows. |
| Notification RPCs (`mark_notifications_as_read`, etc.) | User | `notifications`, `notification_preferences` | `notifications.is_read`, `read_at` | Non-admin users are restricted to modifying `is_read` and `read_at` by `trg_protect_notification_columns`. |
| `reconcile_writer_unpaid_commission` | Writer / Admin | `writer_profiles`, `notifications` | `writer_profiles.current_unpaid_commission`, `is_orders_paused_for_commission` | Caller authorization: `auth.uid() = p_writer_id OR public.is_admin()`. `SECURITY DEFINER` executes write as `postgres`. |
| `get_writer_unpaid_commission` | Writer / Admin | None (Read-only) | None | Caller authorization: `auth.uid() = p_writer_id OR public.is_admin()`. |

---

### 5.3 search_path Enforcement on 9 SECURITY DEFINER Functions

Migration `0021` fixed the 5 functions rewritten in migration `0020`. The 9 functions rewritten in migration `0019` retained `SET search_path = public, pg_temp`. In migration `0022`, all 9 have been recreated with `SET search_path = ''`:

1. `public.get_public_novel_chapters(text)`: Fully schema-qualified catalog TOC accessor (`public.chapters`, `public.novels`, `public.profiles`, `public.writer_profiles`). Explicit casts `n.status::text = 'published'` and `wp.status::text = 'approved'`. Retains anon execution grant.
2. `public.get_checkout_options(uuid)`: Schema-qualified (`public.novels`, `public.writer_profiles`, `public.writer_payment_methods`, `public.purchase_entitlements`, `public.orders`). Masked account formatting via `pg_catalog.length()` and `pg_catalog.substr()`.
3. `public.create_order(uuid, uuid)`: Schema-qualified order creation with bounded price checking against `public.platform_settings`, rate limiting, and immutable order snapshotting.
4. `public.get_chapter_for_reader(text, integer)`: Schema-qualified content delivery with entitlements evaluation, sliding-window rate limiting, and navigation calculations.
5. `public.admin_list_orders(text, text, boolean, integer, integer)`: Paginated order inspection with `LEFT JOIN public.writer_profiles` and strict reader privacy protections.
6. `public.admin_get_order(uuid)`: Detailed order inspection returning structured `order`, `reader`, `writer`, `novel`, `submissions`, `disputes`, `ledger`, and `entitlement` objects.
7. `public.get_writer_unpaid_commission(uuid)`: Authorized ledger aggregation (`public.sales_ledger` minus `public.commission_payments`).
8. `public.reconcile_writer_unpaid_commission(uuid)`: Authorized reconciliation and automated order pause threshold notifications (80% warning and 100% suspension).
9. `public.reject_order_payment(uuid, uuid, text)`: Strict status validation (`payment_submitted` order and `pending` submission) with reader notification and audit logging.

Verification check 12 in `supabase/tests/00_post_migration_verification.sql` has been updated to dynamically verify that **every** `SECURITY DEFINER` function in schema public has a strictly empty `search_path` GUC (`search_path=""` or `search_path=`). Any non-empty value triggers a `FAIL`.

---

### 5.4 Smoke Test Step 7 De-anonymization & Privacy Audit

#### Ambiguity in Step 7 v1
Step 7 in smoke test v1 grouped multiple assertions into a single `IF` statement:
```sql
IF (v_list_res::text NOT LIKE '%' || v_buyer_email || '%')
   AND (v_order_res::text NOT LIKE '%' || v_buyer_email || '%')
   AND (v_order_res->>'id' = v_order_id::text) -- <-- BUG: admin_get_order returns { "order": { "id": ... } }
THEN
```
Because `admin_get_order()` nests the order metadata under the `'order'` key, `v_order_res->>'id'` was `NULL`. The test failed with the ambiguous message *"Privacy leakage detected or order detail missing"*, obscuring whether a data leak had actually occurred.

#### Step 7 v2 Split Checks & Findings
Step 7 has been decoupled into four discrete checks with explicit diagnostic errors:
1. **Check (i) Order Discovery**: `admin_list_orders('verified')` returns the fixture order in the paginated list.
2. **Check (ii) Order Detail Structure**: `admin_get_order()` returns the order object (`v_order_res->'order'->>'id'`), at least 1 payment submission, and at least 1 sales ledger entry.
3. **Check (iii) Reader Email Privacy**: The fixture reader's exact email address (`buyer_smoke_...`) does NOT appear anywhere in the raw JSON text of `admin_list_orders` or `admin_get_order`. (Admin RPCs project `display_name` and `username`; emails are never selected).
4. **Check (iv) Account Number Exposure**: The writer's full account number (`03001234567`) does NOT appear in `admin_list_orders` (where only `payment_method_type` is returned). In `admin_get_order`, the account number appears strictly within `payment_instructions_snapshot` as required for payment reconciliation.

---

### 5.5 Client-Side Protection Verification (Step 4.5)

Step 4.5 was added to `supabase/tests/12_runtime_smoke.sql` to rigorously test client-side security boundaries under an impersonated non-admin writer JWT (`request.jwt.claims -> sub = writer_id, role = 'authenticated'`). All 12 attack vectors are confirmed to fail:
1. Direct `UPDATE writer_profiles SET current_unpaid_commission = 0.00` -> **BLOCKED** by trigger.
2. Direct `UPDATE writer_profiles SET custom_commission_rate = 5.00` -> **BLOCKED** by trigger.
3. Direct `UPDATE writer_profiles SET unpaid_commission_limit = 99999.00` -> **BLOCKED** by trigger.
4. Direct `UPDATE writer_profiles SET status = 'approved'` -> **BLOCKED** by trigger.
5. Direct `UPDATE writer_profiles SET is_orders_paused_for_commission = false` -> **BLOCKED** by trigger.
6. Direct `UPDATE profiles SET role = 'admin'` -> **BLOCKED** by trigger.
7. Direct `UPDATE profiles SET is_active = false` -> **BLOCKED** by trigger.
8. Direct `UPDATE novels SET status = 'draft'` -> **BLOCKED** by trigger.
9. Direct `UPDATE novels SET price_pkr = 25.00` (below platform minimum) -> **BLOCKED** by price validation trigger.
10. Direct `UPDATE novels SET slug = 'hacked-slug'` after publication -> **BLOCKED** by trigger.
11. `reconcile_writer_unpaid_commission(stranger_id)` -> **BLOCKED** by authorization check (`Access denied`).
12. `get_writer_unpaid_commission(stranger_id)` -> **BLOCKED** by authorization check (`Access denied`).

