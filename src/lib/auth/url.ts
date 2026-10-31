const DEFAULT_ORIGIN = 'https://premium.urdunovelbanks.com';

/**
 * Resolves the canonical public origin (protocol + host) of the application.
 *
 * Priority order:
 * 1. NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL environment variable (if explicitly set and non-empty).
 * 2. Incoming request headers (`x-forwarded-host` / `host`, with `x-forwarded-proto` or auto-detected proto).
 * 3. Default fallback: 'https://premium.urdunovelbanks.com'.
 *
 * Never falls back to 'http://localhost:3000' in a production or non-local context.
 */
export async function getAppOrigin(): Promise<string> {
  // 1. Explicit environment variable
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 2. Derive from incoming request headers if in a server request context
  try {
    const { headers } = await import('next/headers');
    const headerList = await headers();
    const host = headerList.get('x-forwarded-host') || headerList.get('host');
    if (host) {
      const proto =
        headerList.get('x-forwarded-proto') ||
        (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  } catch {
    // headers() throws or is unavailable outside of an active Next.js request context
  }

  // 3. Default to canonical production domain
  return DEFAULT_ORIGIN;
}
