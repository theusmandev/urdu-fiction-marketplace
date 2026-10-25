import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { EmptyState } from '@/components/ui/empty-state';
import { ShoppingBag, ArrowRight, AlertCircle } from 'lucide-react';
import { OrderListItem } from './order-list-item';
import type { OrderStatus } from '@/types/database';

interface ReaderOrderListItem {
  id: string;
  order_number: string;
  status: OrderStatus;
  amount_pkr: number;
  created_at: string;
  novel_title_snapshot: string;
  rejected_reason: string | null;
  novel_id: string;
  payment_instructions_snapshot: unknown;
  payment_submissions: Array<{
    id: string;
    transaction_reference_tid: string;
    reviewer_status: string;
    screenshot_path: string;
    created_at: string;
  }> | null;
}

export default async function OrdersPage() {
  const { user } = await requireAuth('/orders');
  const supabase = await createClient();

  const ordersRes = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      amount_pkr,
      created_at,
      novel_title_snapshot,
      rejected_reason,
      novel_id,
      payment_instructions_snapshot,
      payment_submissions (
        id,
        transaction_reference_tid,
        reviewer_status,
        screenshot_path,
        created_at
      )
    `)
    .eq('reader_id', user.id)
    .order('created_at', { ascending: false });

  const { data: orders, error: ordersError } = unwrapQuery<ReaderOrderListItem[]>(ordersRes, {
    context: 'OrdersPage.fetchOrders',
  });

  const hasOrders = orders && orders.length > 0;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {ordersError && (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-sm">Failed to load orders</h3>
              <p className="text-xs text-red-400/80 mt-1">{ordersError.message}</p>
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <ShoppingBag className="h-7 w-7 text-amber-500" />
              <span>Purchase Orders</span>
            </h1>
            <p className="mt-1 text-sm text-stone-400">
              Track direct bank verification status, resubmit payment proofs, or cancel orders.
            </p>
          </div>
          <Link
            href="/novels"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600/90 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors shrink-0"
          >
            <span>Explore Novels</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {!hasOrders ? (
          <EmptyState
            title="No Orders Found"
            description="You have not placed any novel orders yet. Browse our Urdu fiction catalog to unlock complete novels."
            actionLabel="Discover Novels"
            actionHref="/novels"
            icon={ShoppingBag}
          />
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              // Extract latest submission
              const submissions = Array.isArray(order.payment_submissions)
                ? [...order.payment_submissions].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  )
                : [];
              const latestSubmission = submissions[0] || null;

              return (
                <OrderListItem
                  key={order.id}
                  order={{
                    id: order.id,
                    order_number: order.order_number,
                    status: order.status as OrderStatus,
                    amount_pkr: order.amount_pkr,
                    created_at: order.created_at,
                    novel_title_snapshot: order.novel_title_snapshot,
                    rejected_reason: order.rejected_reason,
                    novel_id: order.novel_id,
                    payment_instructions_snapshot: order.payment_instructions_snapshot,
                    latest_submission: latestSubmission,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
