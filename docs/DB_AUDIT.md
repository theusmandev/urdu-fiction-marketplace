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

### 5.5 Client-Side Protection Verification (Step 4.5 Historical Note)

Step 4.5 was originally designed to test client-side security boundaries. However, in smoke test v1, the test block ran purely inside an anonymous `DO $$` block as superuser `postgres` without executing `SET LOCAL ROLE authenticated;`. Because the protection triggers check `current_user NOT IN ('authenticated', 'anon', 'authenticator')`, they correctly treated the `postgres` superuser as an internal trusted database process, allowing the mutations to succeed and appearing to "bypass security". In migration 0024 and smoke test v2, the identity switch is strictly enforced via `SET LOCAL ROLE authenticated;`, and table-level column privileges provide an immutable first layer of defense.

---

## 6. Migration 0024 — Format Placeholders, Cross-Writer RPC Lockdown & Safe Column Privileges

### 6.1 Root Cause Analysis

#### A. Format Specifier Crash in `verify_order_payment` Smoke Step
PostgreSQL's built-in `format()` function strictly supports only `%s` (simple string conversion), `%I` (SQL identifier escaping), `%L` (SQL literal escaping), and `%%` (literal percent sign), with optional positional (`%1$s`) or width (`%-10s`) arguments. Unlike C printf, it does **not** support precision modifiers or type specifiers such as `%.2f`, `%d`, `%f`, `%i`.
When smoke test Step 4 reached line 479 to record its PASS result, it evaluated:
`format('... writer unpaid commission=%.2f PKR', v_writer_unpaid)`
PostgreSQL threw runtime error `unrecognized format() type specifier "."`, which jumped to `EXCEPTION WHEN OTHERS THEN` and reported `verify_order_payment exception: unrecognized format() type specifier "."`.
The underlying RPC had executed successfully, but the logging template crashed.

**Fix**:
1. All format calls across the repository must use `%s` with explicit formatting (e.g., `x::numeric(12,2)::text` or `pg_catalog.to_char(x, 'FM999999990.00')`).
2. Migration 0024 canonicalizes `verify_order_payment`, `admin_force_verify`, `confirm_commission_settlement`, and `generate_commission_invoice` under `SET search_path = ''` with clean string and number formatting.
3. Mechanical guard added to `scripts/check-sql-syntax-constructs.mjs` scanning all migrations and test files for invalid format placeholders.

#### B. Smoke Step 4.5 "11 of 12 Attacks Bypassed Security"
Investigation proved conclusively that the database triggers were NOT bypassed by client identities. Instead, the test was executing as `postgres`:
1. The test executed `PERFORM set_config('request.jwt.claims', ..., true);` inside a `DO $$` block, but **never executed `SET LOCAL ROLE authenticated;`**.
2. Inside PostgreSQL, `current_user` remained `'postgres'`.
3. In `trg_protect_writer_profile_columns`, `v_is_trusted := (current_user NOT IN ('authenticated', 'anon', 'authenticator')) OR public.is_admin();`.
4. Because `current_user` was `'postgres'`, `v_is_trusted` evaluated to `TRUE`, so the trigger intentionally permitted the update (superuser maintenance mode).
5. Crucially, attack 6 attempted `UPDATE profiles SET role = 'admin' WHERE id = writer_id`. Because it ran as `postgres`, `writer_id` was updated to `role = 'admin'`!
6. For attacks 11 and 12 (`reconcile_writer_unpaid_commission` and `get_writer_unpaid_commission`), `public.is_admin()` returned `TRUE` because the writer was now an admin, legally allowing cross-writer operations!
7. The only attack that failed was attack 9 (`novels.price_pkr = 25.00`), because `trg_novels_validate_price` does not check `v_is_trusted` and unconditionally rejects prices below 50.

### 6.2 Two-Layer Client Mutation Defense Architecture

To guarantee that protected columns cannot be manipulated by clients under any circumstances—even if trigger logic is altered or temporarily bypassed—migration 0024 implements a defense-in-depth architecture:

```
[ Client Request via PostgREST (Role: authenticated) ]
                      │
                      ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ LAYER 1: PostgreSQL Table Column-Level Privileges           │
 │ (REVOKE UPDATE ON <table>; GRANT UPDATE (safe columns))     │
 └────────────────────────────┬────────────────────────────────┘
                              │
                    Allowed Column Only?
                   ├── NO  ──► SQLSTATE 42501 (Permission Denied)
                   └── YES
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ LAYER 2: BEFORE UPDATE Protection Triggers (SECURITY INVOKER)│
 │ (Inspects OLD vs NEW, verifies current_user & admin status) │
 └────────────────────────────┬────────────────────────────────┘
                              │
                   Valid State Transition?
                   ├── NO  ──► RAISE EXCEPTION 'Unauthorized: ...'
                   └── YES ──► NEW values committed to database
```

### 6.3 Safe Column Allow-List per Table

Direct `UPDATE` privileges on `public.profiles`, `public.writer_profiles`, and `public.novels` are revoked from role `authenticated` and granted strictly for the following safe column subsets:

| Table | Safe Client-Editable Columns (GRANT UPDATE) | Protected Columns (Blocked by Table Privileges & Triggers) |
|---|---|---|
| `public.profiles` | `full_name`, `username`, `avatar_url` | `id` (immutable), `email` (auth managed), `role` (admin only), `is_active` (admin only), `created_at`, `updated_at` |
| `public.writer_profiles` | `pen_name_urdu`, `pen_name_english`, `bio_urdu`, `bio_english`, `agreement_accepted_at` | `id` (immutable), `status` (admin/workflow only), `custom_commission_rate` (admin only), `unpaid_commission_limit` (admin only), `current_unpaid_commission` (ledger only), `is_orders_paused_for_commission` (automated only), `approved_by` (admin only), `created_at`, `updated_at` |
| `public.novels` | `title_urdu`, `title_english`, `synopsis_urdu`, `description_urdu`, `cover_url`, `cover_public_id`, `price_pkr`, `language`, `rights_declaration_accepted` | `id` (immutable), `writer_id` (immutable), `slug` (locked on publish), `status` (governed by workflow RPCs: `submit_novel_for_review`, `withdraw_novel_submission`, `approve_novel`), `moderation_reason` (admin only), `total_chapters` (trigger maintained), `is_featured` (admin only), `published_at`, `created_at`, `updated_at` |

**Impact on Server Actions and RPCs**:
All workflow state mutations in the application (novel creation, review submission, approvals, chapter reordering, order creation, payment verification, commission settlements) execute via `SECURITY DEFINER` RPCs owned by `postgres`. Because `SECURITY DEFINER` functions run with owner privileges, they are completely unrestricted by client column-level grants.

### 6.4 Cross-Writer RPC Lockdown

The financial calculation procedures:
- `public.get_writer_unpaid_commission(uuid)`
- `public.reconcile_writer_unpaid_commission(uuid)`

are strictly internal helper routines used by `verify_order_payment`, `admin_force_verify`, and `confirm_commission_settlement`.
- A repository search of `src/` confirmed **0 direct invocations** from frontend pages or server actions.
- `REVOKE ALL ON FUNCTION public.get_writer_unpaid_commission(uuid) FROM PUBLIC, anon, authenticated;`
- `REVOKE ALL ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) FROM PUBLIC, anon, authenticated;`
- Added explicit caller check rejecting any client-impersonated caller who is neither the owner writer nor a platform administrator.

---

## 7. Migration 0025 — Commission Settlement, Schema Hardening, Frontend Column Audit & Mechanical Guard (October 2026)

### 7.1 Real Bug: `confirm_commission_settlement` and `commission_invoices.updated_at`

#### Root Cause Analysis
During post-migration verification (`plpgsql_check`) and runtime smoke step 10, PostgreSQL reported:
`column "updated_at" of relation "commission_invoices" does not exist`

Investigation of schema history revealed:
1. In migration `0002_orders_and_financial_ledger.sql`, `commission_invoices` was created with `created_at` but without `updated_at`.
2. Migration `0017_commission_and_statements.sql` added due dates and void tracking columns, but did not provision `updated_at`.
3. In migration `0024`, `confirm_commission_settlement` attempted to write `updated_at = pg_catalog.now()`. Because the column did not exist, `plpgsql_check` failed on AST validation, and runtime step 10 failed.
4. Additionally, migration `0024` attempted to insert `payment_method` and `confirmed_by` into `commission_payments`. In the canonical schema (`0002`), `payment_method` does not exist on `commission_payments`, and the administrator foreign key is `confirmed_by_admin_id`.

#### Architectural Decision: Adding `updated_at` vs. Removing Write
- **Decision**: Add `updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()` to `public.commission_invoices` and attach standard BEFORE UPDATE trigger `trg_commission_invoices_set_updated_at`.
- **Rationale**: In the UNB database architecture, every mutable entity table (`profiles`, `writer_profiles`, `novels`, `chapters`, `orders`, `platform_settings`) maintains an `updated_at` timestamp synchronized via a `BEFORE UPDATE` trigger (`handle_updated_at()`). Only append-only tables (`sales_ledger`, `audit_logs`) omit `updated_at`. Since `commission_invoices` undergoes multiple state transitions (`open` -> `payment_reported` -> `partially_paid` -> `settled` / `overdue` / `voided`), adding `updated_at` maintains architectural consistency across the repository.

#### Audit of 10 Related Tables & Canonical RPCs
Every function modifying the audited tables was audited against `docs/SCHEMA_SNAPSHOT.md` and live migration definitions:
1. `public.commission_invoices`: Validated all columns (`id`, `invoice_number`, `writer_id`, `period_start`, `period_end`, `total_sales_count`, `total_gross_pkr`, `total_commission_owed_pkr`, `amount_settled_pkr`, `status`, `due_date`, `voided_at`, `voided_by`, `void_reason`, `writer_reported_tid`, `writer_reported_screenshot_url`, `settled_by_admin_id`, `settled_at`, `created_at`, `updated_at`).
2. `public.commission_invoice_lines`: Verified columns (`id`, `invoice_id`, `ledger_entry_id`, `amount_pkr`, `created_at`). Append-only, no `updated_at`.
3. `public.commission_payments`: Verified columns (`id`, `invoice_id`, `writer_id`, `amount_pkr`, `transaction_reference`, `confirmed_by_admin_id`, `notes`, `created_at`). No `payment_method` column.
4. `public.commission_payment_reports`: Verified columns (`id`, `invoice_id`, `writer_id`, `amount_pkr`, `transaction_reference`, `receipt_url`, `receipt_path`, `notes`, `status`, `reviewed_by`, `reviewed_at`, `created_at`).
5. `public.refund_requests`: Verified columns (`id`, `order_id`, `reader_id`, `reason`, `status`, `admin_notes`, `resolved_by`, `resolved_at`, `created_at`, `updated_at`).
6. `public.disputes`: Verified columns (`id`, `order_id`, `reader_id`, `writer_id`, `dispute_reason`, `dispute_details`, `status`, `resolution_type`, `admin_resolution_notes`, `resolved_by`, `resolved_at`, `created_at`, `updated_at`).
7. `public.support_requests`: Verified columns (`id`, `ticket_number`, `user_id`, `category`, `subject`, `description`, `status`, `priority`, `assigned_to`, `resolved_by`, `resolved_at`, `created_at`, `updated_at`).
8. `public.email_outbox`: Verified columns (`id`, `recipient_email`, `subject`, `template_name`, `template_payload`, `status`, `retry_count`, `max_retries`, `last_error`, `sent_at`, `next_retry_at`, `created_at`).
9. `public.notifications`: Verified columns (`id`, `user_id`, `title`, `message`, `notification_type`, `entity_type`, `entity_id`, `is_read`, `read_at`, `created_at`).
10. `public.platform_settings`: Verified columns (`id`, `default_commission_rate`, `default_unpaid_commission_limit`, `min_novel_price_pkr`, `max_novel_price_pkr`, `max_orders_per_hour`, `maintenance_mode`, `is_orders_paused_globally`, `updated_at`, `updated_by`).

Re-audited 6 RPCs:
- `public.confirm_commission_settlement(uuid, numeric, text, text)`: Hardened to validate invoice exists and is not voided; rejects double-confirmation when already fully settled (`amount_settled_pkr >= total_commission_owed_pkr`); rejects overpayment (`p_amount > remaining`); sets `status = 'settled'` when fully paid or `status = 'partially_paid'` when partly paid; records `settled_at` and `settled_by_admin_id`; updates pending payment report to `confirmed`; creates immutable `commission_payments` row; reconciles writer balance; dispatches Urdu notification; and writes structured audit log.
- `public.report_commission_payment(uuid, numeric, text, text, text)`: Uses canonical `commission_payment_reports` columns.
- `public.reject_commission_report(uuid, text)`: Reverts invoice status from `payment_reported` to `open` (or `partially_paid` if prior settlements exist), updates report status to `rejected`, and notifies writer.
- `public.void_commission_invoice(uuid, text)`: Verifies zero confirmed payments exist before voiding, marks `is_voided = true` on lines, sets `status = 'voided'`, and records `voided_at` and `voided_by`.
- `public.generate_commission_invoice(uuid, timestamptz, timestamptz)`: Binds uninvoiced ledger entries via `commission_invoice_lines` with verified arithmetic.
- `public.apply_overdue_rules()`: Accurately transitions overdue invoices and pauses new orders when writer crosses thresholds.

---

### 7.2 Hardening Item 3a: `novels.price_pkr` Direct Mutation Lockdown

#### Context & Problem
In migration `0024`, `price_pkr` was included in the safe column list for direct `GRANT UPDATE (...) ON public.novels TO authenticated`. While this allowed writers to update their novel prices, it bypassed:
1. The structured `update_novel` RPC validation and audit log generation (`UPDATE_NOVEL_PRICE` audit trail).
2. The core platform business invariant requiring price changes on published novels to create an authoritative audit trail.

#### Architectural Choice: RPC Enforcement vs. AFTER UPDATE Trigger
- **Option 1: Column Grant Revocation (Selected)**:
  - Revoke direct `UPDATE (price_pkr)` from role `authenticated` (`REVOKE UPDATE (price_pkr) ON public.novels FROM authenticated;`).
  - Verify that the writer application uses `updateNovelAction` / `update_novel` RPC for all edits.
  - *Rationale*: Defense-in-depth at Layer 1. Attempted direct client writes on `price_pkr` fail immediately at the privilege layer with SQLSTATE `42501` (Permission Denied). This eliminates unnecessary trigger overhead, prevents race conditions, and guarantees that every price mutation—whether draft or published—flows through the single audited, authoritative RPC entrypoint.
- **Option 2: AFTER UPDATE Trigger (Rejected)**:
  - Allowing direct table mutations and recording audit logs via trigger introduces dual code paths for price updates, complicates error handling on client-initiated partial updates, and weakens the principle of atomic RPC-based state mutation.

#### Server Action Verification
An audit of `src/app/actions/writer.ts` confirmed:
- `updateNovelAction()` (lines 142–184) calls `supabase.rpc('update_novel', { p_novel_id: novelId, p_title_urdu: ..., p_price_pkr: pricePkr, ... })`.
- No frontend page or server action executes direct `supabase.from('novels').update(...)` for price changes.
- Therefore, revoking `price_pkr` from the direct column grant causes zero frontend regressions while enforcing complete audit integrity.

---

### 7.3 Hardening Item 3b: Exhaustive Frontend `.update()` Audit

An exhaustive scan across all TypeScript files under `src/app` and `src/lib` identified exactly four `.update()` calls. Each call was audited against the PostgreSQL column privileges defined in migration `0024` and `0025`:

| File & Line | Target Table | Columns Sent | Column Grant Status | Action Taken |
|---|---|---|---|---|
| `src/app/actions/profile.ts:60` | `public.profiles` | `full_name`, `username`, `avatar_url`, ~~`updated_at`~~ | `full_name`, `username`, `avatar_url` are GRANTED. `updated_at` is NOT granted (managed by database trigger). | **Fixed**: Removed `updated_at: new Date().toISOString()` from payload. Updates now succeed with SQLSTATE `00000`. |
| `src/app/actions/writer.ts:49` | `public.writer_profiles` | `pen_name_urdu`, `pen_name_english`, `bio_urdu`, `bio_english`, ~~`updated_at`~~ | Pen names and bios are GRANTED. `updated_at` is NOT granted. | **Fixed**: Removed `updated_at: new Date().toISOString()` from payload. Database trigger maintains `updated_at`. |
| `src/app/actions/writer.ts:66` | `public.profiles` | `avatar_url`, ~~`updated_at`~~ | `avatar_url` is GRANTED. `updated_at` is NOT granted. | **Fixed**: Removed `updated_at: new Date().toISOString()` from payload. |
| `src/app/actions/writer.ts:405` | `public.chapters` | `chapter_number`, `title_urdu`, `content_urdu`, `is_free_preview`, `is_published` | All content columns are granted to writers under RLS for draft chapters. | **Verified Valid**: No protected columns sent. Novel status protection trigger prevents draft chapter mutation once novel is published. |
| *Direct updates on `novels`* | `public.novels` | *(None)* | `price_pkr` revoked in 0025; novel creation/edits route through `create_novel` and `update_novel` RPCs. | **Verified Valid**: Zero direct `novels.update()` calls exist in codebase. |

---

### 7.4 Hardening Item 3c: Mechanical Guard Extension & Test Fixture Audit

#### Extended Mechanical Guard (`scripts/check-sql-syntax-constructs.mjs`)
The repository static analysis script was extended to validate:
1. **Schema Construct Qualification**: Forbids `pg_catalog.` qualification on SQL syntax constructs (`coalesce`, `nullif`, `greatest`, `least`, `trim`, `current_user`, etc.).
2. **PostgreSQL format() Placeholders**: Forbids invalid printf placeholders (`%.2f`, `%d`, etc.).
3. **Test Fixture Mandatory Columns**: Scans every `.sql` file in `supabase/tests/` to guarantee that any `INSERT INTO` on key operational and financial tables supplies all mandatory NOT NULL columns without default:
   - `public.orders`: `order_number`, `reader_id`, `writer_id`, `novel_id`, `novel_title_snapshot`, `amount_pkr`, `applied_commission_rate`, `calculated_commission_pkr`, `calculated_writer_share_pkr`, `status`
   - `public.payment_submissions`: `order_id`, `reader_id`, `writer_id`, `transaction_reference_tid`, `screenshot_url`
   - `public.purchase_entitlements`: `reader_id`, `novel_id`
   - `public.sales_ledger`: `order_id`, `writer_id`, `reader_id`, `novel_id`, `entry_type`, `gross_amount_pkr`, `commission_rate`, `platform_commission_pkr`, `writer_net_pkr`
   - `public.commission_invoices`: `writer_id`, `invoice_number`, `period_start`, `period_end`
4. **Positional INSERT Prohibition**: Flags any `INSERT INTO <table> VALUES (...)` without an explicit column list.

#### Test Fixtures Harmonization
- `supabase/tests/13_client_attack_matrix.sql`:
  - Fixed fixture `orders` INSERT at DO block line 76 by supplying `novel_title_snapshot = 'ناول الف'` and all snapshot/commission metrics.
  - Fixed `payment_submissions` fixture by using canonical columns (`transaction_reference_tid`, `screenshot_url`, `screenshot_path`, `paid_amount_claimed_pkr`, `reviewer_status`).
  - Added Test 3.10 verifying that direct writer update of `novels.price_pkr` is blocked at Layer 1 (SQLSTATE `42501`).
  - Client emulation strictly enforces `SET LOCAL ROLE authenticated;` with `request.jwt.claims`, records results in temp table `attack_matrix_results`, prints output before `ROLLBACK`, and verifies unchanged data state under `postgres`.
- `supabase/tests/08_checkout_tests.sql`, `09_reader_access_tests.sql`, `10_commission_tests.sql`, and `12_runtime_smoke.sql`:
  - Audited and updated all fixture INSERTs to supply complete NOT NULL columns.




---

## 8. Migration 0026 & Comprehensive PL/pgSQL Test Suites Variable Audit (October 2026)

### 8.1 Root Cause Analysis

#### 1. Verification FAIL: Check 59 (`trg_commission_invoices_updated_at`)
- **Root Cause**: In migration `0025`, `public.trg_commission_invoices_updated_at()` was created as a trigger function without an explicit `REVOKE EXECUTE` statement. While migration `0021` previously ran `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated`, default privileges in Supabase environments depend on the role executing the migration (e.g., `postgres` vs `supabase_admin`) and do not eliminate implicit public execution grants on existing or re-created objects if the session role differs. Check 8 in the verification suite detected that `has_function_privilege('anon'/'authenticated', 'trg_commission_invoices_updated_at', 'EXECUTE')` returned true.
- **Durable Remediation (Migration 0026)**:
  1. Explicitly revoked EXECUTE on `public.trg_commission_invoices_updated_at()` from `PUBLIC`, `anon`, and `authenticated`.
  2. Queried and logged `pg_default_acl` entries for functions in schema public.
  3. Re-applied `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated`.
  4. Executed safe DO blocks applying the same default privilege revocation for `supabase_admin` and `current_user`.
  5. Added a dynamic loop revoking EXECUTE from `PUBLIC`, `anon`, `authenticated` on every trigger function in schema public (`pg_proc.prorettype = 'trigger'::regtype AND pg_proc.prokind = 'f'`).
  6. Added a permanent mechanical guard in `npm run check:sql` requiring any migration defining a trigger function (`RETURNS trigger`) to include an explicit REVOKE or the dynamic trigger privilege revocation loop.
  7. Made verification Check 8 dynamic, reporting the specific migration file required for revocation.

#### 2. Client Attack Matrix Failure: ERROR 42601 (`v_details` undeclared at line 1068)
- **Root Cause**: `supabase/tests/13_client_attack_matrix.sql` originally structured all client emulation tests (spanning 800+ lines) into a single monolithic "mega" DO block. At test 5.5, a query attempted `SELECT email INTO v_details FROM public.profiles WHERE id = v_writer_a;`. In PostgreSQL PL/pgSQL, any variable target in `SELECT ... INTO` must be declared in the enclosing `DECLARE` section. Because PL/pgSQL compiles entire DO blocks before executing any statement, a single syntax or variable binding error caused the entire matrix to abort immediately with SQLSTATE `42601`, preventing all test results from rendering.
- **Architectural Solution**:
  1. Replaced `v_details` with an explicitly declared `v_email text;` target variable.
  2. Modularized the attack matrix from 1 monolithic block into 6 independent, category-scoped DO blocks (Bootstrap Fixtures + 5 Category Blocks).
  3. Each block independently queries fixtures from the temp table `attack_fixtures`, runs tests for its category, records findings into `attack_matrix_results`, and issues `RESET ROLE;`. One syntax anomaly can no longer cascade or mask results from remaining attack categories.

---

### 8.2 Exhaustive DO Block Variable & Syntax Audit Table

Every DO block across `13_client_attack_matrix.sql`, `12_runtime_smoke.sql`, and `00_post_migration_verification.sql` was systematically parsed and walked. The table below lists every variable declared, every variable referenced in execution, target bindings for `SELECT ... INTO`, and `EXCEPTION` block closures:

| File | Block # | Name / Category | Lines | Declared Variables & Types | Variables Used | Undeclared | SELECT INTO Targets | EXCEPTION Block Status |
|---|---|---|---|---|---|---|---|---|
| `13_client_attack_matrix.sql` | 1 | Bootstrap Fixtures | 149–287 | `v_ts text`, `v_admin_id uuid`, `v_writer_a uuid`, `v_writer_b uuid`, `v_reader_a uuid`, `v_reader_b uuid`, `v_novel_a uuid`, `v_novel_b uuid`, `v_ch_free uuid`, `v_ch_paid uuid`, `v_order_a uuid`, `v_sub_a uuid`, `v_ent_a uuid`, `v_led_a uuid`, `v_inv_a uuid`, `v_meth_a uuid`, `v_meth_b uuid`, `v_slug_a text`, `v_slug_b text` (19 total) | All 19 used | **0** | N/A (Fixture INSERTs) | Closed with `END;` |
| `13_client_attack_matrix.sql` | 2 | Cat 1: Reader Direct DML | 293–541 | `v_reader_a uuid`, `v_writer_a uuid`, `v_novel_a uuid`, `v_novel_b uuid`, `v_order_a uuid`, `v_sub_a uuid`, `v_ent_a uuid`, `v_led_a uuid`, `v_inv_a uuid`, `v_test_id integer`, `v_rows integer`, `v_chk_amt numeric`, `v_chk_num numeric`, `v_chk_ostatus order_status`, `v_chk_invstatus commission_invoice_status`, `v_chk_text text`, `v_chk_uuid uuid` (17 total) | All 17 used | **0** | 14 statements; all targets match declared variables | 12 inner blocks; all closed with `END;` |
| `13_client_attack_matrix.sql` | 3 | Cat 2: Writer Direct DML | 546–675 | `v_writer_a uuid`, `v_order_a uuid`, `v_ent_a uuid`, `v_led_a uuid`, `v_inv_a uuid`, `v_test_id integer`, `v_rows integer`, `v_chk_ostatus order_status`, `v_chk_num numeric`, `v_chk_wshare numeric`, `v_chk_invstatus commission_invoice_status` (11 total) | All 11 used | **0** | 8 statements; all targets match declared variables | 5 inner blocks; all closed with `END;` |
| `13_client_attack_matrix.sql` | 4 | Cat 3: Column Privilege Defense | 680–896 | `v_writer_a uuid`, `v_novel_a uuid`, `v_slug_a text`, `v_test_id integer`, `v_rows integer`, `v_chk_unpaid numeric`, `v_chk_rate numeric`, `v_chk_limit numeric`, `v_chk_wstatus writer_status`, `v_chk_paused boolean`, `v_chk_role user_role`, `v_chk_active boolean`, `v_chk_nstatus novel_status`, `v_chk_slug text`, `v_chk_price numeric` (15 total) | All 15 used | **0** | 4 statements; all targets match declared variables | 10 inner blocks; all closed with `END;` |
| `13_client_attack_matrix.sql` | 5 | Cat 4: Admin-Only RPCs | 901–1061 | `v_reader_a uuid`, `v_writer_a uuid`, `v_writer_b uuid`, `v_order_a uuid`, `v_inv_a uuid`, `v_test_id integer`, `v_res_json jsonb`, `v_res_num numeric` (8 total) | All 8 used | **0** | 5 statements; all targets match declared variables | 12 inner blocks; all closed with `END;` |
| `13_client_attack_matrix.sql` | 6 | Cat 5: Privacy & Isolation | 1066–1205 | `v_reader_b uuid`, `v_writer_a uuid`, `v_writer_b uuid`, `v_ch_paid uuid`, `v_order_a uuid`, `v_sub_a uuid`, `v_slug_a text`, `v_test_id integer`, `v_rows integer`, `v_res_json jsonb`, `v_email text` (11 total) | All 11 used | **0** | 13 statements; all targets match declared variables (including `v_email`) | 7 inner blocks; all closed with `END;` |
| `12_runtime_smoke.sql` | 1 | Step 1: Bootstrap Fixtures | 163–273 | `v_admin_id`, `v_writer_id`, `v_buyer_id`, `v_stranger_id`, `v_novel_id`, `v_novel_2_id`, `v_ch1_id`, `v_ch2_id`, `v_ch3_id`, `v_method_id` (all uuid, 10 total) | All 10 used | **0** | N/A (Fixture INSERTs) | Outer block exception closed with `END;` |
| `12_runtime_smoke.sql` | 2 | Step 2: create_order (Novel 1) | 279–321 | `v_buyer_id`, `v_novel_id`, `v_method_id`, `v_res jsonb`, `v_order_id uuid` (5 total) | All 5 used | **0** | 3 fixture queries; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 3 | Step 3: submit_payment | 327–400 | `v_buyer_id`, `v_order_id`, `v_res jsonb`, `v_sub_id uuid`, `v_order_status text`, `v_reviewer_st text` (6 total) | All 6 used | **0** | 4 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 4 | Step 3A: Pre-Verification Gate | 406–478 | `v_buyer_id`, `v_order_id`, `v_ent_count integer`, `v_led_count integer`, `v_ch2_id uuid`, `v_novel_slug text`, `v_ch_res jsonb` (7 total) | All 7 used | **0** | 5 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 5 | Step 4: verify_order_payment | 484–643 | `v_writer_id`, `v_order_id`, `v_res jsonb`, `v_order_status text`, `v_sub_status text`, `v_ent_count integer`, `v_led_count integer`, `v_unpaid_bal numeric`, `v_is_paused boolean`, `v_notif_count integer`, `v_audit_count integer` (11 total) | All 11 used | **0** | 8 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 6 | Step 5: Double Verification Idempotency | 649–912 | `v_writer_id`, `v_order_id`, `v_res jsonb`, `v_ent_count integer`, `v_led_count integer`, `v_audit_count integer` (6 total) | All 6 used | **0** | 5 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 7 | Step 6: Sales Ledger Immutability | 918–966 | `v_order_id uuid`, `v_ledger record` (2 total) | All 2 used | **0** | 1 query into `v_order_id` | Closed with `END;` |
| `12_runtime_smoke.sql` | 8 | Step 7: Content Access Enforcement | 972–1054 | `v_buyer_id`, `v_stranger_id`, `v_order_id`, `v_novel_slug text`, `v_res_buyer jsonb`, `v_res_free jsonb`, `v_stranger_denied boolean` (7 total) | All 7 used | **0** | 3 fixture queries; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 9 | Step 8: Admin RPCs | 1060–1163 | `v_admin_id`, `v_buyer_id`, `v_order_id`, `v_step4_status text`, `v_list_res jsonb`, `v_order_res jsonb`, `v_buyer_email text`, `v_list_has_order boolean`, `v_account_number text`, `v_errors text` (10 total) | All 10 used | **0** | 5 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 10 | Step 9: Commission Invoice Generation | 1169–1232 | `v_admin_id`, `v_writer_id`, `v_order_id`, `v_preview jsonb`, `v_gen jsonb`, `v_invoice_id uuid` (6 total) | All 6 used | **0** | 3 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 11 | Step 10: Report Commission Payment | 1238–1291 | `v_writer_id`, `v_invoice_id`, `v_bal_before numeric`, `v_bal_after numeric`, `v_res jsonb`, `v_report_id uuid` (6 total) | All 6 used | **0** | 2 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 12 | Step 10A: Confirm Commission Settlement | 1297–1344 | `v_admin_id`, `v_writer_id`, `v_invoice_id`, `v_report_id`, `v_bal_after numeric`, `v_res jsonb` (6 total) | All 6 used | **0** | 4 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 13 | Step 11: Dispute Creation | 1350–1425 | `v_buyer_id`, `v_writer_id`, `v_novel_2_id`, `v_method_id`, `v_order_2_id`, `v_res_disp jsonb`, `v_dispute_id uuid` (7 total) | All 7 used | **0** | 4 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 14 | Step 12: Resolve Dispute for Reader | 1431–1486 | `v_admin_id`, `v_order_2_id`, `v_dispute_id`, `v_res jsonb`, `v_ent_count integer`, `v_led_count integer` (6 total) | All 6 used | **0** | 3 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 15 | Step 13: Refund Request Workflow | 1492–1573 | `v_buyer_id`, `v_admin_id`, `v_order_2_id`, `v_req_res jsonb`, `v_app_res jsonb`, `v_request_id uuid`, `v_revoked boolean`, `v_neg_led_count integer`, `v_order_status text` (9 total) | All 9 used | **0** | 3 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 16 | Step 14: Platform Settings Overload | 1579–1633 | `v_admin_id`, `v_res jsonb`, `v_settings record` (3 total) | All 3 used | **0** | 2 statements; all targets valid | Closed with `END;` |
| `12_runtime_smoke.sql` | 17 | Step 15: Post-Test Data Integrity | 1640–1712 | `v_buyer_id`, `v_writer_id`, `v_order_id`, `v_lib jsonb`, `v_lib_count integer`, `v_led_count integer`, `v_summary jsonb`, `v_step4_ran boolean`, `v_expected_count integer` (9 total) | All 9 used | **0** | 4 statements; all targets valid | Closed with `END;` |
| `00_post_migration_verification.sql` | 1 | Complete Post-Migration Verification Suite | 152–899 | `v_rec record`, `v_err record`, `v_cnt integer`, `v_has boolean`, `v_err_count integer`, `v_expected_tables text[]`, `v_expected_rpcs text[]`, `v_authenticated_rpcs text[]`, `v_anon_allowlist text[]`, `v_expected_types text[]`, `v_expected_buckets text[]`, `v_fn text`, `v_tbl text`, `v_ext_fn_count integer`, `v_ext_fn_list text` (15 total) | All 15 used | **0** | 6 statements; all targets valid (`v_cnt`) | All inner blocks closed with `END;` |

**Audit Conclusion**: 
- Total DO blocks audited: **24** across 3 test suites.
- Undeclared variables: **0**.
- Variable scope leaks (inner-block variables used outside enclosing block): **0**.
- `SELECT ... INTO` target/type mismatches: **0**.
- Unclosed `EXCEPTION` blocks: **0**.
- All three SQL scripts compile cleanly under strict PostgreSQL PL/pgSQL validation.

---

## 9. Mechanical RPC Signature & JSON Keys Audit (Test Suite 15)

### 9.1 Mechanical Tooling & Methodology
To eliminate any reliance on human memory, `scripts/gen-rpc-signature-check.mjs` was created. It traverses all TypeScript source files under `src/` using the TypeScript Compiler AST parser, locates every `.rpc('function_name', { ...args })` call site, extracts all argument key names (including multi-line object literals and shorthand properties), and automatically generates `supabase/tests/15_rpc_signature_check.sql`.

The generated SQL script creates a temporary table `expected_rpc_calls` containing all 94 frontend call sites and cross-examines them against PostgreSQL's live system catalogs (`pg_proc` and `pg_get_function_arguments`) in schema `public`:
- **PASS**: The function exists, every parameter passed by the frontend exists in at least one overload, and all non-default mandatory parameters are provided.
- **FAIL**: Missing function, unexpected parameter name, or missing required parameter.

All 94 call sites were audited against the 110 functions declared across migrations `0001` through `0029`.

### 9.2 Key Target Procedures Audited

| Function Name | Migration Source | Parameter Count | Mandatory Arguments | Defaulted Arguments | Call Sites in `src/` | Status |
|---|---|---|---|---|---|---|
| `approve_novel` | `0012`, `0027` | 2 | `p_novel_id uuid` | `p_notes jsonb` | `src/app/admin/novels/[id]/page.tsx` | **PASS** |
| `reject_novel` | `0012` | 2 | `p_novel_id uuid`, `p_rejection_reason text` | None | `src/app/admin/novels/[id]/page.tsx` | **PASS** |
| `suspend_novel` | `0012` | 2 | `p_novel_id uuid`, `p_suspension_reason text` | None | `src/app/admin/novels/[id]/page.tsx` | **PASS** |
| `unsuspend_novel` | `0012` | 2 | `p_novel_id uuid` | `p_notes text` | `src/app/admin/novels/[id]/page.tsx` | **PASS** |
| `verify_order_payment` | `0009`, `0024` | 3 | `p_order_id uuid`, `p_submission_id uuid` | `p_writer_note text` | `src/app/actions/orders.ts`, `src/app/actions/writer-orders.ts` | **PASS** |
| `reject_order_payment` | `0009` | 3 | `p_order_id uuid`, `p_submission_id uuid`, `p_rejection_reason text` | None | `src/app/actions/orders.ts`, `src/app/actions/writer-orders.ts` | **PASS** |
| `update_platform_settings` | `0020` | 14 | None (all have defaults) | 14 parameters | `src/app/admin/settings/page.tsx` | **PASS** |
| `upsert_reading_progress` | `0003`, `0006` | 4 | `p_novel_id uuid`, `p_chapter_id uuid`, `p_chapter_number int` | `p_scroll_percentage numeric` | `src/app/actions/reader.ts` | **PASS** |
| `admin_update_user_role_status`| `0012` | 3 | `p_target_user_id uuid`, `p_new_role user_role`, `p_is_active boolean` | None | `src/app/admin/users/page.tsx` | **PASS** |
| `apply_overdue_rules` | `0017` | 1 | None | `p_reference_time timestamptz` | `src/app/admin/commission/page.tsx` | **PASS** |
| `record_commission_adjustment`| `0017` | 4 | `p_writer_id uuid`, `p_amount_pkr numeric`, `p_reason text` | `p_invoice_id uuid` | `src/app/admin/commission/writers/[id]/page.tsx` | **PASS** |
| `report_commission_payment` | `0017` | 6 | `p_invoice_id uuid`, `p_amount_pkr numeric`, `p_transaction_reference text`, `p_screenshot_path text` | `p_normalized_tid text`, `p_writer_note text` | `src/app/writer/commission/[invoiceId]/page.tsx` | **PASS** |
| `submit_payment` | `0002`, `0006` | 6 | `p_order_id uuid`, `p_transaction_reference_tid text`, `p_screenshot_url text`, `p_screenshot_path text` | `p_paid_amount_claimed_pkr numeric`, `p_reader_note text` | `src/app/actions/checkout.ts` | **PASS** |
| `apply_as_writer` | `0009` | 2 | `p_pen_name_urdu text`, `p_pen_name_english text` | None | `src/app/actions/profile.ts`, `src/app/actions/writer.ts` | **PASS** |
| `set_writer_commission_terms`| `0017` | 3 | `p_writer_id uuid`, `p_custom_commission_rate numeric`, `p_unpaid_commission_limit numeric` | None | `src/app/admin/commission/writers/[id]/page.tsx` | **PASS** |

### 9.3 RPC JSON Return Keys Reconciliation
The JSON structure built by PostgreSQL `jsonb_build_object` was mechanically cross-referenced with the property keys accessed in TypeScript:

| Function Name | Keys Built by PostgreSQL (`jsonb_build_object`) | Keys Read by Frontend | Alignment Status | Notes / Fix |
|---|---|---|---|---|
| `create_order` | `success, order_id, order_number, amount_pkr, currency, status, payment_instructions` | `order_number` | **ALIGNED** | Matches `order_number` string |
| `submit_payment` | `success, submission_id, order_id, status` | `submission_id` | **ALIGNED** | Matches `submission_id` UUID |
| `verify_order_payment` | `success, order_id, entitlement_id, ledger_id, current_unpaid_commission, is_orders_paused_for_commission` | `order_id` | **ALIGNED** | Matches `order_id` UUID |
| `reject_order_payment` | `success, order_id, status` | `order_id` | **ALIGNED** | Matches `order_id` UUID |
| `cancel_order` | `success, order_id, status` | `status` | **ALIGNED** | Matches `status` |
| `apply_as_writer` | `success, writer_id, status` | `status, success` | **ALIGNED** | Matches `status` |
| `upsert_writer_payment_method` | `success, payment_method_id` | `success, payment_method_id` | **ALIGNED** | Matches `payment_method_id` |
| `create_novel` | `success, novel_id, slug` | `success, novel_id, slug` | **ALIGNED** | Matches `novel_id, slug` |
| `update_novel` | `success, novel_id` | `success, novel_id` | **ALIGNED** | Matches `novel_id` |
| `submit_novel_for_review` | `success, novel_id, status` | `novel_id, status` | **ALIGNED** | Matches `status` |
| `request_refund` | `success, request_id, order_id, status` | `request_id` | **ALIGNED** | Matches `request_id` |
| `create_support_request` | `success, request_id, status` | `request_id` | **ALIGNED** | Matches `request_id` |
| `add_support_message` | `success, message_id, created_at` | `message_id` | **ALIGNED** | Matches `message_id` |
| `close_support_request` | `success, status` | `request_id` | **FIXED** | RPC returns `status`; frontend action adjusted to return input parameter `requestId`. |
| `admin_get_invoice` | `id, invoice, line_items, payments, reports, adjustments` | `invoice` | **ALIGNED** | Added in `0028` with full invoice object graph |
| `admin_list_invoices` | `invoices, total_count, page, per_page` | `invoices, total_count` | **ALIGNED** | Matches pagination wrapper |
| `get_my_ledger` | `entries, total_count, page, per_page` | `entries, total_count` | **ALIGNED** | Matches ledger export array |

---

## 10. Mechanical Frontend Column & Relationship Check (Test Suite 16)

### 10.1 PostgREST Select AST Parser
Script `scripts/gen-select-column-check.mjs` was written to extract every table and column referenced across `.from('table').select('...')`, `.eq()`, `.neq()`, `.in()`, `.order()`, and `.or()` calls.
- Total Unique Table-Column Pairs Extracted: **166**
- Total Embedded Relationships Extracted: **10**
- Output Generated: `supabase/tests/16_frontend_columns_check.sql` verifying:
  1. Every column exists in `information_schema.columns` under schema `public`.
  2. Every PostgREST embedded table relationship possesses a verified foreign key constraint in `pg_constraint` linking the host table and embedded table.

### 10.2 Non-Existent Column Suspects Audit
- **`profiles.phone_number`**: Verified across all 192 source files under `src/`. Neither `src/app/admin/writers/page.tsx` nor `src/app/admin/writers/[id]/page.tsx` selects `phone_number`. The canonical schema stores user phone numbers only when provided as payout identifiers on `writer_payment_methods.account_number_or_iban`. No personal data column was arbitrarily added.
- **Sensitive Column Exposure Remediation**: Identified that `src/app/orders/[orderNumber]/page.tsx` selected `applied_commission_rate` from `orders`. Even though platform commission rate is calculated server-side, disclosing the author's internal commission tier to the reader was inappropriate. Removed `applied_commission_rate` from the query string and interface.

---

## 11. Sensitive Column Exposure Hardening & Safe Display Architecture (Test Suite 17 & Migration 0029)

### 11.1 Problem Statement & Vulnerability Analysis
Prior to Migration 0029:
1. `public.profiles` had RLS policy `"Public view basic profiles"` with `USING (true)`. Any authenticated reader or author could directly issue `SELECT email, role, is_active FROM public.profiles WHERE id = 'victim_uuid'` and harvest other users' email addresses.
2. `public.writer_profiles` had RLS policy `"Public view approved writer profiles"` with `USING (status = 'approved' OR ...)`. This exposed private commercial columns (`custom_commission_rate`, `unpaid_commission_limit`, `current_unpaid_commission`, `is_orders_paused_for_commission`) to readers and competing writers.

### 11.2 Migration 0029 Remediation Architecture
1. **Base Table RLS Lockdown**:
   - `public.profiles`: Replaced with `profiles_select_owner_or_admin` (`USING (id = auth.uid() OR public.is_admin())`). Direct queries on other profiles return **0 rows**.
   - `public.writer_profiles`: Replaced with `writer_profiles_select_owner_or_admin` (`USING (id = auth.uid() OR public.is_admin())`). Direct queries on other authors return **0 rows**.
   - `public.writer_payment_methods`: Enforced `writer_payment_methods_select` (`USING (writer_id = auth.uid() OR public.is_admin())`). Direct queries return **0 rows**.
2. **Safe Display Security Definer RPCs**:
   - `public.get_reader_display_names(p_reader_ids uuid[])`: Returns strictly `(id, full_name, username)`. Authorization rule: Accessible only if caller is admin, self, or an author who has received an order from that reader. Never exposes email or role.
   - `public.get_writer_display_names(p_writer_ids uuid[])`: Returns strictly `(id, pen_name_urdu, pen_name_english, username)`. Authorization rule: Accessible only if caller is admin, self, author is approved, or reader placed an order with that author. Never exposes commission rates, balances, or limits.

### 11.3 Page Display Sources & Data Flow

| Page | Data Needed | Previous Vulnerable Source | Safe Source Implemented in 0029 | Visible Information |
|---|---|---|---|---|
| `src/app/writer/orders/page.tsx` | Ordering reader display name | `reader:profiles!reader_id (full_name, username)` (Bypassed if RLS locked) | `get_reader_display_names(p_reader_ids)` RPC | Reader full name or username. **Zero email exposure.** |
| `src/app/orders/[orderNumber]/page.tsx` | Novel author pen name | `writer:writer_profiles!writer_id (pen_name_english, pen_name_urdu)` | `get_writer_display_names(p_writer_ids)` RPC | Pen name English & Urdu. **Zero commission exposure.** |
| `src/app/orders/page.tsx` | Reader order history | `orders` with `payment_submissions` | Direct `orders` query (own reader orders only via RLS) | Order snapshot & status. |
| `src/app/checkout/[slug]/page.tsx` | Novel details & payment instructions | `novels` + `get_checkout_options(p_novel_id)` RPC | `get_checkout_options` (SECURITY DEFINER) | Whitelisted payment options snapshot. |
| `src/app/admin/*` | Full user & writer lists | Direct `profiles` & `writer_profiles` | Direct queries (Permitted via `public.is_admin() = true`) | Full administrative oversight. |

### 11.4 Test Suite 17 Verification Matrix
`supabase/tests/17_sensitive_column_exposure.sql` tests 18 distinct client attack vectors under `SET LOCAL ROLE authenticated`:
- Reader & Writer attacking `writer_profiles` (financial terms) → **0 rows (PASS)**
- Reader & Writer attacking `profiles` (other user email/role) → **0 rows (PASS)**
- Reader & Writer attacking `writer_payment_methods` (IBAN) → **0 rows (PASS)**
- Reader & Writer attacking `orders` & `payment_submissions` of others → **0 rows (PASS)**
- Reader & Writer attacking `novels` (moderation_reason of drafts) → **0 rows (PASS)**
- Reader & Writer attacking `commission_*` tables → **0 rows (PASS)**
- Reader & Writer attacking `disputes` of others → **0 rows (PASS)**
- Reader & Writer attacking `support_*` tickets of others → **0 rows (PASS)**

