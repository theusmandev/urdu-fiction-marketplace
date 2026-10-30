import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Public health check endpoint for monitoring uptime (e.g. UptimeRobot, Cloudflare Health Checks).
 * Verifies application worker runtime and Supabase database connectivity with zero exposed secrets.
 */
export async function GET() {
  const startTime = Date.now();
  let dbStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  let dbLatencyMs: number | null = null;

  try {
    const supabase = await createClient();
    const dbStart = Date.now();
    const { error } = await supabase
      .from('genres')
      .select('id')
      .limit(1);

    dbLatencyMs = Date.now() - dbStart;
    dbStatus = error ? 'error' : 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  const isHealthy = dbStatus === 'connected';
  const totalLatencyMs = Date.now() - startTime;

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      runtime: 'cloudflare-worker',
      database: dbStatus,
      latencyMs: totalLatencyMs,
      dbLatencyMs,
      timestamp: new Date().toISOString(),
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

