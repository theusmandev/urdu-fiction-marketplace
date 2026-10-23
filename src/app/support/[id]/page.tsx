import React from 'react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/requireRole';
import { getSupportRequestDetailAction } from '@/app/actions/support';
import { SupportDetailClient } from './SupportDetailClient';

export const dynamic = 'force-dynamic';

interface SupportRequestPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function SupportRequestPage({ params }: SupportRequestPageProps) {
  const { id } = await params;
  await requireAuth(`/support/${id}`);

  const result = await getSupportRequestDetailAction(id);
  if (!result.success || !result.data) {
    notFound();
  }

  return <SupportDetailClient payload={result.data} />;
}
