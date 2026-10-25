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
  let targetOrderId = id;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    const { data: ord } = await supabase
      .from('orders')
      .select('id')
      .eq('order_number', id)
      .maybeSingle();

    if (ord?.id) {
      targetOrderId = ord.id;
    } else {
      notFound();
    }
  }

  const { data, error } = await supabase.rpc('admin_get_order', {
    p_order_id: targetOrderId,
  });

  if (error || !data) {
    notFound();
  }

  const typedOrderData = data as unknown as AdminOrderDetailResponse;

  return <AdminOrderDetailClient orderData={typedOrderData} />;
}
