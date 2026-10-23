import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createCronSupabaseClient } from "@/lib/supabase/cron-client";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/reminders
 * Periodic scheduled reminder worker.
 * Checks for:
 *   - Payment submitted orders pending writer verification (>12h, >24h)
 *   - Payment submitted orders stuck without action (>48h admin alert)
 *   - Invoices due in 2 days
 *   - Invoices overdue
 *   - Disputes open with no admin action for >3 days
 * Authenticated via Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  // 1. Constant-time authentication
  const authCheck = verifyCronAuth(req);
  if (!authCheck.authorized) {
    return NextResponse.json(
      { error: "Unauthorized", reason: authCheck.reason },
      { status: 401 }
    );
  }

  try {
    const supabase = createCronSupabaseClient();

    // 2. Invoke idempotent reminder calculation RPC
    const { data, error } = await supabase.rpc("run_scheduled_reminders");
    const reminderResult = data as { success?: boolean; enqueued_reminders?: number } | null;

    if (error) {
      console.error("[Cron reminders] Error executing run_scheduled_reminders:", error.message);
      return NextResponse.json(
        { error: "Failed to run scheduled reminders", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      enqueued_reminders: reminderResult?.enqueued_reminders ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Cron reminders] Unexpected error:", errorMessage);
    return NextResponse.json(
      { error: "Internal server error during reminder processing", details: errorMessage },
      { status: 500 }
    );
  }
}
