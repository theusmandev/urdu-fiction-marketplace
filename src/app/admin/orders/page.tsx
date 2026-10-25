import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { formatPKR } from '@/lib/utils';
import type { AdminOrdersListResponse, AdminOrderItemSummary } from '@/types/database';
import { unwrapQuery } from '@/lib/supabase/query';
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
  const rpcRes = await supabase.rpc('admin_list_orders', {
    p_status: currentStatus || null,
    p_search: currentSearch || null,
    p_only_stuck: onlyStuck,
    p_limit: limit,
    p_offset: offset,
  });

  const { data, error } = unwrapQuery(rpcRes, 'AdminOrdersPage.admin_list_orders');

  const response = (data as unknown as AdminOrdersListResponse) || {
    orders: [],
    total_count: 0,
    limit,
    offset,
  };

  const totalPages = Math.ceil(response.total_count / limit) || 1;

  const statusBadges: Record<string, { label: string; bg: string; text: string }> = {
    pending_payment: { label: 'Pending Payment', bg: 'bg-stone-100 text-stone-700 border-stone-200', text: 'text-stone-700' },
    payment_submitted: { label: 'Payment Submitted', bg: 'bg-amber-50 text-amber-800 border-amber-200', text: 'text-amber-800' },
    verified: { label: 'Verified', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700' },
    rejected: { label: 'Rejected', bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700' },
    disputed: { label: 'Disputed', bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-700' },
    cancelled: { label: 'Cancelled', bg: 'bg-stone-100 text-stone-600 border-stone-200', text: 'text-stone-600' },
    refunded_adjusted: { label: 'Refunded / Adjusted', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700' },
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-accent-admin/10 text-accent-admin border border-accent-admin/20">
              Orders Queue
            </span>
            <span className="text-xs text-muted">
              {response.total_count} matching
            </span>
          </div>
          <h1 className="text-2xl font-bold text-main mt-1 flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-accent-admin" />
            <span>Orders & Payment Inspection</span>
          </h1>
          <p className="text-xs text-muted">
            Inspect reader-to-writer payment transactions, verify deposits, and investigate stuck orders.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders?stuck=true"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              onlyStuck
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-surface-muted hover:bg-surface text-main border-border'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Stuck &gt; 24h</span>
          </Link>
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-muted hover:bg-surface text-main border border-border transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center shadow-card">
        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            href={`/admin/orders${currentSearch ? `?search=${encodeURIComponent(currentSearch)}` : ''}`}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              !currentStatus && !onlyStuck
                ? 'bg-accent-admin text-white font-semibold shadow-sm'
                : 'bg-surface-muted hover:bg-surface text-muted hover:text-main border border-border'
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
                  ? 'bg-accent-admin text-white font-semibold shadow-sm'
                  : 'bg-surface-muted hover:bg-surface text-muted hover:text-main border border-border'
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            type="text"
            name="search"
            defaultValue={currentSearch}
            placeholder="Search order #, novel, reader..."
            className="w-full bg-surface-muted border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin transition-colors"
          />
        </form>
      </div>

      {/* Orders List */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          Failed to load orders: {error.message}
        </div>
      )}

      {!error && response.orders.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center space-y-3 shadow-card">
          <ShoppingBag className="w-10 h-10 text-muted mx-auto" />
          <h3 className="text-sm font-bold text-main">No Matching Orders</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            {currentSearch || currentStatus || onlyStuck
              ? 'No orders found matching your search or status filter criteria.'
              : 'There are currently no orders in the system.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto bg-surface border border-border rounded-2xl shadow-card">
            <table className="w-full text-left text-xs text-main">
              <thead className="bg-surface-muted/80 border-b border-border text-[11px] font-medium text-muted uppercase tracking-wider">
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
              <tbody className="divide-y divide-border">
                {response.orders.map((order: AdminOrderItemSummary) => {
                  const badge = statusBadges[order.status] || {
                    label: order.status,
                    bg: 'bg-surface-muted text-muted border-border',
                    text: 'text-muted',
                  };

                  return (
                    <tr key={order.id} className="hover:bg-surface-muted/50 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-main">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="hover:text-accent-admin transition-colors flex items-center gap-1.5"
                        >
                          <span>{order.order_number}</span>
                          <ExternalLink className="w-3 h-3 text-muted" />
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px] truncate font-medium text-main">
                        {order.novel_title}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-main">
                            {order.reader_display_name}
                          </span>
                          {order.reader_username && (
                            <span className="text-[10px] text-muted font-mono">
                              @{order.reader_username}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-main">
                        {order.writer_pen_name}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-semibold text-emerald-700">
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
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              <span>Stuck</span>
                            </span>
                          )}
                          {order.has_duplicate_submission && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Duplicate TID
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-muted font-mono whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="px-3 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-main font-semibold text-xs border border-border transition-colors inline-flex items-center gap-1 shadow-sm"
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
                bg: 'bg-surface-muted text-muted border-border',
                text: 'text-muted',
              };

              return (
                <div
                  key={order.id}
                  className="bg-surface border border-border rounded-xl p-4 space-y-3 shadow-card"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-main text-xs">
                      {order.order_number}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-main line-clamp-1">
                      {order.novel_title}
                    </p>
                    <div className="flex items-center justify-between text-muted text-[11px]">
                      <span>Reader: {order.reader_display_name}</span>
                      <span className="font-mono text-emerald-700 font-bold">
                        {formatPKR(order.amount_pkr)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted">
                      Author: {order.writer_pen_name}
                    </p>
                  </div>

                  {(order.is_stuck || order.has_duplicate_submission) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {order.is_stuck && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Stuck &gt; 24h
                        </span>
                      )}
                      {order.has_duplicate_submission && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Duplicate TID Warning
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <span className="text-[10px] text-muted font-mono">
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="px-3 py-1.5 rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white font-semibold text-xs flex items-center gap-1 transition-colors shadow-sm"
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
            <div className="bg-surface border border-border rounded-2xl p-4 flex items-center justify-between text-xs shadow-card">
              <span className="text-muted font-mono">
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
                    className="px-3 py-1.5 rounded-lg bg-surface-muted border border-border text-main hover:bg-surface transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </Link>
                ) : (
                  <button
                    disabled
                    className="px-3 py-1.5 rounded-lg bg-surface-muted border border-border text-muted/50 cursor-not-allowed flex items-center gap-1"
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
                    className="px-3 py-1.5 rounded-lg bg-surface-muted border border-border text-main hover:bg-surface transition-colors flex items-center gap-1"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <button
                    disabled
                    className="px-3 py-1.5 rounded-lg bg-surface-muted border border-border text-muted/50 cursor-not-allowed flex items-center gap-1"
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
