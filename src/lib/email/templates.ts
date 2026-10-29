/**
 * UNB Premium — Email Templates & Sanitization
 *
 * Strict Non-Sensitive Email Invariant:
 * Platform emails NEVER include writer or reader bank account numbers, IBANs,
 * transaction reference IDs (TIDs), or screenshot URLs.
 * They only contain a brief, branded operational message and a secure link
 * directing the user to inspect the details directly on UNB Premium.
 */

export interface EmailRenderInput {
  template: string;
  subject: string;
  bodyText: string;
  recipientEmail?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Strips any sensitive tokens (e.g. IBANs, long bank account digits, TIDs, or signed URLs)
 * if they accidentally appear in dynamic strings.
 */
export function sanitizeEmailContent(content: string): string {
  if (!content) return "";

  let sanitized = content;

  // Mask IBANs (e.g., PK36SCBL0000001123456701)
  sanitized = sanitized.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, "[REDACTED_ACCOUNT]");

  // Mask long digit runs (potential bank account numbers or raw TIDs >= 9 digits)
  sanitized = sanitized.replace(/\b\d{9,24}\b/g, "[REDACTED_NUMERIC_ID]");

  // Strip signed or absolute storage URLs pointing to proofs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+payment-proofs[^\s]*/gi, "[SECURE_PORTAL_PROOF_LINK]");
  sanitized = sanitized.replace(/https?:\/\/[^\s]+supabase[^\s]*\/storage[^\s]*/gi, "[SECURE_PORTAL_LINK]");

  return sanitized;
}

/**
 * Returns the public application base URL from environment or production default.
 */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://unbpremium.pk"
  ).replace(/\/+$/, "");
}

/**
 * Renders branded plain-text and HTML emails with English & Urdu styling.
 */
export function renderEmailTemplate(input: EmailRenderInput): RenderedEmail {
  const baseUrl = getAppBaseUrl();
  const preferencesUrl = `${baseUrl}/account/notifications`;
  const sanitizedSubject = sanitizeEmailContent(input.subject);
  const sanitizedBody = sanitizeEmailContent(input.bodyText);

  // Plain-text representation
  const text = `UNB Premium | اردو فکشن مارکیٹ پلیس
--------------------------------------------------

${sanitizedBody}

--------------------------------------------------
To view details securely, please visit:
${baseUrl}

Notification Preferences & Email Controls:
${preferencesUrl}

UNB Premium — Safe Peer-to-Peer Urdu Publishing.
This is an automated system notification.
`;

  // Branded HTML representation
  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sanitizedSubject)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      line-height: 1.6;
    }
    .wrapper {
      width: 100%;
      background-color: #0f172a;
      padding: 32px 16px;
    }
    .card {
      max-width: 580px;
      margin: 0 auto;
      background-color: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .header {
      background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
      padding: 24px 32px;
      border-bottom: 1px solid #334155;
      text-align: center;
    }
    .brand-title {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #f8fafc;
    }
    .brand-subtitle {
      margin: 4px 0 0 0;
      font-size: 14px;
      color: #94a3b8;
      font-family: 'Gulzar', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', Tahoma, serif;
    }
    .content {
      padding: 32px;
      font-size: 15px;
      color: #cbd5e1;
    }
    .subject-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      background-color: #0284c7;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .message-body {
      white-space: pre-wrap;
      font-size: 15px;
      line-height: 1.7;
      color: #e2e8f0;
    }
    .action-button {
      display: inline-block;
      margin-top: 24px;
      padding: 12px 24px;
      background-color: #0284c7;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      border-radius: 8px;
      text-align: center;
    }
    .action-button:hover {
      background-color: #0369a1;
    }
    .footer {
      background-color: #0f172a;
      padding: 20px 32px;
      border-top: 1px solid #334155;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }
    .footer a {
      color: #38bdf8;
      text-decoration: underline;
    }
    .footer-urdu {
      margin-top: 8px;
      font-size: 13px;
      color: #94a3b8;
      font-family: 'Gulzar', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', Tahoma, serif;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <a href="${escapeHtml(baseUrl)}" style="text-decoration:none;display:inline-block;" target="_blank" rel="noopener noreferrer">
          <img
            src="${escapeHtml(baseUrl)}/brand/logo-email.png"
            width="140"
            height="91"
            alt="UNB Premium"
            style="display:block;margin:0 auto 10px auto;max-width:140px;height:auto;border:0;outline:none;"
          />
        </a>
        <h1 class="brand-title">UNB PREMIUM</h1>
        <p class="brand-subtitle">اردو فکشن کی سب سے معتبر آن لائن مارکیٹ</p>
      </div>
      <div class="content">
        <div class="subject-badge">Notification</div>
        <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #f1f5f9;">${escapeHtml(sanitizedSubject)}</h2>
        <div class="message-body">${escapeHtml(sanitizedBody)}</div>
        <div style="text-align: center;">
          <a href="${escapeHtml(baseUrl)}" class="action-button" target="_blank" rel="noopener noreferrer">
            Open UNB Premium Dashboard
          </a>
        </div>
      </div>
      <div class="footer">
        <p style="margin: 0 0 8px 0;">This is an automated operational notification regarding your UNB Premium account.</p>
        <p style="margin: 0;">Manage your preferences or toggle emails in <a href="${escapeHtml(preferencesUrl)}">Notification Settings</a>.</p>
        <p class="footer-urdu">براہ کرم کسی بھی مالیاتی کارروائی کی تفصیلات پورٹل پر چیک کریں۔</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return {
    subject: sanitizedSubject,
    text,
    html,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
