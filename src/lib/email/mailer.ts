import { renderEmailTemplate, type EmailRenderInput } from "./templates.ts";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isMocked?: boolean;
}

/**
 * Safely resolves an environment variable or secret from both Node.js (process.env)
 * and Cloudflare Workers runtime context (getCloudflareContext().env).
 *
 * 1. Checks process.env[key] first (trimmed, non-empty).
 * 2. If not found, safely calls getCloudflareContext() inside a try/catch block
 *    and reads (ctx?.env as Record<string, string | undefined>)?.[key].
 */
export function resolveEmailEnv(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }

  try {
    const ctx = getCloudflareContext();
    if (ctx?.env) {
      const val = (ctx.env as Record<string, string | undefined>)?.[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    }
  } catch {
    // getCloudflareContext throws in Node.js test runners or build stages where no CF context is mounted
  }

  try {
    const sym = Symbol.for("__cloudflare-context__");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalCtx = (globalThis as any)[sym];
    if (globalCtx?.env) {
      const val = globalCtx.env[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    }
  } catch {
    // Ignore fallback inspection errors
  }

  return undefined;
}

export const getEmailEnv = resolveEmailEnv;

/**
 * Checks whether the email dispatch service has valid credentials configured.
 * Returns true if EMAIL_PROVIDER has a corresponding non-empty API key.
 */
export function isEmailServiceConfigured(): boolean {
  const provider = (resolveEmailEnv("EMAIL_PROVIDER") || "").toLowerCase().trim();
  if (provider === "resend") {
    const key = resolveEmailEnv("RESEND_API_KEY");
    return Boolean(key && key.trim().length > 0);
  }
  if (provider === "brevo") {
    const key = resolveEmailEnv("BREVO_API_KEY");
    return Boolean(key && key.trim().length > 0);
  }
  return false;
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
 *
 * Strict Production Safety Invariant:
 * If no provider or keys are configured, it will NOT falsely mark production database
 * outbox rows as sent unless explicitly running in a test suite or mock flag.
 */
export async function sendEmail(
  recipientEmail: string,
  input: EmailRenderInput,
  options?: { allowMockInDevelopment?: boolean }
): Promise<SendEmailResult> {
  const provider = (resolveEmailEnv("EMAIL_PROVIDER") || "").toLowerCase().trim();
  const fromAddress =
    resolveEmailEnv("EMAIL_FROM") ||
    "Urdu Novel Bank Premium <noreply@urdunovelbanks.com>";
  const sender = parseFromAddress(fromAddress);
  const rendered = renderEmailTemplate({ ...input, recipientEmail });

  // 1. Resend REST API
  if (provider === "resend") {
    const apiKey = resolveEmailEnv("RESEND_API_KEY");
    if (!apiKey) {
      if (process.env.NODE_ENV !== "production" || options?.allowMockInDevelopment) {
        return { success: true, isMocked: true, messageId: `mock-resend-${Date.now()}` };
      }
      const errorMsg = `EMAIL_PROVIDER is "resend" but RESEND_API_KEY is not configured in server environment.`;
      console.warn(`[Email Warning] ${errorMsg} Skipped sending to ${recipientEmail}.`);
      return { success: false, error: errorMsg };
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
    const apiKey = resolveEmailEnv("BREVO_API_KEY");
    if (!apiKey) {
      if (process.env.NODE_ENV !== "production" || options?.allowMockInDevelopment) {
        return { success: true, isMocked: true, messageId: `mock-brevo-${Date.now()}` };
      }
      const errorMsg = `EMAIL_PROVIDER is "brevo" but BREVO_API_KEY is not configured in server environment.`;
      console.warn(`[Email Warning] ${errorMsg} Skipped sending to ${recipientEmail}.`);
      return { success: false, error: errorMsg };
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

  // 3. Fallback: Mocked in test/development; unconfigured failure in production
  if (process.env.NODE_ENV !== "production" || options?.allowMockInDevelopment) {
    return {
      success: true,
      isMocked: true,
      messageId: `mock-${Date.now()}`,
    };
  }

  const errorMsg = `EMAIL_PROVIDER is not configured or unsupported ("${provider}"). Configure RESEND_API_KEY to send emails.`;
  console.warn(`[Email Warning] ${errorMsg} Skipped sending to ${recipientEmail}.`);
  return {
    success: false,
    error: errorMsg,
  };
}
