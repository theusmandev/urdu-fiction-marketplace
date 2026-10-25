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
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-bold text-accent-admin">
              {order.order_number}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs text-secondary mt-0.5">
            Placed on {new Date(order.created_at).toLocaleDateString()} at{' '}
            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="text-right sm:text-right flex items-center justify-between sm:block">
          <span className="text-xs text-secondary sm:hidden">Total Amount:</span>
          <span className="text-base font-bold text-navy">
            PKR {order.amount_pkr.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <UrduText as="h3" size="xl" className="text-navy font-bold leading-[2.2]">
            {order.novel_title_snapshot}
          </UrduText>
          {order.status === 'rejected' && order.rejected_reason && (
            <p className="mt-1 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
              <strong className="font-semibold">Author Note:</strong> {order.rejected_reason}
            </p>
          )}
          {order.latest_submission && (
            <p className="mt-1 text-xs text-secondary flex items-center gap-1.5">
              <span>Reported TID:</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-main hover:bg-surface-muted transition-colors shadow-xs cursor-pointer"
            >
              {loadingProof ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-accent" />
              )}
              <span>Receipt Proof</span>
            </button>
          )}

          <Link
            href={`/orders/${order.order_number}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted px-3.5 py-1.5 text-xs font-semibold text-main transition-colors shadow-xs"
          >
            <span>View Order</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-secondary" />
          </Link>

          {order.status === 'verified' && (
            <Link
              href={`/orders/${order.order_number}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors shadow-xs"
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
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

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
