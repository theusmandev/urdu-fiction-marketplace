import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { getDisputeDetailAction } from '@/app/actions/disputes';
import { AdminDisputeDetailClient } from './AdminDisputeDetailClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dispute Investigation | UNB Admin',
  description: 'Adjudicate reader-author dispute.',
};

interface AdminDisputeDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AdminDisputeDetailPage({ params }: AdminDisputeDetailPageProps) {
  const { id } = await params;
  await requireRole('admin', `/admin/disputes/${id}`);

  const res = await getDisputeDetailAction(id);
  if (!res.success || !res.data) {
    notFound();
  }

  return <AdminDisputeDetailClient payload={res.data} />;
}
