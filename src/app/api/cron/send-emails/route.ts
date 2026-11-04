import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { dispatchPendingEmails } from "@/lib/email/dispatch-outbox";

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

  // 2. Dispatch pending batch
  const result = await dispatchPendingEmails(25);

  if (!result.success) {
    return NextResponse.json(
      { error: "Email dispatch failed", details: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    processed: result.processed,
    sent: result.sent,
    failed: result.failed,
    unconfigured: result.unconfigured || false,
  });
}
