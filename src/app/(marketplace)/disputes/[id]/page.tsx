import React from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/requireRole';
import { getDisputeDetailAction } from '@/app/actions/disputes';
import { DisputeDetailClient } from './DisputeDetailClient';

export const dynamic = 'force-dynamic';

interface DisputePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function DisputePage({ params }: DisputePageProps) {
  const { id } = await params;
  const { user } = await requireAuth(`/disputes/${id}`);

  const result = await getDisputeDetailAction(id);
  if (!result.success || !result.data) {
    notFound();
  }

  return <DisputeDetailClient payload={result.data} currentUserId={user.id} />;
}
