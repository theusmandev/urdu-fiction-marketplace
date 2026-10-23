import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminCommissionOverviewClient } from './AdminCommissionOverviewClient';
import type { AdminWriterCommissionOverview } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function AdminCommissionPage() {
  await requireRole('admin', '/admin/commission');
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc('admin_commission_overview');

  if (error) {
    console.error('Failed to load admin commission overview:', error);
  }

  const writers = (data as AdminWriterCommissionOverview[]) || [];

  return <AdminCommissionOverviewClient writers={writers} />;
}
