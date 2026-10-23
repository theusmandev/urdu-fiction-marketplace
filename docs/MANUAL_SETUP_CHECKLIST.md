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

### 17. `supabase/migrations/0017_commission_and_statements.sql` [SALES LEDGER, COMMISSION INVOICES, SETTLEMENT & STATEMENTS]
- **Purpose**: Implements Step 5.1 sales ledger audit fixes, lines-based commission invoicing, admin settlement confirmation, and auditable financial statements:
  - Enum `commission_invoice_status`: Adds `'partially_paid'` and `'void'` values.
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
- **Action**: Paste contents into the Supabase SQL Editor and click **Run**.
- **Verification**:
  - Run:
    ```sql
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('commission_invoice_lines', 'platform_payment_methods', 'commission_payment_reports');
    SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('preview_commission_invoice', 'generate_commission_invoice', 'confirm_commission_settlement', 'report_commission_payment', 'record_commission_adjustment', 'apply_overdue_rules');
    ```
    Confirm all 3 tables and RPCs exist.
  - Execute automated test suite: `supabase/tests/10_commission_tests.sql`.

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
   - `SUPABASE_SERVICE_ROLE_KEY`: Reserved for future offline maintenance; strictly NOT used in Step 1.3 application code.
   - `NEXT_PUBLIC_APP_URL`: Defaults to `http://localhost:3000`.
   - Note: Cloudinary environment variables are **prohibited** in Step 1.3. Supabase Storage is the authoritative storage engine.

---

## Stage 5: Verification & Test Execution

Run the SQL test suite in `supabase/tests/` to validate all security policies and financial ledger mechanics:
1. Review `docs/RLS_TEST_PLAN.md` for the test matrix covering Reader, Writer A, Writer B, and Admin.
2. Execute `supabase/tests/01_security_and_financial_hardening_tests.sql` in the Supabase SQL Editor.
3. Confirm that all test assertions return `SUCCESS` or expected exception triggers.
4. Run `npm run build` locally to verify 100% TypeScript type compilation.
