import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { formatPKR } from '@/lib/utils';
import type { AdminOrdersListResponse, AdminOrderItemSummary } from '@/types/database';
import {
  ShoppingBag,
  Search,
  Clock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface AdminOrdersPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
    stuck?: string;
    page?: string;
  }>;
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  await requireRole('admin', '/admin/orders');
  const params = await searchParams;

  const currentStatus = params.status || '';
  const currentSearch = params.search || '';
  const onlyStuck = params.stuck === 'true';
  const currentPage = Math.max(1, parseInt(params.page || '1', 10));
  const limit = 20;
  const offset = (currentPage - 1) * limit;

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('admin_list_orders', {
    p_status: currentStatus || null,
    p_search: currentSearch || null,
    p_only_stuck: onlyStuck,
    p_limit: limit,
    p_offset: offset,
  });

  const response = (data as unknown as AdminOrdersListResponse) || {
    orders: [],
    total_count: 0,
    limit,
    offset,
  };

  const totalPages = Math.ceil(response.total_count / limit) || 1;

  const statusBadges: Record<string, { label: string; bg: string; text: string }> = {
    pending_payment: { label: 'Pending Payment', bg: 'bg-stone-800 text-stone-300 border-stone-700', text: 'text-stone-300' },
    payment_submitted: { label: 'Payment Submitted', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30', text: 'text-amber-300' },
    verified: { label: 'Verified', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', text: 'text-emerald-300' },
    rejected: { label: 'Rejected', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/30', text: 'text-rose-300' },
    disputed: { label: 'Disputed', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30', text: 'text-purple-300' },
    cancelled: { label: 'Cancelled', bg: 'bg-stone-800 text-stone-400 border-stone-700', text: 'text-stone-400' },
    refunded_adjusted: { label: 'Refunded / Adjusted', bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30', text: 'text-blue-300' },
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
              Admin Moderation
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Orders Queue ({response.total_count} matching)
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1 flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-rose-400" />
            <span>Orders & Payment Inspection</span>
          </h1>
          <p className="text-xs text-slate-400">
            Inspect reader-to-writer payment transactions, verify deposits, and investigate stuck orders.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders?stuck=true"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              onlyStuck
                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-yellow-400" />
            <span>Stuck &gt; 24h</span>
          </Link>
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            href={`/admin/orders${currentSearch ? `?search=${encodeURIComponent(currentSearch)}` : ''}`}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              !currentStatus && !onlyStuck
                ? 'bg-rose-600 text-white font-semibold'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            All Orders
          </Link>

          {[
            { key: 'payment_submitted', label: 'Submitted' },
            { key: 'verified', label: 'Verified' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'disputed', label: 'Disputed' },
            { key: 'pending_payment', label: 'Pending' },
            { key: 'cancelled', label: 'Cancelled' },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={`/admin/orders?status=${tab.key}${
                currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''
              }`}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                currentStatus === tab.key && !onlyStuck
                  ? 'bg-rose-600 text-white font-semibold'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Search Input */}
        <form method="GET" action="/admin/orders" className="relative min-w-[260px]">
          {currentStatus && <input type="hidden" name="status" value={currentStatus} />}
          {onlyStuck && <input type="hidden" name="stuck" value="true" />}
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            name="search"
            defaultValue={currentSearch}
            placeholder="Search order #, novel, reader..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
        </form>
      </div>

      {/* Orders List */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          Failed to load orders: {error.message}
        </div>
      )}

      {!error && response.orders.length === 0 ? (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No Matching Orders</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {currentSearch || currentStatus || onlyStuck
              ? 'No orders found matching your search or status filter criteria.'
              : 'There are currently no orders in the system.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto bg-slate-950/60 border border-slate-800 rounded-2xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3">Novel</th>
                  <th className="px-4 py-3">Reader</th>
                  <th className="px-4 py-3">Writer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {response.orders.map((order: AdminOrderItemSummary) => {
                  const badge = statusBadges[order.status] || {
                    label: order.status,
                    bg: 'bg-slate-800 text-slate-300 border-slate-700',
                    text: 'text-slate-300',
                  };

                  return (
                    <tr key={order.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-white">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="hover:text-rose-400 transition-colors flex items-center gap-1.5"
                        >
                          <span>{order.order_number}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px] truncate font-medium text-slate-200">
                        {order.novel_title}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-200">
                            {order.reader_display_name}
                          </span>
                          {order.reader_username && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              @{order.reader_username}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">
                        {order.writer_pen_name}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-amber-400">
                        {formatPKR(order.amount_pkr)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                          {order.is_stuck && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              <span>Stuck</span>
                            </span>
                          )}
                          {order.has_duplicate_submission && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              Duplicate TID
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-slate-500 font-mono whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs border border-slate-700 transition-colors inline-flex items-center gap-1"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {response.orders.map((order: AdminOrderItemSummary) => {
              const badge = statusBadges[order.status] || {
                label: order.status,
                bg: 'bg-slate-800 text-slate-300 border-slate-700',
                text: 'text-slate-300',
              };

              return (
                <div
                  key={order.id}
                  className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white text-xs">
                      {order.order_number}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-slate-200 line-clamp-1">
                      {order.novel_title}
                    </p>
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>Reader: {order.reader_display_name}</span>
                      <span className="font-mono text-amber-400 font-bold">
                        {formatPKR(order.amount_pkr)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Author: {order.writer_pen_name}
                    </p>
                  </div>

                  {(order.is_stuck || order.has_duplicate_submission) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {order.is_stuck && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                          Stuck &gt; 24h
                        </span>
                      )}
                      {order.has_duplicate_submission && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          Duplicate TID Warning
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1 transition-colors"
                    >
                      <span>Inspect Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link
                    href={`/admin/orders?page=${currentPage - 1}${
                      currentStatus ? `&status=${currentStatus}` : ''
                    }${onlyStuck ? '&stuck=true' : ''}${
                      currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''
                    }`}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </Link>
                ) : (
                  <button
                    disabled
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                )}

                {currentPage < totalPages ? (
                  <Link
                    href={`/admin/orders?page=${currentPage + 1}${
                      currentStatus ? `&status=${currentStatus}` : ''
                    }${onlyStuck ? '&stuck=true' : ''}${
                      currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''
                    }`}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <button
                    disabled
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed flex items-center gap-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
