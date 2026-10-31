import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createClient } from '@/lib/supabase/server';
import type { HeaderSessionUser } from '@/components/layout/public-header-client';

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
 * directly on the server to prevent initial client-side auth UI flickering.
 */
export async function getHeaderSessionUser(): Promise<HeaderSessionUser | null> {
  try {
    const { user, profile, writerProfile } = await getCurrentUser();

    if (!user || !profile) {
      return null;
    }

    const supabase = await createClient();
    const { data: unreadCount, error: countErr } = await supabase.rpc(
      'get_my_unread_notification_count'
    );
    if (countErr) {
      console.error('getHeaderSessionUser: unread count RPC error:', countErr);
    }

    const sessionUser: HeaderSessionUser = {
      id: user.id,
      email: user.email || profile.email,
      name: profile.full_name || profile.username || user.email?.split('@')[0] || 'User',
      username: profile.username,
      avatarUrl: profile.avatar_url,
      role: profile.role,
      isWriter:
        profile.role === 'writer' ||
        writerProfile?.status === 'approved' ||
        writerProfile?.status === 'pending_approval',
      writerStatus: writerProfile?.status ?? null,
      unreadNotificationsCount: unreadCount ?? 0,
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

