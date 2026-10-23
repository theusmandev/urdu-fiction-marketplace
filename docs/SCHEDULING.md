# UNB Premium — Automated Schedulers & Background Workers

This guide documents the automated scheduler infrastructure implemented in **Migration 0018 / Step 5.2**, including endpoint contracts, authentication mechanisms, local testing recipes, and production scheduler setups.

---

## 1. Architecture Overview

Because UNB Premium operates on a serverless Next.js architecture, background tasks are driven by authenticated HTTP webhook endpoints triggered periodically by external schedulers:

| Endpoint | Frequency | Primary Responsibility |
| :--- | :--- | :--- |
| `POST /api/cron/send-emails` | Every 1-5 minutes | Claims pending batches from `email_outbox` table, renders branded templates, dispatches via SMTP/Nodemailer, and records delivery statuses. |
| `POST /api/cron/reminders` | Hourly (or 2x daily) | Invokes `run_scheduled_reminders()` database RPC to send verification nudges to writers (>12h), overdue invoice warnings, and stagnant dispute alerts (>3 days). |

---

## 2. Security & Authentication

Both endpoints require strict authentication using the shared secret `CRON_SECRET`:

1. **Authorization Header**:
   ```http
   Authorization: Bearer <CRON_SECRET>
   ```
2. **Constant-Time Verification**:
   The endpoints use `crypto.timingSafeEqual` to verify the bearer token, preventing side-channel timing attacks.
3. **No Browser Exposure**:
   `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are server-only environment variables and are **never** bundled or exposed to client JavaScript.

---

## 3. Local Testing & Verification via `curl`

To test both endpoints locally during development:

### 3.1 Test `send-emails` Endpoint

**PowerShell (Windows)**:
```powershell
$headers = @{
    "Authorization" = "Bearer local-test-cron-secret-12345"
    "Content-Type"  = "application/json"
}
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/send-emails" -Method Post -Headers $headers
```

**Bash / Git Bash**:
```bash
curl -X POST http://localhost:3000/api/cron/send-emails \
  -H "Authorization: Bearer local-test-cron-secret-12345" \
  -H "Content-Type: application/json"
```

**Expected JSON Response**:
```json
{
  "success": true,
  "processed": 2,
  "delivered": 2,
  "failed": 0
}
```

*(Note: If SMTP is not configured in `.env.local`, nodemailer runs in safe dry-run mode and logs dispatch notices to the terminal without throwing errors).*

### 3.2 Test `reminders` Endpoint

**PowerShell (Windows)**:
```powershell
$headers = @{
    "Authorization" = "Bearer local-test-cron-secret-12345"
    "Content-Type"  = "application/json"
}
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/reminders" -Method Post -Headers $headers
```

**Bash / Git Bash**:
```bash
curl -X POST http://localhost:3000/api/cron/reminders \
  -H "Authorization: Bearer local-test-cron-secret-12345" \
  -H "Content-Type: application/json"
```

**Expected JSON Response**:
```json
{
  "success": true,
  "reminders_sent": {
    "orders_reminded": 1,
    "invoices_reminded": 0,
    "disputes_alerted": 0
  }
}
```

---

## 4. Production Scheduler Setup Options

### Option A: GitHub Actions (Recommended / Free)
This repository includes `.github/workflows/cron.yml` which executes every 5 minutes:

1. In your GitHub repository, navigate to **Settings > Secrets and variables > Actions**.
2. Add the following repository secrets:
   - `APP_URL`: Your production URL (e.g. `https://unbpremium.pk` or `https://urdu-novel-hub.vercel.app`)
   - `CRON_SECRET`: Strong random 32+ character secret matching your server environment variable.

### Option B: Free Web Cron Services (cron-job.org / EasyCron)
If your deployment platform (e.g. basic Vercel tier) has cron limitations:

1. Create a free account at [cron-job.org](https://cron-job.org).
2. Create Cron Job 1:
   - **URL**: `https://your-domain.com/api/cron/send-emails`
   - **Method**: `POST`
   - **Schedule**: Every 5 minutes
   - **Headers**:
     - `Authorization: Bearer <YOUR_CRON_SECRET>`
     - `Content-Type: application/json`
3. Create Cron Job 2:
   - **URL**: `https://your-domain.com/api/cron/reminders`
   - **Method**: `POST`
   - **Schedule**: Every 60 minutes
   - **Headers**:
     - `Authorization: Bearer <YOUR_CRON_SECRET>`
     - `Content-Type: application/json`

### Option C: Vercel Cron Jobs (`vercel.json`)
If hosting on Vercel Pro, add `crons` to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/send-emails",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/reminders",
      "schedule": "0 * * * *"
    }
  ]
}
```
*(Note: Vercel Cron automatically passes `Authorization: Bearer ${CRON_SECRET}` if `CRON_SECRET` is set in Vercel project environment variables).*

---

## 5. Monitoring & Operational Health

Platform administrators can monitor cron operations in real time from the admin console:
- **Email Outbox Health Card** at `/admin`: Shows live counts for `pending`, `dispatched`, `transient failures`, and `dead letters`, with a one-click **"Retry Failed Emails"** button.
- **Audit Trail** at `/admin/audit`: Logs all automated reminders and resolution actions.
