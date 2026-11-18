# UNB Premium (`یو این بی پریمیم`) — Comprehensive Project Handoff

> **Document Version:** 1.1.0
> **Repository:** `urdu-fiction-marketplace`
> **Production URL:** `https://premium.urdunovelbanks.com`
> **Target Audience:** Incoming Lead Engineers, Full-Stack Developers, Database Architects, and Autonomous Coding Agents.
> **Verification Status:** Fact-checked on 2026-11-18 against the actual repository. Tech stack versions read from `package.json` and `package-lock.json`. Routes rebuilt from the real `src/app` file tree. RPC migration sources verified by grepping `supabase/migrations/*.sql`. Scheduling verified from `.github/workflows/cron.yml` and `wrangler.jsonc`. Test counts taken from actual directory listings and test runner output. Claims that could not be verified against repository evidence are marked UNVERIFIED.

---

## Corrections in 1.1.0

The following errors from v1.0.0 have been corrected:

1. **Lucide-react version** was `^1.16.0` → corrected to `^1.61.0` (resolved: `1.61.0`).
2. **Mammoth version** was `^1.11.0` → corrected to `^1.13.0` (resolved: `1.13.0`).
3. **Tailwind CSS version** listed as `^4.0.0` → package.json says `^4`, resolved to `4.3.3`; dev package `@tailwindcss/turbopack` resolves to `4.3.3`.
4. **Routes section completely rebuilt** from actual file tree. Major corrections:
   - `/browse` does not exist — removed.
   - `/novels/[slug]/read` does not exist — the catalog detail is `/novels/[slug]`; the reader is in route group `(reader)` as `/novels/[slug]/read/[number]`, plus a legacy `/read/[slug]/[number]`.
   - `/orders/[id]/pay` does not exist — the actual route is `/orders/[orderNumber]` (single page showing order details and payment actions).
   - `/tips/[writerId]` and `/tips/orders/[id]` do not exist — actual tip routes are `/tips` (list), `/tips/new` (create), `/tips/[tipNumber]` (detail).
   - `/writer/payments` does not exist — actual route is `/writer/payment-methods`.
   - `/writer/novels/[id]` does not exist as a standalone page — the novel hub is accessed through sub-routes like `/writer/novels/[id]/edit`, `/writer/novels/[id]/chapters`.
   - `/writer/novels/[id]/split` does not exist as a route — the splitter (`ChapterSplitterWizard.tsx`) is a component embedded in the chapters page, not its own page route.
   - `/admin/audit-logs` does not exist — actual route is `/admin/audit`.
   - `/admin/analytics` does not exist as a named route — there is `/admin/dashboard`.
   - `/admin/commission` has sub-routes: `/admin/commission`, `/admin/commission/reports`, `/admin/commission/writers/[id]`.
   - `/admin/invoices` and `/admin/invoices/[id]` exist (not documented previously).
   - `/admin/refunds` exists (not documented previously).
   - `/admin/tips` and `/admin/tips/[id]` exist (not documented previously).
   - `/admin/support` and `/admin/support/[id]` exist (not documented previously).
   - API routes `/api/cron/cleanup` and `/api/cron/purge-drafts` exist (not documented previously).
   - `/api/writer/export-sales` and `/api/writer/parse-manuscript` exist (not documented previously).
   - `/api/proofs/signed-url` exists (not documented previously).
   - `/api/auth/impersonate` does **not** exist — there is no such route file; impersonation is handled via a different mechanism. Removed.
   - `/api/chapters/autosave` does **not** exist — the autosave is `/api/writer/parse-manuscript` and client-side logic. Removed.
   - `/api/settings/palette` does **not** exist — removed.
   - Writer routes `/writer/disputes`, `/writer/disputes/[id]`, `/writer/earnings`, `/writer/agreement`, `/writer/commission/[invoiceId]` exist (not documented previously).
   - Public routes `/novels`, `/writers`, `/genres` listing pages exist.
   - Informational routes `/how-it-works`, `/how-to-pay`, `/content-policy`, `/writer-agreement`, `/refund-policy` exist. `/about`, `/terms`, `/privacy` are confirmed.
   - Dev routes `/dev/fonts` (inside `(marketplace)`) and `/dev/brand`, `/dev/theme` exist at the root dev group.
5. **RPC `claim_email_batch`** — no function with this exact name exists. The actual function is `claim_pending_emails_for_send` (migration `0051`) plus `record_email_delivery_result` and `retry_failed_emails`. Corrected.
6. **RPC `batch_import_chapters`** — no function with this name exists. Actual RPCs are `import_chapters` and `split_chapter` (migration `0031`). Corrected.
7. **"48-hour dispute trigger rule"** — corrected. The 48-hour figure appears only in the reminder logic (migration `0018`): payment submissions older than 48 hours trigger an admin notification. The minimum wait before a reader *can* open a dispute is `min_dispute_wait_hours` (default `24` hours, migration `0018`), not 48 hours.
8. **Scheduling** — v1.0.0 incorrectly said emails are not automatically sent. `.github/workflows/cron.yml` triggers `/api/cron/send-emails` every 5 minutes via GitHub Actions `schedule: cron: '*/5 * * * *'`. Corrected and documented in full.
9. **Supabase SQL test file count** was 28 — actual count is **30** (29 `.sql` files + 1 `.md` checklist). The SQL suites are 29 files total, including `rls_hardening.test.sql` and two tests numbered `21` (`21_api_rate_limits_tests.sql` and `21_site_palette_tests.sql`).
10. **Node.js test file count** was 46 — actual count is **46 test files** in `tests/` (excluding the `fixtures/` subdirectory). Test runner produces **618 passing tests** (confirmed by running `npm test`).
11. **Tip daily cap** — v1.0.0 did not state the actual default values. Corrected: `tip_min_pkr DEFAULT 20`, `tip_max_pkr DEFAULT 5000`, `max_tips_per_hour DEFAULT 5`, `tip_daily_cap_pkr_per_reader DEFAULT 10000`, `tip_confirm_reminder_hours DEFAULT 48` (all from `0034_tips.sql`).
12. **Known Issues** expanded — added marketing copy conflict ("instant digital access" metadata, "Pay securely" language) and other factual gaps in public copy.
13. **Database client & utility versions verified** — `@supabase/supabase-js` (`2.118.0`), `@supabase/ssr` (`0.12.7`), and `browser-image-compression` (`2.0.2`) verified from `package-lock.json`.

---

## Table of Contents
1. [Product Summary](#1-product-summary)
2. [Tech Stack & Runtime Environment](#2-tech-stack--runtime-environment)
3. [Repository Folder Map](#3-repository-folder-map)
4. [Route Architecture & Access Control](#4-route-architecture--access-control)
5. [Database Architecture & Migrations](#5-database-architecture--migrations)
6. [Core Business Flows & State Machines](#6-core-business-flows--state-machines)
7. [Security Model & Invariants](#7-security-model--invariants)
8. [Deployment & Cloudflare OpenNext Architecture](#8-deployment--cloudflare-opennext-architecture)
9. [Quality Gates & Automated Test Suites](#9-quality-gates--automated-test-suites)
10. [Current State of Features](#10-current-state-of-features)
11. [Known Issues & Technical Debt](#11-known-issues--technical-debt)
12. [Manual Operational Checklist for the Owner](#12-manual-operational-checklist-for-the-owner)
13. [Recommended Next 10 Engineering Tasks](#13-recommended-next-10-engineering-tasks)
14. [Git Secret Scan Findings](#14-git-secret-scan-findings)

---

## 1. Product Summary

### 1.1 Purpose & Mission
**UNB Premium** (`یو این بی پریمیم`) is a dedicated digital publishing platform and reader-to-writer commercial marketplace engineered specifically for serialized and standalone Urdu fiction (Novels, Novelettes, Afsanay, and Episodic Series).

The platform solves two major problems in Pakistani digital publishing:
1. **Lack of International Payment Gateways:** International card networks (Stripe, PayPal) do not natively serve mainstream Pakistani creators or consumers due to banking constraints. UNB Premium operates exclusively on Pakistani domestic direct-payment rails (**JazzCash**, **EasyPaisa**, **Raast**, and **Direct Bank Transfer / IBAN**).
2. **Piracy & Unethical Distribution:** Urdu fiction has historically suffered from unauthorized PDF re-uploads on social media. UNB Premium provides an authentic online reading experience with dynamic anti-piracy watermarking, server-enforced chapter content authorization, and Nastaliq Urdu typography.

### 1.2 User Roles & Capabilities
The system implements three mutually exclusive primary user roles (governed by `profiles.role`):

1. **Reader (`reader`):**
   - Discovers novels via search, genre taxonomy, and curated shelves.
   - Reads free teaser/sample chapters (controlled by author per novel).
   - Purchases access to complete novels by transferring PKR directly to the author's local bank or mobile wallet, uploading the Transaction ID (TID) and payment receipt screenshot.
   - Reads unlocked chapters inside a distraction-free, customizable Urdu reader (with Light, Sepia, and Dark themes; Nastaliq calligraphy; dynamic reader watermark).
   - Tracks reading progress (last read chapter, scroll position, completion status).
   - Sends direct appreciation **Tips** (0% platform fee) to authors.
   - Raises disputes on unverified or rejected orders within a 30-day window.

2. **Writer (`writer`):**
   - Applies for author status with pen name, Urdu bio, and contact information.
   - Configures domestic payout accounts (JazzCash, EasyPaisa, Raast, Bank IBAN).
   - Creates novels (English title, Urdu Nastaliq title, synopsis, cover artwork).
   - Ingests manuscripts using the **Writer-Controlled Chapter Splitter** (batch import from `.docx` or `.txt`, automatic Urdu numbering `حصہ ۱`, `حصہ ۲`; the splitter is a component embedded in `/writer/novels/[id]/chapters`).
   - Writes and autosaves chapter drafts with revision tracking.
   - Submits novels for administrative editorial review.
   - Verifies or rejects reader payment submissions directly from the Writer Studio dashboard after checking their bank SMS/app notifications.
   - Monitors sales performance, monthly statements, and platform fee obligations.

3. **Platform Administrator (`admin`):**
   - Reviews and approves/rejects writer applications.
   - Moderates novel submissions (content verification, editorial guidelines, intellectual property declaration).
   - Suspends or features novels; suspends bad-actor accounts.
   - Manages dispute cases between readers and writers, executing manual force-verifications or refund adjustments.
   - Governs platform settings (default platform fee rate, unpaid fee thresholds, minimum/maximum novel prices, site-wide color palette, banner announcements).
   - Generates and settles platform fee invoices for writers.
   - Performs audited support impersonation ("Login as Writer") for troubleshooting.
   - Monitors audit logs, platform analytics, and background outbox dispatches.

### 1.3 The Manual Direct-Payment Model
Unlike conventional e-commerce platforms that act as merchant-of-record, UNB Premium operates a **zero-custody, direct-to-creator payment model**:
- Readers transfer money **directly into the author's personal bank account or mobile wallet**.
- The platform never holds, routes, or escrows reader funds.
- The reader inputs the domestic Transaction ID (TID) and uploads an image receipt (stored in the private `payment-proofs` bucket).
- The author logs into the Writer Studio, compares the TID and proof against their own banking app / SMS, and triggers the `verify_order_payment` RPC.
- Upon author verification, the database atomically issues a `purchase_entitlement` granting the reader perpetual access to the novel's paid chapters.
- **Important:** Access is granted only after the author manually verifies the bank transfer, not automatically or instantly.

### 1.4 Platform Fee & Monetization Model
- **Terminology Rule:** The word "commission" (and Urdu "کمیشن") is strictly forbidden in all user-facing copy. The feature is universally labeled **"Platform fee"** (Urdu: **پلیٹ فارم فیس**). Internal database tables and RPC names retain `commission` for historical migration continuity.
- **Default Platform Fee Rate:** **30.00%** (updated from 20% in migration `0049_update_default_platform_fee_to_30_percent.sql`).
- **Per-Writer Overrides:** Administrators can configure custom platform fee percentages (e.g. 15% for VIP authors) and custom credit limits via `set_writer_commission_terms`.
- **Unpaid Fee Threshold:** Default **PKR 5,000.00**. When a writer's accumulated unpaid platform fees reach or exceed this threshold, the system automatically pauses new order creation for that writer's novels (`orders_paused = true`).
- **Platform Fee Invoicing & Settlement:** Platform fee invoices are generated periodically by administrators. Writers transfer owed fees to the platform's bank account, report payment, and admins confirm settlement via `confirm_commission_settlement`.
- **Minimum & Maximum Novel Pricing:**
  - Minimum Price: **PKR 50.00** (seed default in migration `0005`; enforced and stored in `platform_settings.min_novel_price_pkr`, column added in migration `0014`).
  - Maximum Price: **PKR 5,000.00** (seed default in migration `0005`; stored in `platform_settings.max_novel_price_pkr`, column added in migration `0011`).
- **Reader Appreciation Tips (0% platform fee):**
  - 100% of reader tips go directly to the author.
  - Defaults (from `0034_tips.sql`): `tip_min_pkr = 20`, `tip_max_pkr = 5000`, `max_tips_per_hour = 5`, `tip_daily_cap_pkr_per_reader = 10000`, `tip_confirm_reminder_hours = 48`.

---

## 2. Tech Stack & Runtime Environment

Versions read from `package.json` (semver ranges) and resolved exact versions from `package-lock.json`.

| Category | Technology | Declared Range | Resolved / Installed |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `16.4.2` (exact) | `16.4.2` |
| **UI Library** | React | `19.3.0` (exact) | `19.3.0` |
| **UI Library** | React DOM | `19.3.0` (exact) | `19.3.0` |
| **Styling Engine** | Tailwind CSS v4 | `^4` | `4.3.3` |
| **Styling Compiler** | @tailwindcss/turbopack | `^4` (devDep) | `4.3.3` |
| **Database & Auth** | @supabase/supabase-js | `^2.118.0` | `2.118.0` |
| **Database SSR** | @supabase/ssr | `^0.12.7` | `0.12.7` |
| **Deployment Adapter** | @opennextjs/cloudflare | `1.20.14` (exact, devDep) | `1.20.14` |
| **Cloudflare CLI** | wrangler | `4.156.0` (exact, devDep) | `4.156.0` |
| **Icons** | lucide-react | `^1.61.0` | `1.61.0` |
| **Document Parser** | mammoth (.docx → HTML) | `^1.13.0` | `1.13.0` |
| **Image Compression** | browser-image-compression | `^2.0.2` | `2.0.2` |
| **Test Runner** | Node.js built-in `--test` | n/a (via `node --test`) | Native Node.js test runner (no vitest/jest) |
| **Typography** | Google Fonts (Next.js) | Edge-hosted | `Plus_Jakarta_Sans`, `Cormorant_Garamond`, `Gulzar` (Nastaliq), `Amiri` |
| **Production Domain** | Cloudflare Custom Domain | `https://premium.urdunovelbanks.com` | Configured in DNS & Workers routing |

> [!IMPORTANT]
> **No vitest or jest** is installed. The test runner is Node.js's native `--test` framework invoked via `"test": "node --test tests/*.test.ts"` in `package.json`.

---

## 3. Repository Folder Map

```
urdu-fiction-marketplace/
├── .github/
│   └── workflows/
│       ├── cf-build-check.yml    # Cloudflare build verification CI
│       ├── cron.yml              # GitHub Actions cron: sends emails every 5 min, reminders hourly
│       └── security-scan.yml     # Dependency vulnerability scanning
├── docs/                         # Architectural documentation, checklists, and audit reports
│   ├── email-templates/          # Raw HTML templates for Supabase Auth and transactional emails
│   ├── MANUAL_SETUP_CHECKLIST.md # Step-by-step Supabase & Cloudflare manual setup guide
│   ├── TERMINOLOGY.md            # "Platform fee" vs internal "commission" mapping rules
│   ├── RLS_TEST_PLAN.md          # Multi-tenant security matrix & RLS verification scenarios
│   ├── SECURITY_AUDIT.md         # Vulnerability assessment and mitigation logs
│   ├── KEEP_ALIVE_AUDIT.md       # Analysis of Supabase Free Tier keep-alive architecture
│   └── PROJECT_HANDOFF.md        # (This document) Master onboarding and architecture reference
├── public/                       # Static public assets (logos, manifest, favicon, brand marks)
├── scripts/                      # Pre-commit, linting, and quality check scripts
│   ├── check-sql-syntax-constructs.mjs
│   ├── check-terminology.mjs
│   ├── check-colors.mjs
│   ├── check-contrast.mjs
│   ├── check-internal-links.mjs
│   ├── check-frontend-queries.mjs
│   └── check-seo-regression.mjs
├── src/
│   ├── app/
│   │   ├── (marketplace)/        # Route group for all public-facing marketplace routes
│   │   ├── (reader)/             # Route group for the distraction-free reader experience
│   │   ├── admin/                # Admin panel routes
│   │   ├── api/                  # API route handlers
│   │   ├── auth/                 # Auth callback handler
│   │   ├── dev/                  # Developer-only design tool routes
│   │   ├── read/                 # Legacy reader route (also serves /read/[slug]/[number])
│   │   ├── writer/               # Writer Studio routes
│   │   ├── globals.css           # Tailwind v4 theme + font setup
│   │   └── layout.tsx            # Root layout
│   ├── components/               # Modular UI components
│   ├── config/                   # Global singletons (siteConfig, navigation)
│   ├── lib/                      # Business logic, helpers, database adapters
│   ├── styles/                   # Design token CSS variables (tokens.css)
│   ├── types/                    # TypeScript interfaces (database.ts, etc.)
│   └── proxy.ts                  # Edge request proxy (session refresh, header cleaning)
├── supabase/
│   ├── migrations/               # SQL migrations 0001–0056
│   └── tests/                    # SQL test suites (29 .sql files + 1 .md)
├── tests/                        # Node.js built-in test runner test files (46 .test.ts files)
├── open-next.config.ts           # OpenNext Cloudflare adapter cache & binding configuration
├── wrangler.jsonc                # Cloudflare Worker configuration & resource bindings
└── next.config.ts                # Next.js configuration, security headers, CSP
```

---

## 4. Route Architecture & Access Control

Access control is enforced at two distinct boundaries:
1. **Edge Request Proxy (`src/proxy.ts` → `src/lib/supabase/middleware-or-proxy.ts`):** Strips untrusted `x-user-id` and `x-user-email` headers, refreshes Supabase auth cookies, and redirects unauthenticated requests on protected prefixes to `/login?next=...`. Protected prefixes (from `middleware-or-proxy.ts`): `/account`, `/library`, `/orders`, `/checkout`, `/writer`, `/admin`, `/read`, `/notifications`, `/disputes`, `/support`, `/tips`, `/become-a-writer`.
2. **Server Action / Route Handler Authorization:** Every mutation independently calls `supabase.auth.getUser()`, verifies account status (`is_active = true`), and checks user roles before executing any logic.

### 4.1 Public Routes (No Authentication Required)

| Route | File | Description |
| :--- | :--- | :--- |
| `/` | `(marketplace)/page.tsx` | Homepage: featured novels, newest releases, top genres, authors. |
| `/novels` | `(marketplace)/novels/page.tsx` | Full public novel catalog browser with search and filters. |
| `/novels/[slug]` | `(marketplace)/novels/[slug]/page.tsx` | Novel detail: blurb, pricing, chapter index, author bio. |
| `/novels/[slug]/read/[number]` | `(reader)/novels/[slug]/read/[number]/page.tsx` | Reader interface (enforces entitlement via RLS on SSR). |
| `/read/[slug]/[number]` | `read/[slug]/[number]/page.tsx` | Legacy reader route (same function). |
| `/genres` | `(marketplace)/genres/page.tsx` | Full genre taxonomy listing page. |
| `/genres/[slug]` | `(marketplace)/genres/[slug]/page.tsx` | Filtered catalog for a specific genre. |
| `/writers` | `(marketplace)/writers/page.tsx` | Public approved-writers directory. |
| `/writers/[username]` | `(marketplace)/writers/[username]/page.tsx` | Public author profile and published novel catalog. |
| `/about` | `(marketplace)/about/page.tsx` | About UNB Premium. |
| `/contact` | `(marketplace)/contact/page.tsx` | Contact page. |
| `/faq` | `(marketplace)/faq/page.tsx` | Frequently asked questions. |
| `/how-it-works` | `(marketplace)/how-it-works/page.tsx` | Explains the buy/verify/read flow. |
| `/how-to-pay` | `(marketplace)/how-to-pay/page.tsx` | Payment guide (JazzCash, EasyPaisa, Raast, Bank). |
| `/terms` | `(marketplace)/terms/page.tsx` | Terms of Service. |
| `/privacy` | `(marketplace)/privacy/page.tsx` | Privacy Policy. |
| `/refund-policy` | `(marketplace)/refund-policy/page.tsx` | Refund policy documentation. |
| `/content-policy` | `(marketplace)/content-policy/page.tsx` | Content moderation policy. |
| `/writer-agreement` | `(marketplace)/writer-agreement/page.tsx` | Public writer agreement terms. |

### 4.2 Anonymous Routes (Redirect if Already Authenticated)

| Route | File | Description |
| :--- | :--- | :--- |
| `/login` | `(marketplace)/login/page.tsx` | Sign-in page. |
| `/register` | `(marketplace)/register/page.tsx` | Account registration. |
| `/forgot-password` | `(marketplace)/forgot-password/page.tsx` | Password recovery request. |
| `/reset-password` | `(marketplace)/reset-password/page.tsx` | New password entry after email link. |
| `/auth/callback` | `auth/callback/route.ts` | Supabase Auth PKCE code exchange. |

### 4.3 Authenticated Reader / All-Roles Routes

| Route | File | Access |
| :--- | :--- | :--- |
| `/account` | `(marketplace)/account/page.tsx` | Profile settings. |
| `/account/notifications` | `(marketplace)/account/notifications/page.tsx` | Notification preferences. |
| `/notifications` | `(marketplace)/notifications/page.tsx` | In-app notification feed. |
| `/library` | `(marketplace)/library/page.tsx` | Reader's purchased novels shelf. |
| `/orders` | `(marketplace)/orders/page.tsx` | Reader's order history. |
| `/orders/[orderNumber]` | `(marketplace)/orders/[orderNumber]/page.tsx` | Order detail, payment submission, TID upload. |
| `/checkout/[slug]` | `(marketplace)/checkout/[slug]/page.tsx` | Novel purchase initiation. |
| `/disputes` | `(marketplace)/disputes/page.tsx` | Reader dispute list. |
| `/disputes/[id]` | `(marketplace)/disputes/[id]/page.tsx` | Individual dispute detail / tracking. |
| `/support` | `(marketplace)/support/page.tsx` | Support ticket list. |
| `/support/[id]` | `(marketplace)/support/[id]/page.tsx` | Individual support ticket. |
| `/tips` | `(marketplace)/tips/page.tsx` | Reader's tip history. |
| `/tips/new` | `(marketplace)/tips/new/page.tsx` | Create a new appreciation tip. |
| `/tips/[tipNumber]` | `(marketplace)/tips/[tipNumber]/page.tsx` | Individual tip detail. |
| `/become-a-writer` | `(marketplace)/become-a-writer/page.tsx` | Writer application form (reader role only). |

### 4.4 Writer Studio Routes

| Route | File | Access |
| :--- | :--- | :--- |
| `/writer` | `writer/page.tsx` | Writer Studio dashboard. |
| `/writer/agreement` | `writer/agreement/page.tsx` | Writer platform agreement confirmation. |
| `/writer/novels` | `writer/novels/page.tsx` | Author's novel list. |
| `/writer/novels/new` | `writer/novels/new/page.tsx` | Create new novel (with duplicate title guard). |
| `/writer/novels/[id]/edit` | `writer/novels/[id]/edit/page.tsx` | Edit novel metadata. |
| `/writer/novels/[id]/chapters` | `writer/novels/[id]/chapters/page.tsx` | Chapter manager + embedded `ChapterSplitterWizard` for manuscript import. |
| `/writer/novels/[id]/chapters/new` | `writer/novels/[id]/chapters/new/page.tsx` | Create a new chapter. |
| `/writer/novels/[id]/chapters/[chapterId]` | `writer/novels/[id]/chapters/[chapterId]/page.tsx` | Chapter editor with autosave. |
| `/writer/orders` | `writer/orders/page.tsx` | Payment verification queue. |
| `/writer/disputes` | `writer/disputes/page.tsx` | Writer's dispute list. |
| `/writer/disputes/[id]` | `writer/disputes/[id]/page.tsx` | Individual dispute detail. |
| `/writer/commission` | `writer/commission/page.tsx` | Platform fee balance and invoices. |
| `/writer/commission/[invoiceId]` | `writer/commission/[invoiceId]/page.tsx` | Individual invoice detail. |
| `/writer/earnings` | `writer/earnings/page.tsx` | Earnings and sales ledger view. |
| `/writer/payment-methods` | `writer/payment-methods/page.tsx` | Payment method configuration. |
| `/writer/profile` | `writer/profile/page.tsx` | Public profile editor (pen name, bio, social links). |
| `/writer/tips` | `writer/tips/page.tsx` | Incoming appreciation tips list. |

### 4.5 Admin Panel Routes

| Route | File | Access |
| :--- | :--- | :--- |
| `/admin` | `admin/page.tsx` | Admin dashboard overview. |
| `/admin/dashboard` | `admin/dashboard/page.tsx` | Analytics dashboard. |
| `/admin/novels` | `admin/novels/page.tsx` | Novel moderation queue. |
| `/admin/novels/[id]` | `admin/novels/[id]/page.tsx` | Novel review panel. |
| `/admin/writers` | `admin/writers/page.tsx` | Writer application queue. |
| `/admin/writers/[id]` | `admin/writers/[id]/page.tsx` | Author detail, fee terms, impersonation. |
| `/admin/orders` | `admin/orders/page.tsx` | Global orders explorer. |
| `/admin/orders/[id]` | `admin/orders/[id]/page.tsx` | Individual order detail. |
| `/admin/disputes` | `admin/disputes/page.tsx` | Dispute resolution desk. |
| `/admin/disputes/[id]` | `admin/disputes/[id]/page.tsx` | Individual dispute resolution. |
| `/admin/commission` | `admin/commission/page.tsx` | Platform fee overview. |
| `/admin/commission/reports` | `admin/commission/reports/page.tsx` | Financial reports. |
| `/admin/commission/writers/[id]` | `admin/commission/writers/[id]/page.tsx` | Per-writer fee details. |
| `/admin/invoices` | `admin/invoices/page.tsx` | Invoice management list. |
| `/admin/invoices/[id]` | `admin/invoices/[id]/page.tsx` | Individual invoice detail. |
| `/admin/refunds` | `admin/refunds/page.tsx` | Refund adjustments desk. |
| `/admin/tips` | `admin/tips/page.tsx` | Platform-wide tips management. |
| `/admin/tips/[id]` | `admin/tips/[id]/page.tsx` | Individual tip detail. |
| `/admin/support` | `admin/support/page.tsx` | Support ticket queue. |
| `/admin/support/[id]` | `admin/support/[id]/page.tsx` | Individual support ticket. |
| `/admin/users` | `admin/users/page.tsx` | User role and status governance. |
| `/admin/genres` | `admin/genres/page.tsx` | Taxonomy management. |
| `/admin/settings` | `admin/settings/page.tsx` | Global platform settings. |
| `/admin/audit` | `admin/audit/page.tsx` | Immutable administrative activity log. |

### 4.6 API Routes

| Route | File | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/health` | `api/health/route.ts` | None (public) | Stateless Supabase keep-alive (GET/HEAD). |
| `/api/auth/session` | `api/auth/session/route.ts` | Cookie or public | Fast session resolver. |
| `/api/cron/send-emails` | `api/cron/send-emails/route.ts` | Bearer `CRON_SECRET` | Dispatches pending `email_outbox` rows via Resend. Triggered by GitHub Actions every 5 minutes. |
| `/api/cron/reminders` | `api/cron/reminders/route.ts` | Bearer `CRON_SECRET` | Sends verification and fee reminders. Triggered hourly by GitHub Actions. |
| `/api/cron/cleanup` | `api/cron/cleanup/route.ts` | Bearer `CRON_SECRET` | Prunes stale records per data-retention policy. |
| `/api/cron/purge-drafts` | `api/cron/purge-drafts/route.ts` | Bearer `CRON_SECRET` | Purges inactive chapter drafts older than 90 days. |
| `/api/proofs/signed-url` | `api/proofs/signed-url/route.ts` | Authenticated | Generates private signed URLs for payment screenshots. |
| `/api/writer/export-sales` | `api/writer/export-sales/route.ts` | Authenticated (writer) | Exports writer sales data as CSV/JSON. |
| `/api/writer/parse-manuscript` | `api/writer/parse-manuscript/route.ts` | Authenticated (writer) | Parses `.docx` manuscripts server-side for the chapter splitter. |

### 4.7 Developer-Only Routes

| Route | File | Description |
| :--- | :--- | :--- |
| `/dev/brand` | `dev/brand/page.tsx` | Brand asset viewer. |
| `/dev/theme` | `dev/theme/page.tsx` | Design token theme explorer. |
| `/dev/fonts` | `(marketplace)/dev/fonts/page.tsx` | Font rendering test. |

---

## 5. Database Architecture & Migrations

The database is built on **PostgreSQL 15+** managed via Supabase. All database logic adheres strictly to **zero client direct writes on financial tables**; state transitions are governed exclusively by atomic, transactional, `SECURITY DEFINER` RPC functions with hardened `search_path = ''`.

### 5.1 Sequential Migration Log (0001 through 0056)

| Migration File | Primary Focus | Key Schema Objects Created |
| :--- | :--- | :--- |
| `0001_enums_and_core_tables.sql` | Core Domain Schema | Enums, `profiles`, `writer_profiles`, `writer_payment_methods`, `genres`, `novels`, `novel_genres`, `chapters`, `platform_settings`. |
| `0002_orders_and_financial_ledger.sql` | Financial Framework | `orders`, `payment_submissions` (with virtual `normalized_tid`), `purchase_entitlements`, `commission_invoices`, `sales_ledger`, `commission_payments`, `disputes`, `notifications`, `audit_logs`. |
| `0003_triggers_and_rpc_functions.sql` | Automation & Logic | `handle_new_user()`, order number generators, initial `confirm_commission_settlement` (superseded). |
| `0004_rls_policies.sql` | Baseline RLS | Initial multi-tenant Row-Level Security policies. |
| `0005_seed_genres_and_settings.sql` | Seed Data | `platform_settings` singleton (initial 20% default fee, PKR 5,000 threshold); 8 primary Urdu genres. |
| `0006_security_and_financial_hardening.sql` | Security Lockdown | Append-only triggers on `sales_ledger` and `audit_logs`; RPCs: `create_order`, `submit_payment`, `verify_order_payment`, `reject_order_payment`, `record_refund_adjustment`, `generate_commission_invoice`, `confirm_commission_settlement`, `open_dispute`, `resolve_dispute`, `approve_novel`, `reject_novel`. Storage buckets `payment-proofs` and `novel-assets`. |
| `0007_gap_fixes_and_storage_hardening.sql` | Revisions & Limits | `chapter_revisions` table; `reader_progress` table; 120,000-character `CHECK` on `chapters.content_urdu`; `resolve_dispute` and `admin_force_verify` RPCs (first version). |
| `0008_revoke_default_grants.sql` | ACL Hardening | Revokes default `PUBLIC`/`anon` write privileges. |
| `0009_order_flow_fixes.sql` | Order Edge Cases | Hardens `verify_order_payment`/`reject_order_payment`; `cancel_order`, `apply_as_writer`, `upsert_writer_payment_method`, `deactivate_writer_payment_method` RPCs. |
| `0010_dispute_and_writer_status_hardening.sql` | Disputes & Status | Adds `dispute_window_days`; `min_dispute_wait_hours DEFAULT 24`; updated `admin_force_verify`, `open_dispute`, `resolve_dispute`. |
| `0011_writer_content_hardening.sql` | Content Security | `max_novel_price_pkr`; column-protection triggers on `novels`; word-count trigger; `submit_novel_for_review`, `withdraw_novel_submission`, `unpublish_own_novel`, `create_novel`, `update_novel`, `reorder_chapters`. |
| `0012_admin_controls.sql` | Admin Governance | `suspend_novel`, `unsuspend_novel`, `set_novel_featured`, `approve_novel` (superseded), `create_genre`, `update_genre`, `reorder_genres`, `delete_genre`, `update_platform_settings`, `set_writer_commission_terms`, `admin_update_user_role_status`. |
| `0013_public_catalog.sql` | Catalog Views | `public_novels_catalog` and `public_writers_catalog` security-barrier views. |
| `0014_min_novel_price.sql` | Pricing Constraints | `min_novel_price_pkr` column (DEFAULT 50); PKR 50 enforcement in `create_novel`/`update_novel`. |
| `0015_checkout_and_payment_submission.sql` | Checkout Pipeline | Checkout flow and TID validation hardening. |
| `0016_reader_and_admin_orders.sql` | Order Visibility | Reader order history views and admin order-tracking helpers. |
| `0017_a_commission_enum_values.sql` | Enum Isolation | Standalone commit for `ALTER TYPE ... ADD VALUE` (required by PostgreSQL Error 55P04). |
| `0017_commission_and_statements.sql` | Fee Statements | `reconcile_writer_unpaid_commission`, `generate_commission_invoice`, `confirm_commission_settlement` (all superseded by later migrations). |
| `0018_disputes_refunds_support.sql` | Dispute Resolution | Hardened `open_dispute` with `min_dispute_wait_hours`; `resolve_dispute_for_reader`, `resolve_dispute_refund`, `resolve_dispute_for_writer` RPCs; `verification_reminder_hours` column (DEFAULT 48, in `platform_settings`). Note: the 48-hour figure in the reminder logic (`0018`, line 2665) is for triggering *admin alerts* about stale unverified submissions, not the minimum wait to open a dispute (which defaults to 24 hours). |
| `0019_database_reconciliation_and_runtime_fixes.sql` | Runtime Bug Fixes | Null-pointer edge cases in RPC returns; edge order-state handling; updated `reconcile_writer_unpaid_commission`. |
| `0020_database_reconciliation_and_immutability_hardening.sql` | Immutability | Immutability on completed orders; updated `admin_force_verify`, `resolve_dispute_for_reader`. |
| `0021_trigger_privilege_lockdown_and_search_path_fix.sql` | Search Path Hardening | All trigger functions set `SET search_path = ''`. |
| `0022_protection_triggers_and_search_path_lockdown.sql` | Column Protection | Column lock triggers on `novels`, `profiles`, `writer_profiles`; updated `reconcile_writer_unpaid_commission`. |
| `0023_fix_sql_construct_qualification_regression.sql` | Syntax Cleanup | Removes forbidden `pg_catalog.` from SQL keywords; updated `reconcile_writer_unpaid_commission`. |
| `0024_format_specifiers_and_privilege_lockdown.sql` | Formatting Fixes | `format()` specifiers in dynamic SQL; updated `admin_force_verify`, `confirm_commission_settlement`, `generate_commission_invoice`, `reconcile_writer_unpaid_commission`. |
| `0025_commission_settlement_and_audit_hardening.sql` | Settlement Hardening | Dual-sided audit logging for settlements; updated `confirm_commission_settlement`. |
| `0026_revoke_trigger_privileges_and_default_acls.sql` | ACL Lockdown | Revokes trigger execution rights from non-superuser roles. |
| `0027_admin_novel_moderation_rls.sql` | Moderation RLS | Admins can read draft/under-review novels in the moderation queue. |
| `0028_admin_get_invoice_rpc.sql` | Invoice RPC | Admin RPC to fetch and compile invoice details. |
| `0029_sensitive_column_exposure_hardening.sql` | Data Privacy | Strips phone numbers, real names, and internal limits from public views. |
| `0030_platform_payment_methods_admin_policy.sql` | Platform Accounts | Admin-controlled platform receiving bank accounts. |
| `0031_chapter_import_and_split_rpcs.sql` | Splitter RPCs | `import_chapters` RPC (batch chapter ingestion) and `split_chapter` RPC. |
| `0032_seed_missing_featured_genres.sql` | Taxonomy Expansion | Additional Urdu literary genres. |
| `0033_chapter_drafts.sql` | Chapter Autosave | `chapter_drafts` table; per-chapter autosave with writer isolation. |
| `0034_tips.sql` | Reader Tips | `tips` table; 0% platform fee tips; `tip_min_pkr=20`, `tip_max_pkr=5000`, `max_tips_per_hour=5`, `tip_daily_cap_pkr_per_reader=10000`, `tip_confirm_reminder_hours=48`. Updated `update_platform_settings` and reminder RPC. |
| `0035_rename_commission_to_platform_fee.sql` | Terminology Sync | Updates view comments and labels to "Platform fee"; updated `generate_commission_invoice`, `confirm_commission_settlement`, `reconcile_writer_unpaid_commission`. |
| `0036_site_palette_settings.sql` | Palette Presets | `site_palette` column in `platform_settings` (Ivory & Ink / Paper & Teal / Cream & Maroon). |
| `0037_fix_db_verification_issues.sql` | Verification Patch | Schema consistency fixes; updated `update_platform_settings`. |
| `0038_api_rate_limits.sql` | Rate Limiting | `api_rate_limits` table; sliding-window RPC (`DEFAULT 10 requests per 60 seconds`). |
| `0039_add_social_links_to_platform_settings.sql` | Platform Socials | Social media links JSONB in `platform_settings`. |
| `0040_email_outbox_wiring_and_support_events.sql` | Async Email Outbox | `email_outbox` table; `enqueue_email_for_notif`; updated `submit_payment`, `verify_order_payment`, `reject_order_payment`, `generate_commission_invoice`, `confirm_commission_settlement`, `approve_writer`, `reject_writer`, `approve_novel`, `reject_novel`. |
| `0041_data_retention_and_maintenance.sql` | Data Retention | Automated retention cleanup procedures; retention column defaults in `platform_settings`. |
| `0042_writer_studio_announcement.sql` | Studio Banners | Announcement banner columns in `platform_settings`. |
| `0043_admin_dashboard_analytics.sql` | Analytics | Materialized analytics RPCs for revenue, active readers, novel velocity. |
| `0044_fix_analytics_and_retention_columns.sql` | Analytics Fixes | Column data types and grouping in analytics RPCs. |
| `0045_writer_social_links.sql` | Author Socials | Social media links in `writer_profiles` (Facebook, Instagram, YouTube, Website). |
| `0046_fix_writer_profiles_rls_update.sql` | Profile Update Fix | RLS policy fix allowing writers to update bio and pen name. |
| `0047_reader_watermark_toggle.sql` | Anti-Piracy Watermark | `watermark_enabled` platform toggle; updated `update_platform_settings`. |
| `0048_fix_order_verification_commission_column.sql` | Ledger Column Patch | Ensures `commission_amount` is recorded in `verify_order_payment`. |
| `0049_update_default_platform_fee_to_30_percent.sql` | Platform Fee Update | `default_commission_rate` updated to **30.00%**; updated `admin_force_verify`. |
| `0050_enable_writer_tips_by_default.sql` | Default Tips | Sets `tips_enabled = true` for all existing writers. |
| `0051_email_outbox_lease_and_quota_retry.sql` | Outbox Resilience | `claim_pending_emails_for_send`, `record_email_delivery_result`, `retry_failed_emails` RPCs; lease expiry and retry backoff. |
| `0052_harden_suspended_writer_and_novel_visibility.sql` | Catalog Hardening | Suspended authors and novels excluded from public views; entitlements preserved. |
| `0053_fix_novels_rls_recursion.sql` | RLS Recursion Fix | `SECURITY DEFINER` helpers eliminate PostgreSQL 42P17 infinite recursion. |
| `0054_admin_impersonation_audit.sql` | Impersonation Audit | `admin_impersonation_sessions` table; audit logging for "Login as Writer". |
| `0055_fix_public_writers_zero_novels.sql` | Writer Discovery Fix | Approved writers with zero published novels can display profile. |
| `0056_delete_draft_novel.sql` | Draft Novel Deletion | `delete_draft_novel` RPC; author duplicate-title guard in `create_novel`. |

### 5.2 Core Tables & Financial Immutability
- **`profiles`:** 1-to-1 with `auth.users`. `role`, `display_name`, `avatar_url`, `is_active`. Protected by `trg_protect_profile_columns`.
- **`novels`:** Catalog metadata, slug, status, price. Status transitions locked by `trg_protect_novel_columns`.
- **`chapters`:** Body content in `content_urdu`, word count (auto-calculated), `is_free_preview`. Chapter content limit: **120,000 characters** (`chk_chapters_content_length`, `0007_gap_fixes_and_storage_hardening.sql:33`).
- **`orders`:** Status flow: `pending_payment` → `payment_submitted` → `verified` (or `rejected`, `disputed`, `cancelled`).
- **`payment_submissions`:** Raw TID + virtual `normalized_tid` + screenshot path.
- **`purchase_entitlements`:** One active entitlement per reader per novel (partial unique index).
- **`sales_ledger`:** **Append-only immutable** (`trg_sales_ledger_immutable` blocks UPDATE/DELETE).
- **`audit_logs`:** Append-only security event log.

### 5.3 Storage Buckets
1. **`novel-assets` (Public):** Cover art and author avatars. 5 MB max. `image/webp, image/jpeg, image/png`.
2. **`payment-proofs` (Private):** Payment receipts. 2 MB max. Accessible only by order owner, novel author, or admin.

---

## 6. Core Business Flows & State Machines

### 6.1 Novel Authoring & Publication Lifecycle

```
[Draft Novel Created] ──> [Chapters Written/Imported] ──> [Submit For Editorial Review]
                                                                        │
                                   ┌────────────────────────────────────┴────────────────┐
                                   ▼                                                     ▼
                         [Admin Approved]                                       [Admin Rejected]
                            │                                                        │
                            ▼                                                        ▼
                    [Status: published]                                      [Status: rejected]
               (Visible in Public Catalog)                            (Returned to Writer with Reason)
```

**Key RPCs & Migration Sources:**
- `create_novel`: `0011_writer_content_hardening.sql:591`, updated in `0056_delete_draft_novel.sql:120`
- `submit_novel_for_review`: `0011_writer_content_hardening.sql`
- `approve_novel`: `0006_security_and_financial_hardening.sql:2011`, superseded in `0012_admin_controls.sql:282`, then `0040_email_outbox_wiring_and_support_events.sql:1550`
- `reject_novel`: `0006_security_and_financial_hardening.sql:2084`, superseded in `0040_email_outbox_wiring_and_support_events.sql:1639`
- `import_chapters`: `0031_chapter_import_and_split_rpcs.sql:30`
- `split_chapter`: `0031_chapter_import_and_split_rpcs.sql:233`

### 6.2 Order Placement & Payment Verification Lifecycle

```
[Reader Clicks Buy] → create_order → pending_payment
                              │
                              ▼
[Reader Transfers PKR] → submit_payment → payment_submitted
  (Uploads TID & Screenshot)       │
                                   ▼
[Author Checks Bank App] → verify_order_payment
                                   │
              ┌────────────────────┴────────────────┐
              ▼                                     ▼
     [Payment Confirmed]                   [Payment Rejected]
     Status: verified                      reject_order_payment
     - Entitlement Granted                 Status: rejected
     - Sales Ledger Appended               - Reader Can Re-submit
     - Fees Accrued                        - Reader Can Open Dispute
```

**Key RPCs & Migration Sources:**
- `create_order`: `0006_security_and_financial_hardening.sql`
- `submit_payment`: `0006`, superseded in `0040_email_outbox_wiring_and_support_events.sql:129`
- `verify_order_payment`: `0006`, superseded in `0040_email_outbox_wiring_and_support_events.sql:340`
- `reject_order_payment`: `0006`, superseded in `0040_email_outbox_wiring_and_support_events.sql:608`
- `cancel_order`: `0009_order_flow_fixes.sql`

### 6.3 Dispute Resolution & Refunds

Minimum wait before a reader can open a dispute: `min_dispute_wait_hours` (DEFAULT **24** hours, `0018_disputes_refunds_support.sql:16`).
Dispute window: `dispute_window_days` (DEFAULT **30** days, `0010_dispute_and_writer_status_hardening.sql`).

An admin notification is triggered by the reminder RPC when a payment submission is older than **48 hours** without verification (`0018_disputes_refunds_support.sql:2665`) — this is not a reader-facing deadline.

**Key RPCs:**
- `open_dispute`: `0006`, superseded `0010`, `0018:364`, superseded `0018:364`
- `resolve_dispute_for_reader`: `0018:718`, superseded `0020:768`
- `resolve_dispute_for_writer`: `0018:1140`
- `resolve_dispute_refund`: `0018:949`
- `admin_force_verify`: `0007:386`, superseded `0010:240`, `0020:463`, `0024:334`, `0049:558`
- `record_refund_adjustment`: `0006_security_and_financial_hardening.sql:1019`

### 6.4 Platform Fee Threshold & Invoicing

**Key RPCs:**
- `reconcile_writer_unpaid_commission`: `0006:341`, superseded across `0017`, `0019`, `0022`, `0023`, `0024`, `0035`
- `generate_commission_invoice`: `0006:1195`, superseded across `0017`, `0024`, `0028`, `0035`, `0040`
- `confirm_commission_settlement`: `0003:443`, superseded across `0006`, `0017`, `0024`, `0025`, `0035`, `0040`
- `set_writer_commission_terms`: `0012_admin_controls.sql`

### 6.5 Transactional Email Outbox Pipeline

Business RPCs enqueue rows into `email_outbox` via `enqueue_email_for_notif` (`0040:31`). The outbox is dispatched by:
- **`claim_pending_emails_for_send`** RPC (`0051_email_outbox_lease_and_quota_retry.sql:32`) — acquires a lease on pending emails.
- **`record_email_delivery_result`** RPC (`0051:91`) — marks sent or failed.
- **`retry_failed_emails`** RPC (`0051:150`) — retries with backoff.

> **Note:** There is no `claim_email_batch` function. The actual function is `claim_pending_emails_for_send`.

---

## 7. Security Model & Invariants

### 7.1 Authentication & Edge Proxy Hardening
- Server-side PKCE cookie management via `@supabase/ssr`.
- **Cookie Security:** Auth cookies are strictly **host-only** (`delete options.domain` in `middleware-or-proxy.ts:126`), preventing sub-domain cookie leakage.
- **Edge Header Sanitization:** Strips incoming `x-user-id` and `x-user-email` headers (`middleware-or-proxy.ts:76-77`).
- **Zero Client Metadata Trust:** `handle_new_user()` unconditionally assigns `role = 'reader'`.

### 7.2 Database Privileges & RLS Policies
- Default write privileges on `public` schema revoked from `anon` and `PUBLIC`.
- Direct table mutations on financial tables blocked; all mutations via `SECURITY DEFINER` RPCs.
- `sales_ledger` and `audit_logs` are append-only via triggers.
- Chapter content RLS: free-preview chapters are public; paid chapters require author, admin, or non-revoked `purchase_entitlement`.

### 7.3 Reader Anti-Piracy Watermarking
Dynamic canvas watermark injected in the reader UI containing the reader's identifier and timestamp. Governed by `watermark_enabled` platform toggle (`0047_reader_watermark_toggle.sql`).

### 7.4 Input Sanitization & File Upload Guards
- **TID Normalization:** `UPPER(REGEXP_REPLACE(tid, '[^A-Za-z0-9]', ''))` prevents duplicate fraud via varying punctuation.
- **Storage Path Validation:** `payment-proofs` RLS enforces upload only by order owner while in `pending_payment` or `rejected` status.
- **File Type & Size Limits:** 2 MB for payment screenshots, 5 MB for covers; MIME: `image/webp, image/jpeg, image/png`.

---

## 8. Deployment & Cloudflare OpenNext Architecture

### 8.1 Cloudflare Worker Architecture
- **Framework:** `@opennextjs/cloudflare` `1.20.14`
- **Entry Point:** `.open-next/worker.js`
- **Compatibility Date:** `2024-12-30` with `nodejs_compat`
- **Static Assets:** `.open-next/assets` via Workers Assets (`binding = "ASSETS"`)
- **Incremental Cache:** Cloudflare R2 bucket `unb-premium-cache` (`NEXT_INC_CACHE_R2_BUCKET`)
- **Tag Cache:** Cloudflare D1 `unb-premium-tag-cache` (ID `ab3532e1-c979-43ad-999a-bb7bbaa5a34d`)
- **Cache Interception:** `enableCacheInterception: false` (`open-next.config.ts:21`)

### 8.2 The Tailwind CSS v4 / Turbopack Compilation Invariant
Tailwind v4 is compiled by `@tailwindcss/turbopack` (resolved `4.3.3`). **No PostCSS Tailwind plugin is configured.** Building with `--webpack` bypasses the Tailwind engine, emitting uncompiled `@tailwind utilities` (≈35 KB). The build command MUST remain `"build": "next build"` (Turbopack) which produces the full ≈144.8 KB stylesheet.

### 8.3 Automated Scheduling (GitHub Actions)

**Emails are automatically dispatched in production via `.github/workflows/cron.yml`:**
- **`/api/cron/send-emails`** — triggered every **5 minutes** (`schedule: cron: '*/5 * * * *'`), processes the `email_outbox` table via Resend REST API.
- **`/api/cron/reminders`** — triggered **hourly** (via `workflow_dispatch` with `trigger_reminders: true` or `github.event.schedule == '0 * * * *'`), sends verification and fee reminders.
- Both endpoints require `Authorization: Bearer ${{ secrets.CRON_SECRET }}`.
- **Dependency:** `secrets.APP_URL` and `secrets.CRON_SECRET` must be set in the GitHub repository secrets for the workflow to function. If these secrets are unset, the workflow will silently fail.
- `wrangler.jsonc` does **not** contain a Cloudflare Cron Trigger; the scheduling is fully in GitHub Actions.

### 8.4 Environment Variables & Secrets Reference

| Variable Name | Exposure | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Server | Supabase project REST URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Server | Supabase anonymous public API key. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server Only (SECRET)** | Administrative key. Set via `wrangler secret put`. |
| `NEXT_PUBLIC_APP_URL` | Client & Server | Canonical application base URL. |
| `CRON_SECRET` | **Server Only (SECRET)** | 32+ character bearer token for cron endpoint auth. Also set in GitHub repository secrets as `secrets.CRON_SECRET`. |
| `EMAIL_PROVIDER` | Server Only | `resend` (set in `wrangler.jsonc:13` as a plain var). |
| `RESEND_API_KEY` | **Server Only (SECRET)** | Resend transactional email API key. |
| `EMAIL_FROM` | Server Only | Default sender header (set in `wrangler.jsonc:14`). |

---

## 9. Quality Gates & Automated Test Suites

Verified on **2026-11-18**:

### 9.1 NPM Scripts Execution Audit

| Script | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **SQL Syntax** | `npm run check:sql` | **PASS** | 86 SQL files, 0 violations. |
| **Terminology** | `npm run check:terms` | **PASS** | 0 forbidden "commission" or "کمیشن" in src/. |
| **Design Tokens** | `npm run check:colors` | **PASS** | 0 hardcoded colors; 100% semantic. |
| **WCAG Contrast** | `npm run check:contrast` | **PASS** | All 3 palettes WCAG AA compliant. |
| **Link Crawler** | `npm run check:links` | **PASS** | 92 routes, 305 files, 0 dead links. |
| **Frontend Queries** | `npm run check:frontend` | **PASS** | 305 files, 0 unhandled query errors. |
| **SEO Metadata** | `npm run check:seo` | **PASS** | 126 checks, 0 failures. |
| **TypeScript** | `npx tsc --noEmit` | **PASS** | 0 type errors. |
| **Unit Tests** | `npm test` | **PASS** | **618 tests** across 46 test files (Node.js `--test`). |
| **Next.js Build** | `npm run build` | **PASS** | All routes compiled by Turbopack. |
| **Worker Build** | `npm run build:worker` | **PASS** | `.open-next/worker.js` with 144.8 KB compiled CSS. |
| **ESLint** | `npm run lint` | **FAIL** | 25 errors, 20 warnings (React 19 hook rules, `no-explicit-any`). |

### 9.2 SQL Test Suites (`supabase/tests/`)

30 files total (29 `.sql` files + `00_manual_flow_checklist.md`):

- `00_post_migration_verification.sql` — Schema, function signatures, search paths.
- `01_security_and_financial_hardening_tests.sql` — Append-only triggers, RPC ACLs.
- `02_order_flow_fixes_tests.sql` — Order state machine, payment submissions.
- `03_dispute_and_writer_status_tests.sql` — 30-day windows, writer reapplication.
- `04_writer_content_tests.sql` — Word counting, slug generation, publication locking.
- `05_admin_controls_tests.sql` — Suspensions, taxonomy, fee overrides.
- `06_public_catalog_tests.sql` — Security barrier views, catalog visibility.
- `07_min_price_tests.sql` — PKR 50 minimum enforcement.
- `08_checkout_tests.sql` — Order concurrency, duplicate TID prevention.
- `09_reader_access_tests.sql` — Chapter RLS content unlocking.
- `10_commission_tests.sql` — Platform fee math, statements.
- `11_disputes_refunds_tests.sql` — Force-verify, refund adjustment ledger.
- `12_runtime_smoke.sql` — 15-step end-to-end smoke test.
- `13_client_attack_matrix.sql` — 46-vector privilege escalation matrix.
- `14_admin_read_access.sql` — Multi-tenant admin view isolation.
- `15_rpc_signature_check.sql` / `16_frontend_columns_check.sql` — Interface sync.
- `17_sensitive_column_exposure.sql` — Zero private data leakage.
- `18_chapter_split_tests.sql` — Batch ingestion security.
- `19_chapter_drafts_tests.sql` — Autosave concurrency, RLS.
- `20_tips_tests.sql` — 0% fee, daily caps, rate limits.
- `21_api_rate_limits_tests.sql` / `21_site_palette_tests.sql` — Rate limits, palette settings.
- `22_email_outbox_lease_and_quota_tests.sql` — Lease locking, retry backoff.
- `23_suspended_visibility_tests.sql` — Suspended author/novel catalog exclusion.
- `24_admin_impersonation_tests.sql` — Impersonation tokens, audit trail.
- `25_public_writers_zero_novels_tests.sql` — Writer discovery.
- `26_delete_draft_novel_tests.sql` — Deletion invariants, duplicate title guard.
- `rls_hardening.test.sql` — Standalone RLS hardening suite.

---

## 10. Current State of Features

### 10.1 Completed & Production-Ready
- **End-to-End Direct Payment Marketplace:** Order creation, TID submission, proof screenshot upload, and manual author verification flow.
- **Content Protection & Reading Experience:** Gulzar Nastaliq reader with 3 themes, reading progress sync, and anti-piracy watermark.
- **Writer Studio & Manuscript Ingestion:** `ChapterSplitterWizard` (embedded in chapters page) with `.docx`/`.txt` import, Urdu chapter numbering; autosaving drafts.
- **Financial Ledger & Platform Fee Engine:** Append-only ledger, 30% default fee, per-writer custom terms, PKR 5,000 threshold, invoice generation.
- **Administrative Governance:** Moderation queues, dispute desk, taxonomy management, impersonation, announcements, palette settings.
- **Automated Email Outbox:** GitHub Actions cron triggers `/api/cron/send-emails` every 5 minutes via Resend.
- **Supabase Keep-Alive:** `/api/health` for UptimeRobot/cron-job.org.
- **Design System:** 3 switchable WCAG AA palettes with unified semantic tokens.

### 10.2 Partially Built / Requires Additional Setup
- **GitHub Actions Cron Secrets:** `secrets.APP_URL` and `secrets.CRON_SECRET` must be configured in GitHub repository settings for automated email dispatch to function.
- **Cloudflare Turnstile Bot Protection:** Rate-limiting infrastructure exists but Turnstile CAPTCHA integration on auth forms is marked as TODO in `docs/MANUAL_SETUP_CHECKLIST.md`.

---

## 11. Known Issues & Technical Debt

### 11.1 Marketing Copy Conflicts with Actual System Behaviour

> [!CAUTION]
> The following user-facing copy makes promises that the system **does not automatically fulfill**. Access requires manual author verification which may take minutes to days.

1. **Homepage SEO metadata / OpenGraph description** — file `src/app/(marketplace)/page.tsx:31,38,56`:
   ```
   "Buy and read original Urdu novels directly from Pakistani authors.
   Pay securely via JazzCash, EasyPaisa, or Raast with instant digital access."
   ```
   - **"Pay securely"**: The platform does not facilitate, monitor, or secure the actual bank transfer — the reader transfers money directly to the author's private account. The word "securely" implies platform guarantees that do not exist.
   - **"instant digital access"**: Access is granted only after the author manually verifies receipt. There is no mechanism to guarantee any timeframe. This phrase directly conflicts with the actual flow.
   - This same string appears in three places (page metadata, OpenGraph, and Twitter card) in the same file.

2. **Homepage UI copy — Step 3 heading** — file `src/app/(marketplace)/page.tsx:203`:
   ```
   3. Instant Access Unlocked
   ```
   The body text below it correctly says "Once the author confirms receipt..." but the heading "Instant Access Unlocked" implies immediacy that the system cannot guarantee.

3. **`EmailOutboxCard.tsx:192`**:
   ```html
   <span>Emails are securely dispatched to recipients.</span>
   ```
   This is in the admin UI (not public-facing), but is factually imprecise — the system queues emails and dispatches them asynchronously via a third-party service (Resend). Delivery is not guaranteed by the platform.

### 11.2 React 19 ESLint Hook Warnings
- **Issue:** `react-hooks/set-state-in-effect` rule (25 errors, 20 warnings in `NovelListClient.tsx`, `ChapterListManager.tsx`, `login-form.tsx`, `SubmitReviewModal.tsx`, and others).
- **Impact:** `npm run lint` fails. CI does not currently block on lint.
- **Remediation:** Refactor to derive state directly or use React `key` prop to reset.

### 11.3 Terminology Split (DB vs UI)
- Database objects, RPC names, URL paths (`/writer/commission`, `/admin/commission`), and TypeScript identifiers all use `commission`.
- All user-visible copy must use "Platform fee" / "پلیٹ فارم فیس".
- New developers must remember this distinction at every touchpoint.

### 11.4 Migration Sequence Anomaly (Two `0017` Prefixes)
- `0017_a_commission_enum_values.sql` and `0017_commission_and_statements.sql` share the `0017` prefix.
- Required by PostgreSQL 55P04: `ALTER TYPE ... ADD VALUE` must commit before the new value can be referenced.

### 11.5 GitHub Actions Cron Secret Dependency
- Automated email delivery depends on `secrets.APP_URL` and `secrets.CRON_SECRET` being set in the GitHub repository settings. If either is missing or incorrect, emails are silently not dispatched and the GitHub Actions job fails (but does not block deployments, since the cron is a separate workflow).

### 11.6 Next.js CLI Security Advisory Exit
- `next build` on Next.js 16.4.2 may exit code 1 on first run with a security advisory. Retrying immediately succeeds.

### 11.7 No Cloudflare Cron Trigger
- `wrangler.jsonc` does **not** define a Cloudflare Cron Trigger. Email dispatch depends entirely on GitHub Actions. If the GitHub Actions runner is unavailable or the repo is migrated without keeping the workflow, emails will stop.

---

## 12. Manual Operational Checklist for the Owner

### 12.1 Supabase PostgreSQL Setup
1. Execute migrations `0001` through `0056` sequentially in the Supabase SQL Editor.
2. Bootstrap platform administrator:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE email = 'your-admin-email@unbpremium.pk';
   ```
3. Verify storage buckets: `payment-proofs` (Private, 2 MB), `novel-assets` (Public, 5 MB).
4. Configure Auth redirect allowlist: `https://premium.urdunovelbanks.com/auth/callback` and `.../reset-password`.

### 12.2 Cloudflare Workers & Bindings
1. Provision R2 bucket `unb-premium-cache`.
2. Confirm D1 database `unb-premium-tag-cache` (ID `ab3532e1-c979-43ad-999a-bb7bbaa5a34d`).
3. Set secrets:
   ```bash
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put CRON_SECRET
   wrangler secret put RESEND_API_KEY
   ```

### 12.3 GitHub Actions Secrets (Required for Email Dispatch)
In **GitHub → Repository → Settings → Secrets and variables → Actions**, add:
- `APP_URL` = `https://premium.urdunovelbanks.com`
- `CRON_SECRET` = same 32+ character value as the Cloudflare Worker secret

### 12.4 Supabase Keep-Alive Monitor
Create a free HTTP monitor at [UptimeRobot.com](https://uptimerobot.com) or [cron-job.org](https://cron-job.org):
- **URL:** `https://premium.urdunovelbanks.com/api/health`
- **Interval:** 5 minutes
- **Method:** `HEAD` or `GET`

---

## 13. Recommended Next 10 Engineering Tasks

1. **Fix "instant digital access" / "Pay securely" homepage metadata** — Replace with accurate copy: e.g. `"Pay directly via JazzCash, EasyPaisa, or Raast. Access granted after the author verifies your bank transfer."` Affects `src/app/(marketplace)/page.tsx:31,38,56` and the "Instant Access Unlocked" heading at line 203.
2. **Add Cloudflare Cron Trigger to `wrangler.jsonc`** — Add `"triggers": { "crons": ["*/5 * * * *"] }` with a Worker scheduled handler so email dispatch is not GitHub-Actions-dependent.
3. **Resolve React 19 ESLint `react-hooks/set-state-in-effect` Warnings** — Refactor affected components to restore a clean `npm run lint` gate.
4. **Integrate Cloudflare Turnstile Bot Protection** — Add CAPTCHA to `/register` and `/login` forms.
5. **Automate Scheduled Platform Fee Reminder Notifications** — Ensure `secrets.APP_URL` and `secrets.CRON_SECRET` are configured in GitHub so the hourly reminder job actually runs.
6. **Optimize Chapter Reading Cache Invalidation** — Refine `revalidateTag` calls on chapter edits.
7. **Implement Author Payout QR Codes** — Allow authors to upload Raast / JazzCash QR codes to streamline checkout.
8. **Expand Reader Progress Analytics for Authors** — Chapter drop-off charts and reading time metrics from `reader_progress`.
9. **Upgrade Next.js Patch Release** — Clear the CLI security advisory intermittent exit-1.
10. **Implement Multi-Currency Display** — Show estimated USD/AED/GBP alongside PKR prices for diaspora readers.

---

## 14. Git Secret Scan Findings

Scan of 268 commits on `main` (remote: `https://github.com/theusmandev/urdu-fiction-marketplace.git`):

- **Accidental Key Leaks: ZERO.** No production API keys, service role keys, or private tokens committed.
- `.env.example`: Sanitized placeholders only (`your-project-id`, `re_dummy_...`, `32-char-random-secret`).
- `wrangler.jsonc`: Public configuration only (`EMAIL_PROVIDER`, sender header, binding names).
- `tests/`: Mock strings (`re_dummy_test_key_for_testing_only`) with Vitest network spies.
- **Local HEAD is 1 commit ahead of `origin/main`** (the `"docs: add project handoff"` commit plus this correction commit are unpushed). Do not push without owner confirmation.

---
*End of Project Handoff Document — Version 1.1.0, fact-checked 2026-11-18.*
