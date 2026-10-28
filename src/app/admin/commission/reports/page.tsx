import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminCommissionReportsClient } from './AdminCommissionReportsClient';
import type { AdminCommissionReportItem } from '@/types/database';
import { ShieldAlert } from 'lucide-react';
import { unwrapQuery } from '@/lib/supabase/query';

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

  const rpcRes = await supabase.rpc('admin_list_commission_reports', {
    p_status: status === 'all' ? null : status,
  });

  const { data, error: queryError } = unwrapQuery(rpcRes, 'AdminCommissionReportsPage');

  if (queryError) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto py-8">
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 space-y-3 shadow-card">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
            <span>Database Error Loading Platform Fee Reports</span>
          </div>
          <p className="text-xs text-rose-900 leading-relaxed">
            Unable to retrieve platform fee payment reports from the database:
          </p>
          <div className="p-3 rounded-xl bg-surface border border-rose-200 text-xs font-mono text-rose-800">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-secondary italic">Hint: {queryError.hint}</p>
          )}
        </div>
      </div>
    );
  }

  const reports = (data as AdminCommissionReportItem[]) || [];

  return (
    <AdminCommissionReportsClient
      reports={reports}
      initialStatus={status}
    />
  );
}
