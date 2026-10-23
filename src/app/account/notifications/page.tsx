import React from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/requireRole';
import { getNotificationPreferencesAction } from '@/app/actions/notifications';
import { NotificationPreferencesClient } from './NotificationPreferencesClient';

export const metadata: Metadata = {
  title: 'Notification Preferences | UNB Premium',
  description: 'Manage email and notifications settings for your account.',
};

export default async function AccountNotificationsPage() {
  await requireAuth('/account/notifications');
  const res = await getNotificationPreferencesAction();
  const initialEmailEnabled = res.success && res.data ? res.data.email_enabled : true;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6 md:p-8 backdrop-blur-md">
        <NotificationPreferencesClient initialEmailEnabled={initialEmailEnabled} />
      </div>
    </div>
  );
}
