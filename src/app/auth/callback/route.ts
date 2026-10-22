import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSafeRedirectUrl } from '@/lib/auth/safe-redirect';

/**
 * Route Handler for Supabase Auth OAuth, Email Confirmation, and Password Recovery callbacks.
 * Exchanges the temporary auth code for a persistent session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const destination = getSafeRedirectUrl(nextParam, '/account');
      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  // If code exchange failed or expired
  return NextResponse.redirect(
    new URL('/login?error=auth_callback_failed', origin)
  );
}
