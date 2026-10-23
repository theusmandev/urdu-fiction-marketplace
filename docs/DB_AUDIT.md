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
| New Migration | `0019_database_reconciliation_and_runtime_fixes.sql` | Must be guarded against missing prerequisites. | Starts with a guarded `DO $$` block validating that `partially_paid` exists and required tables exist before executing DDL. |
