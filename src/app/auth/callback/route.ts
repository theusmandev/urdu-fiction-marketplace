import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { siteConfig } from '@/config/site';
import { attachSessionHintCookie, removeSessionHintCookie } from '@/lib/auth/session-hint';
import { mapOAuthCallbackError, resolveSafePostAuthRedirect } from '@/lib/auth/callback-helpers';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Route Handler for Supabase Auth OAuth, Email Confirmation, and Password Recovery callbacks.
 * Supports:
 *  - Provider error handling (e.g. Google OAuth consent cancellation)
 *  - PKCE flow via `code` (exchangeCodeForSession)
 *  - Token Hash flow via `token_hash` & `type` (verifyOtp)
 *  - Deactivated user protection: signs out inactive users and blocks session cookie issuance
 *  - Graceful cross-browser email confirmation fallback to login with verified notice
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const errorParam = searchParams.get('error');
  const errorCodeParam = searchParams.get('error_code');
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

  // 0. Handle provider errors (e.g. user clicked Cancel on Google consent screen)
  const oauthError = mapOAuthCallbackError(errorParam, errorCodeParam);
  if (oauthError) {
    return NextResponse.redirect(new URL(oauthError.redirectPath, baseUrl));
  }

  const supabase = await createClient();

  /**
   * Helper to verify user active status before completing authentication.
   * If the user profile is deactivated (is_active = false), immediately signs out,
   * clears the session hint cookie, and redirects to /login?error=account_deactivated.
   */
  const handleAuthenticatedSession = async (destination: string): Promise<NextResponse> => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(new URL('/login?error=auth_callback_failed', baseUrl));
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('auth/callback: profile query error:', profileError);
    }

    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      const response = NextResponse.redirect(new URL('/login?error=account_deactivated', baseUrl));
      removeSessionHintCookie(response);
      return response;
    }

    const response = NextResponse.redirect(new URL(destination, baseUrl));
    attachSessionHintCookie(response);
    return response;
  };

  // 1. Support Token Hash + Type OTP verification (standard Supabase email OTP / verification link)
  if (tokenHash && type) {
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!otpError) {
      if (type === 'recovery') {
        const destination = resolveSafePostAuthRedirect(nextParam, '/reset-password');
        return await handleAuthenticatedSession(destination);
      }

      // Successful signup or email confirmation
      const destination = nextParam
        ? resolveSafePostAuthRedirect(nextParam, '/account')
        : `/login?verified=true${emailParam ? `&email=${encodeURIComponent(emailParam)}` : ''}`;
      return await handleAuthenticatedSession(destination);
    }
  }

  // 2. Support PKCE code exchange
  if (code) {
    const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!codeError) {
      const destination = resolveSafePostAuthRedirect(nextParam, '/account');
      return await handleAuthenticatedSession(destination);
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
