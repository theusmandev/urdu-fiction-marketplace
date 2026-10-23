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

  const getActionBadgeColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('REJECT') || act.includes('SUSPEND')) {
      return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    }
    if (act.includes('APPROVE') || act.includes('UNSUSPEND') || act.includes('CREATE')) {
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    }
    if (act.includes('UPDATE') || act.includes('SET')) {
      return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
    }
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className="space-y-4">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px] font-sans">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {logs.map((entry) => {
                const actorEmail = entry.profiles?.email || entry.actor_id || 'System';
                return (
                  <tr key={entry.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${getActionBadgeColor(
                          entry.action_type
                        )}`}
                      >
                        {entry.action_type}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <div className="font-semibold text-white capitalize">{entry.entity_type}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[160px]">
                        {entry.entity_id}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-sans">
                      <div className="text-slate-300 truncate max-w-[180px] font-mono text-[11px]">
                        {actorEmail}
                      </div>
                      <div className="text-[10px] text-slate-500 capitalize">
                        {entry.actor_role || entry.profiles?.role || 'user'}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => setSelectedEntry(entry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                      >
                        <Code className="w-3 h-3 text-slate-400" />
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
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 font-mono text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getActionBadgeColor(
                    entry.action_type
                  )}`}
                >
                  {entry.action_type}
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(entry.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="text-slate-300 space-y-1 font-sans">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-mono">Entity:</span>
                  <span className="font-semibold text-white capitalize">{entry.entity_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-mono">Actor:</span>
                  <span className="font-mono text-slate-300 text-[11px] truncate max-w-[180px]">
                    {actorEmail}
                  </span>
                </div>
              </div>

              <div className="pt-1 font-sans">
                <button
                  type="button"
                  onClick={() => setSelectedEntry(entry)}
                  className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Inspect State Changes</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs">
          <div className="text-slate-400">
            Showing Page <span className="text-white font-mono">{currentPage}</span> of{' '}
            <span className="text-white font-mono">{totalPages}</span> ({totalCount} total audit events)
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={buildQueryUrl(Math.max(1, currentPage - 1))}
              className={`p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors ${
                currentPage <= 1 ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>

            <Link
              href={buildQueryUrl(Math.min(totalPages, currentPage + 1))}
              className={`p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors ${
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
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 shadow-2xl space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${getActionBadgeColor(
                        selectedEntry.action_type
                      )}`}
                    >
                      {selectedEntry.action_type}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {selectedEntry.entity_type}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white font-mono mt-1">
                    Entity ID: {selectedEntry.entity_id}
                  </h3>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{new Date(selectedEntry.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Actor Details */}
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="font-semibold text-slate-300 flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  <span>Executing Actor Metadata</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono text-[11px]">
                  <div>
                    Email:{' '}
                    <span className="text-white">
                      {selectedEntry.profiles?.email || 'N/A'}
                    </span>
                  </div>
                  <div>
                    Role:{' '}
                    <span className="text-amber-400 capitalize">
                      {selectedEntry.actor_role || selectedEntry.profiles?.role || 'N/A'}
                    </span>
                  </div>
                  <div className="col-span-2 truncate">
                    Actor UUID: {selectedEntry.actor_id || 'System Automated'}
                  </div>
                </div>
              </div>

              {/* State JSON Inspector: Previous vs New */}
              <div className="space-y-4">
                {/* Previous State */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span>Previous State</span>
                    <span className="text-[10px] text-slate-500 lowercase">immutable snapshot</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 overflow-x-auto max-h-56">
                    {selectedEntry.previous_state ? (
                      <pre className="text-xs font-mono text-rose-300/90 whitespace-pre leading-relaxed">
                        {JSON.stringify(selectedEntry.previous_state, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-slate-600 italic font-mono">null (initial state / creation)</span>
                    )}
                  </div>
                </div>

                {/* Transition Indicator */}
                <div className="flex items-center justify-center">
                  <div className="p-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>

                {/* New State */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    <span>New State</span>
                    <span className="text-[10px] text-slate-500 lowercase">recorded result</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 overflow-x-auto max-h-64">
                    {selectedEntry.new_state ? (
                      <pre className="text-xs font-mono text-emerald-300/90 whitespace-pre leading-relaxed">
                        {JSON.stringify(selectedEntry.new_state, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-xs text-slate-600 italic font-mono">null (deleted)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
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
