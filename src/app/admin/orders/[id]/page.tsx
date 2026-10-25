import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AdminOrderDetailClient } from './AdminOrderDetailClient';
import type { AdminOrderDetailResponse } from '@/types/database';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { unwrapQuery } from '@/lib/supabase/query';

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
    const ordRes = await supabase
      .from('orders')
      .select('id')
      .eq('order_number', id)
      .maybeSingle();

    const { data: ord, error: ordError } = unwrapQuery(ordRes, 'AdminOrderDetailPage.lookupOrderNumber');
    if (ordError) {
      return (
        <div className="space-y-6 max-w-4xl mx-auto py-8">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-main transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Orders</span>
          </Link>
          <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>Database Error Resolving Order Number</span>
            </div>
            <p className="text-xs text-rose-600 leading-relaxed">
              Unable to look up order reference from the database:
            </p>
            <div className="p-3 rounded-xl bg-surface border border-rose-200 text-xs font-mono text-rose-800">
              {ordError.message} {ordError.code ? `(Code: ${ordError.code})` : ''}
            </div>
          </div>
        </div>
      );
    }

    if (ord?.id) {
      targetOrderId = ord.id;
    } else {
      notFound();
    }
  }

  const rpcRes = await supabase.rpc('admin_get_order', {
    p_order_id: targetOrderId,
  });

  const { data, error: queryError } = unwrapQuery(rpcRes, 'AdminOrderDetailPage.admin_get_order');

  if (queryError) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-8">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-main transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Orders</span>
        </Link>
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
          <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Database Error Loading Order</span>
          </div>
          <p className="text-xs text-rose-600 leading-relaxed">
            Unable to retrieve order details from the database:
          </p>
          <div className="p-3 rounded-xl bg-surface border border-rose-200 text-xs font-mono text-rose-800">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-muted italic">Hint: {queryError.hint}</p>
          )}
        </div>
      </div>
    );
  }

  if (!data) {
    notFound();
  }

  const typedOrderData = data as unknown as AdminOrderDetailResponse;

  return <AdminOrderDetailClient orderData={typedOrderData} />;
}
