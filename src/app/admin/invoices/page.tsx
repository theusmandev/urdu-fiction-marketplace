import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminInvoicesListClient } from './AdminInvoicesListClient';
import { unwrapQuery } from '@/lib/supabase/query';

export const dynamic = 'force-dynamic';

interface AdminInvoicesPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
  }>;
}

export default async function AdminInvoicesPage({
  searchParams,
}: AdminInvoicesPageProps) {
  await requireRole('admin', '/admin/invoices');
  const params = await searchParams;

  const status = params.status || undefined;
  const search = params.search || undefined;
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  const supabase = await createServerClient();

  const rpcRes = await supabase.rpc('admin_list_invoices', {
    p_status: status || null,
    p_search: search || null,
    p_limit: pageSize,
    p_offset: offset,
  });

  const { data, error: queryError } = unwrapQuery(rpcRes, 'AdminInvoicesPage');

  if (queryError) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto py-8">
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <span>Database Error Loading Commission Invoices</span>
          </div>
          <p className="text-xs text-rose-800/90 leading-relaxed">
            Unable to retrieve commission invoice statements from the database:
          </p>
          <div className="p-3 rounded-xl bg-surface border border-rose-200 text-xs font-mono text-rose-800">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-muted italic">Hint: {queryError.hint}</p>
          )}
        </div>
      </div>
    );
  }

  const invoices = data?.invoices || [];
  const totalCount = data?.total_count ?? 0;

  return (
    <AdminInvoicesListClient
      invoices={invoices}
      totalCount={totalCount}
      initialStatus={status}
      initialSearch={search}
      currentPage={page}
      pageSize={pageSize}
    />
  );
}
