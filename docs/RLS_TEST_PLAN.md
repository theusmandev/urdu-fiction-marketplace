# UNB Premium — RLS & Financial Hardening Test Plan

**Document Version**: 1.0  
**Target Schema**: Migrations `0001` through `0006`  
**Test Suite Path**: `supabase/tests/01_security_and_financial_hardening_tests.sql`

---

## 1. Test Architecture & Persona Definitions

The security test suite evaluates multi-tenant isolation, role boundaries, and financial invariants using four isolated identities:

| Persona | Role | Identifier in Tests | Context & Capabilities |
|---|---|---|---|
| **Reader** | `reader` | `u_reader` (`11111111-1111-1111-1111-111111111111`) | Registered user who browses public novels, submits orders via `create_order`, and uploads payment receipts via `submit_payment`. Cannot read paid chapters without entitlement. |
| **Writer A** | `writer` | `u_writer_a` (`22222222-2222-2222-2222-222222222222`) | Approved author who owns Novel A (`nov_a`). Can verify/reject payments for Novel A. Can also act as a reader to buy Writer B's novels. |
| **Writer B** | `writer` | `u_writer_b` (`33333333-3333-3333-3333-333333333333`) | Approved author who owns Novel B (`nov_b`). Isolated tenant. Must NOT be able to view Writer A's orders, receipts, or financial ledger entries. |
| **Admin** | `admin` | `u_admin` (`99999999-9999-9999-9999-999999999999`) | Platform administrator. Can inspect all records, issue refunds, adjust commissions, settle invoices, and moderate writers/novels. |

---

## 2. Comprehensive Test Matrix (10 Core Scenarios)

### Test 1: Privilege Escalation Blocked
- **Target**: `profiles` & `writer_profiles` column protection triggers (`trg_protect_profile_columns`, `trg_protect_writer_profile_columns`).
- **Actions Tested**:
  1. Reader attempts `UPDATE profiles SET role = 'admin' WHERE id = u_reader;`
  2. Writer A attempts `UPDATE writer_profiles SET status = 'approved', custom_commission_rate = 0.00 WHERE id = u_writer_a;`
- **Expected Result**: Both operations are aborted with an exception (`Privilege escalation rejected` / `Unauthorized`).

### Test 2: Orders Must Be Created Server-Side (No Direct Client Insert or Tampered Price)
- **Target**: RLS on `orders` and RPC `create_order`.
- **Actions Tested**:
  1. Reader attempts direct client SQL insert: `INSERT INTO orders (reader_id, writer_id, novel_id, amount_pkr, ...) VALUES (u_reader, u_writer_a, nov_a, 1.00, ...);`
  2. Reader executes `create_order(nov_a, method_a)` via RPC.
- **Expected Result**: Direct client `INSERT` is rejected by RLS (0 rows or `permission denied`). RPC succeeds and creates the order with the authoritative server-side price from `novels.price_pkr` (e.g. PKR 750.00).

### Test 3: Reader Privacy Isolation (Reader Cannot Read Another Reader's Orders or Receipts)
- **Target**: RLS policies on `orders`, `payment_submissions`, and storage bucket `payment-proofs`.
- **Actions Tested**:
  1. Reader A places Order 1.
  2. Reader B queries `SELECT * FROM orders WHERE id = order_1_id;`
  3. Reader B queries `SELECT * FROM payment_submissions WHERE order_id = order_1_id;`
- **Expected Result**: Reader B queries return `0` rows.

### Test 4: Writer Multi-Tenant Isolation (Writer B Cannot Read Writer A's Orders, Receipts, or Screenshots)
- **Target**: RLS on `orders`, `payment_submissions`, `sales_ledger`, and storage bucket `payment-proofs`.
- **Actions Tested**:
  1. Writer B queries `SELECT * FROM orders WHERE writer_id = u_writer_a;`
  2. Writer B queries `SELECT * FROM payment_submissions WHERE writer_id = u_writer_a;`
  3. Writer B queries `SELECT * FROM sales_ledger WHERE writer_id = u_writer_a;`
- **Expected Result**: All queries return `0` rows.

### Test 5: Chapter Content Protection (Paid Chapters Unreadable Without Entitlement)
- **Target**: RLS policy `Read chapters if free preview or entitled or owner or admin` on `chapters`.
- **Actions Tested**:
  1. Reader queries free preview chapter (`is_free_preview = true`) of published novel.
  2. Reader queries paid chapter (`is_free_preview = false`) before payment verification.
  3. Reader queries paid chapter after payment verification.
- **Expected Result**: (1) Returns chapter text. (2) Returns `0` rows. (3) Returns paid chapter text.

### Test 6: Verification Idempotency & Financial Balancing
- **Target**: RPC `verify_order_payment`, partial unique index `idx_sales_ledger_order_sale_verified`, partial index `idx_active_purchase_entitlement`.
- **Actions Tested**:
  1. Writer verifies payment once via `verify_order_payment`.
  2. Confirm 1 row in `purchase_entitlements` and 1 row in `sales_ledger`.
  3. Confirm `platform_commission_pkr + writer_net_pkr = gross_amount_pkr`.
  4. Writer calls `verify_order_payment` a second time on the same order.
- **Expected Result**: Exactly 1 active entitlement and 1 ledger row exist. No duplicate ledger lines or entitlements are generated.

### Test 7: Append-Only Ledger & Audit Immutability
- **Target**: Triggers `trg_sales_ledger_prevent_mutation` and `trg_audit_logs_prevent_mutation`.
- **Actions Tested**:
  1. Attempt `UPDATE sales_ledger SET gross_amount_pkr = 99999 WHERE id = ...;`
  2. Attempt `DELETE FROM sales_ledger WHERE id = ...;`
  3. Attempt `UPDATE audit_logs SET action_type = 'TAMPERED' WHERE id = ...;`
  4. Attempt `DELETE FROM audit_logs WHERE id = ...;`
- **Expected Result**: All 4 statements fail with exception: `Append-only violation: Direct UPDATE and DELETE operations are strictly prohibited`.

### Test 8: Unpaid Commission Limit & Publishing Pause / Unpause
- **Target**: `writer_profiles.is_orders_paused_for_commission`, RPC `create_order`, and RPC `confirm_commission_settlement`.
- **Actions Tested**:
  1. Writer A accumulates unpaid commission >= limit (PKR 5,000).
  2. Confirm `is_orders_paused_for_commission = true`.
  3. Reader attempts `create_order` for Writer A's novel.
  4. Admin executes `confirm_commission_settlement` settling the balance.
  5. Reader attempts `create_order` again.
- **Expected Result**: Step 3 is rejected with exception (`Orders for this author are currently paused`). After settlement, `is_orders_paused_for_commission` becomes `false`, and Step 5 successfully creates the order.

### Test 9: Refund Adjustment & Entitlement Revocation
- **Target**: RPC `record_refund_adjustment`, `purchase_entitlements.is_revoked`, and negative ledger line.
- **Actions Tested**:
  1. Admin executes `record_refund_adjustment(order_id, 'Duplicate charge reported by customer bank')`.
  2. Inspect `sales_ledger` for `entry_type = 'refund_adjustment'`.
  3. Inspect `purchase_entitlements` for `is_revoked = true`.
  4. Reader queries paid chapter again.
- **Expected Result**: Negative ledger line created (`gross_amount_pkr < 0`, `platform_commission_pkr < 0`), entitlement is marked revoked, and reader can no longer read the paid chapter.

### Test 10: Fraud Detection: Duplicate TID Flagging vs Resubmission
- **Target**: Trigger `check_duplicate_tid_before_insert`.
- **Actions Tested**:
  1. Reader submits `TID-987654` for Order 1. Submission is rejected by writer.
  2. Reader resubmits the same `TID-987654` for Order 1 with a clearer screenshot.
  3. Malicious user submits the same `TID-987654` for a different order (Order 2).
- **Expected Result**:
  - Resubmission on Order 1: `is_duplicate_tid_flagged = false`.
  - Submission on Order 2: `is_duplicate_tid_flagged = true` with `duplicate_of_submission_id` pointing to Order 1's submission.

### Test 11: Admin Bootstrap as postgres vs authenticated Escalation Block
- **Target**: `trg_protect_profile_columns`.
- **Actions Tested**:
  1. As `postgres` (superuser / direct SQL editor): `UPDATE profiles SET role = 'admin' WHERE id = admin_id;`
  2. Under `SET LOCAL ROLE authenticated;` with JWT for reader: `UPDATE profiles SET role = 'admin' WHERE id = reader_id;`
- **Expected Result**: (1) Succeeds cleanly for initial setup. (2) Fails with `Privilege escalation rejected: Users cannot modify their own role`.

### Test 12: Chapter Content 120,000 Char Limit & Revision Tracking
- **Target**: Constraint `chk_chapters_content_length`, table `chapter_revisions`, trigger `trg_chapters_record_revision`.
- **Actions Tested**:
  1. Writer attempts updating chapter with 120,001 characters.
  2. Writer updates chapter content normally.
  3. Inspect `chapter_revisions` for prior version snapshot.
  4. Writer B attempts querying Writer A's chapter revisions.
- **Expected Result**: (1) Fails CHECK constraint. (2) Succeeds. (3) Revision snapshot exists. (4) Returns 0 rows for Writer B.

### Test 13: Reader Progress Isolated RLS
- **Target**: Table `reader_progress` RLS policies.
- **Actions Tested**:
  1. Reader 1 records progress on Chapter 2.
  2. Reader 2 attempts to query Reader 1's progress.
  3. Reader 2 attempts to update Reader 1's progress.
- **Expected Result**: Reader 1 reads and updates own progress. Reader 2 cannot read (0 rows) or modify Reader 1's progress.

### Test 14: Dispute Decoupling & Admin Force-Verify
- **Target**: RPC `resolve_dispute`, RPC `admin_force_verify`.
- **Actions Tested**:
  1. Reader opens dispute on verified order.
  2. Admin resolves dispute with `resolved_for_reader`.
  3. Confirm order is NOT automatically refunded.
  4. Reader submits order unfairly rejected by writer.
  5. Admin executes `admin_force_verify(order_id, note)`.
  6. Confirm entitlement granted, sales ledger entry recorded, and writer commission reconciled.
  7. Admin resolves dispute with `resolved_for_writer`.
  8. Confirm order status remains `rejected`.
- **Expected Result**: Distinct admin outcomes operate cleanly without side-effect automatic ledger mutations.

## 3. How to Execute the SQL Test Suites

In your local Supabase database or the Supabase SQL Editor:
1. Open `supabase/tests/01_security_and_financial_hardening_tests.sql` (Security & Multi-Tenant Tests).
2. Open `supabase/tests/02_order_flow_fixes_tests.sql` (Order Flow Gap Fixes & Payment Tests).
3. Every test executes in an isolated transaction wrapped in `BEGIN ... ROLLBACK` with `GRANT ALL ON test_results TO PUBLIC`, simulating impersonated roles (`reader`, `writer`, `admin`) via `SET LOCAL "request.jwt.claims"`.

---

## 4. Order Flow Gap Fixes Test Matrix (Step 1.2d — Migration 0009)

**Test Suite Path**: `supabase/tests/02_order_flow_fixes_tests.sql`

### Test 1: Verifying Non-Submitted Order Fails
- **Target**: RPC `verify_order_payment`.
- **Condition**: Order created in `pending_payment` without a valid payment submission.
- **Expected Result**: Attempting to verify raises an exception (`Order cannot be verified in current status: pending_payment. Only orders in status payment_submitted can be verified.`).

### Test 2: Verifying with Rejected Submission Fails
- **Target**: RPC `verify_order_payment`, RPC `reject_order_payment`.
- **Condition**: Submission `reviewer_status` was rejected by writer.
- **Expected Result**: Attempting to call `verify_order_payment` with this submission fails with `Payment submission cannot be verified: submission reviewer_status is rejected, expected pending.`.

### Test 3: Double Verify Creates Exactly One Ledger Row & Subsequent Verify Is Blocked
- **Target**: RPC `verify_order_payment`, partial unique index `idx_sales_ledger_order_sale_verified`.
- **Condition**: Author successfully verifies payment. Order status becomes `verified`.
- **Expected Result**: Exactly 1 ledger row is written. Subsequent call to `verify_order_payment` is rejected because order is no longer in `payment_submitted`.

### Test 4: Resubmission After Rejection Works
- **Target**: RPC `submit_payment`, RPC `reject_order_payment`.
- **Condition**: Order was rejected by author. Reader resubmits payment with updated TID / screenshot.
- **Expected Result**: Order cleanly transitions back to `payment_submitted` and can be subsequently verified.

### Test 5: Second Order While Rejected Order Exists Is Blocked
- **Target**: RPC `create_order`, partial unique index `uq_orders_reader_novel_active`.
- **Condition**: Order in status `rejected` exists for (reader, novel). Reader attempts `create_order` for the same novel.
- **Expected Result**: Blocked with exception (`An active or rejected order for this novel already exists in your account`). Reader must either resubmit or cancel the existing order.

### Test 6: Cancel Order Works Only for Reader & Only for Open/Rejected Orders
- **Target**: RPC `cancel_order`.
- **Condition**: Another user attempts to cancel the order (unauthorized). The ordering reader cancels their own order.
- **Expected Result**: Unauthorized user is rejected with error. Ordering reader successfully cancels order, transitioning status to `cancelled` and writing an audit log.

### Test 7: Non-Writer Cannot Call Writer RPCs
- **Target**: RPC `upsert_writer_payment_method`, RPC `verify_order_payment`, RLS on `writer_payment_methods`.
- **Condition**: Reader attempts to invoke writer-restricted RPCs.
- **Expected Result**: Both `upsert_writer_payment_method` and `verify_order_payment` abort with unauthorized exceptions. Readers cannot read or manage writer payment methods.

---

## 5. Dispute & Writer Status Hardening Test Matrix (Step 1.2e — Migration 0010)

**Test Suite Path**: `supabase/tests/03_dispute_and_writer_status_tests.sql`

### Test 1: Disputed Order Blocks a New Order
- **Target**: Partial unique index `uq_orders_reader_novel_active` and RPC `create_order`.
- **Condition**: Reader has an order in status `disputed` for a novel. Reader attempts to call `create_order` for the same novel.
- **Expected Result**: Blocked with exception (`An active, rejected, or disputed order for this novel already exists in your account`). Unique index also enforces at the database storage level.

### Test 2: Force-Verify Cannot Create a Double Sale
- **Target**: RPC `admin_force_verify`, table `purchase_entitlements`, table `sales_ledger`.
- **Condition**: Order was force-verified by admin (entitlement granted, `sale_verified` ledger row recorded). Admin attempts a second `admin_force_verify` call on the same order.
- **Expected Result**: Blocked with exception (`Reader already holds an active entitlement` / `A sale_verified ledger entry already exists` / `Order is not in a force-verifiable state`). Double sales, redundant entitlements, and ledger duplication are strictly impossible.

### Test 3: open_dispute Rejects Cancelled and Out-of-Window Orders
- **Target**: RPC `open_dispute`, table `platform_settings` (`dispute_window_days`).
- **Condition**:
  1. Reader attempts to open a dispute on a `cancelled` order.
  2. Reader attempts to open a dispute on an order whose reference timestamp (`verified_at` / `created_at`) exceeds `dispute_window_days` (default 30 days).
  3. Reader opens a dispute on an active `verified` order.
- **Expected Result**:
  1. Rejected with exception (`Disputes can only be opened for orders in payment_submitted, rejected, or verified status`).
  2. Rejected with exception (`The dispute window for this order has expired (30 days limit)`).
  3. Succeeds; crucially, the order status **remains `verified`** (does not overwrite to `disputed`) so the reader maintains reading access while the dispute is evaluated. The dispute is tracked solely in `disputes.status`.

### Test 4: Suspended Writer Cannot Self-Update Status
- **Target**: Trigger function `trg_protect_writer_profile_columns` and RPC `apply_as_writer`.
- **Condition**: Writer whose status is `suspended` attempts direct SQL `UPDATE writer_profiles SET status = 'pending_approval'` or calls `apply_as_writer`.
- **Expected Result**: Direct update is aborted by trigger (`Unauthorized: Writer approval status can only be modified by administrators`). Calling `apply_as_writer` is rejected (`A writer application already exists for your account with status: suspended`).

### Test 5: Rejected Writer Can Reapply Only via apply_as_writer
- **Target**: Trigger function `trg_protect_writer_profile_columns` and RPC `apply_as_writer`.
- **Condition**: Writer in status `rejected` attempts direct SQL update to `pending_approval` vs calling `apply_as_writer`.
- **Expected Result**:
  1. Direct SQL update is blocked by trigger because the transaction-local setting `app.writer_reapply` is missing.
  2. Calling `apply_as_writer` sets `app.writer_reapply = '1'` locally, accepts terms, logs audit entry, and successfully transitions status to `pending_approval`.

---

## 6. Writer Content & Manuscript Hardening Test Matrix (Step 3.1 — Migration 0011)

**Test Suite Path**: `supabase/tests/04_writer_content_tests.sql`

### Test 1: Writer Cannot Set Own Novel Status to Published
- **Target**: Trigger function `trg_protect_novel_columns` on `public.novels`.
- **Condition**: Author attempts direct client SQL `UPDATE novels SET status = 'published' WHERE id = own_novel_id;`
- **Expected Result**: Blocked by trigger exception (`Unauthorized: Novel status can only be modified via official editorial workflows.`). Only editorial review approval RPC or administrators can mark a novel as published.

### Test 2: Writer Cross-Author Isolation
- **Target**: RLS policies and triggers on `novels` and `chapters`.
- **Condition**: Writer A attempts to call `update_novel` on Writer B's novel or insert chapters into Writer B's novel.
- **Expected Result**: Both operations are aborted with unauthorized exceptions or blocked by RLS policies. Multi-tenant writer boundaries are strictly enforced.

### Test 3: Non-Approved Writer Cannot Create Novels
- **Target**: RPC `create_novel` and RLS `Writers insert own novels`.
- **Condition**: Applicant with writer profile status `pending_approval` or `suspended` invokes `create_novel`.
- **Expected Result**: Aborted with exception (`Only approved writers can create new novels.`).

### Test 4: Reader Cannot Insert Novel
- **Target**: RPC `create_novel` and direct SQL insert on `novels`.
- **Condition**: User with role `reader` attempts `create_novel` RPC and direct SQL `INSERT INTO novels`.
- **Expected Result**: Both attempts are aborted by RPC authorization checks and database RLS.

### Test 5: submit_novel_for_review Complete Lifecycle
- **Target**: RPC `submit_novel_for_review` and RPC `withdraw_novel_submission`.
- **Condition**: Author attempts to submit a novel missing cover art, genre, published chapter, or active payment method (for paid novels). Author subsequently provides all prerequisites and submits. Author then tests withdrawing.
- **Expected Result**:
  1. Each incomplete submission attempt fails with a descriptive exception identifying the missing requirement.
  2. Once complete, `submit_novel_for_review` succeeds, transitions status to `under_review`, records an audit log, and notifies all platform administrators.
  3. Calling `withdraw_novel_submission` safely reverts novel to `draft` status.

### Test 6: Price Change on Published Novel Does Not Alter Existing Orders
- **Target**: Trigger function `trg_protect_novel_columns`, table `orders`, table `audit_logs`.
- **Condition**: An existing reader order exists at PKR 600.00. Author updates the published novel price to PKR 950.00.
- **Expected Result**: The existing order's `amount_pkr` remains completely unchanged at PKR 600.00 (snapshot immutable). An audit log row with `action_type = 'UPDATE_NOVEL_PRICE'` is recorded.

### Test 7: Chapter Hard-Delete Protection on Published Novels
- **Target**: Trigger function `trg_protect_chapter_deletion` on `chapters`.
- **Condition**: Author attempts `DELETE FROM chapters WHERE id = chap_id` for a chapter in a submitted or published novel.
- **Expected Result**: Blocked by trigger exception (`Chapters cannot be hard-deleted once a novel is submitted or published. Please unpublish the chapter instead.`). Hard deletes are strictly allowed only while novel is in draft status.

### Test 8: Draft Novels & Unpublished Chapters Visibility
- **Target**: RLS policies `Public view published novels` and `Read chapters if free preview or entitled or owner or admin`.
- **Condition**: Unentitled reader and anon query draft novels or unpublished chapters.
- **Expected Result**: All queries return `0` rows. Manuscripts remain private to author and platform administrators until published.

---

## 5. Step 3.2 Platform Admin Controls & Governance Matrix (Test Suite 05)

**Test Suite Path**: `supabase/tests/05_admin_controls_tests.sql`

| Scenario ID | Tested Operation / RPC | Personas Evaluated | Target Policy / Invariant | Expected Test Behavior |
|---|---|---|---|---|
| **ADM-01** | `suspend_novel`, `unsuspend_novel`, `set_novel_featured`, `create_genre`, `update_genre`, `delete_genre`, `update_platform_settings`, `set_writer_commission_terms`, `admin_update_user_role_status` | Reader, Writer, Anon | `public.is_admin()` gate | Every RPC execution by a non-admin is strictly aborted with an exception (`Restricted: Only platform administrators...`). |
| **ADM-02** | `update_platform_settings` range validation | Admin | Range constraints (rate 0-100, limit >= 0, dispute 1-365, max price > 0) | Out-of-bound inputs abort with validation exceptions. Valid inputs update `platform_settings` and write audit log with prior and new state. |
| **ADM-03** | `admin_update_user_role_status` self-protection | Admin | Self-demotion / deactivation block | Admin cannot change their own role to non-admin or set `is_active = false`. Aborts with `Administrators cannot demote or deactivate their own account`. |
| **ADM-04** | `admin_update_user_role_status` last-admin guard | Admin | Platform administrative continuity | When only one active administrator remains, attempts by another admin or automated workflow to demote or deactivate the last admin abort with `Cannot remove the last remaining active platform administrator`. |
| **ADM-05** | `admin_update_user_role_status` published writer guard | Admin | Catalog integrity | Demoting an approved writer with published novels to `reader` is blocked with `Cannot demote writer to reader while they have N published novel(s). Suspend the writer and their published novels first.`. |
| **ADM-06** | `delete_genre` in-use protection | Admin | Taxonomy consistency | Deleting a genre assigned to any novel in `novel_genres` aborts with `Cannot delete genre ... because it is assigned to N novel(s). Deactivate it instead.`. Deleting an unassigned genre succeeds. |
| **ADM-07** | `suspend_novel` & entitlement preservation | Admin, Reader | Marketplace visibility & Reader Entitlements | Suspending a novel transitions its status to `suspended`, blocks new reader orders, but preserves existing reader purchase entitlements and chapter access. Calling `unsuspend_novel` returns status to `published`. |
| **ADM-08** | `set_writer_commission_terms` | Admin | Future-sales scope & balance reconciliation | Updates custom commission rate and limit with mandatory reason. Past `sales_ledger` rows remain immutable. Calls `reconcile_writer_unpaid_commission` and writes audit log. |
| **ADM-09** | Audit trail recording | Admin | Immutable `audit_logs` | Every successful administrative governance action records an append-only row in `public.audit_logs` capturing `actor_id`, `actor_role`, `action_type`, `entity_type`, `entity_id`, `previous_state`, and `new_state`. |



