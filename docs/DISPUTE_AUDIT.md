# UNB Premium — Dispute, Refund, and Settlement Financial Audit (Step 5.2)

**Document Target**: Audit of historical dispute handling, force verification, refund adjustments, and ledger interactions across migrations `0006`, `0007`, `0009`, `0010`, `0012`, `0016`, and `0017`.  
**Architecture Context**: Reader-to-writer direct payment rails (JazzCash, EasyPaisa, Raast, Direct Bank Transfer). The platform never touches, escrows, or holds reader funds. Refunds are executed by the writer off-platform and formalized on-platform as administrative ledger adjustments.

---

## 1. Executive Summary & Core Invariants

In UNB Premium:
1. **Direct Settlement Invariant**: A "refund" is fundamentally a peer-to-peer reversal executed by the author to the reader outside the platform. The platform records an append-only negative ledger entry (`refund_adjustment`) that reduces the author's accrued platform commission and revokes reader chapter access (`purchase_entitlements.is_revoked = true`).
2. **Append-Only Immutability Invariant**: Historical `sales_ledger` rows and past `commission_invoices` are never updated or deleted. Corrections and reversals are strictly append-only.
3. **Decoupled Verification vs. Dispute Resolution**: A dispute can be raised across three distinct lifecycle states: `payment_submitted`, `rejected`, or `verified`. Administrative resolution must enforce idempotent, atomic outcomes.

---

## 2. In-Depth Audit of Current Implementations (Migrations 0006–0017)

### A. Current Behavior of `open_dispute`
*Found in*: `0010_dispute_and_writer_status_hardening.sql:L488-L600` (superseding `0006:L1552`).
- **Authorization**: Callable by order reader, order writer, or admin.
- **Allowed Statuses**: Orders in `payment_submitted`, `rejected`, or `verified`.
- **Dispute Window**: Checked against `platform_settings.dispute_window_days` (default 30 days) from `coalesce(v_order.verified_at, v_order.created_at)`.
- **Dispute De-duplication**: Rejects if another dispute on the order is in `('open', 'under_review')`.
- **Order State Mutation**:
  - If order is `payment_submitted` or `rejected`, sets `orders.status = 'disputed'`.
  - If order is `verified`, preserves `orders.status = 'verified'` (so the reader retains access while evidence is under review).
- **Vulnerabilities & Gaps Identified**:
  1. **Premature Reader Disputes**: There is **no minimum wait time** for `payment_submitted` orders. A reader can submit a TID and immediately file a dispute before the writer has even had 1 minute to check their bank account.
  2. **No Interactive Messaging**: Disputes only have a static opening `reason`. Neither the reader, writer, nor admin can exchange clarifying statements or upload secondary evidence screenshots after dispute creation.

---

### B. Current Behavior of `resolve_dispute`
*Found in*: `0010_dispute_and_writer_status_hardening.sql:L642-L750` (superseding `0007:L246` and `0006:L1670`).
- **Authorization**: Admin only (`is_admin()`).
- **Allowed Resolutions**: `'resolved_for_reader'`, `'resolved_for_writer'`, `'closed'`.
- **Order State Mutation**:
  - When `p_resolution = 'resolved_for_writer'`: sets order status to `'rejected'`.
  - When `p_resolution = 'closed'`: sets order status to `'rejected'`.
  - When `p_resolution = 'resolved_for_reader'`: **Leaves the order in `'disputed'` or `'verified'` without performing any financial action or entitlement update!**
- **Vulnerabilities & Gaps Identified**:
  1. **Decoupled Limbo**: In `0010`, `resolve_dispute` deliberately refrained from auto-refunding or auto-verifying, stating in comments:
     > *"Order remains in 'disputed' for explicit admin action (admin_force_verify)... Any financial reversal must occur via explicit record_refund_adjustment RPC."*
     This decoupled two-step model leaves disputes marked "resolved" while the order itself remains in a limbo state (`disputed`), requiring admins to locate the order elsewhere to trigger verification or refund.
  2. **Ambiguity on Verified Orders**: If a dispute is raised on a `verified` order (e.g. reader claims wrong manuscript was delivered or author agreed to return funds) and resolved for the reader, the dispute closes, but no refund row is created unless the admin separately finds the order and invokes `record_refund_adjustment`.

---

### C. Current Behavior of `admin_force_verify`
*Found in*: `0010_dispute_and_writer_status_hardening.sql:L240-L350` (superseding `0007:L385`).
- **Authorization**: Admin only (`is_admin()`).
- **Allowed Statuses**: Orders in `payment_submitted`, `rejected`, or `disputed`.
- **Guards**:
  - Checks if reader already has an active entitlement for the novel (`is_revoked = false`).
  - Checks if a `sale_verified` ledger entry already exists for the order.
- **Actions**:
  - Updates payment submission to `reviewer_status = 'verified'`.
  - Updates any open disputes to `status = 'resolved_for_reader'`.
  - Sets order status to `'verified'`.
  - Creates active `purchase_entitlements` row.
  - Creates `sales_ledger` entry (`entry_type = 'sale_verified'`).
  - Reconciles writer's unpaid commission via `reconcile_writer_unpaid_commission()`.
- **Vulnerabilities & Gaps Identified**:
  - If an order was previously `verified` and subsequently refunded via `record_refund_adjustment` (`orders.status = 'refunded_adjusted'`), `admin_force_verify` properly rejects it (`v_order.status NOT IN ('payment_submitted', 'rejected', 'disputed')`). However, if an administrative UI exposes "force verify" on a dispute that was opened on a verified order, the admin action would fail abruptly. Atomic resolution RPCs with specific preconditions are required.

---

### D. Current Behavior of `record_refund_adjustment`
*Found in*: `0006_security_and_financial_hardening.sql:L1019-L1120`.
- **Authorization**: Admin only (`is_admin()`).
- **Preconditions**:
  - Order must be in `status = 'verified'`.
  - Original `sales_ledger` row with `entry_type = 'sale_verified'` must exist.
- **Actions**:
  - Inserts reversal `sales_ledger` row (`entry_type = 'refund_adjustment'`, negative gross, negative commission, negative writer net, referencing `original_ledger_entry_id`).
  - Sets `purchase_entitlements.is_revoked = true` with `revoked_reason`.
  - Updates order status to `'refunded_adjusted'`.
  - Reconciles writer unpaid commission.
- **Double-Credit / Double-Refund Analysis**:
  - Can an order be refunded twice?
    - `v_order.status != 'verified'` check blocks a second refund because the order status immediately transitions to `'refunded_adjusted'`.
    - However, there was no structured way for an author or reader to submit a formal **refund request** with evidence of the bank transfer before the admin issues the adjustment.
  - Can a force-verify occur after a refund?
    - If status is `'refunded_adjusted'`, `admin_force_verify` fails because it only accepts `('payment_submitted', 'rejected', 'disputed')`.
    - Furthermore, `sales_ledger` already contains the original `sale_verified` row, triggering the invariant check: `A sale_verified ledger entry already exists for this order.`

---

## 3. Invoiced Commission vs. Post-Invoicing Refund Interaction

### The Invoicing Lifecycle (Step 5.1 & Migration 0017)
In Step 5.1 (`0017_commission_and_statements.sql`), commission invoicing transitioned to an immutable line-item model:
- `commission_invoice_lines` stores individual ledger entries included in an invoice, guarded by a partial unique index:
  ```sql
  CREATE UNIQUE INDEX idx_cil_active_ledger_entry ON public.commission_invoice_lines (ledger_entry_id) WHERE (is_voided = false);
  ```
- When an invoice is issued, positive sales ledger rows are frozen into invoice lines.

### What Happens When a Refund Occurs on an Already-Invoiced Order?
1. **The Old Invoice is Never Modified**:
   - The invoice issued last month remains legally and historically accurate as of the date it was closed.
2. **Negative Ledger Row Accrues in `sales_ledger`**:
   - `record_refund_adjustment` appends a new row (`platform_commission_pkr = -X`).
   - This row has `id = gen_random_uuid()` and has never been linked to any invoice line.
3. **Immediate Balance Relief**:
   - `reconcile_writer_unpaid_commission(v_writer_id)` calculates:
     $$\text{Unpaid Balance} = \sum(\text{sales\_ledger.platform\_commission}) - \sum(\text{commission\_payments.amount})$$
   - Because the refund entry is negative, the author's unpaid balance decreases immediately by the refunded commission.
4. **Absorption in the NEXT Invoice**:
   - In `generate_commission_invoice()`, all unlinked entries in the period are queried:
     ```sql
     SELECT * FROM public.sales_ledger l
     WHERE l.writer_id = p_writer_id
       AND NOT EXISTS (
           SELECT 1 FROM public.commission_invoice_lines cil
           WHERE cil.ledger_entry_id = l.id AND cil.is_voided = false
       );
     ```
   - The negative refund line is ingested as a negative line item, offsetting new sales for the subsequent billing cycle.
   - If the net sum of a cycle is $\le 0$, `generate_commission_invoice` safely blocks generation until future positive sales bring the net above zero, leaving the credit available.

---

## 4. Double-Credit and State Invariant Matrix

| Scenario | Possible Today? | Vulnerability / Defect | Mitigation in Migration 0018 |
|---|---|---|---|
| **Two Open Disputes on One Order** | No | Guarded by partial check in `open_dispute`. | Retained and reinforced. |
| **Premature Dispute on `payment_submitted`** | **Yes** | Reader can dispute 1 second after submitting TID. | Added `min_dispute_wait_hours` (default 24h) check in `open_dispute`. |
| **Two Refunds on Same Order** | No | `record_refund_adjustment` checks `status = 'verified'` and sets `'refunded_adjusted'`. | Retained. Added partial unique index on `refund_requests (order_id) WHERE (status = 'pending')`. |
| **Force-Verify After Refund** | No | Guarded by `sale_verified` presence and status check. | Retained. |
| **Refund After Force-Verify** | Valid Business Case | If an order was force-verified, but the author subsequently returned funds, a refund is legitimate. | Supported cleanly via `resolve_dispute_refund` and `approve_refund_request`. |
| **Dispute Resolution without Action** | **Yes** | Admin could select `resolved_for_reader` in `resolve_dispute` and forget to force-verify or refund. | Replaced with explicit atomic resolution RPCs: `resolve_dispute_for_reader_verify`, `resolve_dispute_refund`, `resolve_dispute_for_writer`, `close_dispute`. |
| **Writer Balance Drops Below True Total** | No | `reconcile_writer_unpaid_commission` strictly computes from ledger and payment receipts. | Retained. |

---

## 5. Architectural Blueprint for Migration 0018

1. **Settings & Policy**:
   - `platform_settings`: Add `min_dispute_wait_hours` (default 24) and `verification_reminder_hours` (default 12).
2. **Dispute Communication**:
   - Table `dispute_messages`: Multi-party discussion between reader, writer, and admin with attachments stored under `payment-proofs/{dispute_id}/`.
   - Storage RLS: Authorize dispute participants and admin to read and upload to `{dispute_id}/*`.
3. **Atomic Dispute Outcomes**:
   - `resolve_dispute_for_reader_verify(p_dispute_id, p_note)`: Force-verifies order, creates entitlement & ledger row, resolves dispute in 1 transaction.
   - `resolve_dispute_refund(p_dispute_id, p_note)`: Verified orders only; creates negative ledger row, revokes entitlement, marks order `refunded_adjusted`, resolves dispute in 1 transaction.
   - `resolve_dispute_for_writer(p_dispute_id, p_note)`: Closes dispute in writer's favor, zero financial mutations.
   - `close_dispute(p_dispute_id, p_note)`: Closes dispute without resolution.
4. **Refund Requests Desk**:
   - Table `refund_requests`: Track author claims of off-platform refunds with evidence notes and optional screenshots.
   - Admin approval invokes atomic ledger adjustment and revokes entitlement.
5. **Support Helpdesk**:
   - Tables `support_requests` and `support_messages` with isolation and daily submission rate limits.
6. **Email Outbox & Notifications**:
   - Table `email_outbox` and `notification_preferences` with non-sensitive templates and idempotent deduplication keys.
   - Scheduled reminders function `run_scheduled_reminders()` for verification, invoice due dates, and stagnant disputes.
