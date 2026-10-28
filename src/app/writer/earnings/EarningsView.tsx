'use client';

import React, { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatKarachiDateTime, formatPKR2, getKarachiMonthBounds } from '@/lib/commission/time';
import type { WriterSalesSummary, WriterLedgerEntry } from '@/types/database';
import {
  TrendingUp,
  Receipt,
  Download,
  Filter,
  AlertTriangle,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

interface EarningsViewProps {
  summary: WriterSalesSummary | null;
  ledgerEntries: WriterLedgerEntry[];
  totalLedgerCount: number;
  initialFrom?: string;
  initialTo?: string;
  initialEntryType?: string;
  currentPage: number;
  pageSize: number;
}

export function EarningsView({
  summary,
  ledgerEntries,
  totalLedgerCount,
  initialFrom = '',
  initialTo = '',
  initialEntryType = '',
  currentPage,
  pageSize,
}: EarningsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [entryType, setEntryType] = useState(initialEntryType);

  const applyFilters = (newFrom = from, newTo = to, newType = entryType) => {
    const params = new URLSearchParams();
    if (newFrom) params.set('from', newFrom);
    if (newTo) params.set('to', newTo);
    if (newType) params.set('entry_type', newType);
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePreset = (preset: 'this_month' | 'last_month' | 'all_time') => {
    if (preset === 'all_time') {
      setFrom('');
      setTo('');
      applyFilters('', '', entryType);
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    let targetYear = currentYear;
    let targetMonth = currentMonth;

    if (preset === 'last_month') {
      if (currentMonth === 1) {
        targetYear = currentYear - 1;
        targetMonth = 12;
      } else {
        targetMonth = currentMonth - 1;
      }
    }

    const bounds = getKarachiMonthBounds(targetYear, targetMonth);
    setFrom(bounds.periodStartIso);
    setTo(bounds.periodEndIso);
    applyFilters(bounds.periodStartIso, bounds.periodEndIso, entryType);
  };

  const handleReset = () => {
    setFrom('');
    setTo('');
    setEntryType('');
    router.push(pathname);
  };

  const totalPages = Math.max(1, Math.ceil(totalLedgerCount / pageSize));

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('page', newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  // Build CSV export URL with current filters
  const exportParams = new URLSearchParams();
  if (from) exportParams.set('from', from);
  if (to) exportParams.set('to', to);
  if (entryType) exportParams.set('entry_type', entryType);
  const exportUrl = `/api/writer/export-sales?${exportParams.toString()}`;

  const isPaused = summary?.is_orders_paused ?? false;

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-success-soft text-success-text">
              Financial Ledger
            </span>
            <span className="text-xs text-secondary font-mono">
              Immutable • Asia/Karachi (PKT)
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy mt-1">
            Author Earnings & Sales Ledger
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Real-time auditable record of verified reader sales, platform fees, and refunds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={exportUrl}
            download
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-navy text-white hover:bg-navy-light shadow-sm transition-colors"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </a>
          <Link
            href="/writer/commission"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg border border-border bg-surface text-secondary hover:text-navy hover:bg-ivory shadow-sm transition-colors"
          >
            <ShieldCheck className="w-4 h-4 mr-1.5 text-accent" />
            Platform Fee & Invoices
          </Link>
        </div>
      </div>

      {/* Paused Alert Banner */}
      {isPaused && (
        <div className="p-4 bg-danger-soft border border-danger-border rounded-xl text-danger-text flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-danger-text mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-sm">
              New Reader Orders Paused (Platform Fee Threshold Exceeded)
            </div>
            <p>
              Your outstanding platform fee has exceeded PKR{' '}
              {summary?.unpaid_commission_limit_pkr?.toLocaleString() ?? '5,000'}. New reader checkouts
              are paused. Please view your open invoice and report payment to resume sales.
            </p>
          </div>
        </div>
      )}

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Verified Sales */}
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Verified Sales</span>
            <TrendingUp className="w-4 h-4 text-success" />
          </div>
          <div className="text-2xl font-bold text-navy">
            {summary?.sales_count ?? 0}
          </div>
          <p className="text-[11px] text-secondary">
            Gross Volume: {formatPKR2(summary?.total_gross_pkr ?? 0)}
          </p>
        </div>

        {/* Writer Net Earnings */}
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Writer Net Earnings</span>
            <Receipt className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold text-success-text">
            {formatPKR2(summary?.total_net_pkr ?? 0)}
          </div>
          <p className="text-[11px] text-secondary">
            Retained directly via bank & mobile wallet
          </p>
        </div>

        {/* Accrued Platform Fee */}
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Accrued Platform Fee</span>
            <ShieldCheck className="w-4 h-4 text-navy" />
          </div>
          <div className="text-2xl font-bold text-navy">
            {formatPKR2(summary?.total_commission_pkr ?? 0)}
          </div>
          <p className="text-[11px] text-secondary">
            Refunds: -{formatPKR2(summary?.refunds_amount_pkr ?? 0)}
          </p>
        </div>

        {/* Outstanding Unpaid Balance */}
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding Balance</span>
            <AlertTriangle className={`w-4 h-4 ${isPaused ? 'text-danger-text' : 'text-accent-strong'}`} />
          </div>
          <div className={`text-2xl font-bold ${isPaused ? 'text-danger-text' : 'text-navy'}`}>
            {formatPKR2(summary?.unpaid_commission_balance_pkr ?? 0)}
          </div>
          <p className="text-[11px] text-secondary">
            Threshold Limit: {formatPKR2(summary?.unpaid_commission_limit_pkr ?? 5000)}
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-surface rounded-xl border border-border p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-navy">
            <Filter className="w-4 h-4 text-accent" />
            <span>Filter Sales Ledger</span>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handlePreset('this_month')}
              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border bg-ivory text-secondary hover:text-navy hover:bg-surface-muted transition-colors"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => handlePreset('last_month')}
              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border bg-ivory text-secondary hover:text-navy hover:bg-surface-muted transition-colors"
            >
              Last Month
            </button>
            <button
              type="button"
              onClick={() => handlePreset('all_time')}
              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border bg-ivory text-secondary hover:text-navy hover:bg-surface-muted transition-colors"
            >
              All Time
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-secondary mb-1">
              From (PKT Date)
            </label>
            <input
              type="date"
              value={from ? from.slice(0, 10) : ''}
              onChange={(e) => {
                const val = e.target.value ? `${e.target.value}T00:00:00+05:00` : '';
                setFrom(val);
              }}
              className="w-full px-3 py-1.5 rounded-lg border border-border bg-white text-navy focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-secondary mb-1">
              To (PKT Date)
            </label>
            <input
              type="date"
              value={to ? to.slice(0, 10) : ''}
              onChange={(e) => {
                const val = e.target.value ? `${e.target.value}T23:59:59+05:00` : '';
                setTo(val);
              }}
              className="w-full px-3 py-1.5 rounded-lg border border-border bg-white text-navy focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-secondary mb-1">
              Entry Type
            </label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-border bg-white text-navy focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Transactions</option>
              <option value="sale_verified">Sale Verified</option>
              <option value="refund_adjustment">Refund Adjustment</option>
              <option value="manual_correction">Manual Correction</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => applyFilters()}
              className="flex-1 px-3 py-1.5 bg-navy text-white text-xs font-medium rounded-lg hover:bg-navy-light transition-colors"
            >
              Apply Filter
            </button>
            {(from || to || entryType) && (
              <button
                type="button"
                onClick={handleReset}
                title="Reset filters"
                className="p-2 border border-border rounded-lg text-secondary hover:text-navy hover:bg-surface-muted transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ledger Table (Desktop) / Cards (Mobile) */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-accent" />
            <h2 className="font-serif font-bold text-sm text-navy">
              Transactions Ledger ({totalLedgerCount})
            </h2>
          </div>
          <span className="text-[11px] text-secondary">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {ledgerEntries.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
              <Receipt className="w-6 h-6 text-text-muted" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-main">No transactions found</p>
              <p className="text-[11px] text-secondary max-w-sm mx-auto">
                No ledger records match the selected date boundaries and transaction filter.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-ivory border-b border-border text-secondary font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Date (PKT)</th>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Novel</th>
                    <th className="py-3 px-4">Reader</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Gross</th>
                    <th className="py-3 px-4 text-right">Rate</th>
                    <th className="py-3 px-4 text-right">Platform Fee</th>
                    <th className="py-3 px-4 text-right">Net</th>
                    <th className="py-3 px-4">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledgerEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-surface-muted transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-secondary">
                        {formatKarachiDateTime(entry.created_at)}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-navy">
                        {entry.order_number || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-main line-clamp-1">{entry.novel_title}</div>
                      </td>
                      <td className="py-3 px-4 text-secondary">
                        {entry.reader_display_name}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={entry.entry_type} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-navy">
                        {formatPKR2(entry.gross_amount_pkr)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-secondary">
                        {entry.commission_rate.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-danger-text">
                        {formatPKR2(entry.platform_commission_pkr)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-success-text">
                        {formatPKR2(entry.writer_net_pkr)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {entry.invoice_number ? (
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-info-soft text-info-text border border-info-border">
                            {entry.invoice_number}
                          </span>
                        ) : (
                          <span className="text-[11px] text-secondary">Unbilled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-border">
              {ledgerEntries.map((entry) => (
                <div key={entry.id} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-secondary">
                      {formatKarachiDateTime(entry.created_at)}
                    </span>
                    <StatusBadge status={entry.entry_type} size="sm" />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-navy line-clamp-1">
                      {entry.novel_title}
                    </div>
                    <div className="text-[11px] text-secondary flex items-center gap-2 mt-0.5">
                      <span>Order: {entry.order_number || 'N/A'}</span>
                      <span>•</span>
                      <span>Reader: {entry.reader_display_name}</span>
                    </div>
                  </div>

                  <div className="bg-ivory rounded-lg p-2.5 border border-border grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <div className="text-[10px] text-secondary uppercase">Gross</div>
                      <div className="font-mono font-semibold text-navy">
                        {formatPKR2(entry.gross_amount_pkr)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-secondary uppercase">Platform Fee</div>
                      <div className="font-mono font-semibold text-danger-text">
                        {formatPKR2(entry.platform_commission_pkr)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-secondary uppercase">Writer Net</div>
                      <div className="font-mono font-bold text-success-text">
                        {formatPKR2(entry.writer_net_pkr)}
                      </div>
                    </div>
                  </div>

                  {entry.invoice_number && (
                    <div className="text-[11px] text-secondary flex items-center justify-between">
                      <span>Billed in Invoice:</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-info-soft text-info-text border border-info-border">
                        {entry.invoice_number}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-border flex items-center justify-between text-xs">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => goToPage(currentPage - 1)}
                  className="px-3 py-1.5 rounded-lg border border-border text-secondary hover:text-navy disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-secondary font-mono">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => goToPage(currentPage + 1)}
                  className="px-3 py-1.5 rounded-lg border border-border text-secondary hover:text-navy disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
