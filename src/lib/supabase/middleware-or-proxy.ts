import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { ProfileRow, WriterProfileRow } from '@/types/database';
import { getRoleDashboard } from '@/lib/auth/getRoleDashboard';
import { removeSessionHintCookie } from '@/lib/auth/session-hint';

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Protected route prefixes requiring authentication
  const protectedPrefixes = [
    '/account',
    '/library',
    '/orders',
    '/checkout',
    '/writer',
    '/admin',
    '/read',
    '/notifications',
    '/disputes',
    '/support',
    '/tips',
    '/become-a-writer',
  ];

  const isProtected = protectedPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // Auth pages & callbacks requiring session handling / redirection
  const authRoutes = [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/auth',
    '/api/auth',
  ];

  const isAuthRoute = authRoutes.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`)
  );

  // SEO & Core Web Vitals optimization:
  // For public static/ISR routes, NEVER read cookies or call Supabase auth.
  // Returning plain NextResponse.next() preserves static / ISR edge caching and avoids
  // unnecessary network roundtrips to Supabase auth for anonymous visitors and search crawlers.
  if (!isProtected && !isAuthRoute) {
    return NextResponse.next({
      request,
    });
  }

  const allCookies = request.cookies.getAll();
  const hasAuthToken = allCookies.some(
    (c) => c.name.startsWith('sb-') && c.name.includes('-auth-token')
  );

  // Fast anonymous path: If an unauthenticated client requests /api/auth/session
  // and has no Supabase auth cookies, return user: null in <1ms without calling Supabase.
  const isSessionPath = pathname === '/api/auth/session' || pathname === '/api/auth/session/';
  if (isSessionPath && !hasAuthToken) {
    const headers = new Headers();
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Vary', 'Cookie');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return NextResponse.json({ user: null }, { headers });
  }

  // CRITICAL SECURITY RULE: Clean incoming internal headers to prevent spoofing
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-email');

  // Option (b) Security Invariant: Drop proxy-to-route header trust.
  // For /api/auth/session with auth cookies, proxy skips calling getUser() to avoid
  // duplicate Supabase calls, allowing route handler to authoritatively resolve session
  // and handle token refresh with zero header trust.
  if (isSessionPath) {
    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Strict security invariant: enforce host-only auth cookies (no Domain attribute)
            const hostOnlyOptions = { ...(options || {}) };
            delete hostOnlyOptions.domain;
            supabaseResponse.cookies.set(name, value, hostOnlyOptions);
          });
        },
      },
    }
  );

  // CRITICAL SECURITY RULE: Call getUser() for authoritative server verification
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    requestHeaders.set('x-user-id', user.id);
    if (user.email) {
      requestHeaders.set('x-user-email', user.email);
    }
    const finalResponse = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    supabaseResponse.cookies.getAll().forEach((c) => {
      finalResponse.cookies.set(c.name, c.value, c);
    });
    supabaseResponse = finalResponse;
  }

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return redirectRes;
  }

  // Auth pages: Redirect authenticated users to their role dashboard unless handling a valid internal target
  if (user && authRoutes.includes(pathname)) {
    const nextParam = request.nextUrl.searchParams.get('next');
    const url = request.nextUrl.clone();
    url.search = '';

    // Allow relative internal redirects if not pointing to home or another auth route
    if (
      nextParam &&
      nextParam.startsWith('/') &&
      !nextParam.startsWith('//') &&
      nextParam !== '/' &&
      !authRoutes.includes(nextParam)
    ) {
      url.pathname = nextParam;
    } else {
      // Authoritatively resolve user's role and writer status via Supabase
      const { data: profile } = (await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .maybeSingle()) as { data: Pick<ProfileRow, 'role' | 'is_active'> | null };

      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        const errorUrl = request.nextUrl.clone();
        errorUrl.pathname = '/login';
        errorUrl.searchParams.set('error', 'account_deactivated');
        const redirectRes = NextResponse.redirect(errorUrl);
        redirectRes.headers.set('X-Robots-Tag', 'noindex, nofollow');
        removeSessionHintCookie(redirectRes);
        return redirectRes;
      }

      const { data: writerProfile } = (await supabase
        .from('writer_profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle()) as { data: Pick<WriterProfileRow, 'status'> | null };

      url.pathname = getRoleDashboard(profile?.role, writerProfile?.status);
    }
    const redirectRes = NextResponse.redirect(url);
    redirectRes.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return redirectRes;
  }

  if (isProtected || isAuthRoute) {
    supabaseResponse.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return supabaseResponse;
}
