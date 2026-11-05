'use client';

import React from 'react';
import Link from 'next/link';
import { Filter, Bookmark, CheckCircle2, Clock, AlertTriangle, XCircle, RotateCcw, Ban, ChevronRight } from 'lucide-react';
import type { DashboardOrderFunnel, DashboardGenreBreakdown } from '@/types/database';

interface Props {
  funnel: DashboardOrderFunnel;
  genres: DashboardGenreBreakdown[];
}

function formatPkr(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return 'PKR 0';
  }
  return `PKR ${Math.round(Number(val)).toLocaleString('en-PK')}`;
}

export function OrderFunnelGenreCard({ funnel, genres }: Props) {
  const total = funnel.total_orders || 0;

  // Percentage calculations with 0 fallback
  function getPct(cnt: number): number {
    if (!total || total <= 0) return 0;
    return Math.round((cnt / total) * 100);
  }

  const verifiedPct = getPct(funnel.verified);
  const pendingVerifPct = getPct(funnel.pending_verification);
  const pendingPayPct = getPct(funnel.pending_payment);
  const rejectedPct = getPct(funnel.rejected);
  const disputedPct = getPct(funnel.disputed);
  const refundedPct = getPct(funnel.refunded_adjusted);
  const cancelledPct = getPct(funnel.cancelled);

  const maxGenreGmv = Math.max(...genres.map((g) => g.gmv_pkr), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. ORDER FUNNEL BREAKDOWN */}
      <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-main">Order Lifecycle Funnel</h3>
              <p className="text-xs text-muted">
                {total.toLocaleString()} total order transactions across verification stages
              </p>
            </div>
          </div>
          <Link
            href="/admin/orders"
            className="text-xs font-semibold text-accent-admin hover:underline flex items-center gap-1 shrink-0"
          >
            <span>View Orders</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {total === 0 ? (
          <div className="py-10 text-center text-xs text-muted border border-dashed border-border rounded-xl bg-surface-elevated">
            No order volume registered in this window.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Visual Stacked Progress Bar (100% Filled) */}
            <div className="w-full h-4 rounded-full overflow-hidden flex bg-surface-elevated border border-border p-0.5 gap-0.5">
              {funnel.verified > 0 && (
                <div
                  style={{ width: `${(funnel.verified / total) * 100}%` }}
                  className="h-full rounded-sm bg-success-soft border border-success-border transition-all"
                  title={`Verified: ${funnel.verified} (${verifiedPct}%)`}
                />
              )}
              {funnel.pending_verification > 0 && (
                <div
                  style={{ width: `${(funnel.pending_verification / total) * 100}%` }}
                  className="h-full rounded-sm bg-warning-soft border border-warning-border transition-all"
                  title={`Awaiting Verification: ${funnel.pending_verification} (${pendingVerifPct}%)`}
                />
              )}
              {funnel.pending_payment > 0 && (
                <div
                  style={{ width: `${(funnel.pending_payment / total) * 100}%` }}
                  className="h-full rounded-sm bg-surface-elevated border border-border transition-all"
                  title={`Pending Payment: ${funnel.pending_payment} (${pendingPayPct}%)`}
                />
              )}
              {funnel.rejected > 0 && (
                <div
                  style={{ width: `${(funnel.rejected / total) * 100}%` }}
                  className="h-full rounded-sm bg-danger-soft border border-danger-border transition-all"
                  title={`Rejected: ${funnel.rejected} (${rejectedPct}%)`}
                />
              )}
              {funnel.disputed > 0 && (
                <div
                  style={{ width: `${(funnel.disputed / total) * 100}%` }}
                  className="h-full rounded-sm bg-info-soft border border-info-border transition-all"
                  title={`Disputed: ${funnel.disputed} (${disputedPct}%)`}
                />
              )}
              {funnel.refunded_adjusted > 0 && (
                <div
                  style={{ width: `${(funnel.refunded_adjusted / total) * 100}%` }}
                  className="h-full rounded-sm bg-surface border border-border transition-all"
                  title={`Refunded: ${funnel.refunded_adjusted} (${refundedPct}%)`}
                />
              )}
              {funnel.cancelled > 0 && (
                <div
                  style={{ width: `${(funnel.cancelled / total) * 100}%` }}
                  className="h-full rounded-sm bg-surface-elevated border border-border opacity-70 transition-all"
                  title={`Cancelled / Expired: ${funnel.cancelled} (${cancelledPct}%)`}
                />
              )}
            </div>

            {/* Segment Breakdown Grid (All 7 Statuses Accounting for 100% of Orders) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              {/* Verified */}
              <div className="p-3 rounded-xl border border-success-border bg-success-soft text-success-text overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate text-xs font-medium">Verified</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1.5">
                  <span className="text-lg font-bold font-mono">
                    {funnel.verified.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold opacity-80 shrink-0">
                    {verifiedPct}%
                  </span>
                </div>
              </div>

              {/* Awaiting Verification */}
              <div className="p-3 rounded-xl border border-warning-border bg-warning-soft text-warning-text overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate text-xs font-medium">Verifying</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1.5">
                  <span className="text-lg font-bold font-mono">
                    {funnel.pending_verification.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold opacity-80 shrink-0">
                    {pendingVerifPct}%
                  </span>
                </div>
              </div>

              {/* Pending Payment */}
              <div className="p-3 rounded-xl border border-border bg-surface-elevated text-main overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 text-muted">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate text-xs font-medium">Checkout</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1.5">
                  <span className="text-lg font-bold font-mono">
                    {funnel.pending_payment.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold text-muted shrink-0">
                    {pendingPayPct}%
                  </span>
                </div>
              </div>

              {/* Rejected */}
              <div className="p-3 rounded-xl border border-danger-border bg-danger-soft text-danger-text overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate text-xs font-medium">Rejected</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1.5">
                  <span className="text-lg font-bold font-mono">
                    {funnel.rejected.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold opacity-80 shrink-0">
                    {rejectedPct}%
                  </span>
                </div>
              </div>

              {/* Disputed */}
              <div className="p-3 rounded-xl border border-info-border bg-info-soft text-info-text overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate text-xs font-medium">Disputed</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1.5">
                  <span className="text-lg font-bold font-mono">
                    {funnel.disputed.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold opacity-80 shrink-0">
                    {disputedPct}%
                  </span>
                </div>
              </div>

              {/* Refunded */}
              <div className="p-3 rounded-xl border border-border bg-surface text-main overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 text-muted">
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate text-xs font-medium">Refunded</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1.5">
                  <span className="text-lg font-bold font-mono">
                    {funnel.refunded_adjusted.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold text-muted shrink-0">
                    {refundedPct}%
                  </span>
                </div>
              </div>

              {/* Cancelled / Expired */}
              <div className="p-3 rounded-xl border border-border bg-surface-elevated text-muted overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Ban className="w-3.5 h-3.5 shrink-0 text-muted" />
                  <span className="truncate text-xs font-medium">Cancelled</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1.5">
                  <span className="text-lg font-bold font-mono text-main">
                    {funnel.cancelled.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold opacity-80 shrink-0">
                    {cancelledPct}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. GENRE DEMAND BREAKDOWN */}
      <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Bookmark className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-main">Genre Revenue & Demand</h3>
              <p className="text-xs text-muted">Top reader interest categorized by book genres</p>
            </div>
          </div>
          <Link
            href="/admin/genres"
            className="text-xs font-semibold text-accent-admin hover:underline flex items-center gap-1 shrink-0"
          >
            <span>Manage Genres</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {genres.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted border border-dashed border-border rounded-xl bg-surface-elevated">
            No genre sales data available in this timeframe.
          </div>
        ) : (
          <div className="space-y-3">
            {genres.slice(0, 5).map((genre) => {
              const barWidth = Math.max(6, Math.round((genre.gmv_pkr / maxGenreGmv) * 100));
              return (
                <div key={genre.genre_id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-main">{genre.name_en}</span>
                      <span className="font-urdu text-muted text-[13px] leading-none" dir="rtl">
                        {genre.name_ur}
                      </span>
                    </div>
                    <span className="font-bold text-main font-mono">
                      {formatPkr(genre.gmv_pkr)}
                    </span>
                  </div>

                  {/* Relative Volume Bar */}
                  <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden border border-border/40">
                    <div
                      style={{ width: `${barWidth}%` }}
                      className="h-full rounded-full bg-accent-admin transition-all"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{genre.orders_count.toLocaleString()} copies sold</span>
                    <span>{genre.novels_count.toLocaleString()} published novels</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

