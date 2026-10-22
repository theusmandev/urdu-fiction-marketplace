import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import {
  Users,
  Feather,
  BookOpen,
  Receipt,
  ShieldCheck,
  Clock,
  Activity,
  CheckCircle2,
} from 'lucide-react';

interface PendingWriterItem {
  id: string;
  pen_name_english: string;
  pen_name_urdu: string;
  created_at: string;
  status: string;
  profiles?:
    | {
        full_name: string | null;
        email: string;
      }
    | Array<{
        full_name: string | null;
        email: string;
      }>
    | null;
}

interface AuditLogItem {
  id: string;
  action: string;
  actor_id: string | null;
  target_table: string;
  created_at: string;
}

export default async function AdminDashboardPage() {
  const { profile } = await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  // 1. Fetch real counts across core platform entities
  const [
    { count: totalUsersCount },
    { count: totalReadersCount },
    { count: totalWritersCount },
    { count: totalNovelsCount },
    { count: totalOrdersCount },
    { count: pendingOrdersCount },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'reader'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'writer'),
    supabase.from('novels').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'payment_submitted'),
  ]);

  // 2. Fetch pending writer applications
  const { data: pendingWriters } = await supabase
    .from('writer_profiles')
    .select(`
      id,
      pen_name_english,
      pen_name_urdu,
      created_at,
      status,
      profiles:id (
        full_name,
        email
      )
    `)
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false })
    .limit(10);

  // 3. Fetch recent security and financial audit events
  const { data: recentAuditLogs } = await supabase
    .from('audit_logs')
    .select('id, action, actor_id, target_table, created_at')
    .order('created_at', { ascending: false })
    .limit(6);

  const totalUsers = totalUsersCount ?? 0;
  const readers = totalReadersCount ?? 0;
  const writers = totalWritersCount ?? 0;
  const novels = totalNovelsCount ?? 0;
  const orders = totalOrdersCount ?? 0;
  const pendingOrders = pendingOrdersCount ?? 0;
  const pendingApps = (pendingWriters || []) as unknown as PendingWriterItem[];
  const logs = recentAuditLogs ?? [];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              System Active • Postgres RLS Enforced
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Admin: {profile.email}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            Platform Master Overview
          </h1>
          <p className="text-xs text-slate-400">
            Real-time counts and security log stream directly from database tables.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-400">Current Role</div>
            <div className="text-sm font-bold text-amber-400 uppercase font-mono">
              {profile.role}
            </div>
          </div>
        </div>
      </div>

      {/* Real Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Users */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Accounts</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{totalUsers}</div>
          <p className="text-[10px] text-slate-500 font-mono">Registered profiles</p>
        </div>

        {/* Readers */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Readers</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-sky-400 font-mono">{readers}</div>
          <p className="text-[10px] text-slate-500 font-mono">Role: reader</p>
        </div>

        {/* Writers */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Writers</span>
            <Feather className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono">{writers}</div>
          <p className="text-[10px] text-slate-500 font-mono">Role: writer</p>
        </div>

        {/* Novels */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Novels</span>
            <BookOpen className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{novels}</div>
          <p className="text-[10px] text-slate-500 font-mono">In catalog</p>
        </div>

        {/* Total Orders */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Orders</span>
            <Receipt className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-400 font-mono">{orders}</div>
          <p className="text-[10px] text-slate-500 font-mono">Created orders</p>
        </div>

        {/* Pending Orders */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Pending Verif.</span>
            <Clock className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono">{pendingOrders}</div>
          <p className="text-[10px] text-slate-500 font-mono">Awaiting verification</p>
        </div>
      </div>

      {/* Main Two Columns: Pending Applications & Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Writer Applications */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Feather className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                Pending Writer Applications
              </h2>
            </div>
            <span className="text-xs font-mono text-amber-400">
              {pendingApps.length} Pending
            </span>
          </div>

          {pendingApps.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-300">
                No pending author applications
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                When readers apply via /become-a-writer, their pen names, bios, and agreement status will queue here for admin approval.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {pendingApps.map((app: PendingWriterItem) => {
                const profileObj = Array.isArray(app.profiles) ? app.profiles[0] : app.profiles;
                return (
                  <div key={app.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {app.pen_name_english}
                      </div>
                      <UrduText as="div" size="xs" className="text-amber-400/90 py-0">
                        {app.pen_name_urdu}
                      </UrduText>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {profileObj?.email} • {new Date(app.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      pending_approval
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Security & Financial Audit Logs */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                Recent Audit Trail (Immutable)
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {logs.length} Events
            </span>
          </div>

          {logs.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-300">
                Audit ledger initialized
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                All financial transfers, role changes, and admin force actions are automatically written to public.audit_logs via triggers.
              </p>
            </div>
          ) : (
            <div className="space-y-2 font-mono text-xs">
              {logs.map((log: AuditLogItem) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="text-emerald-400 font-semibold text-[11px]">
                      {log.action}
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      Target: {log.target_table} • Actor: {log.actor_id ? log.actor_id.slice(0, 8) + '...' : 'system'}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
