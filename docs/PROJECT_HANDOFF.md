# UNB Premium (`یو این بی پریمیم`) — Comprehensive Project Handoff

> **Document Version:** 1.0.0  
> **Repository:** `urdu-fiction-marketplace`  
> **Production URL:** `https://premium.urdunovelbanks.com`  
> **Target Audience:** Incoming Lead Engineers, Full-Stack Developers, Database Architects, and Autonomous Coding Agents.  
> **Verification Status:** Fully audited against repository commit history, Supabase migrations (`0001`–`0056`), OpenNext Cloudflare configuration, and automated test suites.

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
   - Ingests manuscripts using the **Writer-Controlled Chapter Splitter** (batch import from `.docx` or `.txt`, automatic Urdu numbering `حصہ ۱`, `حصہ ۲`).
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

### 1.4 Platform Fee & Monetization Model
- **Terminology Rule:** The word "commission" (and Urdu "کمیشن") is strictly forbidden in all user-facing copy. The feature is universally labeled **"Platform fee"** (Urdu: **پلیٹ فارم فیس**). Internal database tables and RPC names retain `commission` for historical migration continuity.
- **Default Platform Fee Rate:** **30.00%** (updated from 20% in migration `0049_update_default_platform_fee_to_30_percent.sql`).
- **Per-Writer Overrides:** Administrators can configure custom platform fee percentages (e.g. 15% for VIP authors) and custom credit limits via `set_writer_commission_terms`.
- **Unpaid Fee Threshold:** Default **PKR 5,000.00**. When a writer's accumulated unpaid platform fees reach or exceed this threshold, the system automatically pauses new order creation for that writer's novels (`orders_paused = true`).
- **Platform Fee Invoicing & Settlement:** Platform fee invoices are generated periodically by administrators. Writers transfer owed fees to the platform's bank account, report payment, and admins confirm settlement via `confirm_commission_settlement`.
- **Minimum & Maximum Novel Pricing:**
  - Minimum Price: **PKR 50.00** (`min_novel_price_pkr` in migration `0014`). Free novels are prohibited on the marketplace.
  - Maximum Price: **PKR 5,000.00** (`max_novel_price_pkr` in migration `0011`).
- **Reader Appreciation Tips:**
  - 100% of reader tips go directly to the author.
  - Platform fee on tips is strictly **0.00%** (migration `0034_tips.sql`, enabled by default in `0050`).

---

## 2. Tech Stack & Runtime Environment

| Category | Technology | Exact Version | Repository Evidence / Configuration |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `16.4.2` | `package.json` (`next: "16.4.2"`) |
| **UI Library** | React | `19.3.0` | `package.json` (`react: "19.3.0"`, `react-dom: "19.3.0"`) |
| **Styling Engine** | Tailwind CSS v4 | `^4.0.0` | `@tailwindcss/turbopack`, `src/app/globals.css`, `src/styles/tokens.css` |
| **Database & Auth** | Supabase PostgreSQL | PostgreSQL 15+ | `@supabase/supabase-js: ^2.118.0`, `@supabase/ssr: ^0.12.7` |
| **Deployment Target**| Cloudflare Workers | Edge / workerd | `@opennextjs/cloudflare: ^1.20.14`, `wrangler: ^4.156.0` |
| **Worker Cache** | Cloudflare R2 | Multi-Region R2 | `open-next.config.ts`, binding `NEXT_INC_CACHE_R2_BUCKET: "unb-premium-cache"` |
| **Worker Tag Cache** | Cloudflare D1 | Serverless SQL | `open-next.config.ts`, binding `NEXT_TAG_CACHE_D1: "unb-premium-tag-cache"` (`ab3532e1-c979-43ad-999a-bb7bbaa5a34d`) |
| **Email Service** | Resend (REST API) | HTTP v1 REST | Zero TCP dependencies. `EMAIL_PROVIDER="resend"`, `src/lib/email/` |
| **Icons** | Lucide React | `^1.16.0` | `package.json` (`lucide-react`) |
| **Document Parser** | Mammoth (.docx to HTML) | `^1.11.0` | `package.json` (Used in client-side chapter splitter) |
| **Typography** | Next.js Google Fonts | Edge Hosted | `Plus_Jakarta_Sans` (Sans), `Cormorant_Garamond` (Serif), `Gulzar` (Urdu Nastaliq), `Amiri` (Arabic) |
| **Production Domain**| Cloudflare Custom Domain | `https://premium.urdunovelbanks.com` | Verified in DNS & Cloudflare Workers routing |

---

## 3. Repository Folder Map

```
urdu-fiction-marketplace/
├── .github/
│   └── workflows/                # CI/CD pipelines (Cloudflare build check, cron triggers, security scans)
├── docs/                         # In-depth architectural documentation, checklists, templates, and audits
│   ├── email-templates/          # Raw HTML templates for Supabase Auth and transactional emails
│   ├── MANUAL_SETUP_CHECKLIST.md # Authoritative step-by-step Supabase & Cloudflare manual setup guide
│   ├── TERMINOLOGY.md            # "Platform fee" vs internal "commission" mapping rules
│   ├── RLS_TEST_PLAN.md          # Multi-tenant security matrix & RLS verification scenarios
│   ├── SECURITY_AUDIT.md         # Vulnerability assessment and mitigation logs
│   ├── KEEP_ALIVE_AUDIT.md       # Analysis of Supabase Free Tier keep-alive architecture
│   └── PROJECT_HANDOFF.md        # (This document) Master onboarding and architecture reference
├── public/                       # Static public assets (logos, manifest, favicon, brand marks)
├── scripts/                      # Pre-commit, linting, and quality check node scripts
│   ├── check-sql-syntax-constructs.mjs # Validates zero invalid pg_catalog qualification in migrations
│   ├── check-terminology.mjs     # Asserts zero forbidden user-facing occurrences of "commission"
│   ├── check-design-tokens.mjs   # Asserts zero hard-coded Tailwind palette colors in src/
│   ├── check-contrast.mjs        # WCAG AA 4.5:1 / 3:1 contrast ratio verification for all palettes
│   ├── check-links.mjs           # Crawls routes and source files to prevent dead hyperlinks
│   ├── check-frontend-queries.mjs# PostgREST query validator (checks embed syntax and error handling)
│   └── check-seo-metadata.mjs    # Validates OpenGraph, Twitter cards, and canonical tags
├── src/                          # Next.js App Router source root
│   ├── app/                      # Routes, layouts, error boundaries, and server actions
│   │   ├── (auth)/               # Login, registration, password recovery routes
│   │   ├── (marketplace)/        # Public catalog, novel showcase, writer profiles, search
│   │   ├── account/              # Reader profile, security settings, reading history
│   │   ├── admin/                # Platform management, moderation, financial reconciliation
│   │   ├── api/                  # Route handlers (health, session, impersonation, cron, autosave)
│   │   ├── checkout/             # Payment submission and TID verification checkout funnel
│   │   ├── library/              # Reader's purchased novels and active reading shelf
│   │   ├── orders/               # Reader order history and status tracking
│   │   ├── read/                 # Distraction-free novel reading interface
│   │   ├── writer/               # Writer Studio (manuscript editor, chapter splitter, sales ledger)
│   │   ├── globals.css           # Tailwind v4 theme definitions and font setups
│   │   └── layout.tsx            # Root layout, Google fonts, ConfirmProvider, JSON-LD schemas
│   ├── components/               # Modular UI components
│   │   ├── admin/                # Moderation dialogs, user role editors, settlement tables
│   │   ├── auth/                 # Sign-in forms, password inputs, session providers
│   │   ├── checkout/             # Bank details display, TID input, screenshot uploader
│   │   ├── novels/               # Novel cards, cover art display, review forms
│   │   ├── reader/               # Urdu reading controls, theme picker, font-size sliders
│   │   ├── studio/               # Chapter editor, chapter splitter wizard, draft manager
│   │   └── ui/                   # Base primitives (buttons, badges, modals, toast alerts)
│   ├── config/                   # Global configuration singletons (siteConfig, navigation, metadata)
│   ├── lib/                      # Business logic, helpers, and database adapters
│   │   ├── auth/                 # Role guards, session hint cookies, permission helpers
│   │   ├── email/                # Resend HTTP mailer, bilingual email builders, outbox processor
│   │   ├── rate-limiting/        # Token bucket / DB sliding-window rate limiters
│   │   ├── security/             # Sanitization, input escaping, TID normalizers
│   │   ├── seo/                  # JSON-LD schema generators, canonical URL builders
│   │   ├── settings/             # Dynamic site-palette loading and theme resolution
│   │   ├── supabase/             # Server, client, public, cron, and admin Supabase instances
│   │   └── text/                 # Manuscript splitting, word counters, Urdu text cleaners
│   ├── styles/                   # Design token CSS variable definitions (`tokens.css`)
│   ├── types/                    # TypeScript interfaces (`database.ts`, `auth.ts`, `api.ts`)
│   └── proxy.ts                  # Edge request proxy (session refresh, internal header cleaning)
├── supabase/
│   ├── migrations/               # Numbered sequential SQL migrations (0001 through 0056)
│   └── tests/                    # SQL pgTAP/psql test suites (28 test scripts)
├── tests/                        # Vitest / Jest unit and integration tests (46 test files)
├── open-next.config.ts           # OpenNext Cloudflare adapter cache & binding configuration
├── wrangler.jsonc                # Cloudflare Worker configuration & resource bindings
└── next.config.ts                # Next.js server configuration, security headers, CSP
```

---

## 4. Route Architecture & Access Control

Access control is enforced at two distinct boundaries:
1. **Edge Request Proxy (`src/proxy.ts` -> `src/lib/supabase/middleware-or-proxy.ts`):** Strips untrusted user headers, refreshes Supabase auth cookies, and blocks unauthenticated requests to protected prefixes.
2. **Server Action / Route Handler Authorization:** Every mutation independently calls `supabase.auth.getUser()`, verifies account status (`is_active = true`), and checks user roles against the database before executing any logic.

### 4.1 Route Directory & Access Levels

| Path | Access Level | Purpose / Description |
| :--- | :--- | :--- |
| `/` | Public | Homepage showcasing featured novels, newest releases, top genres, and authors. |
| `/browse` | Public | Catalog browser with search, genre filters, and sort options. |
| `/novels/[slug]` | Public | Novel details, blurb, pricing, chapter index, reviews, and author bio. |
| `/novels/[slug]/read` | Public / Reader | Free preview chapter reader. |
| `/genres/[slug]` | Public | Filtered catalog view for specific literary genres. |
| `/writers/[id]` | Public | Public author profile, biography, and published catalog. |
| `/about`, `/contact`, `/terms`, `/privacy`, `/faq` | Public | Informational, legal, and support documentation. |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Anonymous | User authentication pages. Authenticated users are automatically redirected to their role dashboard. |
| `/auth/callback`, `/auth/confirm` | Public | Supabase Auth PKCE code exchange and email verification handler. |
| `/account` | Authenticated (`reader`, `writer`, `admin`) | Personal profile settings, password update, notification preferences. |
| `/library` | Authenticated (`reader`, `writer`, `admin`) | Reader's personal library of purchased and reading-in-progress novels. |
| `/orders` | Authenticated (`reader`, `writer`, `admin`) | Reader's order history, status tracking, and receipt access. |
| `/orders/[id]/pay` | Authenticated (Order Owner) | Checkout payment screen with author payment details and TID upload form. |
| `/checkout/[slug]` | Authenticated (Reader) | Initial novel purchase confirmation and order creation step. |
| `/read/[novelId]/[chapterNumber]` | Entitled Reader / Author / Admin | Distraction-free protected chapter reading interface. |
| `/tips/[writerId]`, `/tips/orders/[id]` | Authenticated (Reader) | Direct reader-to-author appreciation tipping interface. |
| `/become-a-writer` | Authenticated (`reader`) | Writer application submission form. |
| `/disputes` | Authenticated (Order Owner) | Reader dispute creation and tracking for unverified orders. |
| `/writer` | Authenticated (`writer`, `admin`) | Writer Studio dashboard overview (sales, quick actions, announcements). |
| `/writer/novels` | Authenticated (`writer`, `admin`) | List of author's own novels across all statuses (`draft`, `under_review`, `published`). |
| `/writer/novels/new` | Authenticated (`writer`, `admin`) | New novel creation form with duplicate title prevention. |
| `/writer/novels/[id]` | Authenticated (Novel Author / Admin) | Novel management hub (chapters list, pricing, cover image, status). |
| `/writer/novels/[id]/edit` | Authenticated (Novel Author / Admin) | Edit novel metadata (title, Urdu title, blurb, genres, price). |
| `/writer/novels/[id]/chapters` | Authenticated (Novel Author / Admin) | Chapter manager with drag-and-drop reordering. |
| `/writer/novels/[id]/chapters/new` | Authenticated (Novel Author / Admin) | New chapter creation editor. |
| `/writer/novels/[id]/chapters/[chapterId]/edit` | Authenticated (Novel Author / Admin) | Chapter editing interface with draft autosave. |
| `/writer/novels/[id]/split` | Authenticated (Novel Author / Admin) | Manuscript chapter splitter wizard (`.docx` / `.txt` import). |
| `/writer/orders` | Authenticated (`writer`, `admin`) | Order verification queue where authors approve/reject reader payments. |
| `/writer/commission` | Authenticated (`writer`, `admin`) | Writer Platform Fee dashboard (unpaid balance, statements, invoices). |
| `/writer/payments` | Authenticated (`writer`, `admin`) | Author payment method configuration (JazzCash, EasyPaisa, Raast, Bank IBAN). |
| `/writer/profile` | Authenticated (`writer`, `admin`) | Writer public profile editor (pen name, bio, social links). |
| `/admin` | Authenticated (`admin` only) | Administrator dashboard with key platform metrics and alerts. |
| `/admin/novels` | Authenticated (`admin` only) | Platform-wide novel moderation queue and catalog management. |
| `/admin/novels/[id]` | Authenticated (`admin` only) | Novel review panel with editorial moderation checklist and actions. |
| `/admin/writers` | Authenticated (`admin` only) | Writer application queue and author status management. |
| `/admin/writers/[id]` | Authenticated (`admin` only) | Author detail view with custom fee terms and audited support impersonation. |
| `/admin/orders` | Authenticated (`admin` only) | Global orders explorer with search by TID, reader, or novel. |
| `/admin/commission` | Authenticated (`admin` only) | Platform fee settlement management, invoice generation, and ledger view. |
| `/admin/disputes` | Authenticated (`admin` only) | Dispute resolution desk with force-verify and refund capabilities. |
| `/admin/users` | Authenticated (`admin` only) | User governance (role management, account activation/deactivation). |
| `/admin/genres` | Authenticated (`admin` only) | Taxonomy management (create, edit, reorder, and deactivate genres). |
| `/admin/settings` | Authenticated (`admin` only) | Global settings (platform fee, pricing limits, site palette, announcements). |
| `/admin/audit-logs` | Authenticated (`admin` only) | Immutable administrative activity audit log. |
| `/admin/analytics` | Authenticated (`admin` only) | Platform financial, order, and reader engagement analytics. |
| `/api/health` | Public | Stateless Supabase keep-alive health endpoint (HEAD/GET). |
| `/api/auth/session` | Public | Fast session hint and authenticated user resolver. |
| `/api/auth/impersonate` | Authenticated (`admin` only) | Generates audited support impersonation links ("Login as Writer"). |
| `/api/cron/send-emails`| Cron Bearer Secret | Processes pending emails from `email_outbox` via Resend REST API. |
| `/api/cron/reminders` | Cron Bearer Secret | Sends reminders for pending order verifications and unpaid fees. |
| `/api/chapters/autosave`| Authenticated (Author / Admin) | Autosaves chapter drafts in background during editing. |
| `/api/settings/palette`| Public | Returns the active site-wide color palette preset. |

---

## 5. Database Architecture & Migrations

The database is built on **PostgreSQL 15+** managed via Supabase. All database logic adheres strictly to **zero client direct writes on financial tables**; state transitions are governed exclusively by atomic, transactional, `SECURITY DEFINER` RPC functions with hardened `search_path = ''`.

### 5.1 Sequential Migration Log (0001 through 0056)

| Migration File | Primary Focus | Key Schema Objects & Actions Created |
| :--- | :--- | :--- |
| `0001_enums_and_core_tables.sql` | Core Domain Schema | Enums (`user_role`, `writer_status`, `payment_method_type`, `novel_status`, `order_status`). Core tables: `profiles`, `writer_profiles`, `writer_payment_methods`, `genres`, `novels`, `novel_genres`, `chapters`, `platform_settings`. |
| `0002_orders_and_financial_ledger.sql` | Financial Framework | Tables: `orders`, `payment_submissions` (with virtual generated `normalized_tid`), `purchase_entitlements`, `commission_invoices`, `sales_ledger`, `commission_payments`, `disputes`, `notifications`, `audit_logs`. |
| `0003_triggers_and_rpc_functions.sql` | Automation & Logic | Triggers: `handle_new_user()`, order number generators. Initial verification and rejection RPCs. |
| `0004_rls_policies.sql` | Baseline RLS | Row-Level Security policies establishing multi-tenant data isolation. |
| `0005_seed_genres_and_settings.sql` | Seed Data | Initial singleton in `platform_settings` (initial 20% default fee, PKR 5,000 threshold); seeds 8 primary Urdu genres. |
| `0006_security_and_financial_hardening.sql` | Security Lockdown | Drops client write policies on financial tables; adds append-only triggers on `sales_ledger` and `audit_logs`; creates atomic transactional RPCs (`create_order`, `submit_payment`, `verify_order_payment`, `reject_order_payment`, `record_refund_adjustment`). Configures storage buckets (`payment-proofs`, `novel-assets`). |
| `0007_gap_fixes_and_storage_hardening.sql` | Revisions & Limits | Adds `chapter_revisions` table and tracking trigger; creates `reader_progress` table; enforces 120,000 character limit on chapters; refines storage RLS policies. |
| `0008_revoke_default_grants.sql` | ACL Hardening | Revokes default `PUBLIC` and `anon` write privileges across `public` schema. |
| `0009_order_flow_fixes.sql` | Order Edge Cases | Hardens `verify_order_payment` and `reject_order_payment` state assertions; implements `cancel_order` and `apply_as_writer` RPCs. |
| `0010_dispute_and_writer_status_hardening.sql` | Disputes & Reapplication | Adds `dispute_window_days`; prevents duplicate active orders during dispute; locks writer re-application workflow. |
| `0011_writer_content_hardening.sql` | Content Security | Adds `max_novel_price_pkr`; triggers for novel column protection; automatic chapter word counting (`trg_chapters_calculate_word_count`); blocks chapter deletion after publication; adds `submit_novel_for_review` and `unpublish_own_novel` RPCs. |
| `0012_admin_controls.sql` | Admin Governance | Admin RPCs: `suspend_novel`, `unsuspend_novel`, `set_novel_featured`, `create_genre`, `update_platform_settings`, `set_writer_commission_terms`, `admin_update_user_role_status`. |
| `0013_public_catalog.sql` | Catalog Views | Adds `public_novels_catalog` and `public_writers_catalog` views with security barrier protection. |
| `0014_min_novel_price.sql` | Pricing Constraints | Adds `min_novel_price_pkr = 50.00`; blocks free novel submissions. |
| `0015_checkout_and_payment_submission.sql` | Checkout Pipeline | Hardens checkout flow, payment screenshot association, and TID validation. |
| `0016_reader_and_admin_orders.sql` | Order Visibility | Optimized views and helper functions for reader order history and administrative order tracking. |
| `0017_a_commission_enum_values.sql` | Enum Isolation | Standalone commit for adding new enum values (`ALTER TYPE ... ADD VALUE`), fulfilling PostgreSQL 55P04 safety. |
| `0017_commission_and_statements.sql` | Fee Statements | Statement calculation views and platform fee reconciliation functions. |
| `0018_disputes_refunds_support.sql` | Dispute Resolution | Implements `open_dispute`, `resolve_dispute`, `admin_force_verify`, and support ticket tracking. |
| `0019_database_reconciliation_and_runtime_fixes.sql` | Runtime Bug Fixes | Fixes null pointer edge cases in RPC returns and handles edge order states. |
| `0020_database_reconciliation_and_immutability_hardening.sql` | Immutability | Enforces strict immutability on completed order records and financial ledger rows. |
| `0021_trigger_privilege_lockdown_and_search_path_fix.sql` | Search Path Hardening | Ensures all trigger functions explicitly define `SET search_path = ''`. |
| `0022_protection_triggers_and_search_path_lockdown.sql` | Column Protection | Locks system columns across `novels`, `profiles`, and `writer_profiles` against direct SQL modifications. |
| `0023_fix_sql_construct_qualification_regression.sql` | Syntax Cleanup | Removes forbidden `pg_catalog.` prefixes from SQL grammar keywords (`COALESCE`, `NULLIF`, `TRIM`, `GREATEST`, `LEAST`). |
| `0024_format_specifiers_and_privilege_lockdown.sql` | Formatting Fixes | Replaces legacy string formatting with secure `format()` specifiers in dynamic SQL. |
| `0025_commission_settlement_and_audit_hardening.sql` | Settlement Hardening | Enforces dual-sided audit logging for platform fee settlements. |
| `0026_revoke_trigger_privileges_and_default_acls.sql` | ACL Lockdown | Explicitly revokes trigger execution rights from non-superuser roles. |
| `0027_admin_novel_moderation_rls.sql` | Moderation RLS | Grants administrators full access to unpublished/draft novels within the moderation queue. |
| `0028_admin_get_invoice_rpc.sql` | Invoice RPC | Adds secure administrative RPC to fetch and compile platform fee invoice details. |
| `0029_sensitive_column_exposure_hardening.sql` | Data Privacy | Restricts public views from exposing author phone numbers, real names, or internal financial limits. |
| `0030_platform_payment_methods_admin_policy.sql` | Platform Accounts | Adds table and admin policies for platform receiving bank accounts. |
| `0031_chapter_import_and_split_rpcs.sql` | Splitter RPCs | Batch chapter ingestion RPC `batch_import_chapters` for the Chapter Splitter Wizard. |
| `0032_seed_missing_featured_genres.sql` | Taxonomy Expansion | Seeds additional contemporary Urdu literary genres (Mystery, Historical, Thriller). |
| `0033_chapter_drafts.sql` | Chapter Autosave | Adds `chapter_drafts` table with per-chapter autosave capabilities and writer isolation. |
| `0034_tips.sql` | Reader Tips | Provisions tipping infrastructure (`tips` table, 0% platform fee, daily caps, writer tip toggles). |
| `0035_rename_commission_to_platform_fee.sql` | Terminology Sync | Updates database comment metadata and views to reflect "Platform fee" naming standard. |
| `0036_site_palette_settings.sql` | Palette Presets | Adds `site_palette` column to `platform_settings` supporting Ivory & Ink, Paper & Teal, Cream & Maroon. |
| `0037_fix_db_verification_issues.sql` | Verification Patch | Resolves minor schema inconsistencies identified during full pgTAP test run. |
| `0038_api_rate_limits.sql` | Rate Limiting | Adds `api_rate_limits` table and sliding-window rate-limiting RPC. |
| `0039_add_social_links_to_platform_settings.sql` | Platform Socials | Adds social media links JSONB column to `platform_settings`. |
| `0040_email_outbox_wiring_and_support_events.sql` | Async Email Outbox | Provisions `email_outbox` table, queueing triggers, and lease-claim RPCs for background email processing. |
| `0041_data_retention_and_maintenance.sql` | Data Retention | Automated retention cleanup procedures for audit logs, rate limits, and expired drafts. |
| `0042_writer_studio_announcement.sql` | Studio Banners | Configures platform announcement banner settings for the Writer Studio. |
| `0043_admin_dashboard_analytics.sql` | Analytics Views | Adds materialized analytics functions for revenue, active readers, and novel sales velocity. |
| `0044_fix_analytics_and_retention_columns.sql` | Analytics Fixes | Adjusts column data types and grouping expressions in analytics RPCs. |
| `0045_writer_social_links.sql` | Author Socials | Adds author social media profile links (Facebook, Instagram, YouTube, Website). |
| `0046_fix_writer_profiles_rls_update.sql` | Profile Update Fix | Resolves RLS policy conflict preventing writers from updating their bio and pen name. |
| `0047_reader_watermark_toggle.sql` | Anti-Piracy Watermark | Adds platform setting toggle and user configuration for the dynamic reader watermark. |
| `0048_fix_order_verification_commission_column.sql` | Ledger Column Patch | Ensures `commission_amount` column is correctly recorded during `verify_order_payment`. |
| `0049_update_default_platform_fee_to_30_percent.sql`| Platform Fee Update | Updates `default_commission_rate` from 20.00% to **30.00%** in `platform_settings`. |
| `0050_enable_writer_tips_by_default.sql` | Default Tips | Sets `tips_enabled = true` by default for all registered writers. |
| `0051_email_outbox_lease_and_quota_retry.sql` | Outbox Resilience | Adds lease expiration tracking, retry counters, and exponential backoff to `claim_email_batch`. |
| `0052_harden_suspended_writer_and_novel_visibility.sql`| Catalog Hardening | Excludes suspended authors and novels from public views while preserving existing reader entitlements. |
| `0053_fix_novels_rls_recursion.sql` | RLS Recursion Fix | Eliminates PostgreSQL error 42P17 (infinite RLS recursion) via `SECURITY DEFINER` helper functions. |
| `0054_admin_impersonation_audit.sql` | Impersonation Audit | Adds `admin_impersonation_sessions` table and audit logging for "Login as Writer" actions. |
| `0055_fix_public_writers_zero_novels.sql` | Writer Discovery Fix | Allows approved writers with zero published novels to display their profile page. |
| `0056_delete_draft_novel.sql` | Draft Novel Deletion | Adds `delete_draft_novel` RPC (status `'draft'`, zero orders, zero entitlements) and author duplicate title guard in `create_novel`. |

### 5.2 Core Tables & Financial Immutability
- **`profiles`:** 1-to-1 extension of `auth.users` storing `role`, `display_name`, `avatar_url`, and `is_active`. Protected against self-escalation via trigger `trg_protect_profile_columns`.
- **`novels`:** Catalog metadata (English title, Urdu title, slug, cover image, status, price in PKR). Status transitions are strictly guarded by `trg_protect_novel_columns`.
- **`chapters`:** Chapter body content, chapter sequence number, free preview flag (`is_free_preview`), and word count. Word counts are calculated automatically on save.
- **`orders`:** Commercial purchase requests. Status transitions: `pending_payment` -> `payment_submitted` -> `verified` (or `rejected`, `disputed`, `cancelled`).
- **`payment_submissions`:** Reader proof record storing raw TID, virtual `normalized_tid` (stripped of hyphens and whitespace), and receipt screenshot storage path.
- **`purchase_entitlements`:** Grants perpetual access to a novel's paid chapters. Unique partial index ensures one active entitlement per reader per novel.
- **`sales_ledger`:** **Append-only immutable financial ledger.** Stores gross sale amount, author net earnings, and platform fee. Protected by trigger `trg_sales_ledger_immutable` blocking `UPDATE` and `DELETE`.
- **`audit_logs`:** Append-only security log tracking all administrative, financial, and moderation events.

### 5.3 Storage Buckets & Policies
1. **`novel-assets` (Public):**
   - Stores book cover artwork and author avatar images.
   - Size limit: **5 MB**. Allowed types: `image/webp, image/jpeg, image/png`.
   - Path convention: `{auth.uid()}/covers/{uuid}.webp`.
   - Public read access; writes restricted to folder owner.
2. **`payment-proofs` (Private):**
   - Stores sensitive bank transfer receipts and payment screenshots.
   - Size limit: **2 MB**. Allowed types: `image/webp, image/jpeg, image/png`.
   - Path convention: `{order_id}/{uuid}.webp`.
   - RLS Policy: Strictly readable only by the order's reader, the novel's author, or platform administrators via signed URLs.

---

## 6. Core Business Flows & State Machines

### 6.1 Novel Authoring, Splitting & Publication Lifecycle

```
[Draft Novel Created] ──> [Chapters Ingested/Split] ──> [Submit For Editorial Review]
                                                                  │
                                      ┌───────────────────────────┴───────────────────────────┐
                                      ▼                                                       ▼
                            [Admin Approved]                                        [Admin Rejected]
                                      │                                                       │
                                      ▼                                                       ▼
                              [Status: Published]                                     [Status: Rejected]
                         (Visible in Public Catalog)                              (Returned to Writer with Reason)
```

1. **Novel Creation:** Author calls `create_novel` RPC. Migration `0056` validates that the author does not already have an active novel with the same English or Urdu title. Initial status is `'draft'`.
2. **Manuscript Import / Splitting:** The author opens the Chapter Splitter Wizard (`/writer/novels/[id]/split`), uploads a `.docx` or `.txt` manuscript. The wizard detects chapter breaks or allows custom delimiters. Titles are auto-generated using the novel's Urdu title (e.g. `آئینہ ذات - حصہ ۱`, `آئینہ ذات - حصہ ۲`). The client sends batch slices to the `batch_import_chapters` RPC.
3. **Submission for Review:** Once all chapters are ordered and at least one chapter is marked free preview, the author clicks "Submit for Editorial Review", calling `submit_novel_for_review`. Status changes to `'under_review'`. All novel metadata and chapters are locked against further modification.
4. **Admin Moderation:** An administrator reviews the novel at `/admin/novels/[id]`. The admin completes the editorial checklist (rights verification, formatting, blurb quality) and executes `approve_novel` (status becomes `'published'`, visible in catalog) or `reject_novel` (status becomes `'rejected'` with feedback).

### 6.2 Order Placement & Payment Verification Lifecycle

```
[Reader Clicks Buy] ──> RPC: create_order ──> Status: pending_payment
                              │
                              ▼
[Reader Transfers PKR] ──> RPC: submit_payment ──> Status: payment_submitted
  (Uploads TID & Screenshot)  │
                              ▼
[Author Checks Bank App] ──> RPC: verify_order_payment
                              │
             ┌────────────────┴────────────────┐
             ▼                                 ▼
   [Payment Confirmed]               [Payment Rejected]
   Status: verified                  RPC: reject_order_payment
   - Entitlement Granted             Status: rejected
   - Sales Ledger Appended           - Reader Can Re-submit or Cancel
   - Fees Accrued                    - Reader Can Open Dispute
```

1. **Order Initiation:** Reader initiates checkout on `/checkout/[slug]`. The system calls `create_order` RPC:
   - Validates novel is published and not suspended.
   - Asserts writer has active payment methods and has not exceeded the PKR 5,000 unpaid platform fee threshold (`orders_paused = false`).
   - Asserts reader does not already own the novel.
   - Generates a unique human-readable order number (`ORD-YYYYMMDD-XXXX`). Status is set to `'pending_payment'`.
2. **Payment Submission:** Reader transfers funds via JazzCash, EasyPaisa, Raast, or Bank IBAN to the author's displayed account. Reader enters the TID and uploads the receipt screenshot at `/orders/[id]/pay`. The client calls `submit_payment` RPC:
   - Normalizes the TID (strips spaces, dashes, case).
   - Verifies TID uniqueness across recent orders to prevent replay fraud.
   - Moves order status to `'payment_submitted'`.
   - Places a notification into `email_outbox` for the author.
3. **Author Verification:** The author inspects the receipt and confirms credit in their personal bank account. The author clicks "Verify Payment" in `/writer/orders`, triggering the atomic `verify_order_payment` RPC:
   - Asserts order is currently `'payment_submitted'`.
   - Changes order status to `'verified'`.
   - Inserts row into `purchase_entitlements` (`is_revoked = false`).
   - Appends entry into `sales_ledger` (`entry_type = 'sale_verified'`, recording gross price, platform fee amount, and net writer earnings).
   - Recalculates author's accumulated unpaid platform fee balance.
   - Queues order confirmation email to the reader.

### 6.3 Dispute Resolution & Refunds
If an author rejects a valid payment or fails to verify within 48 hours, the reader can open a dispute via `open_dispute` within 30 days:
- An administrator reviews the bank receipt and author payout records at `/admin/disputes`.
- If reader is verified: Admin calls `admin_force_verify`, granting the reader entitlement, creating ledger records, and settling the dispute.
- If invalid/unpaid: Admin calls `resolve_dispute` with `resolved_for_writer`, closing the case and keeping the order rejected.
- If money was returned manually: Admin calls `record_refund_adjustment`, appending a negative balance entry into `sales_ledger` to adjust platform fee totals.

### 6.4 Platform Fee Threshold & Invoicing Flow
1. As verified orders accrue, the system tracks each author's `unpaid_commission_balance`.
2. When the balance reaches **PKR 5,000.00**, `reconcile_writer_unpaid_commission` flags `orders_paused = true`. New orders for that author's novels are blocked until settled.
3. Administrators generate a formal invoice via `generate_commission_invoice`.
4. The author transfers owed fees to the platform's bank account and reports payment.
5. The administrator confirms receipt via `confirm_commission_settlement`, resetting the author's unpaid balance, marking the invoice `'settled'`, and lifting the order pause (`orders_paused = false`).

### 6.5 Transactional Email Outbox Pipeline
To maintain sub-100ms response times and prevent email delivery failures from breaking database transactions, the system implements an **Asynchronous Database Outbox Pattern**:
1. Business RPCs insert pending email payloads into `email_outbox` (`status = 'pending'`).
2. An external scheduler or Uptime monitor pings `/api/cron/send-emails` (authenticated via `Authorization: Bearer CRON_SECRET`).
3. The endpoint invokes `claim_email_batch(batch_size, lease_seconds)`, acquiring a row-level lock on pending emails.
4. Emails are dispatched via Resend HTTP REST API.
5. Successful dispatches update `status = 'sent'`. Failed dispatches increment `retry_count` and apply exponential backoff.

---

## 7. Security Model & Invariants

### 7.1 Authentication & Edge Proxy Hardening
- Built on Supabase GoTrue Auth with server-side PKCE cookie management (`@supabase/ssr`).
- **Cookie Security:** Auth cookies are strictly **host-only** (`delete options.domain`), preventing sub-domain cookie leakage.
- **Edge Header Sanitization (`src/proxy.ts`):** Strips incoming `x-user-id` and `x-user-email` headers to prevent HTTP header spoofing.
- **Zero Client Metadata Trust:** The auth trigger `handle_new_user()` unconditionally assigns `role = 'reader'`, completely ignoring any client-provided metadata.

### 7.2 Database Privileges & RLS Policies
- Default write privileges on `public` schema are revoked from `anon` and `PUBLIC`.
- Direct table `INSERT`, `UPDATE`, and `DELETE` on financial tables (`orders`, `payment_submissions`, `sales_ledger`, `purchase_entitlements`, `commission_invoices`) are strictly blocked for client roles. All mutations must occur via `SECURITY DEFINER` RPCs.
- `sales_ledger` and `audit_logs` are protected by database triggers that unconditionally raise exceptions on any `UPDATE` or `DELETE` attempt.
- Chapter content (`chapters.content`) is protected by RLS:
  - If `is_free_preview = true`, content is visible to everyone.
  - If `is_free_preview = false`, content is returned **only** if the requesting user is the novel's author, a platform admin, or holds a non-revoked row in `purchase_entitlements`.

### 7.3 Reader Anti-Piracy Watermarking
The novel reading interface (`/read/[novelId]/[chapterNumber]`) features an unobtrusive, dynamic anti-piracy watermark:
- Injects a semi-transparent repeating canvas layer containing the reader's unique identifier and timestamp across the text container.
- Discourages screenshot sharing and unauthorized PDF re-distribution.
- Governed by a platform settings toggle (`watermark_enabled`).

### 7.4 Input Sanitization & File Upload Guards
- **TID Normalization:** Domestic transaction IDs are normalized (`UPPER(REGEXP_REPLACE(tid, '[^A-Za-z0-9]', ''))`) to prevent duplicate submission fraud using varying punctuation.
- **Storage Path Validation:** RLS policies on `payment-proofs` strictly enforce that files can only be uploaded into `{order_id}/...` by the order owner while the order is in `pending_payment` or `rejected` status.
- **File Type & Size Restrictions:** File uploads are limited to 2 MB for payment screenshots and 5 MB for covers, with strict MIME type enforcement (`image/webp, image/jpeg, image/png`).

---

## 8. Deployment & Cloudflare OpenNext Architecture

### 8.1 Cloudflare Worker Architecture
UNB Premium is deployed to **Cloudflare Workers** using `@opennextjs/cloudflare` (`1.20.14`). The application runs on the V8-based `workerd` runtime, providing low-latency edge delivery across global Points of Presence (PoPs).

- **Entry Point:** `.open-next/worker.js`
- **Compatibility Date:** `2024-12-30` (with `nodejs_compat` enabled)
- **Static Assets:** `.open-next/assets` bound via Cloudflare Workers Assets (`binding = "ASSETS"`)
- **Incremental Cache (ISR/Fetch Cache):** Backed by Cloudflare R2 bucket (`unb-premium-cache`). R2 provides multi-region consistency with 1,000,000 free Class A writes per month, avoiding KV write throttling.
- **Tag Cache (`revalidateTag` / `revalidatePath`):** Backed by Cloudflare D1 SQL database (`unb-premium-tag-cache`, ID `ab3532e1-c979-43ad-999a-bb7bbaa5a34d`).
- **Cache Interception:** Explicitly disabled in `open-next.config.ts` (`enableCacheInterception: false`) to ensure deterministic edge streaming.

### 8.2 The Tailwind CSS v4 / Turbopack Compilation Invariant
During recent repository maintenance, an emergency styling defect occurred when `"build": "next build --webpack"` was attempted:
- **Root Cause:** Tailwind CSS v4 in this repository is configured via the `@tailwindcss/turbopack` compiler. Because no PostCSS Tailwind plugin was configured for Webpack, running Webpack bypassed the Tailwind engine, emitting raw `@layer utilities { @tailwind utilities; }` (35 KB) without compiling any utility classes. This caused `premium.urdunovelbanks.com` to render unstyled HTML with oversized SVGs.
- **The Rule:** The production build command MUST remain `"build": "next build"` (Turbopack). Turbopack compiles the full 144.8 KB stylesheet into `.open-next/assets/_next/static/chunks/` with all utility classes (`.flex`, `.grid`, `.items-center`, `.w-*`, etc.).

### 8.3 Environment Variables & Secrets Reference

| Variable Name | Exposure | Required Environment | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Server | All | Supabase project REST URL (`https://<id>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Server | All | Supabase anonymous public API key. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server Only (SECRET)** | Production / Staging | Supabase administrative service role key. Configured via `wrangler secret put`. Never exposed to client. |
| `NEXT_PUBLIC_APP_URL` | Client & Server | All | Canonical application base URL (`https://premium.urdunovelbanks.com`). |
| `CRON_SECRET` | **Server Only (SECRET)** | Production / Staging | 32+ character bearer token used to authenticate scheduled background cron routes. |
| `EMAIL_PROVIDER` | Server Only | Production / Staging | Email dispatch provider (`resend`). |
| `RESEND_API_KEY` | **Server Only (SECRET)** | Production / Staging | API key from Resend for transactional email delivery. |
| `EMAIL_FROM` | Server Only | All | Default sender email header (e.g. `UNB Premium <noreply@urdunovelbanks.com>`). |

---

## 9. Quality Gates & Automated Test Suites

All quality gates, linters, TypeScript compilers, and test runners were executed and verified on `2026-11-18`.

### 9.1 NPM Scripts Execution Audit

| Quality Script | Command | Result | Output Summary / Findings |
| :--- | :--- | :--- | :--- |
| **SQL Syntax Check** | `npm run check:sql` | **PASS (Code 0)** | Scanned 86 SQL files (migrations 0023+ and tests). 0 forbidden `pg_catalog.<keyword>` qualifications found. |
| **Terminology Gate** | `npm run check:terms` | **PASS (Code 0)** | Scanned `src/` and new migrations. 0 forbidden user-facing occurrences of "commission" or "کمیشن". |
| **Design Tokens** | `npm run check:colors` | **PASS (Code 0)** | Scanned all components. 0 forbidden hardcoded Tailwind palette classes; 100% semantic token compliance. |
| **WCAG Contrast** | `npm run check:contrast`| **PASS (Code 0)** | Evaluated all color pairings across Ivory & Ink, Paper & Teal, Cream & Maroon. All meet WCAG AA (4.5:1 / 3:1). |
| **Hyperlink Crawler** | `npm run check:links` | **PASS (Code 0)** | Scanned 92 routes across 305 files. 0 dead links, 0 invalid internal route targets. |
| **Frontend Queries** | `npm run check:frontend`| **PASS (Code 0)** | Validated PostgREST query syntax and error-handling patterns across 305 files. Zero unhandled errors. |
| **SEO Metadata** | `npm run check:seo` | **PASS (Code 0)** | Evaluated 126 route checks. 100% compliant OpenGraph, Twitter, and canonical metadata tags. |
| **TypeScript Compiler**| `npx tsc --noEmit` | **PASS (Code 0)** | Zero type errors across the entire codebase. |
| **Unit & Integration**| `npm test` | **PASS (Code 0)** | **618 passing tests** across 176 test suites in 3.46 seconds. |
| **Next.js Production** | `npm run build` | **PASS (Code 0)** | Turbopack compiled all 66 static and dynamic routes cleanly. |
| **Cloudflare Worker** | `npm run build:worker` | **PASS (Code 0)** | OpenNext Cloudflare bundle created in `.open-next/worker.js` with full 144.8 KB compiled CSS stylesheet. |
| **ESLint** | `npm run lint` | **FAIL (25 errors)** | React 19 strict rule `react-hooks/set-state-in-effect` and `@typescript-eslint/no-explicit-any` in tests (See Section 11). |

### 9.2 SQL Test Suites (`supabase/tests/`)
The repository contains **28 comprehensive SQL test suites** executed via the Supabase SQL Editor:
- `00_post_migration_verification.sql`: Verifies schema objects, function signatures, and search paths.
- `01_security_and_financial_hardening_tests.sql`: Validates append-only triggers and RPC boundaries.
- `02_order_flow_fixes_tests.sql`: Tests order state machine and payment submissions.
- `03_dispute_and_writer_status_tests.sql`: Validates 30-day dispute windows and writer reapplication rules.
- `04_writer_content_tests.sql`: Tests chapter word counting, publication locking, and slug generation.
- `05_admin_controls_tests.sql`: Tests administrative novel suspensions, taxonomy rules, and fee overrides.
- `06_public_catalog_tests.sql`: Tests security barrier views and catalog visibility.
- `07_min_price_tests.sql`: Verifies PKR 50 minimum price enforcement.
- `08_checkout_tests.sql`: Validates open order concurrency limits and duplicate TID prevention.
- `09_reader_access_tests.sql`: Tests RLS chapter content unlocking.
- `10_commission_tests.sql`: Verifies platform fee calculation math and statements.
- `11_disputes_refunds_tests.sql`: Tests force-verification and refund adjustment ledger entries.
- `12_runtime_smoke.sql`: 15-step end-to-end transactional runtime smoke test.
- `13_client_attack_matrix.sql`: 46-vector client privilege escalation attack test.
- `14_admin_read_access.sql`: Validates multi-tenant isolation of administrative views.
- `15_rpc_signature_check.sql` & `16_frontend_columns_check.sql`: Interface synchronization checks.
- `17_sensitive_column_exposure.sql`: Asserts zero leakage of private writer contact info.
- `18_chapter_split_tests.sql`: Tests chapter splitting and batch ingestion security.
- `19_chapter_drafts_tests.sql`: Tests chapter autosave concurrency and RLS isolation.
- `20_tips_tests.sql`: Tests reader appreciation tip limits, isolation, and 0% platform fee rule.
- `21_site_palette_tests.sql`: Tests administrative site palette updates and previews.
- `22_email_outbox_lease_and_quota_tests.sql`: Tests outbox lease-locking and retry backoff.
- `23_suspended_visibility_tests.sql`: Tests exclusion of suspended authors from catalog.
- `24_admin_impersonation_tests.sql`: Tests support impersonation tokens and audit logging.
- `25_public_writers_zero_novels_tests.sql`: Tests visibility of approved writers prior to first release.
- `26_delete_draft_novel_tests.sql`: Tests draft novel deletion invariants and duplicate title guards.

---

## 10. Current State of Features

### 10.1 Completed & Production-Ready
- **End-to-End Direct Payment Marketplace:** Complete order creation, domestic payment submission (JazzCash, EasyPaisa, Raast, Bank IBAN), proof screenshot uploads, and author verification.
- **Content Protection & Reading Experience:** Distraction-free Nastaliq Urdu reader with custom fonts (Gulzar, Plus Jakarta Sans), 3 reading themes (Light, Sepia, Dark), reading progress synchronization, and dynamic anti-piracy watermarking.
- **Writer Studio & Manuscript Ingestion:** Book creation, chapter editor with autosaving drafts, and the **Writer-Controlled Chapter Splitter** (batch import from `.docx` and `.txt` with Urdu numbering).
- **Financial Ledger & Platform Fee Engine:** Append-only sales ledger, automatic platform fee accrual (default 30%), custom writer fee terms, PKR 5,000 credit limit enforcement with automatic order pausing, and invoice generation.
- **Administrative Governance:** Moderation queues for novels and writer applications, dispute resolution desk, taxonomy governance, user role management, site palette presets, studio announcement banners, and audited support impersonation ("Login as Writer").
- **Stateless Supabase Keep-Alive:** Dedicated `/api/health` endpoint optimized for free Uptime monitors (UptimeRobot / cron-job.org) to prevent Supabase Free Tier auto-pauses.
- **Design Tokens & Typography:** Universal light aesthetic with 3 switchable palettes (Ivory & Ink, Paper & Teal, Cream & Maroon) fully compliant with WCAG AA contrast standards.

### 10.2 Partially Built / Requires Production Automation
- **Background Cron Dispatch:** The routes `/api/cron/send-emails` and `/api/cron/reminders` are fully implemented and tested, but require an external cron scheduler (such as Cloudflare Cron Triggers or an external uptime monitor with Bearer authorization) to trigger them periodically.
- **Cloudflare Turnstile Bot Protection:** Rate-limiting tables exist in Supabase (`api_rate_limits`), but Cloudflare Turnstile CAPTCHA integration on registration and login forms is currently flagged as a TODO in `docs/MANUAL_SETUP_CHECKLIST.md`.

---

## 11. Known Issues & Technical Debt

1. **React 19 ESLint Hook Warnings (`npm run lint`):**
   - *Issue:* React 19's ESLint plugin strictly forbids `react-hooks/set-state-in-effect` (syncing initial props into state inside `useEffect`).
   - *Impact:* Flags 25 errors and 20 warnings across components such as `NovelListClient.tsx`, `ChapterListManager.tsx`, `login-form.tsx`, and `SubmitReviewModal.tsx`.
   - *Remediation:* Refactor these components to derive state directly or use React keys to reset component instances when props change.
2. **Terminology Split (DB vs UI):**
   - *Issue:* The database schema, RPC functions, and TypeScript types use `commission` (`sales_ledger.commission_amount`, `default_commission_rate`, `/writer/commission`), while all UI text strictly uses `Platform fee` (`پلیٹ فارم فیس`).
   - *Impact:* Developers must remember to never use the word "commission" in user-facing UI copy while continuing to use it for database queries and RPC parameters.
3. **Migration Sequence Anomaly (`0017` / `0017_a`):**
   - *Issue:* Two files share the sequence prefix 17: `0017_a_commission_enum_values.sql` and `0017_commission_and_statements.sql`.
   - *Reason:* PostgreSQL strictly requires new enum values added via `ALTER TYPE ... ADD VALUE` to be committed in an isolated transaction before they can be referenced in views or tables (Error 55P04).
4. **Next.js CLI Security Advisory Interruption:**
   - *Issue:* Running `next build` on Next.js 16.4.2 intermittently exits with code 1 on the first attempt displaying a security notice (`next upgrade --agent=security`). Retrying the command immediately succeeds with code 0.
   - *Impact:* CI scripts may need retry logic or an upgrade to the latest patch release.

---

## 12. Manual Operational Checklist for the Owner

The repository owner must ensure the following manual steps are executed in the respective external dashboards:

### 12.1 Supabase PostgreSQL Setup
1. **Execute Migrations:** In the **Supabase Dashboard -> SQL Editor**, execute all migrations sequentially from `0001` through `0056`.
2. **Bootstrap Platform Administrator:** After creating an account via the application UI, execute:
   ```sql
   UPDATE public.profiles
   SET role = 'admin'
   WHERE email = 'your-admin-email@unbpremium.pk';
   ```
3. **Verify Storage Buckets:**
   - `payment-proofs`: Must be **Private**, max size 2 MB, allowed MIME types `image/webp, image/jpeg, image/png`.
   - `novel-assets`: Must be **Public**, max size 5 MB, allowed MIME types `image/webp, image/jpeg, image/png`.
4. **Configure Auth Redirect URLs:**
   - Add `https://premium.urdunovelbanks.com/auth/callback` and `https://premium.urdunovelbanks.com/reset-password` to the Supabase Auth allowlist.

### 12.2 Cloudflare Workers & Bindings Setup
1. **Provision R2 Bucket:** Create bucket `unb-premium-cache` in Cloudflare R2 and verify binding in `wrangler.jsonc`.
2. **Provision D1 Database:** Confirm D1 database `unb-premium-tag-cache` (ID `ab3532e1-c979-43ad-999a-bb7bbaa5a34d`) is active.
3. **Set Worker Secrets:** Run in terminal via Wrangler:
   ```bash
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put CRON_SECRET
   wrangler secret put RESEND_API_KEY
   ```

### 12.3 Supabase Free Tier Keep-Alive Monitor
To prevent Supabase from automatically pausing the project after 7 days of inactivity:
1. Create a free HTTP monitor at [UptimeRobot.com](https://uptimerobot.com) or [cron-job.org](https://cron-job.org).
2. Set URL to: `https://premium.urdunovelbanks.com/api/health`
3. Set interval to: **5 minutes** (or 10 minutes).
4. Set method to: `HEAD` or `GET`.

---

## 13. Recommended Next 10 Engineering Tasks

1. **Configure Cloudflare Worker Cron Trigger for Email Outbox:**
   - *Rationale:* Replace external cron reliance by adding a native `triggers: { crons: ["*/2 * * * *"] }` block to `wrangler.jsonc` that dispatches pending emails in `email_outbox` every 2 minutes.
2. **Resolve React 19 ESLint `react-hooks/set-state-in-effect` Warnings:**
   - *Rationale:* Clean up the 25 ESLint errors in client components to restore a clean, zero-warning `npm run lint` CI gate.
3. **Integrate Cloudflare Turnstile Bot Protection:**
   - *Rationale:* Protect public registration and login forms against automated credential stuffing and bot registrations.
4. **Automate Scheduled Platform Fee Reminder Notifications:**
   - *Rationale:* Schedule `/api/cron/reminders` to alert authors whose unpaid platform fee balance is approaching the PKR 5,000 pause threshold.
5. **Optimize Chapter Reading Cache Invalidation:**
   - *Rationale:* Refine Next.js `revalidateTag` calls when an author edits a published chapter so readers see updates instantly without clearing unrelated novel caches.
6. **Implement Author Payout QR Codes:**
   - *Rationale:* Allow authors to upload their Raast / JazzCash QR codes in the Writer Studio to streamline the checkout process for mobile readers.
7. **Add Automated PDF/EPUB Export for Authors:**
   - *Rationale:* Enable authors to download formatted backups of their own manuscripts directly from the Writer Studio.
8. **Expand Reader Progress Analytics for Authors:**
   - *Rationale:* Provide authors with chapter drop-off charts and average reading time metrics based on `reader_progress` data.
9. **Upgrade Next.js Patch Release:**
   - *Rationale:* Upgrade Next.js from `16.4.2` to the latest patch version to clear the CLI security advisory notice during builds.
10. **Implement Multi-Currency Display for Overseas Readers:**
    - *Rationale:* Display estimated USD/AED/GBP conversions alongside PKR prices to assist the substantial Pakistani diaspora reading Urdu fiction abroad.

---

## 14. Git Secret Scan Findings

A comprehensive security audit of the repository's git commit history (`267 commits` on `main`) was performed using `git log` and regex pattern scanning for API keys, private credentials, and sensitive tokens.

### 14.1 Scan Results Summary
- **Accidental Key Leaks:** **ZERO (0)** production secrets, active Supabase service role keys, Resend API tokens, or private certificates were committed to the repository history.
- **Environment Configuration:** All live API credentials are systematically injected via runtime environment variables or Cloudflare Worker Secrets (`wrangler secret put`).
- **Committed Files Checked:**
  - `.env.example`: Contains only sanitized placeholder strings (`your-project-id`, `re_dummy_...`, `32-char-random-secret`).
  - `wrangler.jsonc`: Exposes only public configuration keys (`EMAIL_PROVIDER="resend"`, public sender header, and resource binding names). No secret keys are stored in version control.
  - Test suites (`tests/`): Unit test fixtures use mock strings (e.g. `re_dummy_test_key_for_testing_only`) with network calls mocked via Vitest spies.

---
*End of Project Handoff Document. Authored by the Lead Engineering Team for UNB Premium.*
