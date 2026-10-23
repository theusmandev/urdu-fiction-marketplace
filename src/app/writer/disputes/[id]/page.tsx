import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { getDisputeDetailAction } from '@/app/actions/disputes';
import { DisputeDetailClient } from '@/app/disputes/[id]/DisputeDetailClient';

export const dynamic = 'force-dynamic';

interface WriterDisputePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function WriterDisputePage({ params }: WriterDisputePageProps) {
  const { id } = await params;
  const { user } = await requireWriter(`/writer/disputes/${id}`);

  const result = await getDisputeDetailAction(id);
  if (!result.success || !result.data) {
    notFound();
  }

  return <DisputeDetailClient payload={result.data} currentUserId={user.id} />;
}
