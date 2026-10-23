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
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Financial Control
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Immutable Ledger • Multi-Tenant Isolated
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-white mt-1">
            Platform Commission & Author Ledgers
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor writer commission balances, invoice generations, pending payments, and threshold limits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenOverdueModal}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors"
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            Review Overdue Writers
          </button>
          <Link
            href="/admin/commission/reports"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors"
          >
            <Clock className="w-4 h-4 mr-1.5 text-amber-400" />
            Reports Queue
          </Link>
          <Link
            href="/admin/invoices"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors"
          >
            <Receipt className="w-4 h-4 mr-1.5 text-indigo-400" />
            All Invoices
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search writer pen name (English / اردو)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            All Writers ({writers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('at_risk')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'at_risk'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            At Risk (≥80%)
          </button>
          <button
            type="button"
            onClick={() => setFilter('paused')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'paused'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            Orders Paused
          </button>
          <button
            type="button"
            onClick={() => setFilter('overdue')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'overdue'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            Has Overdue
          </button>
        </div>
      </div>

      {/* Writers Overview Table */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
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
            <tbody className="divide-y divide-slate-800">
              {filteredWriters.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
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
                      className="hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">
                          {w.pen_name_english}
                        </div>
                        <UrduText as="div" size="xs" className="text-slate-400 py-0">
                          {w.pen_name_urdu}
                        </UrduText>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {formatPKR2(w.total_accrued_pkr)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-emerald-400">
                        {formatPKR2(w.total_settled_pkr)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-purple-400">
                        {w.pending_reports_count > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px]">
                            {w.pending_reports_count} pending
                          </span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-white">
                        {formatPKR2(w.unpaid_commission_balance_pkr)}
                      </td>

                      <td className="py-3 px-4 min-w-[140px]">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                          <span>{w.percent_of_limit}%</span>
                          <span>Cap: {formatPKR2(w.unpaid_commission_limit_pkr)}</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isPaused || w.percent_of_limit >= 100
                                ? 'bg-rose-500'
                                : isAtRisk
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, w.percent_of_limit)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {w.overdue_invoices_count > 0 ? (
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {w.overdue_invoices_count} overdue
                          </span>
                        ) : (
                          <span className="text-slate-600 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isPaused ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <PauseCircle className="w-3 h-3" />
                            <span>Paused</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <PlayCircle className="w-3 h-3" />
                            <span>Active</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/commission/writers/${w.writer_id}`}
                          className="inline-flex items-center px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition-colors"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5 ml-1" />
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="font-serif font-bold text-lg text-white">
                  Review Overdue Commission Rules
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOverdueModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingPreview ? (
              <div className="py-8 text-center space-y-2 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                <p className="text-xs">Inspecting overdue invoices across all authors...</p>
              </div>
            ) : overdueError ? (
              <div className="p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                {overdueError}
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {overdueSuccess && (
                  <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl">
                    {overdueSuccess}
                  </div>
                )}

                <p className="text-slate-300">
                  Writers whose commission invoices have remained unpaid past the platform due date and grace period are identified below. No writer is suspended automatically; you must explicitly confirm to pause their new orders.
                </p>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>Eligible Overdue Invoices:</span>
                    <span className="font-mono text-rose-400">
                      {overduePreview?.overdue_invoices_count ?? 0} found
                    </span>
                  </div>

                  {overduePreview && overduePreview.overdue_invoices && overduePreview.overdue_invoices.length > 0 ? (
                    <div className="divide-y divide-slate-800 max-h-48 overflow-y-auto pt-2">
                      {overduePreview.overdue_invoices.map((item) => (
                        <div
                          key={item.invoice_id}
                          className="py-2 flex items-center justify-between text-slate-300"
                        >
                          <div>
                            <span className="font-medium text-white">{item.writer_pen_name}</span>
                            <span className="text-slate-400 text-[11px] ml-2 font-mono">Inv: {item.invoice_number}</span>
                          </div>
                          <span className="text-[11px] font-mono text-rose-400">
                            Due: {formatPKR2(item.remaining_owed_pkr)} ({item.days_past_grace}d past grace)
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic py-2">
                      No authors are currently past their overdue grace days. All accounts are compliant.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOverdueModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  {overduePreview && (overduePreview.overdue_invoices_count ?? 0) > 0 && !overdueSuccess && (
                    <button
                      type="button"
                      disabled={isApplyingRules}
                      onClick={handleApplyOverdueRules}
                      className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50"
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
