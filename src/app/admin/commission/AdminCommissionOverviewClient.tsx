'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { UrduText } from '@/components/urdu/UrduText';
import { formatPKR2 } from '@/lib/commission/time';
import { applyOverdueRulesAction } from '@/app/actions/admin-commission';
import type {
  AdminWriterCommissionOverview,
  AdminOverdueRulesResult,
} from '@/types/database';
import {
  Receipt,
  Search,
  AlertTriangle,
  Clock,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  X,
  RefreshCw,
} from 'lucide-react';

interface AdminCommissionOverviewClientProps {
  writers: AdminWriterCommissionOverview[];
}

export function AdminCommissionOverviewClient({
  writers,
}: AdminCommissionOverviewClientProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'at_risk' | 'paused' | 'overdue'>('all');

  // Overdue Rules Modal State
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [overduePreview, setOverduePreview] = useState<AdminOverdueRulesResult | null>(null);
  const [overdueError, setOverdueError] = useState<string | null>(null);
  const [overdueSuccess, setOverdueSuccess] = useState<string | null>(null);

  const filteredWriters = writers.filter((w) => {
    // Search
    const matchesSearch =
      !search ||
      w.pen_name_english.toLowerCase().includes(search.toLowerCase()) ||
      w.pen_name_urdu.includes(search);

    if (!matchesSearch) return false;

    if (filter === 'paused') {
      return w.is_orders_paused;
    }
    if (filter === 'at_risk') {
      return w.percent_of_limit >= 80;
    }
    if (filter === 'overdue') {
      return w.overdue_invoices_count > 0;
    }
    return true;
  });

  const handleOpenOverdueModal = async () => {
    setIsOverdueModalOpen(true);
    setIsLoadingPreview(true);
    setOverdueError(null);
    setOverdueSuccess(null);
    setOverduePreview(null);

    try {
      const res = await applyOverdueRulesAction(false);
      if (!res.success) {
        setOverdueError(res.error || 'Failed to inspect overdue writers.');
      } else {
        setOverduePreview(res.result as AdminOverdueRulesResult);
      }
    } catch (err: unknown) {
      setOverdueError(err instanceof Error ? err.message : 'Unexpected preview error.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleApplyOverdueRules = async () => {
    setIsApplyingRules(true);
    setOverdueError(null);

    try {
      const res = await applyOverdueRulesAction(true);
      if (!res.success) {
        setOverdueError(res.error || 'Failed to apply overdue rules.');
      } else {
        const result = res.result as AdminOverdueRulesResult;
        setOverduePreview(result);
        setOverdueSuccess(`Successfully evaluated overdue rules: ${result.overdue_invoices_count} overdue invoice(s).`);
      }
    } catch (err: unknown) {
      setOverdueError(err instanceof Error ? err.message : 'Unexpected execution error.');
    } finally {
      setIsApplyingRules(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-surface border border-border shadow-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-accent-admin-light text-accent-admin border border-accent-admin-border">
              Financial Control
            </span>
            <span className="text-xs text-secondary font-medium">
              Platform Commission
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy mt-1">
            Platform Commission & Author Ledgers
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Monitor author commission balances, invoices, pending payments, and threshold limits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenOverdueModal}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            Review Overdue Writers
          </button>
          <Link
            href="/admin/commission/reports"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-xl bg-surface hover:bg-ivory text-main border border-border shadow-xs transition-colors"
          >
            <Clock className="w-4 h-4 mr-1.5 text-amber-600" />
            Reports Queue
          </Link>
          <Link
            href="/admin/invoices"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-xl bg-surface hover:bg-ivory text-main border border-border shadow-xs transition-colors"
          >
            <Receipt className="w-4 h-4 mr-1.5 text-accent-admin" />
            All Invoices
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-surface border border-border shadow-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search author pen name (English / اردو)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-surface text-main text-xs placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent-admin/40 focus:border-accent-admin"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-accent-admin text-white'
                : 'bg-surface text-secondary hover:text-navy hover:bg-ivory border border-border'
            }`}
          >
            All Writers ({writers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('at_risk')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              filter === 'at_risk'
                ? 'bg-amber-600 text-white'
                : 'bg-surface text-secondary hover:text-navy hover:bg-ivory border border-border'
            }`}
          >
            At Risk (≥80%)
          </button>
          <button
            type="button"
            onClick={() => setFilter('paused')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              filter === 'paused'
                ? 'bg-rose-600 text-white'
                : 'bg-surface text-secondary hover:text-navy hover:bg-ivory border border-border'
            }`}
          >
            Orders Paused
          </button>
          <button
            type="button"
            onClick={() => setFilter('overdue')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              filter === 'overdue'
                ? 'bg-rose-600 text-white'
                : 'bg-surface text-secondary hover:text-navy hover:bg-ivory border border-border'
            }`}
          >
            Has Overdue
          </button>
        </div>
      </div>

      {/* Writers Overview Table */}
      <div className="bg-surface border border-border shadow-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-ivory/80 border-b border-border text-secondary font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Author Pen Name</th>
                <th className="py-3 px-4 text-right">Accrued</th>
                <th className="py-3 px-4 text-right">Settled</th>
                <th className="py-3 px-4 text-right">Pending Claims</th>
                <th className="py-3 px-4 text-right">Outstanding</th>
                <th className="py-3 px-4">Limit Utilization</th>
                <th className="py-3 px-4 text-center">Overdue</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredWriters.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-secondary">
                    No authors found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredWriters.map((w) => {
                  const isPaused = w.is_orders_paused;
                  const isAtRisk = w.percent_of_limit >= 80;

                  return (
                    <tr
                      key={w.writer_id}
                      className="hover:bg-ivory/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-main">
                          {w.pen_name_english}
                        </div>
                        <UrduText as="div" size="xs" className="text-navy py-0">
                          {w.pen_name_urdu}
                        </UrduText>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-secondary">
                        {formatPKR2(w.total_accrued_pkr)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                        {formatPKR2(w.total_settled_pkr)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-purple-700">
                        {w.pending_reports_count > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-semibold">
                            {w.pending_reports_count} pending
                          </span>
                        ) : (
                          <span className="text-secondary">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-navy">
                        {formatPKR2(w.unpaid_commission_balance_pkr)}
                      </td>

                      <td className="py-3 px-4 min-w-[140px]">
                        <div className="flex items-center justify-between text-[10px] font-mono text-secondary mb-1">
                          <span>{w.percent_of_limit}%</span>
                          <span>Cap: {formatPKR2(w.unpaid_commission_limit_pkr)}</span>
                        </div>
                        <div className="w-full bg-ivory-dark rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isPaused || w.percent_of_limit >= 100
                                ? 'bg-rose-600'
                                : isAtRisk
                                ? 'bg-amber-600'
                                : 'bg-emerald-600'
                            }`}
                            style={{ width: `${Math.min(100, w.percent_of_limit)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {w.overdue_invoices_count > 0 ? (
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                            {w.overdue_invoices_count} overdue
                          </span>
                        ) : (
                          <span className="text-secondary font-mono text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isPaused ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>Paused</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/commission/writers/${w.writer_id}`}
                          className="inline-flex items-center px-3 py-1 rounded-lg bg-surface hover:bg-ivory text-main border border-border text-xs font-semibold shadow-xs transition-colors"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5 ml-1 text-accent-admin" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Overdue Writers Modal */}
      {isOverdueModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="font-serif font-bold text-lg text-navy">
                  Review Overdue Commission Rules
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOverdueModalOpen(false)}
                className="text-secondary hover:text-navy cursor-pointer p-1 rounded-lg hover:bg-ivory"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingPreview ? (
              <div className="py-8 text-center space-y-2 text-secondary">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-accent-admin" />
                <p className="text-xs">Inspecting overdue invoices across all authors...</p>
              </div>
            ) : overdueError ? (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
                {overdueError}
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {overdueSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl">
                    {overdueSuccess}
                  </div>
                )}

                <p className="text-secondary">
                  Writers whose commission invoices have remained unpaid past the platform due date and grace period are identified below. No writer is suspended automatically; you must explicitly confirm to pause their new orders.
                </p>

                <div className="bg-ivory/50 p-4 rounded-xl border border-border space-y-2">
                  <div className="flex items-center justify-between font-semibold text-navy">
                    <span>Eligible Overdue Invoices:</span>
                    <span className="font-mono text-rose-700 font-bold">
                      {overduePreview?.overdue_invoices_count ?? 0} found
                    </span>
                  </div>

                  {overduePreview && overduePreview.overdue_invoices && overduePreview.overdue_invoices.length > 0 ? (
                    <div className="divide-y divide-border max-h-48 overflow-y-auto pt-2">
                      {overduePreview.overdue_invoices.map((item) => (
                        <div
                          key={item.invoice_id}
                          className="py-2 flex items-center justify-between text-secondary"
                        >
                          <div>
                            <span className="font-medium text-main">{item.writer_pen_name}</span>
                            <span className="text-secondary text-[11px] ml-2 font-mono">Inv: {item.invoice_number}</span>
                          </div>
                          <span className="text-[11px] font-mono text-rose-700 font-semibold">
                            Due: {formatPKR2(item.remaining_owed_pkr)} ({item.days_past_grace}d past grace)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-secondary italic py-2">
                      No authors are currently past their overdue grace days. All accounts are compliant.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOverdueModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-surface border border-border text-main hover:bg-ivory text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  {overduePreview && (overduePreview.overdue_invoices_count ?? 0) > 0 && !overdueSuccess && (
                    <button
                      type="button"
                      disabled={isApplyingRules}
                      onClick={handleApplyOverdueRules}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isApplyingRules ? 'Pausing Orders...' : 'Confirm & Pause Overdue Writers'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
