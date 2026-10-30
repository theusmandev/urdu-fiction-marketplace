# Cloudflare Workers Deployment Guide (OpenNext)

This guide provides a complete, step-by-step walkthrough for deploying UNB Premium to **Cloudflare Workers** using the official `@opennextjs/cloudflare` adapter. It is written for non-experts and assumes zero manual terminal access on the production server.

---

## 1. Executive Summary & Free vs Paid Plan Verdict

### Official Workers Platform Limits
*Source: [Cloudflare Workers Limits Documentation](https://developers.cloudflare.com/workers/platform/limits/) (Verified October 2026)*

| Limit / Metric | Workers Free Tier | Workers Paid Tier ($5/mo) | UNB Premium Status |
| :--- | :--- | :--- | :--- |
| **Worker Script Size** | **64 MiB** (uncompressed) | **64 MiB** (uncompressed) | **Fits Free** (43.77 MiB uncompressed server code, 15.58 MiB upload total). *Note: Cloudflare removed the legacy 3 MiB / 10 MiB compressed limits.* |
| **CPU Time per Request** | **10 ms** | **30,000 ms** (30s) / 5 min max | ⚠️ **Needs Paid for Production**. Dynamic Next.js SSR / React rendering can spike to 15–35 ms on isolate cold starts. |
| **Subrequests per Request** | **50** | **10,000+** | **Fits Free** (highest route `/admin` makes ~22 subrequests; user routes make 2–7). |
| **Daily Request Volume** | **100,000 requests/day** | **10,000,000 requests/month** (+\$0.30/M) | **Can test on Free**, needs Paid once traffic scales. |
| **Memory per Isolate** | **128 MB** | **128 MB** | **Fits Free** |
| **Incremental Cache** | Cloudflare R2 (10 GB free) | Cloudflare R2 | **Fits Free** (1M free Class A writes/mo vs KV's 1k/day). |
| **Tag Cache (Revalidation)**| Cloudflare D1 (5M reads/day) | Cloudflare D1 or Durable Objects | **Fits Free** (D1 is included on Free tier). |

### Verdict: "Needs Paid for Production, Can Test on Free"
> [!IMPORTANT]
> **Can Test on Free**: You can safely deploy and test staging, proofs of concept, and low-traffic previews on the Workers Free plan.
> **Needs Paid for Production**: For live production with paying Pakistani readers, you **must upgrade to Workers Paid ($5/month)**. The **10 ms CPU time limit** on the Free tier will intermittently cause `Error 1102: Worker exceeded CPU limit` during complex server renders (e.g. large Urdu novel chapters in the reader or admin dashboards). Upgrading to Paid eliminates this cap entirely (raising it to 30,000 ms).

---

## 2. Real Build Measurements & Bundle Analysis

From our actual adapter build (`npx opennextjs-cloudflare build`):

* **Total Upload**: `15,584.93 KiB` (~15.2 MiB uncompressed)
* **Gzip Upload**: `3,077.83 KiB` (~3.0 MiB compressed)
* **Uncompressed Server Worker Code**: `43.77 MiB` (comfortably below the 64 MiB limit)

### Top 15 Biggest Dependencies / Components in the Bundle
*(Extracted via meta-file analysis of `.open-next/server-functions/default/handler.mjs.meta.json`)*:
1. **`application-src` (All compiled routes, components & server logic)**: 6,230.4 KB (6.08 MB)
2. **`next` (Next.js server runtime & manifest loaders)**: 3,191.9 KB (3.12 MB)
3. **`@supabase/supabase-js` (PostgREST, Auth & Storage SDK)**: 411.8 KB
4. **`react-dom` (React Edge/Server renderer)**: 295.3 KB
5. **`zod` (Form & RPC schema validation)**: 212.3 KB
6. **`lucide-react` (Feather/Lucide icons)**: 67.4 KB
7. **`react` (Core library)**: 19.0 KB
8. **`styled-jsx`**: 18.5 KB
9. **`tailwind-merge` & `clsx`**: 8.2 KB
10. **`@opennextjs/cloudflare` runtime bridges**: 7.5 KB
11. **`@swc/helpers`**: 1.4 KB
12. **`@supabase/ssr` cookie helpers**: 1.1 KB
13. **Shims (`throw.js`, `env.js`, `empty.js`)**: 0.4 KB
14. **`client-only`**: 0.1 KB
15. **OpenNext asset resolver**: 0.1 KB

### Bundle Optimization Actions Implemented
1. **Dynamic `mammoth` Import**: Word document parser (`mammoth`) is dynamically imported only inside `extractTextFromBuffer()` when `.docx` uploads occur, preventing its AST parser from bloating the main worker bundle.
2. **Dynamic `browser-image-compression` Import**: Client-side canvas compression is loaded on demand.
3. **Removed `nodemailer`**: Replaced raw TCP socket SMTP with native HTTP REST API clients (Resend and Brevo) via `fetch()`, shedding the entire `nodemailer` tree.
4. **Unoptimized Supabase Storage Images**: Set `images: { unoptimized: true }` in `next.config.ts`, eliminating the need for heavy native `sharp` C++ binaries inside the isolate.

---

## 3. Cloudflare Architecture & Bindings

The repository includes pre-configured [`open-next.config.ts`](file:///e:/git-workstation/urdu-fiction-marketplace/open-next.config.ts) and [`wrangler.jsonc`](file:///e:/git-workstation/urdu-fiction-marketplace/wrangler.jsonc).

### Storage & Caching Primitives
1. **Incremental Cache (Cloudflare R2)**:
   - Binding: `NEXT_INC_CACHE_R2_BUCKET`
   - Bucket Name: `unb-premium-cache`
   - *Why R2 instead of Workers KV?* Workers KV Free plan allows only **1,000 writes/day** and is eventually consistent (stale updates take up to 60s). Cloudflare R2 includes **1,000,000 Class A writes/month** (~33,000 writes/day) for free with zero egress fees and multi-region consistency.
2. **Tag Cache for Revalidation (Cloudflare D1)**:
   - Binding: `NEXT_TAG_CACHE_D1`
   - Database Name: `unb-premium-tag-cache`
   - Powers `revalidateTag('site-settings')` and `revalidatePath(...)` without requiring paid Durable Objects. D1 includes **5M reads/day and 100k writes/day** on the Free tier.
3. **Static Assets (`ASSETS`)**:
   - Directory: `.open-next/assets` served directly by Cloudflare's global CDN.

---

## 4. Step-by-Step Deployment Instructions

### Step 1: Create Cloudflare Storage Resources
In your Cloudflare Dashboard (or via Wrangler CLI):

1. **Create the R2 Cache Bucket**:
   ```bash
   npx wrangler r2 bucket create unb-premium-cache
   ```
2. **Create the D1 Tag Cache Database**:
   ```bash
   npx wrangler d1 create unb-premium-tag-cache
   ```
   *Note the `database_id` output by Wrangler.*
3. **Initialize the D1 Schema for Tag Cache**:
   Execute this SQL table creation on your D1 database:
   ```bash
   npx wrangler d1 execute unb-premium-tag-cache --command "CREATE TABLE IF NOT EXISTS revalidations (tag TEXT PRIMARY KEY, revalidatedAt INTEGER NOT NULL, stale INTEGER, expire INTEGER);"
   ```
4. **Update `wrangler.jsonc`**:
   Replace `"REPLACE_WITH_D1_DATABASE_ID"` with your real D1 database ID.

---

### Step 2: Configure Workers Builds (GitHub Integration)
Deploying via **Workers Builds** runs on Cloudflare's Linux infrastructure directly from GitHub:

1. In Cloudflare Dashboard, navigate to **Compute (Workers) > Workers & Pages > Create Application > Workers > Connect to Git**.
2. Select your GitHub repository (`urdu-fiction-marketplace`).
3. Set the build parameters:
   - **Framework Preset**: `None` (or `Next.js`)
   - **Root Directory**: `/`
   - **Build Command**: `npm run build:worker`
   - **Deploy Command**: `npx opennextjs-cloudflare deploy`
   - **Node.js Version**: `20` (or `22`)

---

### Step 3: Configure Environment Variables & Secrets

In Cloudflare Dashboard (**Workers & Pages > unb-premium > Settings > Variables and Secrets**):

#### Build-Time Environment Variables (Plaintext)
*These must be available during `npm run build:worker`:*
* `NEXT_PUBLIC_SUPABASE_URL`: `https://<your-project-id>.supabase.co`
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `eyJhbGciOi...` (your public anon key)
* `NEXT_PUBLIC_SITE_URL`: `https://premium.urdunovelbanks.com`

#### Runtime Variables & Secrets (Encrypted Secrets)
*Click "Add Secret" for each sensitive key:*
* `NEXT_PUBLIC_SUPABASE_URL`: `https://<your-project-id>.supabase.co`
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `eyJhbGciOi...`
* `NEXT_PUBLIC_SITE_URL`: `https://premium.urdunovelbanks.com`
* `SUPABASE_SERVICE_ROLE_KEY`: `eyJhbGciOi...` (Used ONLY by background cron routes)
* `CRON_SECRET`: A secure 64-character random string (e.g. `openssl rand -hex 32`)
* `EMAIL_PROVIDER`: `resend` (or `brevo`)
* `RESEND_API_KEY`: `re_...` (or `BREVO_API_KEY`)
* `EMAIL_FROM`: `UNB Premium <notifications@premium.urdunovelbanks.com>`
* `CACHE_PURGE_ZONE_ID`: Cloudflare Zone ID for `urdunovelbanks.com` (found on Zone Overview page)
* `CACHE_PURGE_API_TOKEN`: Cloudflare API Token with `Zone.Cache Purge` permission

---

### Step 4: Test on `*.workers.dev` First
Before assigning your custom domain:
1. In Cloudflare Workers settings, enable the default `*.workers.dev` route (e.g., `https://unb-premium.<your-subdomain>.workers.dev`).
2. Test the public health check endpoint:
   ```bash
   curl -I https://unb-premium.<your-subdomain>.workers.dev/api/health
   ```
   *Expected response*: `HTTP/1.1 200 OK` with JSON `{ "status": "healthy", "database": "connected" }`.
3. Test browsing public catalog pages, login, and static assets.

---

### Step 5: Add Custom Domain `premium.urdunovelbanks.com`
1. Navigate to **Workers & Pages > unb-premium > Settings > Domains & Routes**.
2. Click **Add > Custom Domain**.
3. Enter `premium.urdunovelbanks.com`.
4. Cloudflare automatically generates the DNS CNAME record and provisions a free Universal SSL/TLS certificate within 1–2 minutes.

---

## 5. DNS Migration Checklist: Moving `urdunovelbanks.com` to Cloudflare

Follow this checklist to move DNS to Cloudflare without breaking existing WordPress, Blogger, or email services:

- [ ] **Step 1: Complete DNS Audit (Pre-Migration)**:
  Log into your current registrar/DNS provider (cPanel, GoDaddy, Namecheap, etc.) and export the zone file or copy every record:
  - All `A` and `AAAA` records (e.g. `@`, `www`, `blog`)
  - All `CNAME` records
  - All `MX` records (Mail Exchange servers and priorities)
  - All `TXT` records (especially Google Site Verification, SPF, DKIM, DMARC)
- [ ] **Step 2: Add Zone to Cloudflare**:
  In Cloudflare Dashboard, click **Add a Domain** and enter `urdunovelbanks.com`. Cloudflare will scan existing records.
- [ ] **Step 3: Line-by-Line Record Verification**:
  Compare Cloudflare's scanned records against your pre-migration export. Add any missing records.
- [ ] **Step 4: Keep Existing Websites DNS-Only (Grey Cloud)**:
  > [!WARNING]
  > If your root domain or subdomains point to WordPress, Blogger, or cPanel hosting, set their proxy status to **DNS Only (Grey Cloud)** during migration. Only switch to Proxied (Orange Cloud) after testing SSL compatibility.
- [ ] **Step 5: SPF Email Record Merging**:
  > [!CAUTION]
  > A domain must have **EXACTLY ONE** SPF TXT record. Having multiple SPF records causes Gmail, Yahoo, and Outlook to reject your emails.
  - If your existing host uses Google Workspace: `v=spf1 include:_spf.google.com ~all`
  - If you also send emails via Resend: Merge them into one string:
    `v=spf1 include:_spf.google.com include:resend.com ~all`
  - If using Brevo:
    `v=spf1 include:_spf.google.com include:spf.brevo.com ~all`
- [ ] **Step 6: Lower TTL in Advance**:
  24–48 hours before the switch, lower the TTL on all records at your existing DNS host to 300 seconds (5 minutes).
- [ ] **Step 7: Update Nameservers at Domain Registrar**:
  Perform the nameserver change during off-peak hours (e.g., 2:00 AM – 4:00 AM PKT). Change nameservers at your registrar to the two Cloudflare nameservers assigned (e.g. `aria.ns.cloudflare.com`, `bob.ns.cloudflare.com`).
- [ ] **Step 8: Post-Switch Email & Site Verification**:
  Send a test email to and from your domain, check that the existing website loads, and verify SSL certificates.

---

## 6. Automated Background Cron Schedulers

UNB Premium requires periodic execution of background jobs:
1. `/api/cron/send-emails`: Dispatches pending outbox emails (every 5 minutes).
2. `/api/cron/reminders`: Dispatches payment and invoice reminders (every 1 hour).
3. `/api/cron/purge-drafts`: Cleans up abandoned manuscript drafts (daily).

### Option A: GitHub Actions Schedulers (Default & Recommended)
The repository includes [`.github/workflows/cron.yml`](file:///e:/git-workstation/urdu-fiction-marketplace/.github/workflows/cron.yml).
Add two secrets in your GitHub repository (**Settings > Secrets and variables > Actions**):
* `APP_URL`: `https://premium.urdunovelbanks.com`
* `CRON_SECRET`: The exact secret configured in Cloudflare runtime secrets.

GitHub Actions will automatically invoke the endpoints with the header:
```http
Authorization: Bearer <CRON_SECRET>
```

### Option B: Cloudflare Cron Triggers
To run crons directly within Cloudflare, add a triggers section in `wrangler.jsonc`:
```jsonc
  "triggers": {
    "crons": ["*/5 * * * *", "0 * * * *"]
  }
```

---

## 7. Operational Observability, Logs & Rollbacks

### Live Log Streaming
1. **Via CLI**:
   ```bash
   npx wrangler tail
   ```
2. **Via Cloudflare Dashboard**:
   Navigate to **Workers & Pages > unb-premium > Observability > Live Logs**. Filter by status code, request URL, or exceptions.

### Instant One-Click Rollbacks
If a bad deployment is made:
1. In Cloudflare Dashboard, go to **Workers & Pages > unb-premium > Deployments**.
2. Locate the previous stable deployment version in the history list.
3. Click **... > Rollback to this deployment**. The rollback takes effect globally in under 2 seconds.

---

## 8. Health Monitoring (UptimeRobot)

We have created [`/api/health`](file:///e:/git-workstation/urdu-fiction-marketplace/src/app/api/health/route.ts), which validates the Worker runtime and performs a lightweight read against Supabase with zero secret exposure.

### Setting up UptimeRobot:
1. Log into [UptimeRobot](https://uptimerobot.com).
2. Click **Add New Monitor**.
3. **Monitor Type**: `HTTP(s)`
4. **Friendly Name**: `UNB Premium Worker & Database`
5. **URL**: `https://premium.urdunovelbanks.com/api/health`
6. **Monitoring Interval**: Every 5 minutes (or 1 minute).
7. **HTTP Method**: `GET`
8. Alert contacts: Configure your email, SMS, or Telegram alerts.

