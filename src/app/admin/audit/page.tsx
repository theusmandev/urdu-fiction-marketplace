import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { AuditLogViewer, AuditEntry } from '@/components/admin/AuditLogViewer';
import { History, Filter, RotateCcw } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  searchParams: Promise<{
    action_type?: string;
    entity_type?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  await requireRole('admin', '/admin');
  const params = await searchParams;

  const actionType = params.action_type || '';
  const entityType = params.entity_type || '';
  const fromDate = params.from || '';
  const toDate = params.to || '';
  const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const pageSize = 20;

  const supabase = await createServerClient();

  let queryBuilder = supabase
    .from('audit_logs')
    .select(`
      id,
      actor_id,
      actor_role,
      action_type,
      entity_type,
      entity_id,
      previous_state,
      new_state,
      created_at,
      profiles:actor_id (
        email,
        username,
        full_name,
        role
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (actionType) {
    queryBuilder = queryBuilder.eq('action_type', actionType);
  }
  if (entityType) {
    queryBuilder = queryBuilder.eq('entity_type', entityType);
  }
  if (fromDate) {
    queryBuilder = queryBuilder.gte('created_at', `${fromDate}T00:00:00.000Z`);
  }
  if (toDate) {
    queryBuilder = queryBuilder.lte('created_at', `${toDate}T23:59:59.999Z`);
  }

  const fromIdx = (currentPage - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;

  queryBuilder = queryBuilder.range(fromIdx, toIdx);

  const { data: logs, count } = await queryBuilder;

  // Available distinct action types and entity types for dropdown filter
  const ACTION_TYPES = [
    'ALL',
    'APPROVE_NOVEL',
    'REJECT_NOVEL',
    'SUSPEND_NOVEL',
    'UNSUSPEND_NOVEL',
    'SET_NOVEL_FEATURED',
    'APPROVE_WRITER',
    'REJECT_WRITER',
    'SUSPEND_WRITER',
    'SET_WRITER_COMMISSION_TERMS',
    'CREATE_GENRE',
    'UPDATE_GENRE',
    'REORDER_GENRES',
    'DELETE_GENRE',
    'UPDATE_PLATFORM_SETTINGS',
    'UPDATE_USER_ROLE_STATUS',
  ];

  const ENTITY_TYPES = ['ALL', 'novels', 'writer_profiles', 'genres', 'platform_settings', 'profiles'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <History className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-white">System Audit & Governance Trail</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable, append-only record of all administrative approvals, suspensions, rate modifications, and deletions.
          </p>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Total Recorded Events: <span className="text-white font-bold">{count || 0}</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <form
        method="get"
        className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      >
        {/* Action Type Filter */}
        <div>
          <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
            Action Type
          </label>
          <select
            name="action_type"
            defaultValue={actionType}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            {ACTION_TYPES.map((act) => (
              <option key={act} value={act === 'ALL' ? '' : act}>
                {act}
              </option>
            ))}
          </select>
        </div>

        {/* Entity Type Filter */}
        <div>
          <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
            Entity Type
          </label>
          <select
            name="entity_type"
            defaultValue={entityType}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          >
            {ENTITY_TYPES.map((ent) => (
              <option key={ent} value={ent === 'ALL' ? '' : ent}>
                {ent}
              </option>
            ))}
          </select>
        </div>

        {/* From Date */}
        <div>
          <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
            From Date
          </label>
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
        </div>

        {/* To Date */}
        <div>
          <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
            To Date
          </label>
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="flex-1 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>
          <Link
            href="/admin/audit"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
            title="Reset Filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Link>
        </div>
      </form>

      {/* Audit Log Results */}
      {!logs || logs.length === 0 ? (
        <div className="py-16 text-center bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-300">No audit log records found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No system actions matched your selected filter criteria.
          </p>
        </div>
      ) : (
        <AuditLogViewer
          logs={logs as unknown as AuditEntry[]}
          totalCount={count || 0}
          currentPage={currentPage}
          pageSize={pageSize}
          currentFilters={{
            action_type: actionType,
            entity_type: entityType,
            from: fromDate,
            to: toDate,
          }}
        />
      )}
    </div>
  );
}
