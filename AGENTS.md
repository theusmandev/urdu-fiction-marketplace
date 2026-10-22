<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# UNB PREMIUM — REPOSITORY ARCHITECTURE & CODING RULES

## STRICT REPOSITORY ORGANIZATION RULES (ENFORCE ACROSS ALL STEPS)
1. **Supabase Migrations (`supabase/migrations/`)**:
   - All SQL schema changes, functions, triggers, and RLS policies MUST be written as numbered, sequential, idempotent SQL files:
     - `0001_enums_and_core_tables.sql`
     - `0002_orders_and_financial_ledger.sql`
     - `0003_triggers_and_rpc_functions.sql`
     - `0004_rls_policies.sql`
     - `0005_seed_genres_and_settings.sql`
   - Migrations are executed manually by developers in the Supabase SQL Editor. Every statement must be idempotent (`CREATE TABLE IF NOT EXISTS`, `DO $$ BEGIN ... END $$`, etc.).
2. **Database Types (`src/types/database.ts`)**:
   - Strict TypeScript interfaces and types mirroring every PostgreSQL table, enum, view, and RPC function payload.
3. **Manual Setup Documentation (`docs/MANUAL_SETUP_CHECKLIST.md`)**:
   - Maintain a step-by-step checklist instructing the developer on which SQL scripts to run, environment variables to populate, and Supabase dashboard settings to configure.
4. **Environment Variables Template (`.env.example`)**:
   - Keep `.env.example` strictly synchronized with all required environment keys. Never store secrets in git.

## CORE BUSINESS & ARCHITECTURAL INVARIANTS
1. **Payment Model**: Direct reader-to-writer payment via Pakistani rails (JazzCash, EasyPaisa, Raast, Direct Bank Transfer). No automated gateways (no Stripe, PayPal, etc.).
2. **Entitlement & Verification**: Readers submit Transaction Reference (TID) + screenshot. Only after writer verifies the bank deposit does the system grant novel access.
3. **Financial Ledger**: Sales and commission accruals are written to an append-only, immutable `sales_ledger`. Platform commission (default 20%) is calculated automatically and tracked against the writer's unpaid commission threshold (PKR 5,000). Direct table mutations from client applications are forbidden; all state changes occur via atomic `SECURITY DEFINER` RPCs.
4. **Content Security**: Chapter contents (`chapters`) are protected by Row-Level Security (RLS). Paid chapters are strictly accessible only by the author, admins, or readers with a valid row in `purchase_entitlements`.
5. **Urdu Nastaliq Rendering**: First-class RTL Urdu rendering with `font-urdu` and safe line-heights (`leading-[2.2]`+) to avoid clipping calligraphy ascenders and descenders.
