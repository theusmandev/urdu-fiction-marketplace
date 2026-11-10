import { isEmailServiceConfigured, sendEmail } from "./mailer.ts";

export interface DispatchOutboxResult {
  success: boolean;
  processed: number;
  sent: number;
  failed: number;
  rateLimited?: boolean;
  unconfigured?: boolean;
  error?: string;
}

/**
 * Claims and delivers a batch of pending emails from public.email_outbox.
 * Can be called from background cron workers, admin actions, or immediate post-action triggers.
 *
 * Strict Safety Guarantee:
 * If no email provider or API key is set in the runtime environment, it will safely NOOP
 * without claiming rows or falsely marking them sent, preserving outbox items in 'pending'.
 */
export async function dispatchPendingEmails(
  batchSize: number = 25,
  options?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client?: any;
    allowMockInDevelopment?: boolean;
  }
): Promise<DispatchOutboxResult> {
  const isConfigured = isEmailServiceConfigured();

  // If unconfigured and not in test/explicit mock mode, avoid claiming rows
  if (!isConfigured && process.env.NODE_ENV !== "test" && !options?.allowMockInDevelopment) {
    return {
      success: true,
      processed: 0,
      sent: 0,
      failed: 0,
      unconfigured: true,
    };
  }

  try {
    let supabase = options?.client;
    if (!supabase) {
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createCronSupabaseClient } = await import("../supabase/cron-client.ts");
        supabase = createCronSupabaseClient();
      } else {
        const { createServerClient } = await import("../supabase/server.ts");
        supabase = await createServerClient();
      }
    }

    const { data, error: claimError } = await supabase.rpc(
      "claim_pending_emails_for_sending",
      { p_batch_size: Math.max(1, Math.min(batchSize, 50)) }
    );

    if (claimError) {
      console.error("[Email Dispatcher] Error claiming pending emails:", claimError.message);
      return {
        success: false,
        processed: 0,
        sent: 0,
        failed: 0,
        error: claimError.message,
      };
    }

    const pendingEmails = (data as Array<{
      id: string;
      user_id: string;
      recipient_email: string;
      template: string;
      subject: string;
      body_text: string;
      attempts: number;
    }>) || [];

    if (pendingEmails.length === 0) {
      return {
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
      };
    }

    let sentCount = 0;
    let failedCount = 0;

    // Rate-limit burst pacing:
    // Resend free-tier enforces a burst cap of 2 requests/second.
    // Brevo free-tier enforces ~10 requests/second.
    // Adding 550ms pacing between sequential dispatches in production (~1.8 req/sec)
    // prevents 429 burst errors without sacrificing batch reliability.
    // In test suites (NODE_ENV === "test"), delay is 0ms for instant execution.
    const pacingDelayMs = process.env.NODE_ENV === "test" ? 0 : 550;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < pendingEmails.length; i++) {
      const item = pendingEmails[i];
      if (i > 0 && pacingDelayMs > 0) {
        await sleep(pacingDelayMs);
      }

      const emailResult = await sendEmail(
        item.recipient_email,
        {
          template: item.template,
          subject: item.subject,
          bodyText: item.body_text,
        },
        { allowMockInDevelopment: options?.allowMockInDevelopment }
      );

      if (emailResult.success) {
        const { error: recordError } = await supabase.rpc(
          "record_email_delivery_result",
          {
            p_email_id: item.id,
            p_success: true,
            p_error: null,
            p_is_rate_limited: false,
            p_retry_after: null,
            p_is_permanent: false,
          }
        );

        if (recordError) {
          console.error(
            `[Email Dispatcher] Failed to record delivery status for ${item.id}:`,
            recordError.message
          );
        }
        sentCount++;
      } else {
        const isRateLimited =
          emailResult.errorCategory === "rate_limited" ||
          emailResult.errorCategory === "daily_quota";
        const isPermanent = emailResult.errorCategory === "permanent";

        let retryAfterIso: string | null = null;
        if (isRateLimited) {
          const delayMs = (emailResult.retryAfterSeconds ?? 300) * 1000;
          retryAfterIso = new Date(Date.now() + delayMs).toISOString();
        }

        const { error: recordError } = await supabase.rpc(
          "record_email_delivery_result",
          {
            p_email_id: item.id,
            p_success: false,
            p_error: emailResult.error || "Email delivery failed",
            p_is_rate_limited: isRateLimited,
            p_retry_after: retryAfterIso,
            p_is_permanent: isPermanent,
          }
        );

        if (recordError) {
          console.error(
            `[Email Dispatcher] Failed to record delivery status for ${item.id}:`,
            recordError.message
          );
        }

        if (isPermanent) {
          failedCount++;
        } else if (!isRateLimited) {
          failedCount++;
        }

        // Circuit breaker: If provider hit 429 or exhausted daily quota, stop the batch immediately
        if (isRateLimited) {
          console.warn(
            `[Email Dispatcher] Email provider rate limit or quota hit (${emailResult.errorCategory}). Halting batch dispatch early to protect outbox.`
          );
          return {
            success: true,
            processed: i + 1,
            sent: sentCount,
            failed: failedCount,
            rateLimited: true,
          };
        }
      }
    }

    return {
      success: true,
      processed: pendingEmails.length,
      sent: sentCount,
      failed: failedCount,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Email Dispatcher] Unexpected exception during dispatch:", errorMessage);
    return {
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      error: errorMessage,
    };
  }
}
