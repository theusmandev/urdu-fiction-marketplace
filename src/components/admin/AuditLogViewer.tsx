'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  User,
  X,
  ChevronLeft,
  ChevronRight,
  Code,
  ArrowRight,
} from 'lucide-react';

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  created_at: string;
  profiles: {
    email: string;
    username: string | null;
    full_name: string | null;
    role: string;
  } | null;
}

interface AuditLogViewerProps {
  logs: AuditEntry[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  currentFilters: {
    action_type?: string;
    entity_type?: string;
    from?: string;
    to?: string;
  };
}

export function AuditLogViewer({
  logs,
  totalCount,
  currentPage,
  pageSize,
  currentFilters,
}: AuditLogViewerProps) {
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildQueryUrl = (newPage: number) => {
    const params = new URLSearchParams();
    if (currentFilters.action_type) params.set('action_type', currentFilters.action_type);
    if (currentFilters.entity_type) params.set('entity_type', currentFilters.entity_type);
    if (currentFilters.from) params.set('from', currentFilters.from);
    if (currentFilters.to) params.set('to', currentFilters.to);
    params.set('page', newPage.toString());
    return `/admin/audit?${params.toString()}`;
  };

  const ACTION_DISPLAY_LABELS: Record<string, string> = {
    SET_WRITER_COMMISSION_TERMS: 'Set Writer Platform Fee Terms',
    CONFIRM_COMMISSION_SETTLEMENT: 'Confirm Platform Fee Settlement',
    REJECT_COMMISSION_REPORT: 'Reject Platform Fee Report',
    RECORD_COMMISSION_ADJUSTMENT: 'Record Platform Fee Adjustment',
    VOID_COMMISSION_INVOICE: 'Void Platform Fee Invoice',
    REPORT_COMMISSION_PAYMENT: 'Report Platform Fee Payment',
    GENERATE_COMMISSION_INVOICE: 'Generate Platform Fee Invoice',
  };

  const formatActionDisplayLabel = (actionType: string): string => {
    if (ACTION_DISPLAY_LABELS[actionType]) {
      return ACTION_DISPLAY_LABELS[actionType];
    }
    return actionType.replace(/_/g, ' ');
  };

  const getActionBadgeColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('REJECT') || act.includes('SUSPEND')) {
      return 'bg-rose-50 text-rose-800 border-rose-200';
    }
    if (act.includes('APPROVE') || act.includes('UNSUSPEND') || act.includes('CREATE')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (act.includes('UPDATE') || act.includes('SET')) {
      return 'bg-accent-admin-light text-accent-admin border-accent-admin-border';
    }
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="space-y-4">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="w-full overflow-x-auto rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-ivory/80 border-b border-border text-secondary font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3 w-[170px]">Timestamp</th>
                <th className="py-2.5 px-3 w-[150px]">Action</th>
                <th className="py-2.5 px-3 w-[160px]">Entity</th>
                <th className="py-2.5 px-3">Actor</th>
                <th className="py-2.5 px-3 text-right w-[130px] shrink-0">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((entry) => {
                const actorEmail = entry.profiles?.email || entry.actor_id || 'System';
                return (
                  <tr key={entry.id} className="hover:bg-ivory/50 transition-colors">
                    <td className="py-2.5 px-3 text-secondary whitespace-nowrap text-xs font-mono w-[170px]">
                      <span suppressHydrationWarning>{new Date(entry.created_at).toLocaleString()}</span>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap w-[170px]">
                      <div>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getActionBadgeColor(
                            entry.action_type
                          )}`}
                          title={`Technical Action Type: ${entry.action_type}`}
                        >
                          {formatActionDisplayLabel(entry.action_type)}
                        </span>
                        <span className="block text-[10px] text-muted font-mono mt-0.5">
                          {entry.action_type}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-sans w-[160px]">
                      <div className="font-semibold text-main capitalize text-xs truncate">{entry.entity_type}</div>
                      <div
                        className="text-[11px] text-secondary font-mono truncate max-w-[150px] break-all"
                        title={entry.entity_id}
                      >
                        {entry.entity_id}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-sans min-w-0">
                      <div
                        className="text-main truncate max-w-[170px] font-mono text-xs break-all"
                        title={actorEmail}
                      >
                        {actorEmail}
                      </div>
                      <div className="text-[11px] text-secondary capitalize">
                        {entry.actor_role || entry.profiles?.role || 'user'}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-sans whitespace-nowrap w-[130px] shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedEntry(entry)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface hover:bg-ivory text-main border border-border text-xs font-semibold transition-colors shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Code className="w-3.5 h-3.5 text-accent-admin" />
                        <span>Inspect JSON</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards View */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {logs.map((entry) => {
          const actorEmail = entry.profiles?.email || entry.actor_id || 'System';
          return (
            <div
              key={entry.id}
              className="bg-surface border border-border shadow-card rounded-2xl p-4 space-y-3 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getActionBadgeColor(
                      entry.action_type
                    )}`}
                    title={`Technical Action Type: ${entry.action_type}`}
                  >
                    {formatActionDisplayLabel(entry.action_type)}
                  </span>
                  <span className="block text-[10px] text-muted font-mono mt-0.5">
                    {entry.action_type}
                  </span>
                </div>
                <span suppressHydrationWarning className="text-[11px] text-secondary font-mono">
                  {new Date(entry.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="space-y-1 font-sans">
                <div className="flex justify-between">
                  <span className="text-secondary font-medium">Entity:</span>
                  <span className="font-semibold text-main capitalize">{entry.entity_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary font-medium">Actor:</span>
                  <span className="font-mono text-main text-[11px] truncate max-w-[180px] break-all">
                    {actorEmail}
                  </span>
                </div>
              </div>

              <div className="pt-1 font-sans">
                <button
                  type="button"
                  onClick={() => setSelectedEntry(entry)}
                  className="w-full py-2 rounded-xl bg-surface hover:bg-ivory text-main border border-border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5 text-accent-admin" />
                  <span>Inspect State Changes</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border text-xs">
          <div className="text-secondary">
            Showing Page <span className="text-navy font-semibold font-mono">{currentPage}</span> of{' '}
            <span className="text-navy font-semibold font-mono">{totalPages}</span> ({totalCount} total audit events)
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={buildQueryUrl(Math.max(1, currentPage - 1))}
              className={`p-2 rounded-xl bg-surface border border-border text-main hover:bg-ivory shadow-xs transition-colors ${
                currentPage <= 1 ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>

            <Link
              href={buildQueryUrl(Math.min(totalPages, currentPage + 1))}
              className={`p-2 rounded-xl bg-surface border border-border text-main hover:bg-ivory shadow-xs transition-colors ${
                currentPage >= totalPages ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Detail Slide-Over Drawer for JSON inspection */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-surface border-l border-border h-full overflow-y-auto p-6 shadow-2xl space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getActionBadgeColor(
                        selectedEntry.action_type
                      )}`}
                    >
                      {formatActionDisplayLabel(selectedEntry.action_type)}
                    </span>
                    <span className="text-xs text-muted font-mono">
                      ({selectedEntry.action_type})
                    </span>
                    <span className="text-xs text-secondary">
                      {selectedEntry.entity_type}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-navy font-mono mt-1 break-all">
                    Entity ID: {selectedEntry.entity_id}
                  </h3>
                  <div className="text-xs text-secondary flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-secondary" />
                    <span>{new Date(selectedEntry.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  className="p-1.5 rounded-lg bg-surface hover:bg-ivory text-secondary hover:text-navy border border-border transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Actor Details */}
              <div className="bg-ivory/50 p-4 rounded-xl border border-border space-y-2 text-xs">
                <div className="font-semibold text-navy flex items-center gap-2">
                  <User className="w-4 h-4 text-accent-admin" />
                  <span>Executing Actor Metadata</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-secondary text-xs">
                  <div>
                    Email:{' '}
                    <span className="text-main font-mono break-all">
                      {selectedEntry.profiles?.email || 'N/A'}
                    </span>
                  </div>
                  <div>
                    Role:{' '}
                    <span className="text-main font-semibold capitalize">
                      {selectedEntry.actor_role || selectedEntry.profiles?.role || 'N/A'}
                    </span>
                  </div>
                  <div className="col-span-2 truncate font-mono text-[11px] break-all">
                    Actor ID: {selectedEntry.actor_id || 'System Automated'}
                  </div>
                </div>
              </div>

              {/* State JSON Inspector: Previous vs New */}
              <div className="space-y-4">
                {/* Previous State */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-secondary uppercase tracking-wider">
                    <span>Previous State</span>
                    <span className="text-[10px] text-secondary lowercase">snapshot</span>
                  </div>
                  <div className="bg-ivory/40 border border-border rounded-xl p-4 overflow-x-auto max-h-56">
                    {selectedEntry.previous_state ? (
                      <pre className="text-xs font-mono text-rose-800 whitespace-pre leading-relaxed">
                        {JSON.stringify(selectedEntry.previous_state, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-secondary italic font-mono">null (initial state / creation)</span>
                    )}
                  </div>
                </div>

                {/* Transition Indicator */}
                <div className="flex items-center justify-center">
                  <div className="p-1.5 rounded-full bg-ivory border border-border text-secondary">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>

                {/* New State */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-secondary uppercase tracking-wider">
                    <span>New State</span>
                    <span className="text-[10px] text-secondary lowercase">result</span>
                  </div>
                  <div className="bg-ivory/40 border border-border rounded-xl p-4 overflow-x-auto max-h-64">
                    {selectedEntry.new_state ? (
                      <pre className="text-xs font-mono text-emerald-800 whitespace-pre leading-relaxed">
                        {JSON.stringify(selectedEntry.new_state, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-secondary italic font-mono">null (deleted)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 rounded-xl bg-surface hover:bg-ivory text-main border border-border text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
