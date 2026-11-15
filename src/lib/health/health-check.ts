/**
 * Supabase Health Check & Keep-Alive Logic
 *
 * Stateless utility to query Supabase 'genres' with a minimal read to:
 * 1. Keep the Supabase Free Tier project active and prevent the 7-day inactivity pause.
 * 2. Measure database round-trip latency in milliseconds.
 * 3. Return sanitized error states (HTTP 503) without leaking SQL/database internals.
 */

export interface HealthCheckSuccess {
  status: 'healthy';
  timestamp: string;
  latency_ms: number;
}

export interface HealthCheckFailure {
  status: 'degraded';
  timestamp: string;
  error: 'Database unreachable';
}

export type HealthCheckResponse = HealthCheckSuccess | HealthCheckFailure;

export const CACHE_CONTROL_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
} as const;

export interface MinimalSupabaseClient {
  from: (table: string) => {
    select: (cols: string) => {
      limit: (n: number) => PromiseLike<{ data?: unknown; error?: unknown }>;
    };
  };
}

/**
 * Executes a lightweight PostgREST query against the 'genres' table.
 */
export async function checkSupabaseHealth(
  client: MinimalSupabaseClient
): Promise<{ status: 200 | 503; body: HealthCheckResponse; headers: typeof CACHE_CONTROL_HEADERS }> {
  const startTime = Date.now();

  try {
    const { error } = await client
      .from('genres')
      .select('id')
      .limit(1);

    if (error) {
      console.error(
        '[HealthCheck] Supabase database check returned error:',
        (error as { message?: string }).message || error
      );
      return {
        status: 503,
        body: {
          status: 'degraded',
          timestamp: new Date().toISOString(),
          error: 'Database unreachable',
        },
        headers: CACHE_CONTROL_HEADERS,
      };
    }

    const latencyMs = Date.now() - startTime;
    return {
      status: 200,
      body: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        latency_ms: latencyMs,
      },
      headers: CACHE_CONTROL_HEADERS,
    };
  } catch (err: unknown) {
    console.error(
      '[HealthCheck] Unexpected health check exception:',
      err instanceof Error ? err.message : String(err)
    );
    return {
      status: 503,
      body: {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        error: 'Database unreachable',
      },
      headers: CACHE_CONTROL_HEADERS,
    };
  }
}
