'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';

export interface NotificationActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Retrieves the current user's email notification preferences.
 */
export async function getNotificationPreferencesAction(): Promise<
  NotificationActionResult<{ email_enabled: boolean }>
> {
  await requireAuth('/account/notifications');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('get_my_notification_preferences');
  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to fetch preferences.',
    };
  }

  return {
    success: true,
    data: { email_enabled: data?.email_enabled ?? true },
  };
}

/**
 * Updates the user's email notifications toggle.
 */
export async function updateNotificationPreferencesAction(
  emailEnabled: boolean
): Promise<NotificationActionResult<{ email_enabled: boolean }>> {
  await requireAuth('/account/notifications');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('update_notification_preferences', {
    p_email_enabled: emailEnabled,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to update preferences.',
    };
  }

  revalidatePath('/account/notifications');

  return {
    success: true,
    data: { email_enabled: data.email_enabled },
    message: emailEnabled
      ? 'Email notifications enabled for optional updates.'
      : 'Email notifications disabled for optional updates. Critical account notices will still be delivered.',
  };
}
