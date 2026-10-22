# UNB Premium — Security & Financial Hardening Audit (Step 1.2b)

**Date**: 2026-10-22  
**Target Migrations Audited**: `supabase/migrations/0001_enums_and_core_tables.sql` through `0005_seed_genres_and_settings.sql`  
**Configuration & Types Audited**: `src/config/site.ts`, `src/types/database.ts`, `.env.example`, `docs/MANUAL_SETUP_CHECKLIST.md`

---

## 1. Executive Summary

A comprehensive architectural and security audit of the initial migrations (0001–0005) was conducted against the UNB Premium financial invariants and security mandates. While the schema establishes foundational tables, strong Urdu typography considerations, and basic RLS, several critical vulnerabilities and architectural gaps were identified. In particular, client-side order creation allowed price manipulation, user role provisioning in the auth trigger permitted unauthenticated privilege escalation, financial ledger constraints blocked refunds, and storage rules lacked private bucket access control.

All identified deficiencies are categorized below as **CORRECT** (already implemented properly) or **MISSING / VULNERABLE** (requiring remediation in migration `0006_*.sql` and TypeScript updates).

---

## 2. Detailed Findings by Category

### A. Privilege Escalation & Role Boundaries
| Item | Requirement | Status | Detailed Finding & Risk |
|---|---|---|---|
| **A.1** | `profiles`: Block user modification of `role`, `is_active`, and `id`. Changes only via admin RPCs. | **MISSING / VULNERABLE** | In `0004_rls_policies.sql`, `Users update own profile` only checks `role = (SELECT role ...)`. It does not prevent modifying `is_active`, `id`, or other columns. A `BEFORE UPDATE` trigger and admin-only role modification RPC are missing. |
| **A.2** | `writer_profiles`: Writers may edit only pen names and bios. Block modifications to `status`, `custom_commission_rate`, `unpaid_commission_limit`, `current_unpaid_commission`, `is_orders_paused_for_commission`, `approved_by`. | **MISSING / VULNERABLE** | In `0004_rls_policies.sql`, `Writers update own profile metadata` protects `status`, `unpaid_commission_limit`, and `current_unpaid_commission`, but **fails to protect** `custom_commission_rate`, `is_orders_paused_for_commission`, and `approved_by`. A malicious writer could set their own commission rate to 0% or unpause their orders. |
| **A.3** | `handle_new_user()`: Must unconditionally assign `role = 'reader'`. Never trust `raw_user_meta_data->>'role'`. Document manual SQL for first admin. | **MISSING / VULNERABLE** | In `0003_triggers_and_rpc_functions.sql` line 21, the trigger reads `(NEW.raw_user_meta_data->>'role')::user_role`. Any user can pass `role: 'admin'` in signup metadata and gain platform administrator privileges. Manual admin creation SQL is also not documented. |
| **A.4** | Writer purchasing privileges: Writers must be treated as a superset of readers (can purchase other writers' novels). | **CORRECT** | Foreign keys on `orders.reader_id` and `purchase_entitlements.reader_id` reference `profiles(id)`. All users (including writers) have a profile. Need to ensure RPC validation allows writers to buy novels where `reader_id != novel.writer_id`. |
| **A.5** | `SECURITY DEFINER` hardening: `SET search_path = ''`, fully qualified references, `REVOKE EXECUTE FROM PUBLIC`, grant only to `authenticated`. | **MISSING / VULNERABLE** | Existing functions in `0003` used `SET search_path = public`. They did not revoke execution from `PUBLIC` or explicitly grant to `authenticated`. Search path injection risk exists. |

---

### B. Server-Side Order & Payment Orchestration
| Item | Requirement | Status | Detailed Finding & Risk |
|---|---|---|---|
| **B.6** | Remove direct client INSERT/UPDATE policies on `orders`, `payment_submissions`, `sales_ledger`, `purchase_entitlements`, `commission_invoices`. | **MISSING / VULNERABLE** | `0004_rls_policies.sql` grants client `INSERT` on `orders` (allowing client-supplied `amount_pkr` and commission rates), client `UPDATE` on `orders`, client `INSERT` on `payment_submissions`, and client `UPDATE` on `commission_invoices`. These permit direct database tampering from client browsers. |
| **B.7** | RPC `create_order(p_novel_id, p_payment_method_id)`: Server-side pricing snapshot, published/approved checks, commission pause check, self-purchase block, existing entitlement/open order block, partial unique index. | **MISSING** | No server-side `create_order` RPC exists. Orders were created directly by client insert. Partial unique index on open orders `(reader_id, novel_id) WHERE status IN ('pending_payment', 'payment_submitted')` is missing. |
| **B.8** | RPC `submit_payment(p_order_id, p_tid, p_screenshot_path, p_claimed_amount, p_sender_name, p_note)`: Restricted to ordering reader, only for pending/rejected orders, transitions to `payment_submitted`. | **MISSING** | No server-side `submit_payment` RPC exists. Submissions were directly inserted by client applications without validating order state transitions. |

---

### C. Ledger Integrity & Commission Accounting
| Item | Requirement | Status | Detailed Finding & Risk |
|---|---|---|---|
| **C.9** | `sales_ledger`: Replace `UNIQUE(order_id)` with partial unique index on `(order_id) WHERE entry_type='sale_verified'`. Add `original_ledger_entry_id` for negative adjustments. | **MISSING / VULNERABLE** | `0002_orders_and_financial_ledger.sql` defines `order_id uuid UNIQUE NOT NULL`. This makes it mathematically impossible to record a `refund_adjustment` or `manual_correction` for the same order. Also lacks `original_ledger_entry_id`. |
| **C.10** | Append-only enforcement on `sales_ledger` and `audit_logs`: `BEFORE UPDATE/DELETE` triggers raising exceptions, plus `REVOKE UPDATE, DELETE`. | **MISSING / VULNERABLE** | Neither `sales_ledger` nor `audit_logs` has triggers preventing updates or deletes. Users with table write permissions could modify historical financial lines. |
| **C.11** | Commission rate authoritative at verification time: Snapshot rate inside `verify_order_payment` using writer's custom rate or `platform_settings.default_commission_rate`. | **MISSING** | Migration `0003` used the estimated rate pre-recorded on the order instead of recalculating authoritatively against `writer_profiles.custom_commission_rate` / `platform_settings`. |
| **C.12** | Rounding & Check: `commission = ROUND(amount * rate / 100, 2)`, `writer_net = amount - commission`, and `CHECK (commission + writer_net = gross)`. | **MISSING / VULNERABLE** | Missing `CHECK (platform_commission_pkr + writer_net_pkr = gross_amount_pkr)`. Furthermore, existing check constraints (`gross_amount_pkr >= 0`) prevent negative refund entries. |
| **C.13** | Source of truth for `current_unpaid_commission`: Reconcilable ledger view/function. Prevent arbitrary column updates. | **MISSING** | Stored column exists on `writer_profiles` without a reconciliation function or verification against ledger rows and confirmed payments. |
| **C.14** | `purchase_entitlements`: Replace `UNIQUE(reader_id, novel_id)` with partial unique index `WHERE is_revoked = false`. | **MISSING** | `0002` enforced strict table constraint `CONSTRAINT uq_reader_novel_entitlement UNIQUE (reader_id, novel_id)`, preventing users who were refunded from ever legitimately purchasing the novel again. |
| **C.15** | Duplicate TID trigger: Compare `normalized_tid` only against other orders (`order_id != NEW.order_id`), allowing legitimate resubmission after rejection. | **MISSING / VULNERABLE** | `0003` compared against all submissions across the database (`id != NEW.id`), erroneously flagging a reader who resubmits a rejected order with a corrected receipt screenshot. |
| **C.16** | `platform_settings`: Enforce single-row singleton `CHECK (id = 1)`. | **CORRECT** | Enforced in `0001_enums_and_core_tables.sql` via `id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1)`. |

---

### D. Missing Atomic RPCs
| Requirement | Status | Detailed Finding |
|---|---|---|
| `generate_commission_invoice` | **MISSING** | Invoicing mechanism not implemented in SQL. |
| `report_commission_payment` | **MISSING** | Writer payment proof submission RPC not implemented. |
| `confirm_commission_settlement` | **NEEDS HARDENING** | Present in `0003`, but needs hardening (`search_path = ''`, qualified names, permission revokes, and ledger reconciliation). |
| `open_dispute` & `resolve_dispute` | **MISSING** | Dispute lifecycle RPCs not implemented. Schema fields on `disputes` need standardization (`opened_by`, `resolution_note`, etc.). |
| `record_refund_adjustment` | **MISSING** | Financial reversal RPC not implemented. |
| `approve_writer`, `reject_writer`, `suspend_writer` | **MISSING** | Writer lifecycle moderation RPCs not implemented. |
| `approve_novel`, `reject_novel` (reason required) | **MISSING** | Novel moderation RPCs not implemented. |
| Table schema alignment: `notifications` & `disputes` | **MISSING** | `notifications` lacks `type`, `body`, `entity_refs`, and `read_at`. `disputes` columns need alignment. |

---

### E. Storage Plan Migration
| Requirement | Status | Detailed Finding |
|---|---|---|
| Private bucket `payment-proofs` with RLS (`{order_id}/{uuid}.webp`) | **MISSING** | Storage buckets were unconfigured; code referenced Cloudinary. No bucket RLS protecting financial screenshots. |
| Public bucket `novel-assets` / `book-covers` | **MISSING** | Public bucket for covers and avatars not declared. |
| Removal of Cloudinary requirement from `.env.example` | **MISSING** | Cloudinary variables were listed as mandatory in `.env.example`. |
| Screenshot retention purge function (90-day retention) | **MISSING** | Scheduled cleanup function not implemented. |

---

### F. Configuration Authority
| Requirement | Status | Detailed Finding |
|---|---|---|
| `platform_settings` table is single source of truth | **PARTIALLY CORRECT** | Table exists, but `src/config/site.ts` did not clearly document that its exported constants are client-side fallbacks only. |

---

## 3. Action Plan for Remediation

To preserve migration immutability (rules 0001-0005 must NOT be edited), all fixes will be implemented sequentially in:
- `supabase/migrations/0006_security_and_financial_hardening.sql`: Drops vulnerable policies, relaxes conflicting ledger constraints, adds triggers, creates private/public storage buckets with RLS, adds full set of audited atomic RPCs, and updates triggers.
- `src/types/database.ts`: Adds TypeScript types for all new RPC signatures, parameters, views, and updated table fields.
- `src/config/site.ts`: Updates documentation to denote fallback/display status.
- `.env.example`: Marks Cloudinary optional and clarifies Supabase Storage.
- `docs/MANUAL_SETUP_CHECKLIST.md`: Documents initial admin bootstrap SQL and migration 0006.
- `docs/RLS_TEST_PLAN.md` & `supabase/tests/`: Comprehensive SQL test suite validating all 10 mandated scenarios.
