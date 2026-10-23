'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { cancelOrderAction } from '@/app/actions/orders';
import { Loader2, XCircle, ArrowUpRight, Eye } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';
import type { OrderStatus } from '@/types/database';

export interface OrderItemData {
  id: string;
  order_number: string;
  status: OrderStatus;
  amount_pkr: number;
  created_at: string;
  novel_title_snapshot: string;
  rejected_reason: string | null;
  novel_id: string;
  payment_instructions_snapshot: unknown;
  latest_submission?: {
    id: string;
    transaction_reference_tid: string;
    reviewer_status: string;
    screenshot_path: string;
  } | null;
}

export function OrderListItem({ order }: { order: OrderItemData }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  const canCancel = order.status === 'pending_payment' || order.status === 'rejected';

  const handleCancel = () => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setError(null);

    startTransition(async () => {
      const result = await cancelOrderAction(order.id);
      if (!result.success) {
        setError(result.error || 'Failed to cancel order.');
      }
    });
  };

  const handleViewProof = async (path: string) => {
    if (proofUrl) {
      window.open(proofUrl, '_blank');
      return;
    }

    setLoadingProof(true);
    try {
      const res = await fetch(`/api/proofs/signed-url?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok && data.url) {
        setProofUrl(data.url);
        window.open(data.url, '_blank');
      } else {
        alert(data.error || 'Unable to generate secure receipt link.');
      }
    } catch {
      alert('Network error while requesting receipt link.');
    } finally {
      setLoadingProof(false);
    }
  };

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-5 backdrop-blur-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-bold text-amber-500">
              {order.order_number}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Placed on {new Date(order.created_at).toLocaleDateString()} at{' '}
            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="text-right sm:text-right flex items-center justify-between sm:block">
          <span className="text-xs text-stone-400 sm:hidden">Total Amount:</span>
          <span className="text-base font-bold text-white">
            PKR {order.amount_pkr.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <UrduText as="h3" size="lg" className="text-white font-bold">
            {order.novel_title_snapshot}
          </UrduText>
          {order.status === 'rejected' && order.rejected_reason && (
            <p className="mt-1 text-xs text-red-400 bg-red-950/40 border border-red-800/40 px-2.5 py-1.5 rounded-md">
              <strong className="font-semibold">Author Note:</strong> {order.rejected_reason}
            </p>
          )}
          {order.latest_submission && (
            <p className="mt-1 text-xs text-stone-400">
              Reported TID:{' '}
              <span className="font-mono text-stone-200">
                {order.latest_submission.transaction_reference_tid}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {order.latest_submission?.screenshot_path && (
            <button
              type="button"
              onClick={() => handleViewProof(order.latest_submission!.screenshot_path)}
              disabled={loadingProof}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-300 hover:bg-stone-700 hover:text-white transition-colors cursor-pointer"
            >
              {loadingProof ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-amber-500" />
              )}
              <span>Receipt Proof</span>
            </button>
          )}

          <Link
            href={`/orders/${order.order_number}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-400 transition-colors"
          >
            <span>View Order</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>

          {order.status === 'verified' && (
            <Link
              href={`/orders/${order.order_number}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <span>Access Novel</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}

          {canCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/50 hover:text-red-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span>Cancel Order</span>
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
