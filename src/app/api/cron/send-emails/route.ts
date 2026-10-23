import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createCronSupabaseClient } from "@/lib/supabase/cron-client";
import { sendEmail } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/send-emails
 * Background email dispatch worker invoked by automated scheduler.
 * Authenticated via Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  // 1. Verify constant-time cron auth
  const authCheck = verifyCronAuth(req);
  if (!authCheck.authorized) {
    return NextResponse.json(
      { error: "Unauthorized", reason: authCheck.reason },
      { status: 401 }
    );
  }

  try {
    const supabase = createCronSupabaseClient();

    // 2. Claim batch of pending emails
    const { data, error: claimError } = await supabase.rpc(
      "claim_pending_emails_for_sending",
      { p_batch_size: 25 }
    );

    const pendingEmails = (data as Array<{
      id: string;
      user_id: string;
      recipient_email: string;
      template: string;
      subject: string;
      body_text: string;
      attempts: number;
    }>) || [];

    if (claimError) {
      console.error("[Cron send-emails] Error claiming pending emails:", claimError.message);
      return NextResponse.json(
        { error: "Failed to claim outbox items", details: claimError.message },
        { status: 500 }
      );
    }

    if (pendingEmails.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending emails in outbox.",
        processed: 0,
        sent: 0,
        failed: 0,
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    // 3. Process claimed items sequentially to respect rate limits
    for (const item of pendingEmails) {
      const emailResult = await sendEmail(item.recipient_email, {
        template: item.template,
        subject: item.subject,
        bodyText: item.body_text,
      });

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
          `[Cron send-emails] Failed to record delivery for ${item.id}:`,
          recordError.message
        );
      }

      if (emailResult.success) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: pendingEmails.length,
      sent: sentCount,
      failed: failedCount,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Cron send-emails] Unexpected exception:", errorMessage);
    return NextResponse.json(
      { error: "Internal server error during email dispatch", details: errorMessage },
      { status: 500 }
    );
  }
}
