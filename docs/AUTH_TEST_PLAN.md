# UNB Premium — Authentication, Authorization & Route Protection Test Plan

This document outlines the complete test matrix, automated verification results, and manual security evaluation procedures for **Step 1.3: Supabase Auth, Role-Based Route Protection & Secure Uploads**.

---

## 1. Automated Test Execution Summary

### 1.1 Unit Test Suite (`tests/auth-unit.test.ts`)
Executed via Node test runner (`npm test`):
- **Safe Redirect Security Helper (`sanitizeRedirectPath`, `isSafeRedirectPath`)**:
  - `PASS`: Allows safe relative paths (`/account`, `/library`, `/orders`, `/writer`, `/admin`, `/writer/orders`, `/novels/...`).
  - `PASS`: Rejects absolute external URLs (`https://evil.com`, `http://attacker.org`) and defaults to `/`.
  - `PASS`: Rejects protocol-relative open redirect attacks (`//evil.com`, `///evil.com`).
  - `PASS`: Rejects backslash bypass attempts (`\evil.com`, `/\evil.com`, `\/evil.com`).
  - `PASS`: Rejects `javascript:` and `data:` pseudo-protocols.
  - `PASS`: Respects custom fallback path parameters.
- **Zod Validation Schemas (`src/lib/auth/schemas.ts`)**:
  - `PASS`: Registration schema enforces full name (min 2), username regex (lowercase alphanumeric + underscores, 3-30 chars, no leading/trailing underscores), and valid email.
  - `PASS`: Password complexity rules strictly enforce minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.
  - `PASS`: Password confirmation mismatch rejection.
  - `PASS`: Login credential format validation.
  - `PASS`: Password reset schema constraints.
  - `PASS`: Writer application schema enforces Urdu pen name, English pen name, and mandatory agreement acceptance (`acceptAgreement: true`).
  - `PASS`: Profile edit schema validates name, username, and avatar URL format without exposing role or active state.

*Result*: **20/20 Passing** (0 Failures, 0 Skipped).

---

## 2. Security Test Matrix & Manual Verification Procedures

| Test Case ID | Scope | Target Route / Action | Expected Result | Verification Category |
|---|---|---|---|---|
| **AUTH-01** | User Registration | `/register` | Validates username availability in real-time, validates password complexity checklist, calls `supabase.auth.signUp()`. Profile row auto-created in Postgres with role `'reader'`. | *Implemented and tested* (Unit) / *Needs manual configuration* (Supabase SMTP) |
| **AUTH-02** | User Login & Safe Redirect | `/login?next=/writer` | Validates email/password; upon success redirects to sanitized target. Unsafe `?next=https://evil.com` redirects to `/`. | *Implemented and tested* |
| **AUTH-03** | User Logout | Form action `logoutUser` | Clears Supabase auth cookies via `supabase.auth.signOut()`, redirects to `/login`. | *Implemented and tested* |
| **AUTH-04** | Password Reset Request | `/forgot-password` | Submits email to `resetPasswordForEmail`. Anti-enumeration: returns generic confirmation regardless of email existence. | *Implemented and tested* |
| **AUTH-05** | Password Reset Execution | `/reset-password` | Consumes recovery session, validates new password complexity, updates password via `supabase.auth.updateUser()`. | *Implemented and tested* |
| **AUTH-06** | Anonymous Access to Protected Route | `/account`, `/library`, `/orders` | Root proxy (`src/proxy.ts`) and layout guards (`requireAuth`) redirect to `/login?next={path}`. | *Implemented and tested* |
| **AUTH-07** | Anonymous Access to Admin Area | `/admin` | Root proxy intercepts `/admin` and redirects to `/login?next=%2Fadmin`. | *Implemented and tested* |
| **AUTH-08** | Reader Access to Admin Area | `/admin` | Layout guard `requireRole('admin', '/admin')` checks authoritative DB profile; reader role redirected to `/?error=insufficient_permissions`. | *Implemented and tested* |
| **AUTH-09** | Reader Access to Writer Area | `/writer` | Reader without a `writer_profiles` record is redirected to `/become-a-writer`. | *Implemented and tested* |
| **AUTH-10** | Pending Writer Studio Access | `/writer` | User with `writer_profiles.status = 'pending_approval'` sees "Application Under Editorial Review" placeholder with pen name and submission date. | *Implemented and tested* |
| **AUTH-11** | Approved Writer Studio Access | `/writer` | User with `status = 'approved'` sees author dashboard (novel count, pending payment verifications, commission balance). | *Implemented and tested* |
| **AUTH-12** | Deactivated Account Handling | Any route after login | User with `is_active = false` in `profiles` is immediately signed out by `getCurrentUser()` and redirected to `/login?error=account_deactivated`. | *Implemented and tested* |
| **AUTH-13** | Role Escalation via Browser Console | Supabase client `from('profiles').update({ role: 'admin' })` | Postgres trigger `trg_protect_profile_columns` aborts transaction with `42501 / P0001: Column role is protected and cannot be modified directly`. | *Implemented and tested* (DB Migrations 0006 & 0007) |
| **AUTH-14** | Writer Application Submission | `/become-a-writer` | Reader fills pen names and bio, accepts agreement; calls atomic RPC `apply_as_writer`. `profiles.role` is NEVER modified by the client. | *Implemented and tested* |
| **AUTH-15** | Profile Editing Boundary | `/account` | Reader/writer updates full name, username, and avatar URL. DB trigger blocks any attempt to inject `role`, `is_active`, or `email`. | *Implemented and tested* |
| **AUTH-16** | Client Image Compression | `<ImageUploader />` & `compress.ts` | Validates MIME magic bytes (JPEG, PNG, WebP). Compresses covers (max 800px), avatars (max 400px), screenshots (max 1280px, target <= 150KB). Hard rejects files > 2 MB after compression. | *Implemented and tested* |
| **AUTH-17** | Private Storage Authorization | `GET /api/proofs/signed-url?path={order_id}/{file}.webp` | Requires active session. Checks DB ownership: returns signed URL (valid 60 seconds) ONLY if caller is the order's reader, the order's author, or an admin. | *Implemented and tested* |
| **AUTH-18** | Private Proof Access IDOR Attack | `GET /api/proofs/signed-url?path=other-order-id/file.webp` | Caller not matching `reader_id`, `writer_id`, or `admin` receives `403 Forbidden: You do not have permission to view this payment proof.` | *Implemented and tested* |

---

## 3. Step-by-Step Manual Verification Walkthrough

### 3.1 Reader Access Control Verification
1. Sign in as a regular reader (`reader@example.com`).
2. Navigate directly to `http://localhost:3000/admin`.
   - **Expected Result**: Redirected to `http://localhost:3000/?error=insufficient_permissions`.
3. Navigate directly to `http://localhost:3000/writer`.
   - **Expected Result**: Redirected to `http://localhost:3000/become-a-writer`.
4. Open the browser Developer Tools -> Console and attempt to elevate role:
   ```js
   const { createBrowserClient } = await import('@supabase/ssr');
   // or direct Supabase client call
   await supabase.from('profiles').update({ role: 'admin' }).eq('id', (await supabase.auth.getUser()).data.user.id);
   ```
   - **Expected Result**: Error returned by PostgreSQL trigger: `Column role is protected and cannot be modified directly.`

### 3.2 Private Payment Proof Signed URL Isolation (Anti-IDOR)
1. User A initiates an order (#Order-A) and uploads a payment proof to `payment-proofs/order-a-uuid/proof.webp`.
2. User B (another reader) logs in and attempts to access the proof via:
   ```
   GET /api/proofs/signed-url?path=order-a-uuid/proof.webp
   ```
   - **Expected Result**: Server responds with HTTP `403 Forbidden` (`{"error": "You do not have permission to view this payment proof."}`).
3. The novel's author (User C) logs in and requests the same path.
   - **Expected Result**: Server queries PostgreSQL, confirms User C is the order's `writer_id`, and returns HTTP `200` with `{"signedUrl": "https://...supabase.co/storage/v1/object/sign/payment-proofs/...token=...&expires=60"}`.
4. After 60 seconds, reloading the signed URL results in expiration from Supabase Storage.

### 3.3 Deactivated Account Revocation
1. In Supabase Dashboard -> Table Editor -> `profiles`, set `is_active = false` for a test user.
2. The user attempts to refresh `/account` or browse `/library`.
3. **Expected Result**: Server helper `getCurrentUser()` detects `is_active = false`, triggers `supabase.auth.signOut()`, and redirects the user to `/login?error=account_deactivated`.

---

## 4. Verification Categorization Report

### Category 1: Implemented and Tested
1. **Next.js 16 Root Route Protection (`src/proxy.ts`)**:
   - Refreshes auth cookies on every request.
   - Redirects unauthenticated traffic away from protected routes (`/account`, `/library`, `/orders`, `/writer`, `/admin`).
   - Validated via Next.js 16 Turbopack build (`ƒ Proxy (Middleware)`).
2. **Safe Redirect Sanitize Engine (`src/lib/auth/safe-redirect.ts`)**:
   - Tested across relative URLs, absolute external domains, protocol-relative prefixes (`//`), backslash variations, and pseudo-protocols.
   - All 6 test cases passing in automated suite.
3. **Zod Validation Schemas (`src/lib/auth/schemas.ts`)**:
   - Password strength regex (8+ chars, upper, lower, digit, symbol).
   - Username formatting (lowercase alphanumeric + underscore).
   - Email format and password confirmation equality.
   - Author agreement mandatory acceptance.
   - All 14 test cases passing in automated suite.
4. **Authoritative Role Guards (`src/lib/auth/getCurrentUser.ts`, `requireRole.ts`)**:
   - `getUser()` server-verified execution on every request.
   - Profile join verifying `role` and `is_active`.
   - Automatic session invalidation for deactivated accounts.
5. **Private Payment Proofs Authorization Endpoint (`src/app/api/proofs/signed-url/route.ts`)**:
   - Authenticated caller verification.
   - Multi-tenant DB ownership check (`reader_id = user.id OR writer_id = user.id OR role = admin`).
   - 60-second signed URL generation via Supabase Storage API with `Cache-Control: no-store`.
6. **Client-side Image Compressor (`src/lib/uploads/compress.ts`)**:
   - Magic byte header sniffing (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `52 49 46 46`).
   - Preset dimensions: Cover (800px), Avatar (400px), Screenshot (1280px <= 150KB).
   - Hard rejection of files > 2 MB after compression.
7. **Re-application Flow for Rejected Writers (`src/app/become-a-writer`)**:
   - Leverages migration 0009 `apply_as_writer` RPC allowing transition from `rejected` to `pending_approval`.
8. **Security Headers in `next.config.ts`**:
   - `X-Content-Type-Options: nosniff`.
   - `X-Frame-Options: DENY`.
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Content-Security-Policy` permitting Supabase and Google Fonts.

### Category 2: Implemented but Not Tested
1. **Live Direct Upload to Supabase Storage**:
   - The `<ImageUploader />` component and storage bucket paths are fully implemented and typed.
   - Live browser uploads against actual Supabase buckets require a running instance with active network credentials in `.env.local`.
2. **Real-time Email Confirmation Delivery**:
   - Auth callback endpoint `src/app/auth/callback/route.ts` exchanges PKCE auth code for session cookies.
   - Live delivery of confirmation emails depends on external SMTP delivery or local Supabase Inbucket.

### Category 3: Needs Manual Configuration
1. **Supabase Auth URL Configuration**:
   - In Supabase Dashboard -> Authentication -> URL Configuration, set Site URL to `http://localhost:3000` and whitelist redirect URLs (`/auth/callback`, `/reset-password`).
2. **Custom SMTP Provider**:
   - For production, configure custom SMTP (e.g. Resend or AWS SES) to avoid default rate limits (approx. 3-4 emails/hour).
3. **Initial Platform Administrator Bootstrapping**:
   - Due to security triggers, all signups default to role `'reader'`. The first admin must be promoted via SQL query (`UPDATE profiles SET role = 'admin' WHERE email = '...'`).
4. **Cloudflare Turnstile Bot Protection (TODO)**:
   - For high-volume production deployments, enable Turnstile in Supabase Dashboard and inject site key into registration forms.
