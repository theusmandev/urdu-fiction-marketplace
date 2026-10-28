import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { getTipStatusMeta } from '@/lib/tips/state';
import {
  Heart,
  Search,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type { TipStatus } from '@/types/database';

export const dynamic = 'force-dynamic';

interface AdminTipsPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    flagged?: string;
    page?: string;
  }>;
}

interface AdminTipListItem {
  id: string;
  tip_number: string;
  reader_id: string;
  reader_display_name: string;
  reader_username: string | null;
  is_anonymous: boolean;
  writer_id: string;
  writer_pen_name: string;
  amount_pkr: number;
  status: TipStatus;
  transaction_reference_tid: string | null;
  is_duplicate_tid_flagged: boolean;
  review_flag: string | null;
  screenshot_path: string | null;
  reader_message: string | null;
  message_status: string;
  created_at: string;
  confirmed_at: string | null;
}

export default async function AdminTipsPage({ searchParams }: AdminTipsPageProps) {
  await requireRole('admin', '/admin/tips');
  const params = await searchParams;

  const currentStatus = params.status || '';
  const currentSearch = params.search || '';
  const isFlaggedOnly = params.flagged === 'true';
  const currentPage = Math.max(1, parseInt(params.page || '1', 10));
  const limit = 20;
  const offset = (currentPage - 1) * limit;

  const supabase = await createServerClient();
  const rpcRes = await supabase.rpc('admin_list_tips', {
    p_status: currentStatus || null,
    p_search: currentSearch || null,
    p_flagged_only: isFlaggedOnly,
    p_limit: limit,
    p_offset: offset,
  });

  const { data } = unwrapQuery(rpcRes, 'AdminTipsPage.admin_list_tips');
  const response = (data as { total?: number; tips?: AdminTipListItem[] }) || {
    total: 0,
    tips: [],
  };

  const tips: AdminTipListItem[] = Array.isArray(response.tips) ? response.tips : [];
  const totalCount = response.total || 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-warning-soft text-warning-text">
              <Heart className="w-5 h-5 fill-accent-strong/30" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-serif text-navy">
                Appreciation Tips
              </h1>
              <p className="text-xs text-secondary">
                Direct reader-to-author appreciation gifts with 0% platform fee.
              </p>
            </div>
          </div>
        </div>

        {/* Flagged Queue Quick Filter */}
        <Link
          href={`/admin/tips?flagged=${isFlaggedOnly ? 'false' : 'true'}`}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
            isFlaggedOnly
              ? 'bg-warning-soft text-warning-text border-warning-border shadow-xs'
              : 'bg-surface text-secondary border-border hover:bg-surface-elevated'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-accent-strong" />
          <span>{isFlaggedOnly ? 'Showing Tips to Review' : 'Filter Tips to Review'}</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface p-4 rounded-2xl border border-border shadow-xs space-y-3">
        <form method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              name="search"
              defaultValue={currentSearch}
              placeholder="Search by tip number, TID, or writer..."
              className="w-full pl-9 pr-4 py-2 bg-ivory/50 border border-border rounded-xl text-xs text-main focus:outline-none focus:ring-2 focus:ring-ring-admin/40"
            />
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-4">
            <select
              name="status"
              defaultValue={currentStatus}
              className="w-full px-3 py-2 bg-ivory/50 border border-border rounded-xl text-xs text-main focus:outline-none focus:ring-2 focus:ring-ring-admin/40 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="payment_submitted">Payment Submitted</option>
              <option value="confirmed">Confirmed</option>
              <option value="not_received">Not Received</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              className="w-full py-2 px-4 bg-navy text-accent font-semibold text-xs rounded-xl hover:bg-navy-light transition-colors"
            >
              Filter
            </button>
            {(currentStatus || currentSearch || isFlaggedOnly) && (
              <Link
                href="/admin/tips"
                className="py-2 px-3 bg-surface border border-border text-secondary hover:text-main font-semibold text-xs rounded-xl transition-colors flex items-center justify-center"
                title="Reset filters"
              >
                Reset
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Tips Table */}
      <div className="bg-surface rounded-2xl border border-border shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ivory/80 text-secondary border-b border-border font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Tip Number</th>
                <th className="py-3 px-4">Reader</th>
                <th className="py-3 px-4">Author</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Flags</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-main">
              {tips.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-secondary">
                    No appreciation tips found matching criteria.
                  </td>
                </tr>
              ) : (
                tips.map((tip) => {
                  const statusMeta = getTipStatusMeta(tip.status);
                  const isFlagged = tip.review_flag || tip.is_duplicate_tid_flagged;

                  return (
                    <tr key={tip.id} className="hover:bg-ivory/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold">
                        <Link
                          href={`/admin/tips/${tip.id}`}
                          className="text-navy hover:text-accent-admin hover:underline"
                        >
                          {tip.tip_number}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-main">
                          {tip.reader_display_name}
                        </div>
                        {tip.is_anonymous && (
                          <span className="text-[10px] text-secondary italic">
                            (Anonymous)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium">
                        {tip.writer_pen_name}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-navy">
                        PKR {Number(tip.amount_pkr).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {isFlagged ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning-soft text-warning-text border border-warning-border">
                            <AlertTriangle className="w-3 h-3 text-warning-text" />
                            <span>{tip.review_flag || 'Duplicate TID'}</span>
                          </span>
                        ) : (
                          <span className="text-secondary/60 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-secondary whitespace-nowrap">
                        {new Date(tip.created_at).toLocaleDateString('en-PK', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/tips/${tip.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-secondary hover:text-navy hover:bg-surface-elevated text-xs font-medium transition-colors"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-ivory/50 border-t border-border flex items-center justify-between text-xs text-secondary">
            <span>
              Showing {offset + 1} to {Math.min(offset + limit, totalCount)} of {totalCount} tips
            </span>
            <div className="flex items-center gap-1">
              {currentPage > 1 && (
                <Link
                  href={`/admin/tips?page=${currentPage - 1}&status=${currentStatus}&search=${encodeURIComponent(currentSearch)}&flagged=${isFlaggedOnly}`}
                  className="p-1.5 rounded-lg border border-border hover:bg-surface"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              )}
              <span className="px-2">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages && (
                <Link
                  href={`/admin/tips?page=${currentPage + 1}&status=${currentStatus}&search=${encodeURIComponent(currentSearch)}&flagged=${isFlaggedOnly}`}
                  className="p-1.5 rounded-lg border border-border hover:bg-surface"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
