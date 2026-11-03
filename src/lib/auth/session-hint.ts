/**
 * src/lib/auth/session-hint.ts
 *
 * STRICT SECURITY INVARIANT:
 * `unb_has_session` is exclusively an aesthetic UI display hint cookie.
 * It is read synchronously on the client before React hydration to display neutral skeletons
 * instead of logged-out buttons, eliminating visual auth flickering on static/ISR public pages.
 *
 * THIS COOKIE MUST NEVER BE USED FOR:
 * - Server-side authorization decisions
 * - Access control or Row Level Security (RLS)
 * - Protected route gating
 * - Role verification or sensitive data exposure
 *
 * Authoritative security checks must ALWAYS verify cryptographically signed Supabase
 * JWT tokens via `supabase.auth.getUser()`.
 */

import type { NextResponse } from 'next/server';

export const SESSION_HINT_COOKIE_NAME = 'unb_has_session';
export const SESSION_HINT_COOKIE_VALUE = '1';
export const SESSION_HINT_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export interface SessionHintCookieOptions {
  name: string;
  value: string;
  path: string;
  maxAge: number;
  sameSite: 'lax';
  secure: boolean;
  httpOnly: boolean;
}

/**
 * Returns cookie options for the display hint cookie.
 * Strictly host-only (no domain specified).
 * Non-httpOnly so client-side JavaScript can read it before first paint.
 */
export function getSessionHintCookieOptions(isClear = false): SessionHintCookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    name: SESSION_HINT_COOKIE_NAME,
    value: isClear ? '' : SESSION_HINT_COOKIE_VALUE,
    path: '/',
    maxAge: isClear ? 0 : SESSION_HINT_MAX_AGE,
    sameSite: 'lax',
    secure: isProd,
    httpOnly: false, // Must be readable by client JS for 0ms layout hint
  };
}

/**
 * Sets the aesthetic session display hint cookie in Server Actions or Route Handlers.
 */
export async function setSessionHintCookie(): Promise<void> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const options = getSessionHintCookieOptions(false);
    cookieStore.set(options.name, options.value, {
      path: options.path,
      maxAge: options.maxAge,
      sameSite: options.sameSite,
      secure: options.secure,
      httpOnly: options.httpOnly,
    });
  } catch (err) {
    // In environments where cookies() is read-only or unavailable, fail gracefully
    console.warn('setSessionHintCookie: unable to set cookie in current execution context', err);
  }
}

/**
 * Clears the aesthetic session display hint cookie on logout or account deactivation.
 */
export async function clearSessionHintCookie(): Promise<void> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const options = getSessionHintCookieOptions(true);
    cookieStore.set(options.name, options.value, {
      path: options.path,
      maxAge: options.maxAge,
      sameSite: options.sameSite,
      secure: options.secure,
      httpOnly: options.httpOnly,
    });
  } catch (err) {
    console.warn('clearSessionHintCookie: unable to clear cookie in current execution context', err);
  }
}

/**
 * Attaches the aesthetic session display hint cookie to a NextResponse (e.g. OAuth callback redirect).
 */
export function attachSessionHintCookie(response: NextResponse): void {
  const options = getSessionHintCookieOptions(false);
  response.cookies.set(options.name, options.value, {
    path: options.path,
    maxAge: options.maxAge,
    sameSite: options.sameSite,
    secure: options.secure,
    httpOnly: options.httpOnly,
  });
}

/**
 * Clears the aesthetic session display hint cookie on a NextResponse.
 */
export function removeSessionHintCookie(response: NextResponse): void {
  const options = getSessionHintCookieOptions(true);
  response.cookies.set(options.name, options.value, {
    path: options.path,
    maxAge: options.maxAge,
    sameSite: options.sameSite,
    secure: options.secure,
    httpOnly: options.httpOnly,
  });
}
