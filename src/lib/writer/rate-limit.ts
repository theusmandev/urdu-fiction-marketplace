/**
 * Sliding-window rate limiter for sensitive writer endpoints
 * (such as manuscript uploads and chapter parsing).
 *
 * Supports both:
 * 1. Database-backed atomic rate limiting via Supabase RPC `check_rate_limit` (production/Cloudflare Workers).
 * 2. In-memory sliding-window fallback for unit tests and local mock environments.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Synchronous in-memory rate limit check (used by tests & local fallback).
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000
): RateLimitResult {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  // If no record exists or window expired, create a fresh window
  if (!record || now > record.resetAt) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitMap.set(identifier, newRecord);
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAt: newRecord.resetAt,
    };
  }

  // If limit reached, deny request
  if (record.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
    };
  }

  // Increment count within active window
  record.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - record.count),
    resetAt: record.resetAt,
  };
}

export interface SupabaseRpcCaller {
  rpc(
    fn: string,
    args?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Database-backed rate limit check via Supabase RPC `check_rate_limit`.
 * Falls back to in-memory check if client is omitted or query fails.
 */
export async function checkRateLimitAsync(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000,
  client?: SupabaseRpcCaller | null
): Promise<RateLimitResult> {
  if (client && typeof client.rpc === 'function') {
    try {
      const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      const { data, error } = await client.rpc('check_rate_limit', {
        p_identifier: identifier,
        p_max_requests: limit,
        p_window_seconds: windowSeconds,
      });

      if (!error && data && typeof data === 'object') {
        const payload = data as { allowed?: boolean; remaining?: number; reset_at?: string };
        return {
          allowed: Boolean(payload.allowed),
          remaining: Number(payload.remaining ?? 0),
          resetAt: payload.reset_at ? new Date(payload.reset_at).getTime() : Date.now() + windowMs,
        };
      }
      if (error) {
        console.warn('[RateLimit] Database RPC returned error, using fallback:', error.message);
      }
    } catch (err) {
      console.warn('[RateLimit] Database rate limit RPC failed, using fallback:', err);
    }
  }

  return checkRateLimit(identifier, limit, windowMs);
}

/**
 * Clears the rate limit for a specific identifier.
 */
export function resetRateLimit(identifier: string): void {
  rateLimitMap.delete(identifier);
}

/**
 * Asynchronously clears rate limits from database and memory.
 */
export async function resetRateLimitAsync(
  identifier: string,
  client?: SupabaseRpcCaller | null
): Promise<void> {
  resetRateLimit(identifier);
  if (client && typeof client.rpc === 'function') {
    try {
      await client.rpc('reset_rate_limit', { p_identifier: identifier });
    } catch {
      // Ignored
    }
  }
}
