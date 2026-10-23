import crypto from "node:crypto";

export interface CronRequestLike {
  headers: {
    get(name: string): string | null;
  };
}

/**
 * Validates the Authorization header of an incoming cron request using
 * constant-time string comparison to prevent timing attacks.
 *
 * Expected format: `Authorization: Bearer <CRON_SECRET>`
 */
export function verifyCronAuth(req: CronRequestLike): { authorized: boolean; reason?: string } {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret || configuredSecret.trim().length === 0) {
    return {
      authorized: false,
      reason: "CRON_SECRET environment variable is not configured on server.",
    };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return {
      authorized: false,
      reason: "Missing Authorization header.",
    };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return {
      authorized: false,
      reason: "Malformed Authorization header. Format: Bearer <token>",
    };
  }

  const clientToken = parts[1];

  // Timing-safe constant-time comparison
  const expectedBuffer = Buffer.from(configuredSecret, "utf8");
  const actualBuffer = Buffer.from(clientToken, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    // Lengths differ; still perform dummy timing-safe equal to avoid short-circuit timing leak
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return {
      authorized: false,
      reason: "Invalid cron secret authorization token.",
    };
  }

  const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  if (!isValid) {
    return {
      authorized: false,
      reason: "Invalid cron secret authorization token.",
    };
  }

  return { authorized: true };
}
