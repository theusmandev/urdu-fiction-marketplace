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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-accent-admin" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main font-serif">
              Disputes Adjudication Desk
            </h1>
            <span className="text-xs bg-accent-admin/10 text-accent-admin border border-accent-admin/20 px-2.5 py-0.5 rounded-full font-mono font-medium">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Investigate reader payment deposit claims against author rejections. Strictly impartial evidence-based adjudication.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/refunds"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-main bg-surface hover:bg-surface-muted border border-border transition-colors shadow-sm"
          >
            <span>Refund Queue</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted" />
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
                    ? 'bg-accent-admin text-white shadow-sm'
                    : 'text-muted hover:text-main hover:bg-surface-muted'
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
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              name="search"
              defaultValue={currentSearch}
              placeholder="Search order #, author, reader..."
              className="bg-surface border border-border text-main text-xs pl-9 pr-3 py-2 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 bg-surface hover:bg-surface-muted text-main border border-border rounded-lg text-xs font-semibold transition-colors shadow-sm"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Disputes Table */}
      {disputes.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center space-y-3 shadow-card">
          <Scale className="w-8 h-8 text-muted mx-auto" />
          <h3 className="text-sm font-bold text-main">No disputes found</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            {currentSearch || currentStatus !== 'all'
              ? 'No disputes match your current filter criteria.'
              : 'There are currently no disputes in the platform registry.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-card">
          <div className="w-full overflow-x-auto rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted text-muted text-[11px] border-b border-border font-medium">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Order / Novel</th>
                  <th className="py-2.5 px-3 sm:px-4">Disputant Parties</th>
                  <th className="py-2.5 px-3 sm:px-4">Reason / Notes</th>
                  <th className="py-2.5 px-3 sm:px-4">Amount</th>
                  <th className="py-2.5 px-3 sm:px-4">Status &amp; Urgency</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-main">
                {disputes.map((d) => {
                  const meta = getDisputeStatusMeta(d.status);
                  return (
                    <tr key={d.dispute_id} className="hover:bg-surface-muted/50 transition-colors">
                      {/* Order / Novel */}
                      <td className="py-2.5 px-3 sm:px-4 space-y-0.5 max-w-[200px]">
                        <div className="font-mono font-bold text-accent-admin text-xs whitespace-nowrap">
                          #{d.order_number}
                        </div>
                        <div className="font-medium text-main line-clamp-1 break-words" title={d.novel_title}>
                          {d.novel_title}
                        </div>
                        <div className="text-[10px] text-muted flex items-center gap-1 font-mono whitespace-nowrap">
                          <Clock className="w-3 h-3" />
                          <span suppressHydrationWarning>{new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>

                      {/* Disputant Parties */}
                      <td className="py-2.5 px-3 sm:px-4 space-y-1 max-w-[180px]">
                        <div className="text-[11px]">
                          <span className="text-muted">Reader: </span>
                          <span className="text-main font-medium truncate inline-block max-w-[120px] align-bottom" title={d.reader_name || 'Reader'}>
                            {d.reader_name || 'Reader'}
                          </span>
                        </div>
                        <div className="text-[11px]">
                          <span className="text-muted">Author: </span>
                          <span className="text-brand-gold font-medium truncate inline-block max-w-[120px] align-bottom" title={d.writer_pen_name || 'Author'}>
                            {d.writer_pen_name || 'Author'}
                          </span>
                        </div>
                      </td>

                      {/* Reason / Notes */}
                      <td className="py-2.5 px-3 sm:px-4 max-w-xs space-y-1 break-words">
                        <p className="line-clamp-2 text-main italic">
                          &quot;{d.reason}&quot;
                        </p>
                        {d.messages_count > 0 && (
                          <div className="inline-flex items-center gap-1 text-[10px] text-muted">
                            <MessageSquare className="w-3 h-3 text-muted" />
                            <span>{d.messages_count} messages</span>
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-2.5 px-3 sm:px-4 font-mono font-bold text-main whitespace-nowrap">
                        {formatPKR(d.amount_pkr)}
                      </td>

                      {/* Status & Urgency */}
                      <td className="py-2.5 px-3 sm:px-4 space-y-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              meta.variant === 'warning'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : meta.variant === 'success'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : meta.variant === 'destructive'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-surface-muted text-muted border border-border'
                            }`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-muted font-urdu">
                            {meta.urduLabel}
                          </span>
                        </div>

                        {/* Stagnant > 3 Days Warning Badge */}
                        {d.is_stuck && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-600 animate-pulse" />
                            <span>STUCK &gt; 3 DAYS</span>
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/disputes/${d.dispute_id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-admin/10 hover:bg-accent-admin/20 text-accent-admin border border-accent-admin/30 rounded-lg text-xs font-semibold transition-colors"
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
            <div className="bg-surface-muted border-t border-border px-4 py-3 flex items-center justify-between text-xs text-muted">
              <div>
                Showing page {currentPage} of {totalPages} ({totalCount} disputes)
              </div>
              <div className="flex items-center gap-2">
                {currentPage > 1 && (
                  <Link
                    href={`/admin/disputes?status=${currentStatus}&page=${currentPage - 1}${currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''}`}
                    className="p-1.5 rounded-lg bg-surface border border-border hover:bg-surface-muted text-main transition-colors shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={`/admin/disputes?status=${currentStatus}&page=${currentPage + 1}${currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''}`}
                    className="p-1.5 rounded-lg bg-surface border border-border hover:bg-surface-muted text-main transition-colors shadow-sm"
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
