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
   - **PostgreSQL Enum Additions Invariant**: Any new enum value added via `ALTER TYPE ... ADD VALUE` MUST be isolated into its own preceding migration file (e.g. `0017_a_commission_enum_values.sql`). NEVER add and use an enum value in the same file or transaction. PostgreSQL (Error 55P04) strictly requires new enum values to be committed in a standalone transaction before they can be referenced in tables, columns, RPCs, views, or policies.
   - **SQL Syntax Construct Qualification Invariant** (CRITICAL — enforced by `npm run check:sql`):
     SQL syntax constructs and special keyword values **MUST NEVER** be schema-qualified with `pg_catalog.`. The following are NOT functions — they are SQL grammar keywords resolved by the parser, not by catalog lookup. Writing `pg_catalog.<name>` for these causes plpgsql_check AST errors at parse time:
     - **FORBIDDEN** (write unqualified): `coalesce`, `nullif`, `greatest`, `least`, `trim` (keyword form), `extract`, `overlay`, `position`, `cast`, `current_user`, `session_user`, `current_date`, `current_time`, `current_timestamp`, `localtime`, `localtimestamp`, `user`
     - **ALLOWED** (keep `pg_catalog.` qualification — these ARE real catalog functions): `pg_catalog.now()`, `pg_catalog.btrim()`, `pg_catalog.ltrim()`, `pg_catalog.rtrim()`, `pg_catalog.count()`, `pg_catalog.sum()`, `pg_catalog.max()`, `pg_catalog.min()`, `pg_catalog.round()`, `pg_catalog.to_char()`, `pg_catalog.upper()`, `pg_catalog.lower()`, `pg_catalog.length()`, `pg_catalog.substring()`, `pg_catalog.replace()`, `pg_catalog.substr()`, `pg_catalog.jsonb_*()`, `pg_catalog.date_part()`, `pg_catalog.age()`, `pg_catalog.date_trunc()`
     - **PRE-COMMIT / CI GATE**: Before committing any `.sql` file, run `npm run check:sql`. This script (`scripts/check-sql-syntax-constructs.mjs`) scans all new migrations (0023+) and test files and exits non-zero if any forbidden `pg_catalog.<construct>` qualification is found. Applied migrations (0001-0022) are excluded from the scan because they cannot be changed without a new migration.
2. **Database Types (`src/types/database.ts`)**:
   - Strict TypeScript interfaces and types mirroring every PostgreSQL table, enum, view, and RPC function payload.
3. **Manual Setup Documentation (`docs/MANUAL_SETUP_CHECKLIST.md`)**:
   - Maintain a step-by-step checklist instructing the developer on which SQL scripts to run, environment variables to populate, and Supabase dashboard settings to configure.
4. **Environment Variables Template (`.env.example`)**:
   - Keep `.env.example` strictly synchronized with all required environment keys. Never store secrets in git.
5. **Frontend PostgREST Queries & Error Handling Rules (`npm run check:frontend`)**:
   - **PostgREST Embed Syntax**: Never use foreign-key column names as embed targets (e.g. `writer_profiles:writer_id`, `profiles:actor_id`, `genre:genre_id` will fail with PGRST200). In PostgREST, syntax is `target_table!fk_column(...)` or `alias:target_table!fk_column(...)`. If no foreign key exists or relationships cross views, execute two sequential queries or create a `SECURITY DEFINER` RPC.
   - **Zero Silent 404s & Error Handling**: Never destructure only `{ data }` from a Supabase query without handling `error`. Never turn query errors into silent empty lists (`data ?? []`) or 404s (`if (error || !data) notFound()`). Always log query errors via `console.error` (including error code and message) and render an explicit error UI banner. Call `notFound()` strictly when there is zero error and zero row returned.
   - **Safe Single-Row Queries**: Avoid `.single()` on queries where zero rows can legitimately exist (PGRST116). Use `.maybeSingle()` combined with `unwrapSingleQuery` from `@/lib/supabase/query`. Run `npm run check:frontend` to verify all queries across `src/`.
6. **User-Facing Terminology Invariant (`npm run check:terms`)**:
   - The word "commission" (and Urdu "کمیشن") must NEVER appear anywhere a human can read it. All user-visible labels, headings, toasts, errors, placeholders, badges, legal pages, emails, and notifications must use **"Platform fee"** (Urdu: **پلیٹ فارم فیس** with feminine grammatical agreement) or "Fees: None" on checkout order summaries.
   - Internal database objects, columns, enums, RPC function signatures, RPC return JSON keys, TypeScript identifiers, and route URLs (`/writer/commission`, `/admin/commission`) remain strictly unchanged. Refer to `docs/TERMINOLOGY.md` for the complete mapping.
   - **PRE-COMMIT / CI GATE**: Run `npm run check:terms`. This script (`scripts/check-terminology.mjs`) scans `src/` and new migrations (`0035+`) and exits non-zero if any forbidden user-facing terminology is introduced.
7. **Semantic Design Tokens & Color Discipline (`npm run check:colors` & `npm run check:contrast`)**:
   - **Unified Light Theme & Semantic Tokens**: All UI across Marketplace, Writer Studio, and Admin MUST use ONE shared set of semantic tokens mapped from CSS variables (`src/styles/tokens.css`, `src/app/globals.css`). Arbitrary hex colors (`bg-[#...]`) and hard-coded Tailwind palette colors (`bg-slate-*`, `text-gray-*`, `border-stone-*`, etc.) are strictly forbidden in `src/`.
   - **Allow-list**: Hard-coded colors are permitted ONLY in `src/lib/email/*` (for email client compatibility), `src/styles/tokens.css` (token definitions), `src/app/globals.css` (Tailwind theme mapping), `src/app/read/*` & `FreePreviewReaderClient.tsx` (reader preference tokens: light, sepia, dark), and book cover placeholder gradients.
   - **Palettes**: Three selectable palettes via `data-palette` on `<html>`:
     - Palette A ("Ivory & Ink", Default)
     - Palette B ("Paper & Teal")
     - Palette C ("Cream & Maroon")
   - **Role Accents**: Applied via `data-area` attributes on shells (`data-area="marketplace"`, `data-area="studio"`, `data-area="admin"`), NOT duplicated across components.
   - **Text Hierarchy & Contrast**: Gold (`accent`) is strictly restricted to borders, icons, fills, and large headings. Text and links MUST use `accent-strong`. Status badges use soft tints with strong text of the same hue.
   - **PRE-COMMIT / CI GATES**:
     - `npm run check:contrast`: Verifies that all defined pairings across all 3 palettes meet or exceed WCAG AA (4.5:1 for normal text, 3:1 for large/UI).
     - `npm run check:colors`: Scans `src/` to ensure zero disallowed hard-coded Tailwind color classes or arbitrary hex values exist outside the allow-list.

## CORE BUSINESS & ARCHITECTURAL INVARIANTS
1. **Payment Model**: Direct reader-to-writer payment via Pakistani rails (JazzCash, EasyPaisa, Raast, Direct Bank Transfer). No automated gateways (no Stripe, PayPal, etc.).
2. **Entitlement & Verification**: Readers submit Transaction Reference (TID) + screenshot. Only after writer verifies the bank deposit does the system grant novel access.
3. **Financial Ledger**: Sales and platform fee accruals are written to an append-only, immutable `sales_ledger`. Platform fee (default 20%, tracked internally as `commission`) is calculated automatically and tracked against the writer's unpaid platform fee threshold (PKR 5,000). Direct table mutations from client applications are forbidden; all state changes occur via atomic `SECURITY DEFINER` RPCs.
4. **Content Security**: Chapter contents (`chapters`) are protected by Row-Level Security (RLS). Paid chapters are strictly accessible only by the author, admins, or readers with a valid row in `purchase_entitlements`.
5. **Urdu Nastaliq Rendering**: First-class RTL Urdu rendering with `font-urdu` and safe line-heights (`leading-[2.2]`+) to avoid clipping calligraphy ascenders and descenders.
