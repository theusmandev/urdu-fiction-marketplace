import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/requireRole';
import { adminListSupportRequestsAction } from '@/app/actions/admin-disputes';
import { getSupportStatusMeta } from '@/lib/disputes/status-meta';
import {
  LifeBuoy,
  MessageSquare,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Customer Support Desk | UNB Admin',
  description: 'Manage platform customer support requests and queries.',
};

interface AdminSupportPageProps {
  searchParams: Promise<{
    status?: string;
    category?: string;
    page?: string;
  }>;
}

export default async function AdminSupportPage({ searchParams }: AdminSupportPageProps) {
  await requireRole('admin', '/admin/support');
  const params = await searchParams;

  const currentStatus = params.status || 'all';
  const currentCategory = params.category || 'all';
  const currentPage = Math.max(1, parseInt(params.page || '1', 10));
  const limit = 25;
  const offset = (currentPage - 1) * limit;

  const result = await adminListSupportRequestsAction(
    currentStatus === 'all' ? null : currentStatus,
    currentCategory === 'all' ? null : currentCategory,
    limit,
    offset
  );

  const requests = result.data?.requests || [];
  const totalCount = result.data?.total_count || 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  const statusTabs = [
    { key: 'all', label: 'All Tickets' },
    { key: 'open', label: 'Open' },
    { key: 'answered', label: 'Answered' },
    { key: 'closed', label: 'Closed' },
  ];

  const categories = [
    { key: 'all', label: 'All Categories' },
    { key: 'order', label: 'Order / Purchase' },
    { key: 'payment', label: 'Payment Deposit' },
    { key: 'account', label: 'Account / Profile' },
    { key: 'content', label: 'Novels / Content' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-accent-admin" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main">
              Customer Support Helpdesk
            </h1>
            <span className="text-xs bg-accent-admin/10 text-accent-admin border border-accent-admin/20 px-2 py-0.5 rounded-full font-mono">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Respond to reader and author support inquiries, general payment questions, and technical assistance tickets.
          </p>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Status Tabs (Wrap cleanly without scrollbars or cut-off) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {statusTabs.map((tab) => {
            const isActive = currentStatus === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/admin/support?status=${tab.key}${currentCategory !== 'all' ? `&category=${currentCategory}` : ''}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-accent-admin text-white shadow-sm'
                    : 'text-muted hover:text-main hover:bg-surface-muted border border-border/60'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Category Pills (Wrap cleanly without scrollbars or cut-off) */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-muted shrink-0" />
          {categories.map((cat) => {
            const isActive = currentCategory === cat.key;
            return (
              <Link
                key={cat.key}
                href={`/admin/support?status=${currentStatus}&category=${cat.key}`}
                className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border transition-colors ${
                  isActive
                    ? 'bg-accent-admin/10 text-accent-admin border-accent-admin/30 font-bold'
                    : 'bg-surface-muted text-muted border-border hover:text-main hover:bg-surface'
                }`}
              >
                {cat.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Tickets Table */}
      {requests.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center space-y-3 shadow-card">
          <LifeBuoy className="w-8 h-8 text-muted mx-auto" />
          <h3 className="text-sm font-bold text-main">No support tickets found</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            {currentStatus !== 'all' || currentCategory !== 'all'
              ? 'No support tickets match the selected filters.'
              : 'There are currently no active support requests in the system.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-card">
          <div className="w-full overflow-x-auto rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted/80 text-muted uppercase tracking-wider text-[11px] border-b border-border font-medium">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4">Subject / Inquiry</th>
                  <th className="py-2.5 px-3 sm:px-4">User</th>
                  <th className="py-2.5 px-3 sm:px-4">Category</th>
                  <th className="py-2.5 px-3 sm:px-4">Status</th>
                  <th className="py-2.5 px-3 sm:px-4">Last Activity</th>
                  <th className="py-2.5 px-3 sm:px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-main">
                {requests.map((ticket) => {
                  const meta = getSupportStatusMeta(ticket.status);

                  return (
                    <tr key={ticket.id} className="hover:bg-surface-muted/50 transition-colors">
                      {/* Subject */}
                      <td className="py-2.5 px-3 sm:px-4 space-y-1 max-w-xs">
                        <div className="font-semibold text-main line-clamp-1 break-words" title={ticket.subject}>
                          {ticket.subject}
                        </div>
                        {ticket.order_number && (
                          <span className="font-mono text-[10px] text-brand-gold break-all">
                            Ref: #{ticket.order_number}
                          </span>
                        )}
                      </td>

                      {/* User */}
                      <td className="py-2.5 px-3 sm:px-4 font-medium text-main max-w-[180px] truncate break-words" title={ticket.user_name || 'User'}>
                        {ticket.user_name || 'User'}
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-muted text-muted border border-border">
                          {ticket.category}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 sm:px-4 space-y-0.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              meta.variant === 'warning'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : meta.variant === 'success'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-stone-100 text-stone-600 border-stone-200'
                            }`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-brand-gold font-urdu">
                            {meta.urduLabel}
                          </span>
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="py-2.5 px-3 sm:px-4 text-muted space-y-0.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 font-mono text-[10px]">
                          <Clock className="w-3 h-3 text-muted" />
                          <span suppressHydrationWarning>{new Date(ticket.updated_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted font-mono">
                          <MessageSquare className="w-3 h-3" />
                          <span>{ticket.messages_count} msgs</span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/support/${ticket.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-admin/10 hover:bg-accent-admin/20 text-accent-admin border border-accent-admin/30 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                        >
                          <span>Reply</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-surface-muted/60 border-t border-border px-4 py-3 flex items-center justify-between text-xs text-muted">
              <div>
                Page {currentPage} of {totalPages} ({totalCount} tickets)
              </div>
              <div className="flex items-center gap-2">
                {currentPage > 1 && (
                  <Link
                    href={`/admin/support?status=${currentStatus}&category=${currentCategory}&page=${currentPage - 1}`}
                    className="p-1.5 rounded-lg bg-surface border border-border hover:bg-surface-muted text-main transition-colors shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={`/admin/support?status=${currentStatus}&category=${currentCategory}&page=${currentPage + 1}`}
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
