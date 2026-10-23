/**
 * In-memory sliding-window rate limiter for sensitive writer endpoints
 * (such as manuscript uploads and chapter parsing).
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Checks if a given identifier (e.g. user ID or IP) is within the rate limit.
 *
 * @param identifier Unique string identifying the requester (e.g. user.id)
 * @param limit Maximum allowed requests within the time window (default 10)
 * @param windowMs Duration of the window in milliseconds (default 60,000ms = 1 minute)
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 10,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetAt: number } {
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

/**
 * Clears the rate limit for a specific identifier (primarily for testing).
 */
export function resetRateLimit(identifier: string): void {
  rateLimitMap.delete(identifier);
}
