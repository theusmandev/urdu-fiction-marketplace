/**
 * UNB Premium — Luxury Email Templates & Sanitization
 *
 * Visual Aesthetic:
 * - Background: Warm Ivory (#FAF7F2)
 * - Card: Crisp White (#FFFFFF) with subtle border (#E6DEC8)
 * - Header Banner: Deep Navy (#1B2A41) with Antique Gold trim (#C8A96B)
 * - Typography: Bilingual Nastaliq RTL (Urdu) & Clean Modern Sans-Serif (English)
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

const TEMPLATE_REGISTRY: Record<string, TemplateMetadata> = {
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
  invoice_issued: {
    badgeText: "Platform Fee Notice",
    badgeUrdu: "پلیٹ فارم فیس",
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
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://premium.urdunovelbanks.com"
  ).replace(/\/+$/, "");
}

/**
 * Renders branded plain-text and luxury HTML emails with English & Urdu styling.
 */
export function renderEmailTemplate(input: EmailRenderInput): RenderedEmail {
  const baseUrl = getAppBaseUrl();
  const preferencesUrl = `${baseUrl}/account/notifications`;
  const sanitizedSubject = sanitizeEmailContent(input.subject);
  const sanitizedBody = sanitizeEmailContent(input.bodyText);

  const meta = TEMPLATE_REGISTRY[input.template] || DEFAULT_METADATA;
  const ctaUrl = input.ctaUrl || `${baseUrl}${meta.ctaPath}`;
  const ctaLabel = input.ctaLabel || meta.ctaLabel;

  // Plain-text representation
  const text = `UNB Premium | اردو فکشن مارکیٹ پلیس
--------------------------------------------------
[${meta.badgeText} / ${meta.badgeUrdu}]
${sanitizedSubject}
--------------------------------------------------

${sanitizedBody}

--------------------------------------------------
Action Link:
${ctaUrl}

Notification Preferences & Settings:
${preferencesUrl}

UNB Premium — Safe Peer-to-Peer Urdu Publishing.
This is an automated operational notification.
`;

  // Process body text into bilingual paragraphs
  const paragraphs = sanitizedBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const bodyHtml = paragraphs
    .map((p) => {
      const isUrdu = /[\u0600-\u06FF]/.test(p);
      if (isUrdu) {
        return `<p style="margin: 0 0 14px 0; direction: rtl; text-align: right; font-family: 'Gulzar', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', Tahoma, serif; font-size: 16px; line-height: 2.1; color: #1F2430;">${escapeHtml(p)}</p>`;
      }
      return `<p style="margin: 0 0 14px 0; direction: ltr; text-align: left; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #333F4D;">${escapeHtml(p)}</p>`;
    })
    .join("");

  // Luxury Branded HTML representation
  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sanitizedSubject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1F2430; -webkit-font-smoothing: antialiased; line-height: 1.6;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #FAF7F2; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 580px; background-color: #FFFFFF; border: 1px solid #E6DEC8; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(27, 42, 65, 0.05);">
          
          <!-- Deep Navy Header Banner with Antique Gold Accent -->
          <tr>
            <td style="background-color: #1B2A41; padding: 28px 32px 24px 32px; text-align: center; border-bottom: 3px solid #C8A96B;">
              <a href="${escapeHtml(baseUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
                <img
                  src="${escapeHtml(baseUrl)}/brand/logo-email.png"
                  width="130"
                  height="auto"
                  alt="UNB Premium"
                  style="display: block; margin: 0 auto 12px auto; max-width: 130px; height: auto; border: 0;"
                />
              </a>
              <h1 style="margin: 0; font-size: 21px; font-weight: 800; letter-spacing: 1.5px; color: #FAF7F2; text-transform: uppercase;">UNB PREMIUM</h1>
              <p style="margin: 6px 0 0 0; font-size: 14px; color: #E6DEC8; font-family: 'Gulzar', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', Tahoma, serif; line-height: 1.8; direction: rtl;">اردو فکشن کی سب سے معتبر آن لائن مارکیٹ</p>
            </td>
          </tr>

          <!-- Email Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; background-color: #FFFFFF;">
              
              <!-- Category / Status Badge -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 18px;">
                <tr>
                  <td style="background-color: #F8F4EC; border: 1px solid #C8A96B; border-radius: 9999px; padding: 4px 14px; font-size: 12px; font-weight: 700; color: #735118; letter-spacing: 0.5px; text-transform: uppercase;">
                    ${escapeHtml(meta.badgeText)} <span style="color: #A37F38; margin: 0 4px;">•</span> ${escapeHtml(meta.badgeUrdu)}
                  </td>
                </tr>
              </table>

              <!-- Email Subject Heading -->
              <h2 style="margin: 0 0 20px 0; font-size: 19px; font-weight: 700; color: #1B2A41; line-height: 1.4;">
                ${escapeHtml(sanitizedSubject)}
              </h2>

              <!-- Dynamic Message Body with Nastaliq RTL & English Formatting -->
              <div style="font-size: 15px; color: #1F2430; margin-bottom: 28px;">
                ${bodyHtml}
              </div>

              <!-- Primary Call-to-Action Button -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="margin: 28px 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #1B2A41; color: #FAF7F2 !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 15px; letter-spacing: 0.3px; border: 1px solid #C8A96B; box-shadow: 0 4px 12px rgba(27, 42, 65, 0.15); text-align: center;">
                      ${escapeHtml(ctaLabel)} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Notice Panel -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #FAF7F2; border: 1px solid #E6DEC8; border-radius: 8px; margin-top: 24px;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; color: #5F6673; line-height: 1.5;">
                      <strong style="color: #1B2A41;">Security Invariant:</strong> UNB Premium never asks for passwords, nor transmits unencrypted banking details or transaction references via email. Always verify activities directly on the official portal.
                    </p>
                    <p style="margin: 0; font-size: 13px; color: #5F6673; font-family: 'Gulzar', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', Tahoma, serif; line-height: 1.8; direction: rtl; text-align: right;">
                      <strong style="color: #1B2A41;">حفاظتی اصول:</strong> پلیٹ فارم کبھی بھی ای میل کے ذریعے حساس بینک اکاؤنٹ یا ٹرانزیکشن حوالہ جات ظاہر نہیں کرتا۔
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Warm Ivory Footer -->
          <tr>
            <td style="background-color: #FAF7F2; padding: 22px 32px; border-top: 1px solid #E6DEC8; text-align: center; font-size: 12px; color: #5F6673; line-height: 1.6;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #1B2A41;">UNB Premium — Safe Peer-to-Peer Urdu Publishing</p>
              <p style="margin: 0 0 10px 0;">This is an automated operational notification regarding your UNB Premium account.</p>
              <p style="margin: 0;">
                To update notification preferences or unsubscribe from non-critical alerts, visit 
                <a href="${escapeHtml(preferencesUrl)}" style="color: #735118; font-weight: 600; text-decoration: underline;">Notification Settings</a>.
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
