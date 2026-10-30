# Production Supabase Project Setup & Hardening Guide

This document provides a comprehensive runbook for initializing, migrating, and securing a fresh **Production Supabase Project** for UNB Premium (`premium.urdunovelbanks.com`).

---

## 1. Project Creation & Region Selection

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project** and select your production organization.
3. **Project Name**: `unb-premium-prod`
4. **Database Password**: Generate a high-entropy 32+ character random password. Store it securely in a password manager (1Password, Bitwarden, etc.).
5. **Region**:
   - Choose **South Asia (Mumbai - ap-south-1)** or **Southeast Asia (Singapore - ap-southeast-1)**.
   - *Rationale*: These regions provide the lowest ping latency (~30–50 ms) to readers and writers connecting from Pakistan on Jazz, Zong, Nayatel, and PTCL networks.
6. **Pricing Tier**:
   - Select the **Pro Plan ($25/mo)** for production to ensure daily automatic backups, point-in-time recovery (PITR), dedicated resources, and no auto-pausing after inactivity.

---

## 2. Migration Execution (Fresh Database Setup)

All schema changes, tables, views, RLS policies, triggers, and RPC functions in UNB Premium are idempotent, numbered SQL scripts in `supabase/migrations/`.

### Migration Sequence Order (0001 through 0038)
Execute each migration sequentially in the **Supabase SQL Editor**:

1. `0001_enums_and_core_tables.sql`
2. `0002_orders_and_financial_ledger.sql`
3. `0003_triggers_and_rpc_functions.sql`
4. `0004_rls_policies.sql`
5. `0005_seed_genres_and_settings.sql`
6. `0006_security_and_financial_hardening.sql`
7. `0007_gap_fixes_and_storage_hardening.sql`
8. `0008_revoke_default_grants.sql`
9. `0009_order_flow_fixes.sql`
10. `0010_dispute_and_writer_status_hardening.sql`
11. `0011_writer_content_hardening.sql`
12. `0012_admin_controls.sql`
13. `0013_public_catalog.sql`
14. `0014_min_novel_price.sql`
15. `0015_checkout_and_payment_submission.sql`
16. `0016_reader_and_admin_orders.sql`
17. **`0017_a_commission_enum_values.sql`** *(MUST execute and commit before `0017`)*
18. `0017_commission_and_statements.sql`
19. `0018_disputes_refunds_support.sql`
20. `0019_database_reconciliation_and_runtime_fixes.sql`
21. `0020_database_reconciliation_and_immutability_hardening.sql`
22. `0021_trigger_privilege_lockdown_and_search_path_fix.sql`
23. `0022_protection_triggers_and_search_path_lockdown.sql`
24. `0023_fix_sql_construct_qualification_regression.sql`
25. `0024_format_specifiers_and_privilege_lockdown.sql`
26. `0025_commission_settlement_and_audit_hardening.sql`
27. `0026_revoke_trigger_privileges_and_default_acls.sql`
28. `0027_admin_novel_moderation_rls.sql`
29. `0028_admin_get_invoice_rpc.sql`
30. `0029_sensitive_column_exposure_hardening.sql`
31. `0030_platform_payment_methods_admin_policy.sql`
32. `0031_chapter_import_and_split_rpcs.sql`
33. `0032_seed_missing_featured_genres.sql`
34. `0033_chapter_drafts.sql`
35. `0034_tips.sql`
36. `0035_rename_commission_to_platform_fee.sql`
37. `0036_site_palette_settings.sql`
38. `0037_fix_db_verification_issues.sql`
39. `0038_api_rate_limits.sql`

> [!CRITICAL]
> **PostgreSQL Error 55P04 (Enum Transaction Invariant)**:
> In PostgreSQL, a new enum value added via `ALTER TYPE ... ADD VALUE` cannot be referenced within the same transaction. For example, `0017_a_commission_enum_values.sql` introduces enum values that are subsequently used in `0017_commission_and_statements.sql`.
> **Never merge `0017_a` and `0017` into a single file or transaction**. In the Supabase SQL editor, run `0017_a`, ensure it succeeds, and only then run `0017`.

---

## 3. Pre-Go-Live Database Verification

Before opening the site to real users, execute the automated verification test suites in the Supabase SQL Editor:

1. **Schema Integrity Check**:
   Run `supabase/tests/00_post_migration_verification.sql`.
   - Verifies all 25+ tables exist.
   - Verifies RLS is enabled on 100% of tables.
   - Confirms sensitive tables have zero default table privileges granted to `anon` or `authenticated`.
2. **Business Flow Test Suites**:
   Run the test suites in `supabase/tests/`:
   - `01_auth_profile_tests.sql`
   - `02_writer_application_tests.sql`
   - `08_checkout_tests.sql`
   - `09_reader_access_tests.sql`
   - `11_disputes_refunds_tests.sql`
   - `20_tips_tests.sql`
   - `21_api_rate_limits_tests.sql`
   Verify that all assertions pass with `PASS`.

---

## 4. Supabase Authentication Configuration

Navigate to **Authentication > Configuration > URL Configuration** in the Supabase Dashboard:

* **Site URL**: `https://premium.urdunovelbanks.com`
* **Redirect URLs**:
  Add both of the following exact redirect URLs:
  - `https://premium.urdunovelbanks.com/auth/callback`
  - `https://premium.urdunovelbanks.com/reset-password`

### Email Provider Setup (Custom SMTP)
In **Authentication > Email Templates**:
1. Disable default Supabase email sending limits.
2. Configure your custom SMTP or HTTP email provider (Resend or Brevo) so verification emails, magic links, and password resets arrive instantly from `auth@premium.urdunovelbanks.com`.
3. Set **Confirm email** to `Enabled` if you require email verification before account activation.

---

## 5. Storage Buckets & Policies

In Supabase Dashboard, navigate to **Storage**:

| Bucket Name | Public? | File Size Limit | Allowed MIME Types | Access Rules |
| :--- | :---: | :---: | :---: | :--- |
| `novel-covers` | **Yes** | 2 MB | `image/jpeg`, `image/png`, `image/webp` | Public read. Authenticated writers can upload/update only their own novel covers. |
| `chapter-content` | **No** | 5 MB | `application/json`, `text/plain` | Private. Strictly accessed via `SECURITY DEFINER` RPCs (`get_chapter_for_reader`). |
| `payment-proofs` | **No** | 1 MB | `image/jpeg`, `image/png`, `image/webp` | Private. Purchasing reader uploads proof; author and admins read via signed URLs. |
| `avatars` | **Yes** | 1 MB | `image/jpeg`, `image/png`, `image/webp` | Public read. Authenticated user can manage their own avatar. |

---

## 6. First Admin Account Bootstrap

To promote the first user to the `admin` role:

1. Go to `https://premium.urdunovelbanks.com/register` and create an account with your desired admin email (e.g. `admin@urdunovelbanks.com`).
2. Open the **Supabase SQL Editor** and execute:
   ```sql
   UPDATE public.profiles
   SET role = 'admin',
       is_active = true
   WHERE email = 'admin@urdunovelbanks.com';
   ```
3. Log out and log back in. Navigate to `https://premium.urdunovelbanks.com/admin` to access the Master Admin Dashboard.

---

## 7. Secrets Hygiene & Key Rotation Runbook

> [!CAUTION]
> If any Supabase key or database password was ever pasted into a chat, commit message, or unencrypted local file, it must be rotated immediately before production launch.

### Key Rotation Steps
1. In Supabase Dashboard, navigate to **Project Settings > API**.
2. If the `service_role` key was ever exposed:
   - Click **Generate a new secret key**.
   - Immediately update `SUPABASE_SERVICE_ROLE_KEY` in Cloudflare Workers runtime secrets (`npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`) and in GitHub Actions secrets.
3. If the database password was ever exposed:
   - Navigate to **Project Settings > Database > Database Password > Reset Database Password**.
4. Confirm `.env.local` is never committed to git (`git status` and `gitleaks` pre-commit checks).

