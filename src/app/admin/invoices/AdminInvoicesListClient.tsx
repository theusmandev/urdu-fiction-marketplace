'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatKarachiDateTime, formatPKR2 } from '@/lib/commission/time';
import {
  Receipt,
  Search,
  Clock,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

interface AdminInvoiceItem {
  id: string;
  invoice_number: string;
  writer_id: string;
  pen_name_english: string;
  pen_name_urdu: string;
  period_start: string;
  period_end: string;
  total_commission_pkr: number;
  amount_settled_pkr: number;
  status: string;
  due_date: string | null;
  is_overdue: boolean;
  reported_count: number;
  created_at: string;
}

interface AdminInvoicesListClientProps {
  invoices: AdminInvoiceItem[];
  totalCount: number;
  initialStatus?: string;
  initialSearch?: string;
  currentPage: number;
  pageSize: number;
}

export function AdminInvoicesListClient({
  invoices,
  totalCount,
  initialStatus = '',
  initialSearch = '',
  currentPage,
  pageSize,
}: AdminInvoicesListClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);

  const applyFilters = (newStatus = status, newSearch = search) => {
    const params = new URLSearchParams();
    if (newStatus) params.set('status', newStatus);
    if (newSearch) params.set('search', newSearch);
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleReset = () => {
    setSearch('');
    setStatus('');
    router.push(pathname);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('page', newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Billing Statements
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Audit-Protected • Immutable
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-white mt-1">
            Platform Commission Invoices
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect all author commission statements, verify settlement reports, and record bank payments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/commission"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors"
          >
            Commission Overview
          </Link>
          <Link
            href="/admin/commission/reports"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
          >
            <Clock className="w-4 h-4 mr-1.5" />
            Pending Reports Queue
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice number or author pen name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters(status, search)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              applyFilters(e.target.value, search);
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="invoiced">Invoiced (Unpaid)</option>
            <option value="payment_reported">Payment Reported</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="settled">Settled</option>
            <option value="void">Voided</option>
          </select>

          <button
            type="button"
            onClick={() => applyFilters(status, search)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
          >
            Apply
          </button>

          {(status || search) && (
            <button
              type="button"
              onClick={handleReset}
              title="Reset filters"
              className="p-2 border border-slate-800 rounded-lg text-slate-400 hover:text-white bg-slate-900 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-400" />
            <span className="font-serif font-bold text-white">
              Invoices Found ({totalCount})
            </span>
          </div>
          <span className="text-slate-400 font-mono">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {invoices.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No invoices found matching current criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {invoices.map((inv) => {
              const remaining = Math.max(0, inv.total_commission_pkr - inv.amount_settled_pkr);
              return (
                <div
                  key={inv.id}
                  className="p-4 hover:bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">
                        {inv.invoice_number}
                      </span>
                      <StatusBadge status={inv.status} size="sm" />
                      {inv.is_overdue && inv.status !== 'settled' && inv.status !== 'void' && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Overdue
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="font-semibold text-white">
                        {inv.pen_name_english}
                      </span>
                      <UrduText as="span" size="xs" className="text-slate-400 py-0">
                        ({inv.pen_name_urdu})
                      </UrduText>
                    </div>

                    <div className="text-slate-400 text-[11px] flex flex-wrap items-center gap-3">
                      <span>
                        Period: {formatKarachiDateTime(inv.period_start, false)} —{' '}
                        {formatKarachiDateTime(inv.period_end, false)}
                      </span>
                      {inv.due_date && (
                        <span className="text-slate-300 font-mono">
                          Due: {formatKarachiDateTime(inv.due_date, false)}
                        </span>
                      )}
                    </div>

                    {inv.reported_count > 0 && inv.status !== 'settled' && (
                      <div className="text-[11px] text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30 inline-block">
                        {inv.reported_count} payment report(s) submitted • Awaiting review
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
                    <div className="text-right">
                      <div className="font-mono font-bold text-white text-sm">
                        {formatPKR2(inv.total_commission_pkr)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        Settled: {formatPKR2(inv.amount_settled_pkr)}
                        {remaining > 0 && (
                          <span className="text-rose-400 font-semibold ml-1">
                            (Due: {formatPKR2(remaining)})
                          </span>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/admin/invoices/${inv.id}`}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                    >
                      <span>Inspect</span>
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-slate-400 font-mono">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
