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
