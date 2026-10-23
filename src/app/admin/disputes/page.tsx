import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import { adminListDisputesAction } from '@/app/actions/admin-disputes';
import { getDisputeStatusMeta } from '@/lib/disputes/status-meta';
import { formatPKR } from '@/lib/utils';
import {
  Scale,
  Search,
  Clock,
  AlertTriangle,
  MessageSquare,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Disputes Adjudication | UNB Admin',
  description: 'Manage, investigate, and adjudicate reader-author disputes.',
};

interface AdminDisputesPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
  }>;
}

export default async function AdminDisputesPage({ searchParams }: AdminDisputesPageProps) {
  await requireRole('admin', '/admin/disputes');
  const params = await searchParams;

  const currentStatus = params.status || 'all';
  const currentSearch = params.search || '';
  const currentPage = Math.max(1, parseInt(params.page || '1', 10));
  const limit = 25;
  const offset = (currentPage - 1) * limit;

  const result = await adminListDisputesAction(
    currentStatus === 'all' ? null : currentStatus,
    currentSearch || null,
    limit,
    offset
  );

  const disputes = result.data?.disputes || [];
  const totalCount = result.data?.total_count || 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  const tabs = [
    { key: 'all', label: 'All Disputes' },
    { key: 'open', label: 'Open' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'resolved', label: 'Resolved / Closed' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-amber-500" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Disputes Adjudication Desk
            </h1>
            <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Investigate reader payment deposit claims against author rejections. Strictly impartial evidence-based adjudication.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/refunds"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            <span>Refund Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {tabs.map((tab) => {
            const isActive = currentStatus === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/admin/disputes?status=${tab.key}${currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Search Input */}
        <form method="GET" action="/admin/disputes" className="flex items-center gap-2">
          {currentStatus !== 'all' && (
            <input type="hidden" name="status" value={currentStatus} />
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              name="search"
              defaultValue={currentSearch}
              placeholder="Search order #, author, reader..."
              className="bg-slate-900 border border-slate-800 text-slate-200 text-xs pl-9 pr-3 py-2 rounded-lg w-64 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Disputes Table */}
      {disputes.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-12 text-center space-y-3">
          <Scale className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No disputes found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {currentSearch || currentStatus !== 'all'
              ? 'No disputes match your current filter criteria.'
              : 'There are currently no disputes in the platform registry.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-mono">
                <tr>
                  <th className="py-3 px-4">Order / Novel</th>
                  <th className="py-3 px-4">Disputant Parties</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status &amp; Urgency</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {disputes.map((d) => {
                  const meta = getDisputeStatusMeta(d.status);
                  return (
                    <tr key={d.dispute_id} className="hover:bg-slate-900/40 transition-colors">
                      {/* Order / Novel */}
                      <td className="py-3.5 px-4 space-y-0.5">
                        <div className="font-mono font-bold text-amber-400 text-xs">
                          #{d.order_number}
                        </div>
                        <div className="font-medium text-white line-clamp-1">
                          {d.novel_title}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>

                      {/* Disputant Parties */}
                      <td className="py-3.5 px-4 space-y-1">
                        <div className="text-[11px]">
                          <span className="text-slate-500">Reader: </span>
                          <span className="text-white font-medium">{d.reader_name || 'Reader'}</span>
                        </div>
                        <div className="text-[11px]">
                          <span className="text-slate-500">Author: </span>
                          <span className="text-amber-300 font-medium">{d.writer_pen_name || 'Author'}</span>
                        </div>
                      </td>

                      {/* Reason / Notes */}
                      <td className="py-3.5 px-4 max-w-xs space-y-1">
                        <p className="line-clamp-2 text-slate-300 italic">
                          &quot;{d.reason}&quot;
                        </p>
                        {d.messages_count > 0 && (
                          <div className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                            <MessageSquare className="w-3 h-3 text-slate-500" />
                            <span>{d.messages_count} messages</span>
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                        {formatPKR(d.amount_pkr)}
                      </td>

                      {/* Status & Urgency */}
                      <td className="py-3.5 px-4 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              meta.variant === 'warning'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : meta.variant === 'success'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : meta.variant === 'destructive'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-slate-400 font-urdu">
                            {meta.urduLabel}
                          </span>
                        </div>

                        {/* Stagnant > 3 Days Warning Badge */}
                        {d.is_stuck && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            <AlertTriangle className="w-3 h-3 text-rose-400 animate-pulse" />
                            <span>STUCK &gt; 3 DAYS</span>
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/admin/disputes/${d.dispute_id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <span>Investigate</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bg-slate-900/60 border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing page {currentPage} of {totalPages} ({totalCount} disputes)
              </div>
              <div className="flex items-center gap-2">
                {currentPage > 1 && (
                  <Link
                    href={`/admin/disputes?status=${currentStatus}&page=${currentPage - 1}${currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''}`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={`/admin/disputes?status=${currentStatus}&page=${currentPage + 1}${currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''}`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
