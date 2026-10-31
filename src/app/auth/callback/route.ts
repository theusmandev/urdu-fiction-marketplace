import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSafeRedirectUrl } from '@/lib/auth/safe-redirect';
import { siteConfig } from '@/config/site';

/**
 * Route Handler for Supabase Auth OAuth, Email Confirmation, and Password Recovery callbacks.
 * Exchanges the temporary auth code for a persistent session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');

  // Determine canonical redirect origin (honoring forwarded headers, env URL, and production domain)
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto =
    request.headers.get('x-forwarded-proto') ||
    (forwardedHost?.startsWith('localhost') || forwardedHost?.startsWith('127.0.0.1') ? 'http' : 'https');
  const fallbackOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    siteConfig.url ||
    'https://premium.urdunovelbanks.com';

  let baseUrl = origin;
  if (forwardedHost) {
    baseUrl = `${forwardedProto}://${forwardedHost}`;
  } else if (!baseUrl || baseUrl.includes('localhost')) {
    baseUrl = fallbackOrigin;
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const destination = getSafeRedirectUrl(nextParam, '/account');
      return NextResponse.redirect(new URL(destination, baseUrl));
    }
  }

  // If code exchange failed or expired
  return NextResponse.redirect(
    new URL('/login?error=auth_callback_failed', baseUrl)
  );
}
