import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
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
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
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

  // Auth pages: Redirect authenticated users to home unless handling reset-password token
  const authRoutes = ['/login', '/register', '/forgot-password'];
  if (user && authRoutes.includes(pathname)) {
    const nextParam = request.nextUrl.searchParams.get('next');
    const url = request.nextUrl.clone();
    url.search = '';
    // Allow relative internal redirects
    if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
      url.pathname = nextParam;
    } else {
      url.pathname = '/';
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
