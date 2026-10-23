import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminCommissionReportsClient } from './AdminCommissionReportsClient';
import type { AdminCommissionReportItem } from '@/types/database';

export const dynamic = 'force-dynamic';

interface AdminCommissionReportsPageProps {
  searchParams: Promise<{
    status?: string;
  }>;
}

export default async function AdminCommissionReportsPage({
  searchParams,
}: AdminCommissionReportsPageProps) {
  await requireRole('admin', '/admin/commission/reports');
  const params = await searchParams;
  const status = params.status || 'pending';

  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('admin_list_commission_reports', {
    p_status: status === 'all' ? null : status,
  });

  if (error) {
    console.error('Failed to list admin commission reports:', error);
  }

  const reports = (data as AdminCommissionReportItem[]) || [];

  return (
    <AdminCommissionReportsClient
      reports={reports}
      initialStatus={status}
    />
  );
}
