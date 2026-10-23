'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatKarachiDateTime, formatPKR2 } from '@/lib/commission/time';
import type { WriterSalesSummary, WriterInvoiceSummary } from '@/types/database';
import {
  Receipt,
  Clock,
  ChevronRight,
  Info,
  Calendar,
} from 'lucide-react';

interface CommissionOverviewViewProps {
  summary: WriterSalesSummary | null;
  invoices: WriterInvoiceSummary[];
}

export function CommissionOverviewView({ summary, invoices }: CommissionOverviewViewProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'settled' | 'overdue'>('all');

  const outstanding = summary?.unpaid_commission_balance_pkr ?? 0;
  const limit = summary?.unpaid_commission_limit_pkr ?? 5000;
  const percentage = limit > 0 ? Math.min(100, Math.round((outstanding / limit) * 100)) : 0;
  const isPaused = summary?.is_orders_paused ?? false;

  let meterColor = 'bg-emerald-500';
  let meterTextColor = 'text-emerald-700';
  let meterBadge = 'Good Standing';
  let meterBadgeClass = 'bg-emerald-100 text-emerald-800';

  if (percentage >= 100 || isPaused) {
    meterColor = 'bg-rose-500';
    meterTextColor = 'text-rose-700';
    meterBadge = 'Orders Paused (100% Exceeded)';
    meterBadgeClass = 'bg-rose-100 text-rose-800';
  } else if (percentage >= 80) {
    meterColor = 'bg-amber-500';
    meterTextColor = 'text-amber-700';
    meterBadge = 'Threshold Warning (≥ 80%)';
    meterBadgeClass = 'bg-amber-100 text-amber-800';
  }

  const filteredInvoices = invoices.filter((inv) => {
    if (filter === 'open') {
      return inv.status === 'invoiced' || inv.status === 'partially_paid' || inv.status === 'payment_reported';
    }
    if (filter === 'settled') {
      return inv.status === 'settled';
    }
    if (filter === 'overdue') {
      return inv.is_overdue && inv.status !== 'settled' && inv.status !== 'void';
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${meterBadgeClass}`}>
              {meterBadge}
            </span>
            <span className="text-xs text-secondary font-mono">
              UNB Remittance Model
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy mt-1">
            Platform Commission & Billing Invoices
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Track your unpaid platform balance, inspect monthly commission statements, and report settlements.
          </p>
        </div>

        <Link
          href="/writer/earnings"
          className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-navy text-white hover:bg-navy-light shadow-sm transition-colors"
        >
          <Receipt className="w-4 h-4 mr-1.5" />
          View Sales Ledger
        </Link>
      </div>

      {/* Threshold & Meter Section */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Outstanding Commission Balance
            </span>
            <div className="flex items-baseline gap-3 mt-1">
              <span className={`text-3xl font-bold font-mono ${meterTextColor}`}>
                {formatPKR2(outstanding)}
              </span>
              <span className="text-xs text-secondary">
                of {formatPKR2(limit)} threshold limit
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-navy">
              {percentage}%
            </div>
            <span className="text-[11px] text-secondary">
              Threshold Utilization
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-slate-100 rounded-full h-3.5 p-0.5 overflow-hidden border border-border">
            <div
              className={`h-full rounded-full transition-all duration-500 ${meterColor}`}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-secondary font-mono">
            <span>0% (PKR 0.00)</span>
            <span className="text-amber-600 font-semibold">80% Alert (PKR {(limit * 0.8).toLocaleString()})</span>
            <span className="text-rose-600 font-semibold">100% Pause (PKR {limit.toLocaleString()})</span>
          </div>
        </div>

        {/* Explain Plain Language Terms Accordion / Cards */}
        <div className="bg-ivory rounded-xl p-4 border border-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-navy">
            <Info className="w-4 h-4 text-accent" />
            <span>How UNB Commission & Direct Payments Work</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-surface p-3 rounded-lg border border-border space-y-1">
              <span className="font-semibold text-navy">1. Accrued Commission</span>
              <p className="text-[11px] text-secondary">
                When you verify a reader&apos;s direct payment, UNB accrues its platform commission (e.g. 20%) in your ledger.
              </p>
            </div>
            <div className="bg-surface p-3 rounded-lg border border-border space-y-1">
              <span className="font-semibold text-navy">2. Commission Invoice</span>
              <p className="text-[11px] text-secondary">
                At billing cycles, administrators issue a formal invoice grouping uninvoiced transactions with a designated due date.
              </p>
            </div>
            <div className="bg-surface p-3 rounded-lg border border-border space-y-1">
              <span className="font-semibold text-navy">3. Payment Reported</span>
              <p className="text-[11px] text-secondary">
                After you transfer funds to the platform bank/wallet, report your TID and receipt. This registers as a claim.
              </p>
            </div>
            <div className="bg-surface p-3 rounded-lg border border-border space-y-1">
              <span className="font-semibold text-navy">4. Admin Confirmation</span>
              <p className="text-[11px] text-secondary">
                Only when an administrator confirms deposit receipt in the UNB account is your balance reduced and settled.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Header & Filter Tabs */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-accent" />
            <h2 className="font-serif font-bold text-base text-navy">
              Commission Invoices ({invoices.length})
            </h2>
          </div>

          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-navy text-white'
                  : 'bg-ivory text-secondary hover:text-navy border border-border'
              }`}
            >
              All ({invoices.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('open')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filter === 'open'
                  ? 'bg-navy text-white'
                  : 'bg-ivory text-secondary hover:text-navy border border-border'
              }`}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setFilter('settled')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filter === 'settled'
                  ? 'bg-navy text-white'
                  : 'bg-ivory text-secondary hover:text-navy border border-border'
              }`}
            >
              Settled
            </button>
            <button
              type="button"
              onClick={() => setFilter('overdue')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filter === 'overdue'
                  ? 'bg-rose-700 text-white'
                  : 'bg-ivory text-secondary hover:text-navy border border-border'
              }`}
            >
              Overdue
            </button>
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
              <Receipt className="w-6 h-6 text-slate-400" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-main">No invoices in this view</p>
              <p className="text-[11px] text-secondary max-w-sm mx-auto">
                {invoices.length === 0
                  ? 'You currently have no billing invoices. When administrators package your sales into invoices, they will appear here.'
                  : 'No invoices match the selected filter.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredInvoices.map((inv) => {
              const remainingPkr = Math.max(0, inv.total_commission_owed_pkr - inv.amount_settled_pkr);
              return (
                <div
                  key={inv.id}
                  className="p-5 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-navy text-sm">
                        {inv.invoice_number}
                      </span>
                      <StatusBadge status={inv.status} size="sm" />
                      {inv.is_overdue && inv.status !== 'settled' && inv.status !== 'void' && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          Overdue
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-secondary flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-accent" />
                        Billing Period: {formatKarachiDateTime(inv.period_start, false)} –{' '}
                        {formatKarachiDateTime(inv.period_end, false)}
                      </span>
                      {inv.due_date && (
                        <span className="flex items-center gap-1 font-medium text-navy">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Due: {formatKarachiDateTime(inv.due_date, false)}
                        </span>
                      )}
                    </div>

                    {(inv.reported_count ?? 0) > 0 && inv.status !== 'settled' && (
                      <div className="text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 inline-block">
                        {inv.reported_count} payment report(s) submitted • Awaiting admin verification
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0">
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold text-navy">
                        {formatPKR2(inv.total_commission_owed_pkr)}
                      </div>
                      <div className="text-[11px] text-secondary font-mono">
                        Settled: {formatPKR2(inv.amount_settled_pkr)}
                        {remainingPkr > 0 && (
                          <span className="text-rose-700 font-semibold block sm:inline sm:ml-1">
                            (Due: {formatPKR2(remainingPkr)})
                          </span>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/writer/commission/${inv.id}`}
                      className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-navy text-white hover:bg-navy-light shadow-sm transition-colors"
                    >
                      <span>Inspect & Pay</span>
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
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
