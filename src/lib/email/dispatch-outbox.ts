import { isEmailServiceConfigured, sendEmail } from "./mailer.ts";

export interface DispatchOutboxResult {
  success: boolean;
  processed: number;
  sent: number;
  failed: number;
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

    for (const item of pendingEmails) {
      const emailResult = await sendEmail(
        item.recipient_email,
        {
          template: item.template,
          subject: item.subject,
          bodyText: item.body_text,
        },
        { allowMockInDevelopment: options?.allowMockInDevelopment }
      );

      const { error: recordError } = await supabase.rpc(
        "record_email_delivery_result",
        {
          p_email_id: item.id,
          p_success: emailResult.success,
          p_error: emailResult.error || null,
        }
      );

      if (recordError) {
        console.error(
          `[Email Dispatcher] Failed to record delivery status for ${item.id}:`,
          recordError.message
        );
      }

      if (emailResult.success) {
        sentCount++;
      } else {
        failedCount++;
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
