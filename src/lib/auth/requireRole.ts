import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import type { ProfileRow, UserRole, WriterProfileRow } from '@/types/database';
import type { User } from '@supabase/supabase-js';

export interface AuthenticatedContext {
  user: User;
  profile: ProfileRow;
  writerProfile: WriterProfileRow | null;
}

/**
 * Enforces that a user is actively authenticated.
 * Redirects unauthenticated users to /login with safe ?next= param.
 * Redirects deactivated users to /login with error notification.
 */
export async function requireAuth(nextPath?: string): Promise<AuthenticatedContext> {
  const current = await getCurrentUser();

  if (current.isDeactivated) {
    redirect('/login?error=account_deactivated');
  }

  if (!current.user || !current.profile) {
    const loginUrl = nextPath
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : '/login';
    redirect(loginUrl);
  }

  return {
    user: current.user,
    profile: current.profile,
    writerProfile: current.writerProfile,
  };
}

/**
 * Enforces that the authenticated user possesses one of the allowed application roles.
 */
export async function requireRole(
  allowedRoles: UserRole | UserRole[],
  nextPath?: string
): Promise<AuthenticatedContext> {
  const context = await requireAuth(nextPath);

  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!rolesArray.includes(context.profile.role)) {
    // If user is a reader trying to access admin or writer areas, redirect appropriately
    if (context.profile.role === 'reader') {
      if (rolesArray.includes('writer')) {
        redirect('/become-a-writer');
      }
      redirect('/?error=insufficient_permissions');
    }

    redirect('/?error=insufficient_permissions');
  }

  return context;
}

/**
 * Specialized guard for author areas (/writer/**).
 * Permits users with role 'writer' or users with an active/pending writer application.
 */
export async function requireWriter(nextPath?: string): Promise<{
  user: User;
  profile: ProfileRow;
  writerProfile: WriterProfileRow;
  isPendingApproval: boolean;
}> {
  const context = await requireAuth(nextPath);

  // If user has admin role, allow access as well
  if (context.profile.role === 'admin') {
    return {
      user: context.user,
      profile: context.profile,
      writerProfile: context.writerProfile ?? {
        id: context.user.id,
        pen_name_urdu: 'ایڈمنسٹریٹر',
        pen_name_english: 'Administrator',
        bio_urdu: null,
        bio_english: null,
        status: 'approved',
        custom_commission_rate: 0,
        unpaid_commission_limit_pkr: null,
        unpaid_commission_limit: 5000,
        current_unpaid_commission: 0,
        is_orders_paused_for_commission: false,
        agreement_accepted_at: new Date().toISOString(),
        approved_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      isPendingApproval: false,
    };
  }

  // Must have a writer profile row or role = writer
  if (!context.writerProfile && context.profile.role !== 'writer') {
    redirect('/become-a-writer');
  }

  const wp = context.writerProfile;
  if (!wp) {
    redirect('/become-a-writer');
  }

  if (wp.status === 'rejected') {
    redirect('/become-a-writer?reapply=true');
  }

  return {
    user: context.user,
    profile: context.profile,
    writerProfile: wp,
    isPendingApproval: wp.status === 'pending_approval',
  };
}
