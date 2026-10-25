import React from 'react';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminShellClient } from '@/components/layout/admin/AdminShellClient';

export const metadata: Metadata = {
  title: 'Admin Control Center | UNB Premium',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  // Fetch queue counts in parallel via lightweight head queries
  const [
    { count: openDisputesCount },
    { count: pendingRefundsCount },
    { count: pendingReportsCount },
    { count: pendingWritersCount },
    { count: underReviewNovelsCount },
    { data: unreadNotificationsCount },
  ] = await Promise.all([
    supabase
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'under_review']),
    supabase
      .from('refund_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('commission_payment_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('writer_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval'),
    supabase
      .from('novels')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'under_review'),
    supabase.rpc('get_my_unread_notification_count'),
  ]);

  const counts = {
    openDisputesCount: openDisputesCount ?? 0,
    pendingRefundsCount: pendingRefundsCount ?? 0,
    pendingReportsCount: pendingReportsCount ?? 0,
    pendingWritersCount: pendingWritersCount ?? 0,
    underReviewNovelsCount: underReviewNovelsCount ?? 0,
  };

  return (
    <AdminShellClient
      profile={profile}
      counts={counts}
      unreadNotificationsCount={unreadNotificationsCount ?? 0}
    >
      {children}
    </AdminShellClient>
  );
}
