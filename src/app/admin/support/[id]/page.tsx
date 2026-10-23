import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { getSupportRequestDetailAction } from '@/app/actions/support';
import { AdminSupportDetailClient } from './AdminSupportDetailClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Support Ticket | UNB Admin',
  description: 'Manage and respond to support ticket.',
};

interface AdminSupportDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminSupportDetailPage({ params }: AdminSupportDetailPageProps) {
  const { id } = await params;
  await requireRole('admin', `/admin/support/${id}`);

  const res = await getSupportRequestDetailAction(id);
  if (!res.success || !res.data) {
    notFound();
  }

  return <AdminSupportDetailClient payload={res.data} />;
}
