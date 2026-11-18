# UNB Premium (`یو این بی پریمیم`)

A modern, high-performance digital publishing platform and reader-to-writer commercial marketplace engineered specifically for serialized and standalone Urdu fiction (Novels, Novelettes, Afsanay, and Episodic Series).

Built with a zero-custody, direct-to-creator payment model supporting Pakistani domestic payment rails (**JazzCash**, **EasyPaisa**, **Raast**, and **Direct Bank Transfer / IBAN**), paired with a distraction-free Nastaliq Urdu reading engine featuring anti-piracy dynamic watermarks.

---

## Key Documentation

For in-depth architecture, setup guides, and development standards, please refer to:

- **[Project Handoff (`docs/PROJECT_HANDOFF.md`)](./docs/PROJECT_HANDOFF.md)**: The authoritative lead engineering handoff document covering the complete product summary, technical stack, folder map, route access controls, database schema (migrations `0001`–`0056`), business state machines, security model, Cloudflare OpenNext deployment, quality gates, and recommended engineering tasks.
- **[Repository Architecture & Coding Invariants (`AGENTS.md`)](./AGENTS.md)**: Repository guidelines, strict design token discipline, forbidden terminology invariants ("Platform fee" vs internal "commission"), PostgREST embed rules, and pre-commit gates.
- **[Manual Setup Checklist (`docs/MANUAL_SETUP_CHECKLIST.md`)](./docs/MANUAL_SETUP_CHECKLIST.md)**: Step-by-step instructions for running Supabase migrations, provisioning storage buckets (`payment-proofs`, `novel-assets`), bootstrapping platform administrators, configuring secrets, and setting up the UptimeRobot keep-alive monitor.
- **[Terminology Guidelines (`docs/TERMINOLOGY.md`)](./docs/TERMINOLOGY.md)**: Complete mapping of user-facing terminology ("Platform fee" / "پلیٹ فارم فیس") vs internal database identifiers.

---

## Tech Stack & Architecture

- **Framework**: Next.js 16.4.2 (App Router, Server Components & Server Actions)
- **UI & Components**: React 19.3.0, Tailwind CSS v4 (`@tailwindcss/turbopack`), Lucide React
- **Database & Auth**: Supabase PostgreSQL 15+ (`@supabase/ssr`, `@supabase/supabase-js`) with strict Row-Level Security (RLS) and atomic `SECURITY DEFINER` RPCs
- **Edge Deployment**: Cloudflare Workers via `@opennextjs/cloudflare` with Cloudflare R2 incremental cache and Cloudflare D1 tag cache
- **Typography**: Gulzar Nastaliq, Plus Jakarta Sans, Cormorant Garamond, Amiri
- **Production URL**: `https://premium.urdunovelbanks.com`

---

## Getting Started

### 1. Prerequisites
- Node.js 20+ (LTS recommended)
- A Supabase project with PostgreSQL 15+
- Cloudflare account with Workers, R2, and D1 enabled (for production deployment)

### 2. Installation
```bash
git clone https://github.com/your-org/urdu-fiction-marketplace.git
cd urdu-fiction-marketplace
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local` and populate the required Supabase and service keys:
```bash
cp .env.example .env.local
```

### 4. Local Development
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## Quality Gates & Verification

Before submitting pull requests or deploying, ensure all quality gates pass:

```bash
# Verify SQL syntax and prevent forbidden catalog qualifications
npm run check:sql

# Verify user-facing terminology (asserts zero forbidden "commission" copy)
npm run check:terms

# Verify semantic design token discipline (asserts zero hardcoded Tailwind colors)
npm run check:colors

# Verify WCAG AA contrast compliance across all 3 color palettes
npm run check:contrast

# Verify zero dead hyperlinks across all routes
npm run check:links

# Verify PostgREST frontend query syntax and error handling
npm run check:frontend

# Verify SEO metadata, Twitter cards, and OpenGraph schemas
npm run check:seo

# Run unit and integration tests (618 passing tests)
npm test

# Verify production build with Turbopack
npm run build
```

---
*UNB Premium (`یو این بی پریمیم`) — Crafted for the preservation and flourishing of modern Urdu literature.*
