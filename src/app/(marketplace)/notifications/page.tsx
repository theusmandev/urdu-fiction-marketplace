'use server';

import React from 'react';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { NotificationsClient, type NotificationItem } from './NotificationsClient';

export default async function NotificationsPage() {
  const { user } = await requireAuth('/notifications');
  const supabase = await createClient();

  const notificationsRes = await supabase
    .from('notifications')
    .select(`
      id,
      type,
      title,
      message,
      body,
      link,
      entity_refs,
      is_read,
      read_at,
      created_at
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: notifications, error: notificationsError } = unwrapQuery<NotificationItem[]>(notificationsRes, {
    context: 'NotificationsPage.fetchNotifications',
  });

  return (
    <div className="min-h-screen bg-ivory text-main py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {notificationsError && (
          <div className="p-4 rounded-xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-danger-text" />
            <div>
              <h3 className="font-semibold text-sm">Failed to load notifications</h3>
              <p className="text-xs text-danger-text mt-1">{notificationsError.message}</p>
            </div>
          </div>
        )}
        <NotificationsClient initialNotifications={notifications || []} />
      </div>
    </div>
  );
}
