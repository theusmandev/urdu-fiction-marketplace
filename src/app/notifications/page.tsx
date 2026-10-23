'use server';

import React from 'react';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { NotificationsClient } from './NotificationsClient';

export default async function NotificationsPage() {
  const { user } = await requireAuth('/notifications');
  const supabase = await createClient();

  const { data: notifications } = await supabase
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

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <NotificationsClient initialNotifications={notifications || []} />
      </div>
    </div>
  );
}
