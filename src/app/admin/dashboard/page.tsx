import React from 'react';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import { getAdminDashboardAnalyticsAction } from '@/app/actions/admin';
import { AdminDashboardClient } from '@/components/admin/dashboard/AdminDashboardClient';
import { AlertCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Executive Analytics & Decision Center | UNB Premium',
};

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    days?: string;
  }>;
}

export default async function AdminDashboardPage({ searchParams }: Props) {
  await requireRole('admin', '/admin/dashboard');

  const params = await searchParams;
  let initialDays = 30;
  if (params.days !== undefined && params.days !== '') {
    const parsed = Number(params.days);
    if (!isNaN(parsed)) {
      initialDays = parsed;
    }
  }

  const res = await getAdminDashboardAnalyticsAction(initialDays);

  if (!res.success || !res.data) {
    return (
      <div className="space-y-6">
        <div className="p-5 rounded-2xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-danger-text" />
          <div className="space-y-1">
            <h3 className="font-bold text-sm">Failed to load executive analytics</h3>
            <p className="text-xs opacity-90">
              {res.error || 'Database RPC get_admin_dashboard_analytics returned an unexpected error.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminDashboardClient
        initialAnalytics={res.data}
        initialDays={initialDays}
      />
    </div>
  );
}

