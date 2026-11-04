import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron/auth';
import { createCronSupabaseClient } from '@/lib/supabase/cron-client';
import { cleanupOldPaymentProofFiles } from '@/lib/retention/storage-cleanup';

export const dynamic = 'force-dynamic';

/**
 * Background Maintenance & Data Retention Cron Worker
 * Endpoint: /api/cron/cleanup
 *
 * Automatically prunes:
 *   1. chapter_reads older than retention_chapter_reads_days
 *   2. rate limit logs older than retention_rate_limits_days
 *   3. audit_logs older than retention_audit_logs_days
 *   4. email_outbox older than retention_email_outbox_days
 *   5. notifications older than retention_notifications_days
 *   6. chapter_revisions older than retention_chapter_revisions_days
 *   7. stale chapter_drafts older than retention_chapter_drafts_days
 *   8. expired binary payment proof screenshots from 'payment-proofs' bucket
 *
 * Core financial records (orders, ledger, invoices, entitlements) are strictly untouched.
 * Requires Bearer <CRON_SECRET> authentication header.
 */
async function handleCleanup(req: NextRequest) {
  const authCheck = verifyCronAuth(req);
  if (!authCheck.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized', reason: authCheck.reason },
      { status: 401 }
    );
  }

  try {
    const supabase = createCronSupabaseClient();

    // 1. Execute dynamic DB cleanup RPC
    const { data: dbSummary, error: dbError } = await supabase.rpc('run_retention_cleanup');

    if (dbError) {
      console.error('[Cron cleanup] Error in run_retention_cleanup:', dbError.message);
      return NextResponse.json(
        { error: 'Failed to execute database retention cleanup', details: dbError.message },
        { status: 500 }
      );
    }

    // 2. Execute storage proofs cleanup
    const storageResult = await cleanupOldPaymentProofFiles({ client: supabase });

    const rawDb = (dbSummary as Record<string, unknown>) || {};
    const dbBytesFreed = typeof rawDb.db_bytes_freed === 'number' ? rawDb.db_bytes_freed : 0;
    const storageBytesFreed = storageResult.storage_bytes_freed ?? 0;
    const totalBytesFreed = dbBytesFreed + storageBytesFreed;

    const combinedSummary = {
      ...rawDb,
      storage_proofs_deleted: storageResult.deletedFiles,
      storage_bytes_freed: storageBytesFreed,
      total_bytes_freed: totalBytesFreed,
    };

    try {
      await supabase
        .from('platform_settings')
        .update({
          last_retention_cleanup_summary: combinedSummary,
        })
        .eq('id', 1);
    } catch {
      // Non-fatal if platform_settings update fails in background worker
    }

    return NextResponse.json({
      success: true,
      database: dbSummary,
      storage: storageResult,
      summary: combinedSummary,
      total_bytes_freed: totalBytesFreed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[Cron cleanup] Unexpected error:', errorMessage);
    return NextResponse.json(
      { error: 'Internal server error during retention cleanup', details: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

