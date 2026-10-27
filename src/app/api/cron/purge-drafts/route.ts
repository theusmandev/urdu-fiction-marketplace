import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { createCronSupabaseClient } from "@/lib/supabase/cron-client";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/purge-drafts
 * Periodic draft retention cleanup worker.
 * Purges inactive chapter drafts older than 90 days (configurable via ?days=N).
 * Also cleans up stale rate limit tracking entries.
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
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 90;

    const supabase = createCronSupabaseClient();

    // 2. Invoke purge RPC with service_role privileges
    const { data, error } = await supabase.rpc("purge_old_chapter_drafts", {
      p_days: isNaN(days) || days < 1 ? 90 : days,
    });

    if (error) {
      console.error("[Cron purge-drafts] Error executing purge_old_chapter_drafts:", error.message);
      return NextResponse.json(
        { error: "Failed to purge chapter drafts", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: data,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[Cron purge-drafts] Unexpected error:", errorMessage);
    return NextResponse.json(
      { error: "Internal server error during draft purge processing", details: errorMessage },
      { status: 500 }
    );
  }
}
