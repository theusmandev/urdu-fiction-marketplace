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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Customer Support Helpdesk
            </h1>
            <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-mono">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Respond to reader and author support inquiries, general payment questions, and technical assistance tickets.
          </p>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {statusTabs.map((tab) => {
            const isActive = currentStatus === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/admin/support?status=${tab.key}${currentCategory !== 'all' ? `&category=${currentCategory}` : ''}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          {categories.map((cat) => {
            const isActive = currentCategory === cat.key;
            return (
              <Link
                key={cat.key}
                href={`/admin/support?status=${currentStatus}&category=${cat.key}`}
                className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-purple-300 border-purple-500/40 font-bold'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-850'
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
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-12 text-center space-y-3">
          <LifeBuoy className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No support tickets found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {currentStatus !== 'all' || currentCategory !== 'all'
              ? 'No support tickets match the selected filters.'
              : 'There are currently no active support requests in the system.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-mono">
                <tr>
                  <th className="py-3 px-4">Subject / Inquiry</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {requests.map((ticket) => {
                  const meta = getSupportStatusMeta(ticket.status);

                  return (
                    <tr key={ticket.id} className="hover:bg-slate-900/40 transition-colors">
                      {/* Subject */}
                      <td className="py-3.5 px-4 space-y-1">
                        <div className="font-semibold text-white line-clamp-1">
                          {ticket.subject}
                        </div>
                        {ticket.order_number && (
                          <span className="font-mono text-[10px] text-amber-400">
                            Ref: #{ticket.order_number}
                          </span>
                        )}
                      </td>

                      {/* User */}
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        {ticket.user_name || 'User'}
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                          {ticket.category}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              meta.variant === 'warning'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : meta.variant === 'success'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-slate-400 font-urdu">
                            {meta.urduLabel}
                          </span>
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="py-3.5 px-4 text-slate-400 space-y-0.5">
                        <div className="flex items-center gap-1 font-mono text-[10px]">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{new Date(ticket.updated_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                          <MessageSquare className="w-3 h-3" />
                          <span>{ticket.messages_count} msgs</span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/admin/support/${ticket.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors"
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
            <div className="bg-slate-900/60 border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
              <div>
                Page {currentPage} of {totalPages} ({totalCount} tickets)
              </div>
              <div className="flex items-center gap-2">
                {currentPage > 1 && (
                  <Link
                    href={`/admin/support?status=${currentStatus}&category=${currentCategory}&page=${currentPage - 1}`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={`/admin/support?status=${currentStatus}&category=${currentCategory}&page=${currentPage + 1}`}
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
