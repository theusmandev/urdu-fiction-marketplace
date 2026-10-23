import React from 'react';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import { adminListRefundRequestsAction } from '@/app/actions/admin-disputes';
import { AdminRefundsClient } from './AdminRefundsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Refund Requests Queue | UNB Admin',
  description: 'Manage off-platform refund adjustment requests.',
};

interface AdminRefundsPageProps {
  searchParams: Promise<{
    status?: string;
    page?: string;
  }>;
}

export default async function AdminRefundsPage({ searchParams }: AdminRefundsPageProps) {
  await requireRole('admin', '/admin/refunds');
  const params = await searchParams;

  const currentStatus = params.status || 'all';
  const currentPage = Math.max(1, parseInt(params.page || '1', 10));
  const limit = 25;
  const offset = (currentPage - 1) * limit;

  const result = await adminListRefundRequestsAction(
    currentStatus === 'all' ? null : currentStatus,
    limit,
    offset
  );

  const requests = result.data?.requests || [];
  const totalCount = result.data?.total_count || 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <AdminRefundsClient
      requests={requests}
      totalCount={totalCount}
      currentStatus={currentStatus}
      currentPage={currentPage}
      totalPages={totalPages}
    />
  );
}
