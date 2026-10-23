import React from 'react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminOrderDetailClient } from './AdminOrderDetailClient';
import type { AdminOrderDetailResponse } from '@/types/database';

export const dynamic = 'force-dynamic';

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  await requireRole('admin', '/admin/orders');
  const { id } = await params;

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('admin_get_order', {
    p_order_id: id,
  });

  if (error || !data) {
    notFound();
  }

  const typedOrderData = data as unknown as AdminOrderDetailResponse;

  return <AdminOrderDetailClient orderData={typedOrderData} />;
}
