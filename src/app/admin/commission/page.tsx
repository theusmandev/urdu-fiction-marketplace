import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminCommissionOverviewClient } from './AdminCommissionOverviewClient';
import type { AdminWriterCommissionOverview } from '@/types/database';
import { ShieldAlert } from 'lucide-react';
import { unwrapQuery } from '@/lib/supabase/query';

export const dynamic = 'force-dynamic';

export default async function AdminCommissionPage() {
  await requireRole('admin', '/admin/commission');
  const supabase = await createServerClient();

  const rpcRes = await supabase.rpc('admin_commission_overview');
  const { data, error: queryError } = unwrapQuery(rpcRes, 'AdminCommissionPage.admin_commission_overview');

  if (queryError) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto py-8">
        <div className="p-6 rounded-2xl bg-danger-soft border border-danger-border space-y-3 shadow-card">
          <div className="flex items-center gap-2 text-danger-text font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-danger-text" />
            <span>Database Error Loading Platform Fee Overview</span>
          </div>
          <p className="text-xs text-danger-text leading-relaxed">
            Unable to retrieve platform fee overview data from the database:
          </p>
          <div className="p-3 rounded-xl bg-surface border border-danger-border text-xs font-mono text-danger-text">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-secondary italic">Hint: {queryError.hint}</p>
          )}
        </div>
      </div>
    );
  }

  const writers = (data as AdminWriterCommissionOverview[]) || [];

  return <AdminCommissionOverviewClient writers={writers} />;
}
