import { NextResponse } from 'next/server';
import { getPublicSupabase } from '@/lib/supabase/public';
import { checkSupabaseHealth, CACHE_CONTROL_HEADERS } from '@/lib/health/health-check';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export { CACHE_CONTROL_HEADERS };

/**
 * GET /api/health
 * Public health check and keep-alive endpoint for UptimeRobot / cron-job.org.
 * Executes a stateless, lightweight query on Supabase 'genres' to keep the Free Tier database active.
 */
export async function GET(request?: Request): Promise<NextResponse> {
  try {
    const supabase = getPublicSupabase();
    const result = await checkSupabaseHealth(supabase);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (err: unknown) {
    console.error(
      '[HealthCheck] Unexpected initialization error:',
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        error: 'Database unreachable',
      },
      {
        status: 503,
        headers: CACHE_CONTROL_HEADERS,
      }
    );
  }
}

/**
 * HEAD /api/health
 * Supported for monitoring tools (like UptimeRobot Free Tier) that ping with HEAD by default.
 * Delegates to GET to genuinely execute the Supabase PostgREST query.
 */
export async function HEAD(request?: Request): Promise<NextResponse> {
  return GET(request);
}
