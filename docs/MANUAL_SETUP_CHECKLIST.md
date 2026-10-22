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

---

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
