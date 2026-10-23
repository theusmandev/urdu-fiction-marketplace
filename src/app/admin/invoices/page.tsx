import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminInvoicesListClient } from './AdminInvoicesListClient';

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

  const { data, error } = await supabase.rpc('admin_list_invoices', {
    p_status: status || null,
    p_search: search || null,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) {
    console.error('Failed to list admin invoices:', error);
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
