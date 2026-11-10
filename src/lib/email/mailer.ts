import { renderEmailTemplate, type EmailRenderInput } from "./templates.ts";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type EmailErrorCategory = "rate_limited" | "daily_quota" | "temporary" | "permanent";

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCategory?: EmailErrorCategory;
  isMocked?: boolean;
  retryAfterSeconds?: number;
}

/**
 * Sanitizes external API error strings to ensure recipient email addresses,
 * API tokens, and authorization credentials never leak into database logs or exceptions.
 */
export function sanitizeErrorMessage(rawError: string): string {
  if (!rawError) return "Unknown email delivery error";
  return rawError
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/(?:Bearer\s+)[a-zA-Z0-9_\-\.]+/gi, "[REDACTED_AUTH]")
    .replace(/(?:xkeysib-|re_)[a-zA-Z0-9_\-\.]+/gi, "[REDACTED_KEY]")
    .slice(0, 500);
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

  // Optional Reply-To header support (defaults to official support desk)
  const defaultReplyTo = "Urdu Novel Bank Support <support@urdunovelbanks.com>";
  const replyToAddress = resolveEmailEnv("EMAIL_REPLY_TO") || defaultReplyTo;
  const replyTo = parseFromAddress(replyToAddress);

  const rendered = renderEmailTemplate({ ...input, recipientEmail });

  // 1. Resend REST API
  // Free tier: 100 emails/day, 2 req/sec rate limit
  if (provider === "resend") {
    const apiKey = resolveEmailEnv("RESEND_API_KEY");
    if (!apiKey) {
      if (process.env.NODE_ENV !== "production" || options?.allowMockInDevelopment) {
        return { success: true, isMocked: true, messageId: `mock-resend-${Date.now()}` };
      }
      const errorMsg = `EMAIL_PROVIDER is "resend" but RESEND_API_KEY is not configured in server environment.`;
      console.warn(`[Email Warning] ${errorMsg} Skipped sending to ${recipientEmail}.`);
      return { success: false, error: errorMsg, errorCategory: "temporary", retryAfterSeconds: 300 };
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
          reply_to: replyTo.raw,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        }),
      });

      const data = (await response.json()) as { id?: string; message?: string; name?: string; statusCode?: number };

      if (!response.ok) {
        const rawMsg = data.message || `Resend API returned status ${response.status}`;
        const errorMsg = sanitizeErrorMessage(rawMsg);
        const statusCode = response.status;

        const isDaily = /daily|quota|plan\s*limit|limit\s*reached/i.test(rawMsg);
        let errorCategory: EmailErrorCategory = "temporary";
        let retryAfterSeconds = 300;

        if (statusCode === 429) {
          errorCategory = isDaily ? "daily_quota" : "rate_limited";
          const retryHeader = response.headers.get("retry-after");
          if (retryHeader) {
            const parsed = parseInt(retryHeader, 10);
            if (!isNaN(parsed) && parsed > 0) {
              retryAfterSeconds = Math.min(parsed, 3600);
            }
          } else {
            retryAfterSeconds = isDaily ? 21600 : 60; // 6 hours for daily, 60s for burst
          }
        } else if (statusCode === 402 || (statusCode === 403 && isDaily)) {
          errorCategory = "daily_quota";
          retryAfterSeconds = 21600;
        } else if (statusCode >= 400 && statusCode < 500) {
          // 400 Bad Request, 422 Invalid Recipient Address, etc.
          errorCategory = "permanent";
        } else {
          errorCategory = "temporary";
        }

        console.error(`[Resend Error] Failed sending email to ${recipientEmail}: [${errorCategory}] ${errorMsg}`);
        return { success: false, error: errorMsg, errorCategory, retryAfterSeconds };
      }

      return {
        success: true,
        messageId: data.id || `resend-${Date.now()}`,
      };
    } catch (err: unknown) {
      const errorMessage = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
      console.error(`[Resend Error] Network error sending to ${recipientEmail}:`, errorMessage);
      return { success: false, error: errorMessage, errorCategory: "temporary", retryAfterSeconds: 300 };
    }
  }

  // 2. Brevo (Sendinblue) REST API
  // Free tier: 300 emails/day, ~10 req/sec rate limit
  if (provider === "brevo") {
    const apiKey = resolveEmailEnv("BREVO_API_KEY");
    if (!apiKey) {
      if (process.env.NODE_ENV !== "production" || options?.allowMockInDevelopment) {
        return { success: true, isMocked: true, messageId: `mock-brevo-${Date.now()}` };
      }
      const errorMsg = `EMAIL_PROVIDER is "brevo" but BREVO_API_KEY is not configured in server environment.`;
      console.warn(`[Email Warning] ${errorMsg} Skipped sending to ${recipientEmail}.`);
      return { success: false, error: errorMsg, errorCategory: "temporary", retryAfterSeconds: 300 };
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
          replyTo: { email: replyTo.email, name: replyTo.name },
          subject: rendered.subject,
          textContent: rendered.text,
          htmlContent: rendered.html,
        }),
      });

      const data = (await response.json()) as { messageId?: string; message?: string; code?: string };

      if (!response.ok) {
        const rawMsg = data.message || data.code || `Brevo API returned status ${response.status}`;
        const errorMsg = sanitizeErrorMessage(rawMsg);
        const statusCode = response.status;

        const isDaily =
          /credits?|quota|daily|plan/i.test(rawMsg) ||
          data.code === "not_enough_credits" ||
          data.code === "quota_exceeded";
        let errorCategory: EmailErrorCategory = "temporary";
        let retryAfterSeconds = 300;

        if (statusCode === 429) {
          errorCategory = isDaily ? "daily_quota" : "rate_limited";
          const retryHeader = response.headers.get("retry-after");
          if (retryHeader) {
            const parsed = parseInt(retryHeader, 10);
            if (!isNaN(parsed) && parsed > 0) {
              retryAfterSeconds = Math.min(parsed, 3600);
            }
          } else {
            retryAfterSeconds = isDaily ? 21600 : 60;
          }
        } else if (statusCode === 402 || (statusCode === 400 && isDaily)) {
          errorCategory = "daily_quota";
          retryAfterSeconds = 21600;
        } else if (statusCode >= 400 && statusCode < 500) {
          errorCategory = "permanent";
        } else {
          errorCategory = "temporary";
        }

        console.error(`[Brevo Error] Failed sending email to ${recipientEmail}: [${errorCategory}] ${errorMsg}`);
        return { success: false, error: errorMsg, errorCategory, retryAfterSeconds };
      }

      return {
        success: true,
        messageId: data.messageId || `brevo-${Date.now()}`,
      };
    } catch (err: unknown) {
      const errorMessage = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
      console.error(`[Brevo Error] Network error sending to ${recipientEmail}:`, errorMessage);
      return { success: false, error: errorMessage, errorCategory: "temporary", retryAfterSeconds: 300 };
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
    errorCategory: "temporary",
    retryAfterSeconds: 300,
  };
}
