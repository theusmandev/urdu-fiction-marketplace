import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { ProfileRow, WriterProfileRow } from '@/types/database';
import { getRoleDashboard } from '@/lib/auth/getRoleDashboard';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
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
            request,
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

  const pathname = request.nextUrl.pathname;

  // Protected route prefixes requiring authentication
  const protectedPrefixes = [
    '/account',
    '/library',
    '/orders',
    '/writer',
    '/admin',
    '/become-a-writer',
  ];

  const isProtected = protectedPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Auth pages: Redirect authenticated users to their role dashboard unless handling a valid internal target
  const authRoutes = ['/login', '/register', '/forgot-password'];
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
        return NextResponse.redirect(errorUrl);
      }

      const { data: writerProfile } = (await supabase
        .from('writer_profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle()) as { data: Pick<WriterProfileRow, 'status'> | null };

      url.pathname = getRoleDashboard(profile?.role, writerProfile?.status);
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
