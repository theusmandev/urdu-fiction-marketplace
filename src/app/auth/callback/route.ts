import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSafeRedirectUrl } from '@/lib/auth/safe-redirect';
import { siteConfig } from '@/config/site';
import { attachSessionHintCookie } from '@/lib/auth/session-hint';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Route Handler for Supabase Auth OAuth, Email Confirmation, and Password Recovery callbacks.
 * Supports:
 *  - PKCE flow via `code` (exchangeCodeForSession)
 *  - Token Hash flow via `token_hash` & `type` (verifyOtp)
 *  - Graceful cross-browser email confirmation fallback to login with verified notice
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const nextParam = searchParams.get('next');
  const emailParam = searchParams.get('email');

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

  const supabase = await createClient();

  // 1. Support Token Hash + Type OTP verification (standard Supabase email OTP / verification link)
  if (tokenHash && type) {
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!otpError) {
      if (type === 'recovery') {
        const destination = getSafeRedirectUrl(nextParam, '/reset-password');
        const response = NextResponse.redirect(new URL(destination, baseUrl));
        attachSessionHintCookie(response);
        return response;
      }

      // Successful signup or email confirmation
      const destination = nextParam
        ? getSafeRedirectUrl(nextParam, '/account')
        : `/login?verified=true${emailParam ? `&email=${encodeURIComponent(emailParam)}` : ''}`;
      const response = NextResponse.redirect(new URL(destination, baseUrl));
      attachSessionHintCookie(response);
      return response;
    }
  }

  // 2. Support PKCE code exchange
  if (code) {
    const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!codeError) {
      const destination = getSafeRedirectUrl(nextParam, '/account');
      const response = NextResponse.redirect(new URL(destination, baseUrl));
      attachSessionHintCookie(response);
      return response;
    }
  }

  // 3. Graceful handling for email confirmation / signup flows:
  // If exchangeCodeForSession or verifyOtp failed (e.g., opened in an external browser
  // without the registration PKCE verifier cookie, or clicked a second time after already confirming),
  // do NOT show a scary red auth error if this is a signup/verification link.
  const isRecoveryFlow = type === 'recovery' || nextParam?.includes('reset-password');
  const isSignupConfirmation =
    !isRecoveryFlow && (type === 'signup' || type === 'email' || Boolean(emailParam) || !nextParam);

  if (isSignupConfirmation && (code || tokenHash || emailParam)) {
    const loginTarget = `/login?verified=true${emailParam ? `&email=${encodeURIComponent(emailParam)}` : ''}${
      nextParam ? `&next=${encodeURIComponent(nextParam)}` : ''
    }`;
    return NextResponse.redirect(new URL(loginTarget, baseUrl));
  }

  // If recovery failed or invalid unknown callback
  return NextResponse.redirect(
    new URL('/login?error=auth_callback_failed', baseUrl)
  );
}
