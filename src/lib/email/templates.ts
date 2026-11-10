/**
 * UNB Premium — Luxury Email Templates & Sanitization
 *
 * Visual Aesthetic (Editorial Ivory & Warm Brown):
 * - Canvas Background: Sand Ivory (#F1ECDF)
 * - Card Container: Crisp White (#FFFFFF) with warm border (#E6DFD0) and 10px radius
 * - Typography: Georgia bold italic header in Brand Brown (#813B09)
 * - Header Badge: Dark Brown (#5F2F16) pill with Gold border and dashes (#D39A2A)
 * - Text: Dark Slate (#22262B) for high legibility, Muted Neutral (#5B6470) for secondary notes
 * - Callouts & Accents: Soft Cream (#FAF6EE), Warm Gold (#D39A2A / #8E6410)
 *
 * Strict Non-Sensitive Email Invariant:
 * Platform emails NEVER include writer or reader bank account numbers, IBANs,
 * transaction reference IDs (TIDs), or screenshot URLs.
 * They only contain a branded operational message and a secure link
 * directing the user to inspect the details directly on UNB Premium.
 */

export interface EmailRenderInput {
  template: string;
  subject: string;
  bodyText: string;
  recipientEmail?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface TemplateMetadata {
  badgeText: string;
  badgeUrdu: string;
  ctaLabel: string;
  ctaPath: string;
}

export const TEMPLATE_REGISTRY: Record<string, TemplateMetadata> = {
  payment_verified: {
    badgeText: "Novel Unlocked",
    badgeUrdu: "رسائی مل گئی",
    ctaLabel: "Open My Library",
    ctaPath: "/library",
  },
  order_payment_submitted: {
    badgeText: "Payment Verification",
    badgeUrdu: "ادائیگی کی تصدیق",
    ctaLabel: "Review Payment in Studio",
    ctaPath: "/writer/orders",
  },
  payment_rejected: {
    badgeText: "Payment Declined",
    badgeUrdu: "ادائیگی مسترد",
    ctaLabel: "View Order Details",
    ctaPath: "/orders",
  },
  support_reply: {
    badgeText: "Support Desk",
    badgeUrdu: "سپورٹ ڈیسک",
    ctaLabel: "View Support Ticket",
    ctaPath: "/support",
  },
  support_ticket_created: {
    badgeText: "Support Request",
    badgeUrdu: "نئی سپورٹ درخواست",
    ctaLabel: "Open Admin Support",
    ctaPath: "/admin/support",
  },
  support_message_received: {
    badgeText: "User Reply",
    badgeUrdu: "صارف کا جواب",
    ctaLabel: "Open Admin Support",
    ctaPath: "/admin/support",
  },
  tip_submitted: {
    badgeText: "Reader Appreciation",
    badgeUrdu: "قاری کی پذیرائی",
    ctaLabel: "View Received Tips",
    ctaPath: "/writer/tips",
  },
  tip_confirmed: {
    badgeText: "Tip Confirmed",
    badgeUrdu: "ٹپ تصدیق شدہ",
    ctaLabel: "View Your Tips",
    ctaPath: "/tips",
  },
  tip_not_received: {
    badgeText: "Tip Verification",
    badgeUrdu: "ٹپ کی تصدیق",
    ctaLabel: "View Tip Details",
    ctaPath: "/tips",
  },
  reminder_tip_confirmation: {
    badgeText: "Tip Confirmation",
    badgeUrdu: "ٹپ تصدیق کی یاد دہانی",
    ctaLabel: "Confirm Tip in Studio",
    ctaPath: "/writer/tips",
  },
  tip_reminder: {
    badgeText: "Tip Confirmation",
    badgeUrdu: "ٹپ تصدیق کی یاد دہانی",
    ctaLabel: "Confirm Tip in Studio",
    ctaPath: "/writer/tips",
  },
  reminder_order_verification: {
    badgeText: "Order Verification",
    badgeUrdu: "آرڈر تصدیق کی یاد دہانی",
    ctaLabel: "Verify Order in Studio",
    ctaPath: "/writer/orders",
  },
  verification_reminder: {
    badgeText: "Order Verification",
    badgeUrdu: "آرڈر تصدیق کی یاد دہانی",
    ctaLabel: "Verify Order in Studio",
    ctaPath: "/writer/orders",
  },
  invoice_issued: {
    badgeText: "Platform Fee Notice",
    badgeUrdu: "پلیٹ فارم فیس",
    ctaLabel: "View Platform Fee Invoice",
    ctaPath: "/writer/commission",
  },
  invoice_overdue: {
    badgeText: "Platform Fee Overdue",
    badgeUrdu: "پلیٹ فارم فیس واجب الادا",
    ctaLabel: "View Platform Fee Invoice",
    ctaPath: "/writer/commission",
  },
  invoice_due_reminder: {
    badgeText: "Platform Fee Reminder",
    badgeUrdu: "پلیٹ فارم فیس کی یاد دہانی",
    ctaLabel: "View Platform Fee Invoice",
    ctaPath: "/writer/commission",
  },
  invoice_settled: {
    badgeText: "Settlement Confirmed",
    badgeUrdu: "ادائیگی مکمل",
    ctaLabel: "View Invoice Statement",
    ctaPath: "/writer/commission",
  },
  invoice_payment_rejected: {
    badgeText: "Payment Declined",
    badgeUrdu: "ادائیگی مسترد",
    ctaLabel: "Review Invoice Details",
    ctaPath: "/writer/commission",
  },
  writer_approved: {
    badgeText: "Writer Studio",
    badgeUrdu: "رائٹر اسٹوڈیو",
    ctaLabel: "Open Writer Studio",
    ctaPath: "/writer/dashboard",
  },
  writer_rejected: {
    badgeText: "Application Status",
    badgeUrdu: "درخواست کا فیصلہ",
    ctaLabel: "Visit UNB Premium",
    ctaPath: "/",
  },
  novel_approved: {
    badgeText: "Novel Published",
    badgeUrdu: "ناول شائع شدہ",
    ctaLabel: "View Published Novel",
    ctaPath: "/writer/novels",
  },
  novel_rejected: {
    badgeText: "Moderation Notice",
    badgeUrdu: "نظر ثانی",
    ctaLabel: "Edit Novel in Studio",
    ctaPath: "/writer/novels",
  },
  dispute_opened: {
    badgeText: "Dispute Opened",
    badgeUrdu: "تنازعہ درج",
    ctaLabel: "Open Dispute Thread",
    ctaPath: "/disputes",
  },
  dispute_message: {
    badgeText: "Dispute Message",
    badgeUrdu: "نیا پیغام",
    ctaLabel: "Open Dispute Thread",
    ctaPath: "/disputes",
  },
  dispute_resolved: {
    badgeText: "Dispute Resolved",
    badgeUrdu: "تنازعہ حل شدہ",
    ctaLabel: "View Dispute Resolution",
    ctaPath: "/disputes",
  },
  refund_requested: {
    badgeText: "Refund Request",
    badgeUrdu: "ریفنڈ درخواست",
    ctaLabel: "View Order Details",
    ctaPath: "/orders",
  },
  refund_approved: {
    badgeText: "Refund Approved",
    badgeUrdu: "ریفنڈ منظور",
    ctaLabel: "View Order Details",
    ctaPath: "/orders",
  },
  refund_rejected: {
    badgeText: "Refund Update",
    badgeUrdu: "ریفنڈ فیصلہ",
    ctaLabel: "View Order Details",
    ctaPath: "/orders",
  },
};

const DEFAULT_METADATA: TemplateMetadata = {
  badgeText: "Notification",
  badgeUrdu: "اطلاع",
  ctaLabel: "Open UNB Premium",
  ctaPath: "/",
};

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
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  return "https://premium.urdunovelbanks.com";
}

/**
 * Renders an optional styled callout box for reasons, moderator feedback, or notes.
 */
export function renderCalloutBox(content: string, isUrdu = false): string {
  const textDir = isUrdu ? "rtl" : "ltr";
  const textAlign = isUrdu ? "right" : "left";
  const fontStack = isUrdu
    ? "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const lineHeight = isUrdu ? "2.05" : "1.6";

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FAF6EE; border: 1px solid #E6DFD0; border-left: 3px solid #D39A2A; border-radius: 6px; margin: 18px 0;">
    <tr>
      <td style="padding: 14px 18px; direction: ${textDir}; text-align: ${textAlign}; font-family: ${fontStack}; font-size: 15px; line-height: ${lineHeight}; color: #22262B;">
        ${escapeHtml(content)}
      </td>
    </tr>
  </table>`;
}

/**
 * Renders branded plain-text and luxury HTML emails with English & Urdu styling.
 * Matches the canonical UNB Premium reference design across all 25 application templates.
 */
export function renderEmailTemplate(input: EmailRenderInput): RenderedEmail {
  const baseUrl = getAppBaseUrl();
  const preferencesUrl = `${baseUrl}/account/notifications`;
  const displayHost = baseUrl.replace(/^https?:\/\//, "");
  const sanitizedSubject = sanitizeEmailContent(input.subject);
  const sanitizedBody = sanitizeEmailContent(input.bodyText);

  const meta = TEMPLATE_REGISTRY[input.template] || DEFAULT_METADATA;
  const ctaUrl = input.ctaUrl || `${baseUrl}${meta.ctaPath}`;
  const ctaLabel = input.ctaLabel || `${meta.ctaLabel} | ${meta.badgeUrdu}`;

  // Plain-text representation
  const text = `UNB Premium | Urdu Novel Bank Premium | اردو ناول بینک
--------------------------------------------------
[${meta.badgeText} / ${meta.badgeUrdu}]
${sanitizedSubject}
--------------------------------------------------

${sanitizedBody}

--------------------------------------------------
Action Link:
${ctaUrl}

Notification Preferences:
${preferencesUrl}

UNB Premium — Urdu Novel Bank Premium — ${displayHost}
This is an automated operational notification.
`;

  // Process body text into bilingual paragraphs
  const rawParagraphs = sanitizedBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const urduLines: string[] = [];
  const englishLines: string[] = [];

  for (const p of rawParagraphs) {
    if (/[\u0600-\u06FF]/.test(p)) {
      urduLines.push(p);
    } else {
      englishLines.push(p);
    }
  }

  // Preheader: First sentence of content plus padding entities
  const previewSnippet = (englishLines[0] || urduLines[0] || sanitizedSubject).slice(0, 120);

  // English block HTML
  const englishHtml = (englishLines.length > 0 ? englishLines : [sanitizedSubject])
    .map((p) => `<p style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 25px; color: #22262B;">${escapeHtml(p)}</p>`)
    .join("");

  // Urdu block HTML (with high line-height 2.05 to prevent ascenders/descenders clipping)
  const defaultUrduNotice = "برائے مہربانی اپنے اکاؤنٹ میں لاگ ان ہو کر تفصیلات ملاحظہ فرمائیں۔";
  const urduParagraphsToRender = urduLines.length > 0 ? urduLines : [defaultUrduNotice];
  const urduHtml = urduParagraphsToRender
    .map((p) => `<p style="margin: 0 0 14px 0; font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif; font-size: 16px; line-height: 2.05; color: #22262B;">${escapeHtml(p)}</p>`)
    .join("");

  // Luxury Branded HTML representation (Editorial Sand & Warm Brown)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(sanitizedSubject)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .unb-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .unb-card-cell {
        padding: 24px 18px !important;
      }
      .unb-btn {
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
        text-align: center !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F1ECDF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #22262B; -webkit-font-smoothing: antialiased; line-height: 1.6;">
  
  <!-- Hidden Preheader with Zero-Width Padding -->
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: #F1ECDF; font-size: 1px; line-height: 1px; mso-hide: all;">
    UNB PREMIUM &mdash; ${escapeHtml(previewSnippet)}
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #F1ECDF; padding: 36px 16px;">
    <tr>
      <td align="center">
        
        <!-- Main Card Container (560px max width) -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="unb-container" style="max-width: 560px; background-color: #FFFFFF; border: 1px solid #E6DFD0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);">
          
          <!-- Typography Brand Header (Centered, Zero Images) -->
          <tr>
            <td align="center" style="padding: 36px 32px 24px 32px; background-color: #FFFFFF; text-align: center;">
              <a href="${escapeHtml(baseUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
                <span style="display: block; font-family: Georgia, 'Palatino Linotype', 'Book Antiqua', serif; font-size: 32px; line-height: 38px; font-weight: bold; font-style: italic; color: #813B09; margin: 0 0 14px 0;">Urdu Novel Bank</span>
              </a>
              <!-- Centered Badge Pill -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin: 0 auto;">
                <tr>
                  <td align="center" bgcolor="#5F2F16" style="background-color: #5F2F16; border: 1px solid #D39A2A; border-radius: 4px; padding: 6px 20px 6px 24px; text-align: center;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; font-weight: bold; letter-spacing: 4px; color: #F1ECDF; text-transform: uppercase; white-space: nowrap;">
                      <span style="color: #D39A2A; font-weight: bold;">&ndash;</span>&nbsp;PREMIUM&nbsp;<span style="color: #D39A2A; font-weight: bold;">&ndash;</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Horizontal Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background-color: #E6DFD0; line-height: 1px; font-size: 1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Main Email Content Area -->
          <tr>
            <td class="unb-card-cell" style="padding: 32px 32px 28px 32px; background-color: #FFFFFF;">
              
              <!-- English Block -->
              <div style="margin-bottom: 24px;">
                <!-- Category / Status Pill Badge -->
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 18px;">
                  <tr>
                    <td style="background-color: #FAF6EE; border: 1px solid #E6DFD0; border-radius: 9999px; padding: 4px 14px; font-size: 12px; font-weight: 700; color: #813B09; letter-spacing: 0.5px; text-transform: uppercase;">
                      ${escapeHtml(meta.badgeText)} <span style="color: #D39A2A; margin: 0 6px;">•</span> ${escapeHtml(meta.badgeUrdu)}
                    </td>
                  </tr>
                </table>

                <!-- Main Subject Heading -->
                <h1 style="margin: 0 0 18px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; line-height: 32px; font-weight: bold; color: #22262B;">
                  ${escapeHtml(sanitizedSubject)}
                </h1>

                <!-- English Message Paragraphs -->
                <div style="font-size: 16px; line-height: 25px; color: #22262B;">
                  ${englishHtml}
                </div>
              </div>

              <!-- Thin Section Divider -->
              <div style="height: 1px; background-color: #E6DFD0; margin: 24px 0; line-height: 1px; font-size: 1px;">&nbsp;</div>

              <!-- Urdu Block (RTL, Nastaliq typography, ample line-height) -->
              <div lang="ur" dir="rtl" align="right" style="direction: rtl; text-align: right; margin-bottom: 28px;">
                <h2 style="margin: 0 0 14px 0; font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif; font-size: 21px; line-height: 2.1; font-weight: bold; color: #22262B;">
                  ${escapeHtml(meta.badgeUrdu)}
                </h2>
                <div style="font-size: 16px; line-height: 2.05; color: #22262B;">
                  ${urduHtml}
                </div>
              </div>

              <!-- ONE Primary Table-Cell Button (Outlook-safe without VML) -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin: 32px auto 24px auto;">
                <tr>
                  <td align="center" bgcolor="#813B09" style="background-color: #813B09; border-radius: 8px;">
                    <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" class="unb-btn" style="display: inline-block; padding: 15px 30px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; color: #FFFFFF !important; text-decoration: none; border-radius: 8px; text-align: center;">
                      ${escapeHtml(ctaLabel)} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Plain Fallback Link Block -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FAF6EE; border: 1px solid #E6DFD0; border-radius: 6px; margin: 20px 0;">
                <tr>
                  <td style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 19px; color: #5B6470;">
                    <p style="margin: 0 0 6px 0;">Button not working? Copy and paste this link into your browser:</p>
                    <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="color: #8E6410; word-break: break-all; text-decoration: underline; font-weight: 600;">${escapeHtml(ctaUrl)}</a>
                  </td>
                </tr>
              </table>

              <!-- Muted Fine Print (EN + UR) -->
              <div style="font-size: 13px; line-height: 20px; color: #5B6470; margin-top: 24px; padding-top: 18px; border-top: 1px solid #E6DFD0;">
                <p style="margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                  <strong style="color: #22262B;">Security Invariant:</strong> UNB Premium never asks for passwords, nor transmits unencrypted banking details or transaction references via email.
                </p>
                <p style="margin: 0; direction: rtl; text-align: right; font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif; line-height: 2.05;">
                  <strong style="color: #22262B;">حفاظتی اصول:</strong> اردو ناول بینک کبھی بھی ای میل پر پاس ورڈ یا نجی بینکنگ معلومات طلب نہیں کرتا۔
                </p>
              </div>

            </td>
          </tr>

        </table>

        <!-- Footer Outside Card on #F1ECDF Canvas -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 560px; margin-top: 24px;">
          <tr>
            <td align="center" style="text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #5B6470;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #22262B;">
                UNB Premium &mdash; Urdu Novel Bank &mdash; اردو ناول بینک
              </p>
              <p style="margin: 0 0 6px 0;">
                <a href="${escapeHtml(baseUrl)}" target="_blank" rel="noopener noreferrer" style="color: #8E6410; text-decoration: underline; font-weight: 600;">
                  ${escapeHtml(displayHost)}
                </a>
                <span style="color: #E6DFD0; margin: 0 6px;">|</span>
                <a href="${escapeHtml(preferencesUrl)}" target="_blank" rel="noopener noreferrer" style="color: #8E6410; text-decoration: underline;">
                  Notification Settings
                </a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #5B6470;">
                This is an automated operational notification regarding your UNB Premium account.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
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
