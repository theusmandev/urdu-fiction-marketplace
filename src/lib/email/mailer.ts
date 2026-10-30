import { renderEmailTemplate, type EmailRenderInput } from "./templates.ts";

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isMocked?: boolean;
}

/**
 * Parses sender details from EMAIL_FROM string (e.g. "UNB Premium <notifications@unbpremium.pk>" or "notifications@unbpremium.pk").
 */
function parseFromAddress(fromHeader: string): { name: string; email: string; raw: string } {
  const match = fromHeader.match(/^([^<]+)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim(),
      email: match[2].trim(),
      raw: fromHeader,
    };
  }
  return {
    name: "UNB Premium",
    email: fromHeader.trim(),
    raw: fromHeader,
  };
}

/**
 * Sends a single email using the configured HTTP REST email provider (Resend or Brevo).
 * Zero Node.js socket dependencies — fully compatible with Cloudflare Workers (workerd).
 * If no provider or keys are configured, it safely dry-runs and logs to the console.
 */
export async function sendEmail(
  recipientEmail: string,
  input: EmailRenderInput
): Promise<SendEmailResult> {
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase().trim();
  const fromAddress = process.env.EMAIL_FROM || "UNB Premium <notifications@unbpremium.pk>";
  const sender = parseFromAddress(fromAddress);
  const rendered = renderEmailTemplate({ ...input, recipientEmail });

  // 1. Resend REST API
  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        `[Email Dry-Run] EMAIL_PROVIDER is "resend" but RESEND_API_KEY is missing. Skipped sending to ${recipientEmail}. Subject: "${rendered.subject}"`
      );
      return { success: true, isMocked: true, messageId: `mock-resend-${Date.now()}` };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: sender.raw,
          to: [recipientEmail],
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        }),
      });

      const data = (await response.json()) as { id?: string; message?: string; name?: string };

      if (!response.ok) {
        const errorMsg = data.message || `Resend API returned status ${response.status}`;
        console.error(`[Resend Error] Failed sending email to ${recipientEmail}:`, errorMsg);
        return { success: false, error: errorMsg };
      }

      return {
        success: true,
        messageId: data.id || `resend-${Date.now()}`,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[Resend Error] Network error sending to ${recipientEmail}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // 2. Brevo (Sendinblue) REST API
  if (provider === "brevo") {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.warn(
        `[Email Dry-Run] EMAIL_PROVIDER is "brevo" but BREVO_API_KEY is missing. Skipped sending to ${recipientEmail}. Subject: "${rendered.subject}"`
      );
      return { success: true, isMocked: true, messageId: `mock-brevo-${Date.now()}` };
    }

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: sender.name, email: sender.email },
          to: [{ email: recipientEmail }],
          subject: rendered.subject,
          textContent: rendered.text,
          htmlContent: rendered.html,
        }),
      });

      const data = (await response.json()) as { messageId?: string; message?: string; code?: string };

      if (!response.ok) {
        const errorMsg = data.message || `Brevo API returned status ${response.status}`;
        console.error(`[Brevo Error] Failed sending email to ${recipientEmail}:`, errorMsg);
        return { success: false, error: errorMsg };
      }

      return {
        success: true,
        messageId: data.messageId || `brevo-${Date.now()}`,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[Brevo Error] Network error sending to ${recipientEmail}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // 3. Fallback: Safe Dry-Run when no provider configured
  console.warn(
    `[Email Dry-Run] EMAIL_PROVIDER not set or unsupported ("${provider}"). Email skipped sending to ${recipientEmail}. Subject: "${rendered.subject}"`
  );
  return {
    success: true,
    isMocked: true,
    messageId: `mock-${Date.now()}`,
  };
}
