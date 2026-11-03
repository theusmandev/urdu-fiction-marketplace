import { createClient } from '@/lib/supabase/server';
import type { HeaderSessionUser } from '@/components/layout/public-header-client';
import { clearSessionHintCookie } from '@/lib/auth/session-hint';

function isDynamicServerError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === 'string' &&
    (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))
  );
}

/**
 * Server-side session resolver for Header & Navigation layouts.
 * Authoritatively retrieves authenticated user profile and unread notifications count
 * directly from cryptographically signed Supabase auth tokens.
 *
 * Security Invariant: Zero header trust. Identity is established strictly via
 * Supabase auth tokens, never from unverified request headers.
 * Queries profiles, writer_profiles, and unread notification count in parallel via Promise.all.
 */
export async function getHeaderSessionUser(): Promise<HeaderSessionUser | null> {
  try {
    const supabase = await createClient();

    // 1. Authoritative verification of signed JWT via Supabase Auth (handles token refresh automatically)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    // 2. Parallel execution of profile, writer_profile, and unread notification count
    const [profileRes, writerProfileRes, unreadCountRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url, role, is_active, email')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('writer_profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.rpc('get_my_unread_notification_count'),
    ]);

    if (profileRes.error) {
      console.error('getHeaderSessionUser: failed to fetch profile:', profileRes.error);
    }
    if (writerProfileRes.error) {
      console.error('getHeaderSessionUser: failed to fetch writer profile:', writerProfileRes.error);
    }
    if (unreadCountRes.error) {
      console.error('getHeaderSessionUser: unread count RPC error:', unreadCountRes.error);
    }

    const profile = profileRes.data;
    if (!profile) {
      return null;
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      await clearSessionHintCookie();
      return null;
    }

    const writerProfile = writerProfileRes.data;
    const unreadCount = unreadCountRes.data ?? 0;

    const sessionUser: HeaderSessionUser = {
      id: user.id,
      email: profile.email || user.email || '',
      name: profile.full_name || profile.username || user.email?.split('@')[0] || 'User',
      username: profile.username,
      avatarUrl: profile.avatar_url,
      role: profile.role,
      isWriter:
        profile.role === 'writer' ||
        writerProfile?.status === 'approved' ||
        writerProfile?.status === 'pending_approval',
      writerStatus: writerProfile?.status ?? null,
      unreadNotificationsCount: unreadCount,
    };

    return sessionUser;
  } catch (err) {
    if (isDynamicServerError(err)) {
      throw err;
    }
    console.error('getHeaderSessionUser: unexpected error resolving session:', err);
    return null;
  }
}
