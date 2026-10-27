# UNB Premium — Developer Manual Setup Checklist

This document details the exact, step-by-step instructions required to initialize the Supabase PostgreSQL database, configure environment variables, provision storage buckets, and verify Row Level Security (RLS) for the **UNB Premium** (`یو این بی پریمیم`) digital marketplace.

---

## Stage 1: Supabase PostgreSQL Schema Execution

Execute the 6 sequential migration files in the **Supabase Dashboard -> SQL Editor** (or via `supabase db push` / `supabase migration up`). Each script is idempotent.

### 1. `supabase/migrations/0001_enums_and_core_tables.sql`
- **Purpose**: Creates PostgreSQL enums, profiles (linked 1-to-1 with `auth.users`), writer profiles, payment methods, genres, novels, and chapter storage.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**: In **Table Editor**, confirm that the following tables appear:
  - `platform_settings` (with check constraint `id = 1`)
  - `profiles`
  - `writer_profiles`
  - `writer_payment_methods`
  - `genres`
  - `novels`
  - `novel_genres`
  - `chapters`

### 2. `supabase/migrations/0002_orders_and_financial_ledger.sql`
- **Purpose**: Establishes commercial orders, direct payment TID submissions, purchase entitlements, commission invoices, disputes, audit logs, and the initial `sales_ledger`.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**: In **Table Editor**, confirm that the following tables appear:
  - `orders`
  - `payment_submissions` (with virtual generated column `normalized_tid`)
  - `purchase_entitlements`
  - `commission_invoices`
  - `sales_ledger`
  - `commission_payments`
  - `disputes`
  - `notifications`
  - `audit_logs`

### 3. `supabase/migrations/0003_triggers_and_rpc_functions.sql`
- **Purpose**: Provisions initial database automation (auth trigger, order numbers, duplicate TID checks, initial verify/reject/confirm RPCs).
- **Action**: Paste contents into the SQL Editor and click **Run**.

### 4. `supabase/migrations/0004_rls_policies.sql`
- **Purpose**: Locks down all tables with initial Row Level Security policies.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**: In **Authentication -> Policies**, verify that tables have RLS enabled.

### 5. `supabase/migrations/0005_seed_genres_and_settings.sql`
- **Purpose**: Populates the platform settings singleton (20% default commission rate, PKR 5,000 unpaid commission threshold) and seeds 8 core Urdu literature genres.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**: Run `SELECT * FROM genres;` and confirm 8 rows are returned.

### 6. `supabase/migrations/0006_security_and_financial_hardening.sql` [CRITICAL SECURITY PATCH]
- **Purpose**: Hardens database against privilege escalation and financial manipulation:
  - Drops direct client write policies on `orders`, `payment_submissions`, `commission_invoices`.
  - Replaces `sales_ledger.order_id` strict unique constraint with a partial index `WHERE entry_type = 'sale_verified'` and adds `original_ledger_entry_id` for negative refund entries.
  - Replaces `purchase_entitlements` unique constraint with a partial index `WHERE is_revoked = false`.
  - Adds single open order constraint `(reader_id, novel_id) WHERE status IN ('pending_payment', 'payment_submitted')`.
  - Enforces append-only triggers on `sales_ledger` and `audit_logs` preventing `UPDATE` and `DELETE`.
  - Hardens `handle_new_user()` to unconditionally assign role `'reader'` (never trusts client metadata).
  - Adds `BEFORE UPDATE` column protection triggers on `profiles` and `writer_profiles`.
  - Implements atomic transactional RPCs: `create_order`, `submit_payment`, `verify_order_payment`, `reject_order_payment`, `record_refund_adjustment`, `generate_commission_invoice`, `report_commission_payment`, `confirm_commission_settlement`, `open_dispute`, `resolve_dispute`, writer moderation (`approve_writer`, `reject_writer`, `suspend_writer`), novel moderation (`approve_novel`, `reject_novel`), user role management, and screenshot retention purging.
  - Configures private bucket `payment-proofs` with RLS and public bucket `novel-assets`.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('create_order', 'submit_payment', 'record_refund_adjustment');
    ```
    Confirm all functions exist with `prosecdef = true` (`SECURITY DEFINER`).

### 7. `supabase/migrations/0007_gap_fixes_and_storage_hardening.sql` [GAP FIXES & STORAGE HARDENING]
- **Purpose**: Closes all remaining gaps:
  - Enforces chapters length limit (`chk_chapters_content_length <= 120000`).
  - Implements `chapter_revisions` table and `AFTER UPDATE` trigger logging prior versions.
  - Implements `reader_progress` table with strictly isolated reader RLS.
  - Decouples dispute resolution from automatic refund, establishes `admin_force_verify` RPC, and ensures `resolved_for_writer` leaves order rejected.
  - Configures granular storage RLS: `novel-assets` (user folder isolated `{auth.uid()}/...`) and `payment-proofs` (reader order folder isolated `{order_id}/...`, restricted to `pending_payment` or `rejected`).
  - Prohibits direct client writes on `disputes`, `commission_payments`, `purchase_entitlements`, `sales_ledger`, `audit_logs`, and restricts `notifications` to read-status updates only.
  - Allows direct SQL bootstrapping by postgres/superuser while blocking authenticated users from privilege escalation.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('admin_force_verify', 'resolve_dispute');
    ```
    Confirm both functions exist with `prosecdef = true`.

### 8. `supabase/migrations/0008_revoke_default_grants.sql` [DEFAULT GRANTS REVOCATION]
- **Purpose**: Revokes all default write grants on schema public from `anon`, revokes client write grants on financial tables (`orders`, `payment_submissions`, `commission_invoices`) from `authenticated`, and restricts notification mutations.
- **Action**: Paste contents into the SQL Editor and click **Run**.

### 9. `supabase/migrations/0009_order_flow_fixes.sql` [ORDER FLOW GAP FIXES & PAYMENT HARDENING]
- **Purpose**: Completes Step 1.2d order flow hardening:
  - `verify_order_payment`: Strictly requires `payment_submitted` (removes `pending_payment`) and `reviewer_status = 'pending'`.
  - `reject_order_payment`: Strictly requires `payment_submitted` and `reviewer_status = 'pending'`.
  - Edge case fix: Includes `'rejected'` in `create_order` open-order check and partial unique index `uq_orders_reader_novel_active`.
  - `cancel_order`: Implements transactional cancellation RPC for readers (and admins) on `pending_payment` and `rejected` orders.
  - `apply_as_writer`: Adds writer application RPC with agreement timestamp; allows reapplication for rejected writers.
  - `upsert_writer_payment_method` / `deactivate_writer_payment_method`: Strictly restricts payment methods management and reads to writer owner and admin.
  - Function permission hardening: Revokes `EXECUTE` on public functions from `PUBLIC` and `anon` (preserving `has_novel_entitlement` and `is_admin` for RLS evaluation), and grants only to `authenticated`.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('cancel_order', 'apply_as_writer', 'upsert_writer_payment_method', 'deactivate_writer_payment_method');
    ```
    Confirm all 4 functions exist with `prosecdef = true`.

### 10. `supabase/migrations/0010_dispute_and_writer_status_hardening.sql` [DISPUTE & WRITER STATUS GAP FIXES]
- **Purpose**: Completes Step 1.2e dispute and writer status hardening:
  - `platform_settings`: Adds `dispute_window_days integer NOT NULL DEFAULT 30`.
  - `uq_orders_reader_novel_active`: Recreates partial index covering `'pending_payment', 'payment_submitted', 'rejected', 'disputed'`.
  - `create_order`: Rejects order creation if an active, rejected, or disputed order exists for the novel.
  - `admin_force_verify`: Raises exception if reader already holds active entitlement or if `sale_verified` ledger entry already exists; resolves open dispute.
  - `open_dispute`: Restricts to `payment_submitted`, `rejected`, or `verified` orders; enforces `dispute_window_days`; for verified orders preserves `verified` status without overwriting.
  - `resolve_dispute`: Handles verified vs disputed orders without creating duplicate entitlements or ledger entries.
  - `trg_protect_writer_profile_columns` & `apply_as_writer`: Non-admin can only transition from `rejected` to `pending_approval` via `apply_as_writer` (`app.writer_reapply = '1'`). Suspended or approved writers cannot self-update.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'platform_settings' AND column_name = 'dispute_window_days';
    ```
    Confirm `dispute_window_days` is present.
  - Execute automated test suite: `supabase/tests/03_dispute_and_writer_status_tests.sql`.

### 11. `supabase/migrations/0011_writer_content_hardening.sql` [WRITER CONTENT & MANUSCRIPT HARDENING]
- **Purpose**: Completes Step 3.1 writer content hardening:
  - `platform_settings`: Adds `max_novel_price_pkr numeric(10,2) NOT NULL DEFAULT 5000.00`.
  - `novels`: Adds `BEFORE UPDATE` trigger `trg_protect_novel_columns` preventing non-admins from altering `status`, `is_featured`, `published_at`, `moderation_reason`, `writer_id`, `total_chapters`, or `slug` after publication.
  - Enforces that novel content can only be modified while in `draft`, `rejected`, or `published` status (not `under_review` or `suspended`).
  - Records an immutable audit log entry whenever the price of a published novel is updated.
  - `chapters`: Trigger `trg_chapters_calculate_word_count` automatically counts words on insert/update; trigger `trg_chapters_sync_total_chapters` synchronizes `novels.total_chapters`.
  - Trigger `trg_protect_chapter_deletion` strictly blocks hard-deleting chapters once a novel is submitted or published (requires unpublishing instead).
  - Atomic RPCs: `create_novel`, `update_novel`, `submit_novel_for_review`, `withdraw_novel_submission`, `unpublish_own_novel`, `reorder_chapters`, and `generate_unique_novel_slug`.
- **Action**: Paste contents into the SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('submit_novel_for_review', 'withdraw_novel_submission', 'unpublish_own_novel', 'create_novel', 'update_novel', 'reorder_chapters');
    ```
    Confirm all 6 RPCs exist with `prosecdef = true`.
  - Execute automated test suite: `supabase/tests/04_writer_content_tests.sql`.

### 12. `supabase/migrations/0012_admin_controls.sql` [ADMIN CONTROLS & GOVERNANCE]
- **Purpose**: Completes Step 3.2 platform administrator governance:
  - `genres`: Adds `is_active boolean NOT NULL DEFAULT true` and admin management policy for `novel_genres`.
  - Novel Moderation RPCs: `suspend_novel(p_novel_id, p_reason)` (hides from catalog, pauses new orders, leaves entitlements intact, notifies writer), `unsuspend_novel(p_novel_id)`, `set_novel_featured(p_novel_id, p_featured)`, and `approve_novel(p_novel_id, p_checklist)`.
  - Taxonomy Governance: `create_genre`, `update_genre`, `reorder_genres`, and `delete_genre` (strictly blocks deletion if linked to any novel in `novel_genres`; requires deactivation instead).
  - Platform Settings RPC: `update_platform_settings(default_commission_rate, default_unpaid_commission_limit, dispute_window_days, max_novel_price_pkr, support_email)` validating bounded ranges and recording audit entries with prior and new values (notes that changes affect future sales only).
  - Writer Commission Terms RPC: `set_writer_commission_terms(p_writer_id, p_custom_rate, p_unpaid_limit, p_reason)` with mandatory reason, audit trail, and automatic invocation of `reconcile_writer_unpaid_commission`.
  - User Role & Status Governance: `admin_update_user_role_status(p_user_id, p_role, p_is_active, p_reason)` with self-demotion / self-deactivation protection, last-admin removal prevention, and blocking demoting approved writers with published works to readers.
  - Security Definier hardening (`search_path = ''`), restricted to `public.is_admin()`, with privileges revoked from `PUBLIC`/`anon` and granted to `authenticated`.
- **Action**: Paste contents into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('suspend_novel', 'unsuspend_novel', 'set_novel_featured', 'create_genre', 'update_genre', 'reorder_genres', 'delete_genre', 'update_platform_settings', 'set_writer_commission_terms', 'admin_update_user_role_status');
    ```
    Confirm all 10 RPCs exist with `prosecdef = true`.
  - Execute automated test suite: `supabase/tests/05_admin_controls_tests.sql`.

### 13. `supabase/migrations/0013_public_catalog.sql` [PUBLIC CATALOG & DISCOVERY]
- **Purpose**: Completes Step 2.1 public marketplace discovery and safe data exposure:
  - Provisions `pg_trgm` extension (if not already enabled) and GIN trigram indexes for high-performance fuzzy Urdu and English search.
  - Provisions B-tree composite indexes on `novels(status, published_at DESC)` and `novels(status, price_pkr ASC)`.
  - Implements safe public view `public.public_novels`: strictly exposes published works with an explicit column allowlist (excluding moderation reasons, rights declarations, commissions, emails, and payment accounts).
  - Implements safe public view `public.public_writers`: exposes approved authors with $\ge 1$ published novel, pen names, biographies, and published counts.
  - Implements safe public view `public.public_genres`: exposes active genres with real published novel counts.
  - Implements safe public view `public.public_free_preview_chapters`: strictly filters chapters with `is_free_preview = true` and `is_published = true` belonging to published novels. Paid chapters and drafts remain unreadable.
  - Implements table-of-contents RPC `public.get_public_novel_chapters(p_novel_slug)` returning ordered chapter titles, sequence numbers, and lock flags without chapter body content.
  - Implements search RPC `public.search_public_novels(p_query, p_genre_slug, p_sort, p_limit, p_offset)` with wildcard escaping (`\`, `%`, `_`), multi-field matching (Urdu/English title, synopsis, author pen names), and sorting (`newest`, `price_low_high`, `price_high_low`, `featured`).
  - Strict security privileges: Grants `SELECT` on public views and `EXECUTE` on catalog RPCs to `anon` and `authenticated`; preserves explicit `REVOKE` on base tables for `anon`.
- **Action**: Paste contents into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name IN ('public_novels', 'public_writers', 'public_genres', 'public_free_preview_chapters');
    ```
    Confirm all 4 public views exist.
  - Execute automated test suite: `supabase/tests/06_public_catalog_tests.sql`.

### 14. `supabase/migrations/0014_min_novel_price.sql` [MINIMUM NOVEL PRICE ENFORCEMENT & PREVENT FREE NOVELS]
- **Purpose**: Implements Step 2.1b business rule: no free novels on the marketplace. Every novel must cost at least PKR 50 (configurable in platform settings; whole rupees only):
  - `platform_settings`: Adds `min_novel_price_pkr integer NOT NULL DEFAULT 50` with check constraint `(min_novel_price_pkr >= 1 AND min_novel_price_pkr <= max_novel_price_pkr)`.
  - Replaces `update_platform_settings(...)` RPC to validate 6 parameters (`p_min_novel_price_pkr integer`), enforcing `min >= 1` and `min <= max`, audit-logging previous/new values with notice that changes affect future sales only.
  - Adds trigger `trg_novels_validate_price` on `BEFORE INSERT OR UPDATE OF price_pkr ON public.novels`: raises a clear exception if `price_pkr` is not a whole number (`price_pkr = round(price_pkr, 0)`), is below `min_novel_price_pkr`, or is above `max_novel_price_pkr`. Enforced universally for all users (including admins via RPC or direct update).
  - Updates RPCs `create_novel` and `update_novel` to validate the novel price against `[min_novel_price_pkr, max_novel_price_pkr]`.
  - Updates RPC `submit_novel_for_review`: rejects submission of any legacy novel whose price is below the current platform minimum with a clear message: `"Novel price of PKR X is below the minimum allowed price of PKR Y. Please update your novel price before submitting for review."`.
  - Updates RPC `create_order`: adds defensive validation ensuring novel `price_pkr > 0` and within `[min_novel_price_pkr, max_novel_price_pkr]` before snapshotting to the order.
- **Action**: Paste contents into the Supabase SQL Editor and click **Run**.
- **Verification & Legacy Data Audit**:
  - Run the following audit query in the Supabase SQL Editor to inspect any pre-existing legacy novels below the minimum price and any past orders with non-positive amounts:
    ```sql
    -- =========================================================================
    -- LEGACY DATA AUDIT: Novels below minimum price & Non-positive orders
    -- NOTE: Do NOT silently modify or delete these rows or past orders.
    -- Review the results below to decide on grandfathering or manual updates.
    -- =========================================================================
    SELECT
      'novel' AS entity_type,
      id::text AS entity_id,
      title_english AS identifier,
      price_pkr AS amount,
      status
    FROM public.novels
    WHERE price_pkr < (SELECT min_novel_price_pkr FROM public.platform_settings WHERE id = 1)

    UNION ALL

    SELECT
      'order' AS entity_type,
      id::text AS entity_id,
      order_number AS identifier,
      amount_pkr AS amount,
      status
    FROM public.orders
    WHERE amount_pkr <= 0;
    ```
  - Execute automated test suite: `supabase/tests/07_min_price_tests.sql`.

### 15. `supabase/migrations/0015_checkout_and_payment_submission.sql` [CHECKOUT, RATE LIMITING, SECURE PAYMENT SUBMISSION & NOTIFICATIONS]
- **Purpose**: Implements Step 4.1 reader-to-writer direct payment checkout, abuse rate-limiting, and hardened payment verification workflows:
  - `platform_settings`: Adds `max_orders_per_hour integer NOT NULL DEFAULT 5` with check constraint `(max_orders_per_hour >= 1 AND max_orders_per_hour <= 100)`.
  - RPC `public.get_checkout_options(p_novel_id)`: returns novel summary (`novel_id`, `novel_title`, `price_pkr`, `writer_pen_name`), writer's ACTIVE payment methods with MASKED account numbers/IBANs (`•••• 1234`), and `existing_open_order_number`. Fails for unpublished novels, suspended novels, the author themselves, or readers who already own the novel. Full account numbers remain unexposed to uncommitted shoppers.
  - RPC `public.create_order(p_novel_id, p_payment_method_id)`: hardens abuse protection with an hourly rate limit per reader (`max_orders_per_hour`). Populates immutable `novel_title_snapshot`, `selected_payment_method_id`, and `currency = 'PKR'`. Captures full unmasked payment snapshot for the created order.
  - RPC `public.submit_payment(...)`:
    - Strict path traversal protection: `p_screenshot_path` must start with `<order_id>/` and contain only safe alphanumeric characters/hyphens/underscores ending in `.webp` (matching private bucket `payment-proofs`).
    - TID validation: 6-40 characters, letters/digits/hyphen/underscore.
    - Claimed amount: positive, whole rupee, maximum 10x order amount.
    - Single pending submission rule: only one pending submission allowed per order.
    - Idempotent retry within 60s: returns existing submission instead of creating duplicate records.
    - Duplicate TID flagging: triggers automatic flag `is_duplicate_tid = true` if TID was used on any other order, without blocking submission.
    - Automated notification: alerts author of the payment submission.
  - RPC `public.get_my_unread_notification_count()`: returns unread notification count for the authenticated user.
  - RPC `public.mark_notifications_as_read(p_notification_ids)`: marks specified notifications (or all unread notifications if empty/NULL) as read for the authenticated caller only.
  - RLS enforcement: readers select only own orders/submissions, writers select only orders/submissions of own novels, admins select all; no direct client INSERT/UPDATE/DELETE.
- **Action**: Paste contents into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'platform_settings' AND column_name = 'max_orders_per_hour';
    SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('get_checkout_options', 'get_my_unread_notification_count', 'mark_notifications_as_read');
    ```
    Confirm column and all 3 RPCs exist.
  - Execute automated test suite: `supabase/tests/08_checkout_tests.sql`.

### 16. `supabase/migrations/0016_reader_and_admin_orders.sql` [READER LIBRARY, SECURE WEB READER, ADMIN ORDER INSPECTION & FORCE-VERIFY]
- **Purpose**: Implements Step 4.2 reader library, server-gated secure chapter access, sliding-window reading abuse rate-limiting, and admin order inspection/force-verification:
  - `platform_settings`: Adds `max_chapter_reads_per_window integer NOT NULL DEFAULT 20` and `chapter_read_window_minutes integer NOT NULL DEFAULT 10` with sane check constraints.
  - Table `public.chapter_reads`: Records `(id, reader_id, chapter_id, novel_id, read_at)` with composite indexes on `(reader_id, read_at)` and `(reader_id, novel_id, chapter_id, read_at DESC)`. RLS enabled with direct client access revoked from both `anon` and `authenticated`.
  - RPC `public.update_platform_settings(...)`: Updated to accept and audit-log 9 settings parameters, including sliding-window reading abuse controls.
  - RPC `public.get_chapter_for_reader(p_novel_slug, p_chapter_number)`:
    - Server-gated secure chapter delivery for entitled readers, novel authors, and platform admins.
    - Free previews served only if the novel is published.
    - Entitled buyers retain reading access even if the novel is subsequently suspended or unlisted from the public store (`is_temporarily_unavailable = true`).
    - Watermark code resolution: Returns the buyer's `order_number` for entitled reads (used for DOM watermark rendering) and `null` for owners/admins.
    - Sliding-window rate limit: Entitled reads check `count(*)` in `chapter_reads` within `chapter_read_window_minutes`. Exceeding `max_chapter_reads_per_window` raises `'Too many chapters opened, please slow down'`.
    - Information Hiding: In every denied access case, raises the exact generic exception `'Chapter not found'` (never reveals novel title, chapter existence, or price).
  - RPC `public.upsert_reading_progress(p_novel_id, p_chapter_number)`: Authorizes progress tracking strictly for active entitlement holders, novel authors, or admins; isolates progress to the caller's own record.
  - RPC `public.get_my_library()`: Returns the caller's active novel entitlements with reading progress, cover art, Urdu/English titles, author pen names, total chapters, order numbers, and `is_temporarily_unavailable` flag.
  - RPC `public.admin_list_orders(p_status, p_search, p_only_stuck, p_limit, p_offset)` & `admin_get_order(p_order_id)`:
    - Admin-only inspection queries.
    - Resolves reader display names and usernames while strictly omitting reader emails for privacy.
    - Identifies stuck orders (`payment_submitted` for longer than the 24-hour verification window).
    - Resolves ledger states, payment submissions, duplicate TID flags, and disputes.
  - RLS Validation & Hardening: Direct `SELECT` on `chapters` never exposes paid content to non-entitled readers.
- **Action**: Paste contents into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'platform_settings' AND column_name IN ('max_chapter_reads_per_window', 'chapter_read_window_minutes');
    SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('get_chapter_for_reader', 'upsert_reading_progress', 'get_my_library', 'admin_list_orders', 'admin_get_order');
    ```
    Confirm both columns and all 5 RPCs exist.
  - Execute automated test suite: `supabase/tests/09_reader_access_tests.sql`.

### 17a. `supabase/migrations/0017_a_commission_enum_values.sql` [COMMISSION ENUM VALUES EXTENSION]
- **Purpose**: Extends `commission_invoice_status` enum with `'partially_paid'` and `'void'` values.
  > [!IMPORTANT]
  > **PostgreSQL Error 55P04 Invariant**: New enum values added via `ALTER TYPE ... ADD VALUE` must be committed in their own separate transaction before they can be referenced in tables, columns, RPCs, or policies. Run `0017_a_commission_enum_values.sql` first as a standalone SQL Editor execution and click **Run**.
- **Action**: Paste contents of `supabase/migrations/0017_a_commission_enum_values.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.commission_invoice_status'::regtype;
    ```
    Confirm both `'partially_paid'` and `'void'` appear in the results.

### 17b. `supabase/migrations/0017_commission_and_statements.sql` [SALES LEDGER, COMMISSION INVOICES, SETTLEMENT & STATEMENTS]
- **Purpose**: Implements Step 5.1 sales ledger audit fixes, lines-based commission invoicing, admin settlement confirmation, and auditable financial statements:
  - Table `platform_settings`: Adds `invoice_due_days integer NOT NULL DEFAULT 7` (range 1-90) and `overdue_grace_days integer NOT NULL DEFAULT 3` (range 0-60).
  - Table `commission_invoices`: Adds `due_date`, `voided_at`, `voided_by`, `void_reason`. Invoices are voided, never deleted.
  - Table `commission_invoice_lines`: `(id, invoice_id, ledger_entry_id, commission_pkr, is_voided, created_at)` with partial unique index `(ledger_entry_id) WHERE (is_voided = false)`. Prevents double-invoicing while never mutating `sales_ledger`.
  - Table `platform_payment_methods`: `(id, method_type, account_title, account_number_or_iban, bank_name, instructions_note, is_active)` managed by admin RPCs; readable only by writers who currently have an open invoice and by admins.
  - Table `commission_payment_reports`: `(id, invoice_id, writer_id, amount_pkr, transaction_reference, screenshot_path, writer_note, status, admin_note, reviewed_by, reviewed_at, created_at)` with TID format checks and duplicate TID detection across reports.
  - RPC `update_platform_settings(...)`: Updated to accept and audit-log 11 settings parameters.
  - RPC `preview_commission_invoice(...)` & `generate_commission_invoice(...)`: Takes uninvoiced ledger entries in the Asia/Karachi time period, atomically inserts invoice + lines, refuses total <= 0, sets due date, notifies writer.
  - RPC `void_commission_invoice(...)`: Voids invoice if no confirmed payments exist, frees lines for re-invoicing, audit logs.
  - RPC `report_commission_payment(...)`: The invoiced writer only; screenshot path must start with `<invoice_id>/`; creates PENDING report; moves invoice status to `payment_reported`; does NOT touch balances.
  - RPC `confirm_commission_settlement(...)`: Admin only; writes `commission_payments` row; updates `amount_settled` and status; reconciles balance; checks against overpayment.
  - RPC `reject_commission_report(...)`: Admin only; rejects claim with mandatory reason; notifies writer; returns invoice to invoiced.
  - RPC `record_commission_adjustment(...)`: Admin only; inserts `manual_correction` in `sales_ledger` (gross 0, platform_commission = +/- amount, writer_net = -/+ amount); never mutates historical ledger.
  - RPC `apply_overdue_rules(p_apply)`: Identifies writers with invoices overdue beyond grace days; pauses orders only when admin explicitly confirms with `p_apply = true`.
  - RPC `reconcile_writer_unpaid_commission(p_writer_id)`: Reconciles balance; pauses/unpauses orders; generates de-duplicated warnings at 80% and 100% threshold crossings.
  - Writer & Admin Inspection RPCs: `get_my_sales_summary`, `get_my_ledger`, `get_my_invoices`, `get_my_invoice`, `get_platform_payment_instructions`, `admin_commission_overview`, `admin_list_invoices`, `admin_get_invoice`, `admin_list_commission_reports`.
- **Action**: Paste contents of `supabase/migrations/0017_commission_and_statements.sql` into the Supabase SQL Editor (after 17a has committed) and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('commission_invoice_lines', 'platform_payment_methods', 'commission_payment_reports');
    SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('preview_commission_invoice', 'generate_commission_invoice', 'confirm_commission_settlement', 'report_commission_payment', 'record_commission_adjustment', 'apply_overdue_rules');
    ```
  - Execute automated test suite: `supabase/tests/10_commission_tests.sql`.

### 18. `supabase/migrations/0018_disputes_refunds_support.sql` [DISPUTES, REFUNDS, EMAIL NOTIFICATIONS, REMINDERS, SUPPORT]
- **Purpose**: Implements Step 5.2 disputes adjudication, off-platform refund adjustments, transactional outbox email delivery, background reminders, customer support desk, and user notification preferences:
  - `platform_settings`: Adds `min_dispute_wait_hours integer NOT NULL DEFAULT 24` and `verification_reminder_hours integer NOT NULL DEFAULT 12`.
  - Table `dispute_messages`: `(id, dispute_id, author_id, body, attachment_path, created_at)` with rate limiting (max 20 messages/hour).
  - Table `refund_requests`: `(id, order_id, requester_id, requester_role, reason, evidence_note, evidence_path, status, admin_note, reviewed_by, reviewed_at, created_at)`.
  - Table `support_requests`: `(id, user_id, category, subject, status, order_id, created_at, updated_at)` and `support_messages` (max 5 tickets/day rate limit).
  - Table `notification_preferences`: `(user_id, email_enabled, updated_at)`.
  - Table `email_outbox`: Transactional outbox `(id, recipient_email, recipient_name, template, subject, body_text, body_html, metadata, status, attempts, max_attempts, last_error, sent_at, created_at)`.
  - Atomic Security Definer RPCs:
    - Disputes: `open_dispute`, `add_dispute_message`, `resolve_dispute_for_reader_verify`, `resolve_dispute_refund`, `resolve_dispute_for_writer`, `close_dispute`, `get_my_disputes`, `get_dispute`, `admin_list_disputes`.
    - Refunds: `request_refund`, `approve_refund_request`, `reject_refund_request`, `admin_list_refund_requests`.
    - Support: `create_support_request`, `add_support_message`, `close_support_request`, `get_my_support_requests`, `get_support_request`, `admin_list_support_requests`.
    - Schedulers & Outbox: `run_scheduled_reminders`, `claim_pending_emails_for_sending`, `record_email_delivery_result`, `get_email_outbox_stats`, `retry_failed_emails`, `get_my_notification_preferences`, `update_notification_preferences`.
- **Action**: Paste contents of `supabase/migrations/0018_disputes_refunds_support.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('dispute_messages', 'refund_requests', 'support_requests', 'support_messages', 'notification_preferences', 'email_outbox');
    SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('open_dispute', 'resolve_dispute_for_reader_verify', 'resolve_dispute_refund', 'request_refund', 'approve_refund_request', 'run_scheduled_reminders', 'claim_pending_emails_for_sending');
    ```
    Confirm all 6 tables and RPCs exist.
  - Execute automated test suite: `supabase/tests/11_disputes_refunds_tests.sql`.

### 19. `supabase/migrations/0019_database_reconciliation_and_runtime_fixes.sql` [DATABASE RECONCILIATION]
- **Purpose**: Drops stale function overloads, reconciles checkout and reader RPCs (`get_checkout_options`, `create_order`, `get_chapter_for_reader`, `admin_list_orders`, `admin_get_order`), enforces security search path, and locks down public permissions.
- **Action**: Paste contents of `supabase/migrations/0019_database_reconciliation_and_runtime_fixes.sql` into the Supabase SQL Editor and click **Run**.

### 20. `supabase/migrations/0020_database_reconciliation_and_immutability_hardening.sql` [RUNTIME FIXES & IMMUTABILITY]
- **Purpose**: Fixes plpgsql_check defects:
  - Corrects `resolve_dispute_for_reader_verify` by using real column `granted_at` (removing non-existent `created_at`) and partial index conflict target.
  - Reconciles `update_platform_settings` with authoritative `public.platform_settings` columns (`default_unpaid_commission_limit`, removing non-existent `unpaid_commission_threshold_pkr` and `payment_verification_window_hours`).
  - Aligns `verify_order_payment` and `admin_force_verify` with partial unique index predicates (`(reader_id, novel_id) WHERE is_revoked = false` and `(order_id) WHERE entry_type = 'sale_verified'`) with idempotent retries.
  - Recreates append-only immutability triggers on `sales_ledger` and `audit_logs` (BEFORE UPDATE/DELETE and BEFORE TRUNCATE).
- **Action**: Paste contents of `supabase/migrations/0020_database_reconciliation_and_immutability_hardening.sql` into the Supabase SQL Editor and click **Run**.

### 21. `supabase/migrations/0021_trigger_privilege_lockdown_and_search_path_fix.sql` [PRIVILEGE LOCKDOWN & SEARCH PATH FIX]
- **Purpose**: Addresses 37 FAILs found in the live verification run:
  - **Trigger function EXECUTE revocation**: Dynamically loops over all trigger-returning functions in schema public and REVOKEs EXECUTE from PUBLIC, anon, and authenticated. No hard-coded function names — covers all current and future trigger functions.
  - **ALTER DEFAULT PRIVILEGES**: Future functions created by the postgres role in schema public are private by default (no automatic PUBLIC EXECUTE grant).
  - **Anon allowlist preservation**: Re-grants EXECUTE to anon on the four catalog/RLS helper functions (`search_public_novels`, `get_public_novel_chapters`, `has_novel_entitlement`, `is_admin`) that must remain unauthenticated-accessible.
  - **search_path fix**: All 5 functions rewritten in migration 0020 used `SET search_path = public, pg_temp` (insecure). This migration uses `ALTER FUNCTION ... SET search_path = ''` to correct each, without touching function bodies (all references were already schema-qualified).
  - **Authenticated RPC grant sweep**: Belt-and-suspenders GRANT EXECUTE to authenticated on all known workflow RPCs.
- **Action**: Paste contents of `supabase/migrations/0021_trigger_privilege_lockdown_and_search_path_fix.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Run `supabase/tests/00_post_migration_verification.sql`.

### 22. `supabase/migrations/0022_protection_triggers_and_search_path_lockdown.sql` [PROTECTION TRIGGERS & SEARCH PATH LOCKDOWN]
- **Purpose**: Fixes writer-side `verify_order_payment` execution and hardens search paths across all remaining SECURITY DEFINER functions:
  - **Protection Trigger Trust Model Overhaul**: Rewrites all 5 sensitive table mutation protection trigger functions (`trg_protect_writer_profile_columns`, `trg_protect_profile_columns`, `trg_protect_novel_columns`, `trg_protect_chapter_deletion`, `trg_protect_notification_columns`) as `SECURITY INVOKER` with `SET search_path = ''`. Replaces fragile `auth.uid()` / `current_setting('role')` checks with `v_is_trusted := (pg_catalog.current_user NOT IN ('authenticated', 'anon', 'authenticator')) OR public.is_admin();`. This allows non-admin writers to execute SECURITY DEFINER RPCs (such as `verify_order_payment` calling `reconcile_writer_unpaid_commission`) without trigger blocks, while strictly preventing direct PostgREST client mutation.
  - **search_path Lockdown**: Rewrites 9 SECURITY DEFINER functions (`admin_get_order`, `admin_list_orders`, `create_order`, `get_chapter_for_reader`, `get_checkout_options`, `get_public_novel_chapters`, `get_writer_unpaid_commission`, `reconcile_writer_unpaid_commission`, `reject_order_payment`) with `SET search_path = ''` and 100% schema qualifications (`pg_catalog.*`, `public.*`, `extensions.*`), eliminating insecure search paths.
  - **Privilege Revocation**: Explicitly revokes `EXECUTE` on all 5 trigger functions from `PUBLIC, anon, authenticated` and re-asserts workflow RPC permissions.
- **Action**: Paste contents of `supabase/migrations/0022_protection_triggers_and_search_path_lockdown.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Run `supabase/tests/00_post_migration_verification.sql` and `supabase/tests/12_runtime_smoke.sql`.

### 23. `supabase/migrations/0023_fix_sql_construct_qualification_regression.sql` [FIX SQL CONSTRUCT QUALIFICATION REGRESSION]
- **Purpose**: Resolves `plpgsql_check` parse errors introduced in migration 0022 where SQL grammar constructs and keywords were improperly qualified with `pg_catalog.`:
  - **Trigger Functions**: Restores unqualified `current_user` in all 5 protection trigger functions (`trg_protect_writer_profile_columns`, `trg_protect_profile_columns`, `trg_protect_novel_columns`, `trg_protect_chapter_deletion`, `trg_protect_notification_columns`), eliminating `missing FROM-clause entry for table "pg_catalog"`.
  - **SECURITY DEFINER Functions**: Replaces invalid `pg_catalog.coalesce()` with `coalesce()`, `pg_catalog.trim()` with `pg_catalog.btrim()`, and unqualified `greatest()` / `least()` across 8 RPC functions (`admin_get_order`, `admin_list_orders`, `create_order`, `get_checkout_options`, `get_writer_unpaid_commission`, `get_chapter_for_reader`, `get_public_novel_chapters`, `reject_order_payment`).
- **Action**: Paste contents of `supabase/migrations/0023_fix_sql_construct_qualification_regression.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Run `npm run check:sql` and execute `supabase/tests/00_post_migration_verification.sql`.

### 24. `supabase/migrations/0024_format_specifiers_and_privilege_lockdown.sql` [FORMAT SPECIFIERS, RPC LOCKDOWN & COLUMN GRANTS]
- **Purpose**: Canonicalizes format specifiers, locks down internal cross-writer financial RPCs, and enforces table-level safe column UPDATE grants:
  - **Format Specifier Enforcement**: Replaces printf-style specifiers (`%.2f`) with standard `%s` and explicit casts (`::numeric(12,2)::text`) across canonical financial functions (`verify_order_payment`, `admin_force_verify`, `confirm_commission_settlement`, `generate_commission_invoice`).
  - **Internal Cross-Writer RPC Lockdown**: Revokes `EXECUTE` on `reconcile_writer_unpaid_commission` and `get_writer_unpaid_commission` from role `authenticated` (callable strictly by internal SECURITY DEFINER owner routines).
  - **Column-Level UPDATE Grants**: Enforces two-layer defense by restricting direct client UPDATE privileges to safe columns on `profiles` (`full_name`, `username`, `avatar_url`), `writer_profiles` (`pen_name_urdu`, `pen_name_english`, `bio_urdu`, `bio_english`, `agreement_accepted_at`), and `novels` (`title_urdu`, `title_english`, `synopsis_urdu`, `description_urdu`, `cover_url`, `cover_public_id`, `price_pkr`, `language`, `rights_declaration_accepted`).
- **Action**: Paste contents of `supabase/migrations/0024_format_specifiers_and_privilege_lockdown.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Execute `supabase/tests/00_post_migration_verification.sql`, `supabase/tests/12_runtime_smoke.sql`, and `supabase/tests/13_client_attack_matrix.sql`.

### 25. `supabase/migrations/0025_commission_settlement_and_audit_hardening.sql` [COMMISSION SETTLEMENT, UPDATED_AT TRIGGER & NOVEL PRICE AUDIT HARDENING]
- **Purpose**: Fixes runtime and verification errors in commission settlement, adds schema consistency trigger, and locks down novel price mutations:
  - **`commission_invoices.updated_at` & Trigger**: Adds `updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()` to `public.commission_invoices` with `BEFORE UPDATE` trigger `trg_commission_invoices_set_updated_at`, aligning with repository entity table design.
  - **Canonical `confirm_commission_settlement`**: Re-creates RPC strictly referencing real columns across `commission_invoices`, `commission_payments`, and `commission_payment_reports`. Correctly records admin settlement, produces `partially_paid` when partly paid and `settled` when fully paid, creates `commission_payments` entry, reconciles writer balance, dispatches notification and audit log, and strictly rejects overpayment and double confirmation.
  - **Novel Price Mutation Lockdown**: Revokes direct client `UPDATE (price_pkr)` on `public.novels` from role `authenticated`. Enforces that all novel updates and price changes flow through the audited, authoritative `update_novel` RPC.
- **Action**: Paste contents of `supabase/migrations/0025_commission_settlement_and_audit_hardening.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Execute `supabase/tests/00_post_migration_verification.sql`, `supabase/tests/12_runtime_smoke.sql`, and `supabase/tests/13_client_attack_matrix.sql`.

### 26. `supabase/migrations/0026_revoke_trigger_privileges_and_default_acls.sql` [TRIGGER PRIVILEGES & DEFAULT ACL HARDENING]
- **Purpose**: Eliminates verification FAIL on Check 59 and makes trigger privilege lockdown durable across future migrations:
  - **Explicit Trigger Revocation**: Revokes `EXECUTE` on `public.trg_commission_invoices_updated_at()` from `PUBLIC`, `anon`, and `authenticated`.
  - **Durable Default Privileges**: Queries and reports `pg_default_acl` entries for functions, and revokes default `EXECUTE` on functions in schema public for role `postgres`, `supabase_admin`, and current session role.
  - **Dynamic Trigger Privilege Sweep**: Re-applies `REVOKE EXECUTE` across every trigger function in schema public (`pg_proc.prorettype = 'trigger'::regtype AND prokind = 'f'`) to protect all present and future triggers.
- **Action**: Paste contents of `supabase/migrations/0026_revoke_trigger_privileges_and_default_acls.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Execute `supabase/tests/00_post_migration_verification.sql` (Check 8 / Check 59 passes), `supabase/tests/12_runtime_smoke.sql` (17/17 PASS), and `supabase/tests/13_client_attack_matrix.sql`.

### 27. `supabase/migrations/0027_admin_novel_moderation_rls.sql` [ADMIN NOVEL MODERATION RLS HARDENING]
- **Purpose**: Fixes admin moderation access boundaries and re-asserts base table SELECT privileges:
  - **Standalone Admin SELECT Policies**: Explicitly adds dedicated `FOR SELECT` RLS policies using `public.is_admin()` on `public.novels` (`"Admins view all novels"`), `public.chapters` (`"Admins view all chapters"`), `public.writer_profiles` (`"Admins view all writer profiles"`), and `public.novel_genres` (`"Admins view all novel genres"`).
  - **Table Privilege Re-assertion**: Re-asserts explicit `GRANT SELECT` on all 6 moderation catalog tables (`novels`, `chapters`, `novel_genres`, `genres`, `writer_profiles`, `profiles`) to role `authenticated`.
  - **Preserves Isolation**: Confirms `anon` base table access remains strictly revoked; preserves reader/writer policies (readers can only read published novels/free previews/entitled chapters; non-owner authors cannot read other writers' drafts).
- **Action**: Paste contents of `supabase/migrations/0027_admin_novel_moderation_rls.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Execute automated test suite: `supabase/tests/14_admin_read_access.sql`.

### 28. `supabase/migrations/0028_admin_get_invoice_rpc.sql` [ADMIN GET INVOICE RPC]
- **Purpose**: Implements administrative invoice inspection RPC `public.admin_get_invoice(p_invoice_id uuid)`:
  - **Security Definer**: Enforces admin check via `public.is_admin()`, strictly rejecting non-administrators with `'Access denied: Administrator privileges required'`.
  - **Comprehensive Payload**: Returns structured `jsonb` containing `{ invoice, lines, payments, reports }` aggregating line items from `commission_invoice_lines` joined with `orders`, settlement payments from `commission_payments`, and writer payment claims from `commission_payment_reports`.
  - **search_path & Permissions**: Uses `SET search_path = ''` with 100% schema qualifications. Revokes execution from `PUBLIC` and `anon`; grants to `authenticated`.
- **Action**: Paste contents of `supabase/migrations/0028_admin_get_invoice_rpc.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Run:
  ```sql
  SELECT proname, prosecdef FROM pg_proc WHERE proname = 'admin_get_invoice';
  ```
  Confirm function exists with `prosecdef = true`.

### 29. `supabase/migrations/0029_sensitive_column_exposure_hardening.sql` [SENSITIVE COLUMN EXPOSURE HARDENING & SAFE DISPLAY RPCs]
- **Purpose**: Closes horizontal and vertical privacy exposure on `profiles` and `writer_profiles`, and provides safe display RPCs:
  - **Profiles RLS Lockdown**: Drops wide-open policy `"Public view basic profiles"` (`USING true`). Replaces with `"profiles_select_owner_or_admin"` (`USING (id = auth.uid() OR public.is_admin())`). Unrelated users directly querying other profiles return 0 rows.
  - **Writer Profiles RLS Lockdown**: Drops `"Public view approved writer profiles"`. Replaces with `"writer_profiles_select_owner_or_admin"` (`USING (id = auth.uid() OR public.is_admin())`). Unrelated users directly querying other authors return 0 rows, completely protecting commission rates, limits, and balances.
  - **Safe Display RPCs**:
    - `public.get_reader_display_names(p_reader_ids uuid[])`: `SECURITY DEFINER` RPC returning strictly `(id, full_name, username)`. Accessible to admins, self, or authors with orders from those readers. Never exposes email or role.
    - `public.get_writer_display_names(p_writer_ids uuid[])`: `SECURITY DEFINER` RPC returning strictly `(id, pen_name_urdu, pen_name_english, username)`. Never exposes financial rates, limits, or balances.
- **Action**: Paste contents of `supabase/migrations/0029_sensitive_column_exposure_hardening.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('get_reader_display_names', 'get_writer_display_names');
    ```
    Confirm both functions exist with `prosecdef = true`.
  - Execute automated test suite: `supabase/tests/17_sensitive_column_exposure.sql` (18/18 PASS).

### 30. `supabase/migrations/0030_platform_payment_methods_admin_policy.sql` [PLATFORM PAYMENT METHODS ADMIN RLS & GRANTS]
- **Purpose**: Grants platform administrators direct SELECT and mutation rights on marketplace payment accounts:
  - **Admin Policy**: Adds policy `"platform_payment_methods_admin_all"` on `public.platform_payment_methods` restricted to `public.is_admin()`.
  - **Grants**: Grants `SELECT, INSERT, UPDATE, DELETE` to `authenticated` role so admin RLS policies can evaluate. Regular readers and writers remain denied.
- **Action**: Paste contents of `supabase/migrations/0030_platform_payment_methods_admin_policy.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**: Run:
  ```sql
  SELECT policyname FROM pg_policies WHERE tablename = 'platform_payment_methods';
  ```
  Confirm `"platform_payment_methods_admin_all"` appears.

### 31. `supabase/migrations/0031_chapter_import_and_split_rpcs.sql` [WRITER-CONTROLLED CHAPTER IMPORT & SPLIT RPCs]
- **Purpose**: Implements atomic chapter import and split RPCs with sold-content protection, lossless text preservation, and unique constraint collision prevention:
  - **RPC `public.import_chapters(p_novel_id uuid, p_start_number integer, p_parts jsonb)`**:
    - Restricted to novel author (approved writer) or admin.
    - Validates parts (non-empty content, <= 120,000 chars, title length 1-200, at most 60 parts per call).
    - Prevents target chapter number collisions.
    - Inserts all parts as drafts (`is_published = false`) in a single transaction.
    - Auto-computes word count and updates novel chapter counts via existing triggers.
    - Writes audit log row.
  - **RPC `public.split_chapter(p_chapter_id uuid, p_parts jsonb)`**:
    - Restricted to novel author (approved writer) or admin.
    - Locks chapter row with `FOR UPDATE` (idempotent against double clicks).
    - Enforces sold-content invariant: If novel is published and has active purchase entitlements, only unpublished chapters or the last chapter may be split/replaced; middle chapters on sold novels are rejected.
    - Validates text preservation: normalizes whitespace in concatenated parts and original content to guarantee lossless preservation.
    - Safely shifts following chapter numbers via two-step temporary offset (+1,000,000) to prevent `(novel_id, chapter_number)` unique constraint collision.
    - Replaces original chapter with first part, creates subsequent parts, records snapshot in `chapter_revisions`, and writes audit log.
- **Action**: Paste contents of `supabase/migrations/0031_chapter_import_and_split_rpcs.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('import_chapters', 'split_chapter');
    ```
    Confirm both functions exist with `prosecdef = true`.
  - Execute automated test suite: `supabase/tests/18_chapter_split_tests.sql` (13/13 PASS).

### 32. `supabase/migrations/0032_seed_missing_featured_genres.sql` [SEED MISSING FEATURED GENRES]
- **Purpose**: Seeds the featured genres referenced in `siteConfig.featuredGenres` (`action-adventure`, `mystery-thriller`, `historical-epic`, `horror-supernatural`, `philosophical-literary`) into `public.genres` table with `is_active = true`.
- **Action**: Paste contents of `supabase/migrations/0032_seed_missing_featured_genres.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT slug, name_english, is_active FROM public.genres WHERE slug IN ('action-adventure', 'mystery-thriller', 'historical-epic', 'horror-supernatural', 'philosophical-literary');
    ```
    Confirm all 5 genres exist with `is_active = true`.

### 33. `supabase/migrations/0033_chapter_drafts.sql` [OFFLINE-TOLERANT AUTOSAVE & CHAPTER DRAFTS STORE]
- **Purpose**: Implements isolated chapter draft storage, sliding-window rate limiting, optimistic concurrency control, and draft lifecycle management:
  - **Table `public.chapter_drafts`**: Stores chapter autosaves isolated from `public.chapters` (`(id, writer_id, novel_id, chapter_id, client_key, title_urdu, content_urdu, chapter_number, base_chapter_updated_at, server_revision, device_label, created_at, updated_at)`).
  - **Table `public.chapter_draft_rate_limits`**: Sliding hourly sync rate limiter per writer (240 syncs/hr).
  - **RPCs**:
    - `upsert_chapter_draft`: Atomic draft upsert with optimistic concurrency check, length validation (<= 120,000 chars), per-writer limits (max 100 drafts), and hourly rate limiting.
    - `get_chapter_draft`: Fetches draft content and revision for calling writer.
    - `list_my_chapter_drafts`: Lightweight metadata listing for all drafts of caller.
    - `discard_chapter_draft`: Deletes draft and logs to audit log.
    - `resolve_chapter_draft_conflict`: Resolves version conflict (`keep_mine` / `keep_server`).
    - `purge_old_chapter_drafts`: Retention cleanup (default 30 days) restricted to admins and scheduled cron workers.
  - **Security & Privileges**: RLS enabled with direct table write/read grants strictly revoked from `anon` and `authenticated` (RPC-only).
- **Action**: Paste contents of `supabase/migrations/0033_chapter_drafts.sql` into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('upsert_chapter_draft', 'get_chapter_draft', 'list_my_chapter_drafts', 'discard_chapter_draft', 'resolve_chapter_draft_conflict', 'purge_old_chapter_drafts');
    ```
    Confirm all 6 functions exist with `prosecdef = true`.
  - Execute automated test suite: `supabase/tests/19_chapter_drafts_tests.sql` (15/15 PASS).

## Stage 2: Initial Platform Administrator Bootstrapping

Due to security hardening in `handle_new_user()`, signups can **never** self-assign the `admin` role. The first platform administrator must be bootstrapped manually via SQL:

1. Register an account through your application UI (or Supabase Auth Dashboard) using your administrative email (e.g., `admin@unbpremium.pk`).
2. Open **Supabase Dashboard -> SQL Editor** and execute:
   ```sql
   -- Bootstrap first platform administrator
   UPDATE public.profiles
   SET role = 'admin'
   WHERE email = 'admin@unbpremium.pk';
   ```
3. Verify administrator status:
   ```sql
   SELECT id, email, role, is_active FROM public.profiles WHERE email = 'admin@unbpremium.pk';
   ```

---

## Stage 3: Supabase Storage Buckets Configuration

Migration 0006 automatically provisions the storage buckets and RLS policies if the `storage` schema exists. To confirm or configure via the Supabase Dashboard:

1. **Private Bucket: `payment-proofs`**:
   - Navigate to **Storage -> Buckets**.
   - Confirm bucket `payment-proofs` exists and is marked **Private** (Public bucket = Disabled).
   - Maximum file size: **2 MB**.
   - Allowed MIME types: `image/webp, image/jpeg, image/png`.
   - File path convention: `{order_id}/{uuid}.webp` or `{invoice_id}/{uuid}.webp`.
   - Accessible only by the reader who owns the order, the novel's author, or platform admins via signed URLs.

2. **Public Bucket: `novel-assets`**:
   - Confirm bucket `novel-assets` exists and is marked **Public**.
   - Maximum file size: **5 MB**.
   - Allowed MIME types: `image/webp, image/jpeg, image/png`.
   - Used for book covers and author avatars.

---

## Stage 3.5: Supabase Auth & Security Configuration

Configure the authentication provider, redirect URLs, and security controls in **Supabase Dashboard -> Authentication**:

### 1. URL Configuration (**Authentication -> URL Configuration**)
- **Site URL**: `http://localhost:3000` (development) or `https://unbpremium.pk` (production).
- **Redirect URLs (Allow list)**: Add the following callback URLs:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/reset-password`
  - `https://unbpremium.pk/auth/callback`
  - `https://unbpremium.pk/reset-password`

### 2. Email Provider & Confirmation Settings (**Authentication -> Providers -> Email**)
- **Enable Email Provider**: `ON`.
- **Confirm Email**: Recommended `ON` in staging/production. (If testing locally without SMTP, you can toggle `OFF` temporarily or inspect confirmation links in Supabase Dashboard -> Inbucket / Auth Users).
- **Secure Email Change**: `ON`.

### 3. Custom SMTP Setup (**Authentication -> SMTP Settings**)
- The default Supabase shared SMTP provider has strict rate limits (approx. 3-4 emails/hour).
- For production email delivery (confirmation emails, password resets, dispute alerts), configure a dedicated SMTP provider (e.g., Resend, Brevo, SendGrid, or AWS SES):
  - Sender email: `noreply@unbpremium.pk`
  - Sender name: `UNB Premium (یو این بی پریمیم)`

### 4. Abuse Protection & Rate Limiting (TODO)
- **Built-in Rate Limits**: Supabase automatically rate-limits auth requests per IP address.
- **Client Double-Submit Prevention**: The application's auth forms (`/login`, `/register`, `/forgot-password`, `/reset-password`) automatically disable submit buttons with animated loaders upon first submission to prevent duplicate requests.
- **Bot Detection & Captcha [TODO]**:
  - In production, if credential stuffing or bot signups are detected, enable Cloudflare Turnstile under **Authentication -> Bot Protection**.
  - Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and backend token verification inside `registerUser` and `loginUser` server actions.

---

## Stage 4: Environment Variables Configuration (`.env.local`)

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Populate the required keys:
   - `NEXT_PUBLIC_SUPABASE_URL`: From **Supabase Dashboard -> Project Settings -> API -> Project URL**.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: From **Supabase Dashboard -> Project Settings -> API -> Project API Keys (anon/public)**.
   - `SUPABASE_SERVICE_ROLE_KEY`: Server-only administrative key. **Strictly used ONLY by the background cron worker (`src/lib/supabase/cron-client.ts`)** to claim pending outbox emails and record delivery results. Never bundled or exposed in browser JavaScript.
   - `NEXT_PUBLIC_APP_URL`: Application URL (defaults to `http://localhost:3000`).
   - `CRON_SECRET`: Secret 32+ character bearer token for constant-time authentication of scheduled cron endpoints (`/api/cron/send-emails` and `/api/cron/reminders`).
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`: SMTP server connection details for transactional outbox dispatch. (If omitted in local development, Nodemailer runs in safe dry-run mode without failing).
   - `EMAIL_FROM`: Default sender address (e.g., `UNB Premium <noreply@unbpremium.pk>`).

---

## Stage 5: Verification & Test Execution

Run the SQL test suites and automated Jest/Node test runners to validate security policies, business rules, and financial ledger integrity:
1. Review `docs/RLS_TEST_PLAN.md` for the comprehensive multi-tenant test matrix.
2. Execute all sequential SQL tests in the Supabase SQL Editor:
   - `supabase/tests/00_post_migration_verification.sql` (Canonical post-migration AST, privileges, and schema integrity check)
   - `supabase/tests/01_security_and_financial_hardening_tests.sql`
   - `supabase/tests/02_gap_fixes_tests.sql`
   - `supabase/tests/03_dispute_and_writer_status_tests.sql`
   - `supabase/tests/04_writer_content_tests.sql`
   - `supabase/tests/05_admin_controls_tests.sql`
   - `supabase/tests/06_public_catalog_tests.sql`
   - `supabase/tests/07_min_price_tests.sql`
   - `supabase/tests/08_checkout_tests.sql`
   - `supabase/tests/09_reader_access_tests.sql`
   - `supabase/tests/10_commission_tests.sql`
   - `supabase/tests/11_disputes_refunds_tests.sql` (Validates disputes, refund adjustments, support tickets, and outbox rules)
   - `supabase/tests/12_runtime_smoke.sql` (Comprehensive 15-step end-to-end transactional runtime smoke test)
   - `supabase/tests/13_client_attack_matrix.sql` (Exhaustive 46-vector client privilege escalation attack matrix)
   - `supabase/tests/14_admin_read_access.sql` (Admin moderation read access and reader/writer/anon isolation matrix)
   - `supabase/tests/15_rpc_signature_check.sql`
   - `supabase/tests/16_frontend_columns_check.sql`
   - `supabase/tests/17_sensitive_column_exposure.sql`
   - `supabase/tests/18_chapter_split_tests.sql` (Writer chapter import & split transactional security and integrity tests)
   - `supabase/tests/19_chapter_drafts_tests.sql` (Chapter drafts & autosave isolation, concurrency, rate limits, and security tests)
3. Run automated Node.js unit tests:
   ```bash
   npm test
   ```
4. Run full production build verification:
   ```bash
   npm run build
   ```
