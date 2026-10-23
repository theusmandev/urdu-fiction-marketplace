import React from 'react';
import { requireAuth } from '@/lib/auth/requireRole';
import { getMySupportRequestsAction } from '@/app/actions/support';
import { SupportClient } from './SupportClient';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  await requireAuth('/support');
  const result = await getMySupportRequestsAction();
  const requests = result.data || [];

  return <SupportClient initialRequests={requests} />;
}
