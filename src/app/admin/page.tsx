import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import {
  Users,
  Feather,
  BookOpen,
  AlertTriangle,
  Clock,
  Activity,
  CheckCircle2,
  ChevronRight,
  Flame,
} from 'lucide-react';

function getTwentyFourHoursAgoIso(): string {
  const d = new Date();
  d.setHours(d.getHours() - 24);
  return d.toISOString();
}

export default async function AdminDashboardPage() {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  // 1. Fetch real counts across queues
  const [
    { count: pendingWritersCount },
    { count: underReviewNovelsCount },
    { count: openDisputesCount },
    { count: totalUsersCount },
    { count: publishedNovelsCount },
    { count: pendingReportsCount },
    { count: overdueInvoicesCount },
  ] = await Promise.all([
    supabase.from('writer_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval'),
    supabase.from('novels').select('id', { count: 'exact', head: true }).eq('status', 'under_review'),
    supabase.from('disputes').select('id', { count: 'exact', head: true }).in('status', ['open', 'under_review']),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('novels').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('commission_payment_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('commission_invoices')
      .select('id', { count: 'exact', head: true })
      .in('status', ['invoiced', 'partially_paid', 'payment_reported'])
      .lt('due_date', new Date().toISOString()),
  ]);

  // 2. Fetch queue items
  // 2a. Pending Writer Applications
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
    .limit(5);

  // 2b. Novels Under Review
  const { data: underReviewNovels } = await supabase
    .from('novels')
    .select(`
      id,
      title_urdu,
      title_english,
      price_pkr,
      created_at,
      status,
      writer_profiles:writer_id (
        pen_name_english,
        pen_name_urdu
      )
    `)
    .eq('status', 'under_review')
    .order('created_at', { ascending: false })
    .limit(5);

  // 2c. Overdue Orders (Awaiting writer verification > 24 hours)
  const twentyFourHoursAgo = getTwentyFourHoursAgoIso();
  const { data: overdueOrders, count: overdueOrdersCount } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      amount_pkr,
      novel_title_snapshot,
      created_at,
      writer_profiles:writer_id (
        pen_name_english
      )
    `, { count: 'exact' })
    .eq('status', 'payment_submitted')
    .lt('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: true })
    .limit(5);

  // 2e. Writers Near/Over Commission Limit
  const { data: cappedWriters } = await supabase
    .from('writer_profiles')
    .select(`
      id,
      pen_name_english,
      pen_name_urdu,
      current_unpaid_commission,
      unpaid_commission_limit,
      is_orders_paused_for_commission
    `)
    .or('is_orders_paused_for_commission.eq.true,current_unpaid_commission.gt.0')
    .order('current_unpaid_commission', { ascending: false })
    .limit(5);

  // Filter writers near or over limit (>= 80% or paused)
  const atRiskWriters = (cappedWriters || []).filter(
    (w) =>
      w.is_orders_paused_for_commission ||
      (w.current_unpaid_commission &&
        w.unpaid_commission_limit &&
        w.current_unpaid_commission >= w.unpaid_commission_limit * 0.8)
  );

  // 2f. Recent Audit Trail
  const { data: recentAuditLogs } = await supabase
    .from('audit_logs')
    .select('id, action_type, entity_type, entity_id, actor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(6);

  return (
    <div className="space-y-8">
      {/* Overview Header Banner */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Operational • Postgres Security Definer
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Live Queues & Moderation Desk
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">
            Admin Master Dashboard
          </h1>
          <p className="text-xs text-slate-400">
            Real-time actionable moderation queues, financial thresholds, and security audit streams.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/novels"
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Moderate Novels ({underReviewNovelsCount ?? 0})</span>
          </Link>
          <Link
            href="/admin/writers"
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <Feather className="w-3.5 h-3.5" />
            <span>Review Writers ({pendingWritersCount ?? 0})</span>
          </Link>
        </div>
      </div>

      {/* Top Queues Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Pending Writers */}
        <Link
          href="/admin/writers?status=pending_approval"
          className="bg-slate-950/50 border border-slate-800 hover:border-amber-500/50 rounded-xl p-4 space-y-1 transition-colors block group"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Writer Apps</span>
            <Feather className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {pendingWritersCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">Awaiting approval</p>
        </Link>

        {/* Novels Under Review */}
        <Link
          href="/admin/novels?status=under_review"
          className="bg-slate-950/50 border border-slate-800 hover:border-rose-500/50 rounded-xl p-4 space-y-1 transition-colors block group"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Under Review</span>
            <BookOpen className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {underReviewNovelsCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">Novel manuscripts</p>
        </Link>

        {/* Open Disputes */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Open Disputes</span>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-orange-400 font-mono">
            {openDisputesCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">Reader complaints</p>
        </div>

        {/* Overdue Orders */}
        <Link
          href="/admin/orders?stuck=true"
          className="bg-slate-950/50 border border-slate-800 hover:border-yellow-500/50 rounded-xl p-4 space-y-1 transition-colors block group"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Delayed Verif.</span>
            <Clock className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold text-yellow-400 font-mono">
            {overdueOrdersCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">&gt; 24h unverified</p>
        </Link>

        {/* Commission Capped Writers */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Near/Over Limit</span>
            <Flame className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 font-mono">
            {atRiskWriters.length}
          </div>
          <p className="text-[10px] text-slate-500">&gt; 80% or paused</p>
        </div>

        {/* Total Accounts */}
        <Link
          href="/admin/users"
          className="bg-slate-950/50 border border-slate-800 hover:border-slate-700 rounded-xl p-4 space-y-1 transition-colors block group"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Users</span>
            <Users className="w-4 h-4 text-slate-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {totalUsersCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">{publishedNovelsCount ?? 0} novels live</p>
        </Link>
      </div>

      {/* Commission Operations Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Reports Awaiting Confirmation */}
        <Link
          href="/admin/commission/reports"
          className="bg-slate-950/50 border border-slate-800 hover:border-amber-500/50 rounded-xl p-4 space-y-1 transition-colors block group"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Reports Awaiting Confirmation</span>
            <Clock className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {pendingReportsCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">Author payment receipts to verify</p>
        </Link>

        {/* Overdue Invoices */}
        <Link
          href="/admin/invoices"
          className="bg-slate-950/50 border border-slate-800 hover:border-rose-500/50 rounded-xl p-4 space-y-1 transition-colors block group"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Overdue Invoices</span>
            <AlertTriangle className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono">
            {overdueInvoicesCount ?? 0}
          </div>
          <p className="text-[10px] text-slate-500">Unsettled past due date</p>
        </Link>

        {/* Writers Over 80% Limit */}
        <Link
          href="/admin/commission"
          className="bg-slate-950/50 border border-slate-800 hover:border-purple-500/50 rounded-xl p-4 space-y-1 transition-colors block group"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Writers Over 80% of Limit</span>
            <Flame className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-2xl font-bold text-purple-400 font-mono">
            {atRiskWriters.length}
          </div>
          <p className="text-[10px] text-slate-500">Threshold alert or paused</p>
        </Link>
      </div>

      {/* Main Grid: Action Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Novels Under Review Queue */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-rose-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                Manuscripts Awaiting Editorial Review
              </h2>
            </div>
            <Link
              href="/admin/novels?status=under_review"
              className="text-xs text-rose-400 hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {!underReviewNovels || underReviewNovels.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-300">
                Novel moderation queue is clear
              </p>
              <p className="text-[11px] text-slate-500">
                All submitted novels have been processed by editorial team.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {underReviewNovels.map((novel) => {
                const wp = Array.isArray(novel.writer_profiles)
                  ? novel.writer_profiles[0]
                  : novel.writer_profiles;
                return (
                  <div
                    key={novel.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {novel.title_english}
                      </div>
                      <UrduText as="div" size="xs" className="text-rose-400 py-0">
                        {novel.title_urdu}
                      </UrduText>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Author: {wp?.pen_name_english || 'Author'} • PKR {novel.price_pkr}
                      </div>
                    </div>
                    <Link
                      href={`/admin/novels/${novel.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
                    >
                      Review
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Pending Writer Applications Queue */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Feather className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                Pending Writer Applications
              </h2>
            </div>
            <Link
              href="/admin/writers?status=pending_approval"
              className="text-xs text-amber-400 hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {!pendingWriters || pendingWriters.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-300">
                No pending author applications
              </p>
              <p className="text-[11px] text-slate-500">
                Reader applications submitted via /become-a-writer will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {pendingWriters.map((writer) => {
                const profileObj = Array.isArray(writer.profiles)
                  ? writer.profiles[0]
                  : writer.profiles;
                return (
                  <div
                    key={writer.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {writer.pen_name_english}
                      </div>
                      <UrduText as="div" size="xs" className="text-amber-400 py-0">
                        {writer.pen_name_urdu}
                      </UrduText>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {profileObj?.email} • Applied {new Date(writer.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Link
                      href={`/admin/writers/${writer.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
                    >
                      Inspect
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Delayed Orders & Commission Overages Strip */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                Delayed Writer Payment Verifications (&gt;24h)
              </h2>
            </div>
            <Link
              href="/admin/orders?stuck=true"
              className="text-xs text-yellow-400 hover:underline flex items-center gap-1 font-mono"
            >
              <span>{overdueOrdersCount ?? 0} Flagged</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {!overdueOrders || overdueOrders.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No orders waiting verification past 24 hours.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {overdueOrders.map((ord) => {
                const wp = Array.isArray(ord.writer_profiles) ? ord.writer_profiles[0] : ord.writer_profiles;
                return (
                  <div key={ord.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-mono text-white font-semibold">
                        {ord.order_number} • PKR {ord.amount_pkr}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Novel: {ord.novel_title_snapshot} • Writer: {wp?.pen_name_english || 'Writer'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-yellow-400 font-mono hidden sm:inline">
                        {new Date(ord.created_at).toLocaleDateString()}
                      </span>
                      <Link
                        href={`/admin/orders/${ord.id}`}
                        className="text-xs px-2.5 py-1 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 transition-colors"
                      >
                        Inspect
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. Writers Near Commission Limit */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                Writers Near/Over Commission Threshold
              </h2>
            </div>
            <span className="text-xs font-mono text-purple-400">
              {atRiskWriters.length} Accounts
            </span>
          </div>

          {atRiskWriters.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              All writers are within safe commission limits.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {atRiskWriters.map((writer) => (
                <div key={writer.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-white">
                      {writer.pen_name_english}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Unpaid: PKR {writer.current_unpaid_commission} / Limit: PKR {writer.unpaid_commission_limit}
                    </div>
                  </div>
                  <div>
                    {writer.is_orders_paused_for_commission ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                        ORDERS PAUSED
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                        HIGH BALANCE
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Security & Financial Audit Logs Strip */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white tracking-wide">
              Recent Security & Financial Audit Stream
            </h2>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>Full Audit Log</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {!recentAuditLogs || recentAuditLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Audit ledger initialized. No recent events found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentAuditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1 font-mono text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold text-[11px]">
                    {log.action_type}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Target: {log.entity_type} #{log.entity_id.slice(0, 8)}...
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
