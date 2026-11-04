'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Scale,
  RotateCcw,
  Users,
  BookOpen,
  FileText,
  MailWarning,
  DollarSign,
  Heart,
  Percent,
  Wallet,
  Coins,
  ShieldCheck,
  ChevronRight,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import type { AdminDashboardAnalytics } from '@/types/database';
import { getAdminDashboardAnalyticsAction } from '@/app/actions/admin';
import { RevenueVelocityChart } from './RevenueVelocityChart';
import { OrderFunnelGenreCard } from './OrderFunnelGenreCard';
import { DashboardLeaderboards } from './DashboardLeaderboards';
import { InfrastructureQuotaCard } from './InfrastructureQuotaCard';

interface Props {
  initialAnalytics: AdminDashboardAnalytics;
  initialDays: number;
}

const TIMEFRAMES = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: '1 Year', days: 365 },
  { label: 'All Time', days: -1 },
] as const;

function formatPkr(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return 'PKR 0';
  }
  return `PKR ${Math.round(Number(val)).toLocaleString('en-PK')}`;
}

function calculateGrowth(current: number, previous: number): {
  pct: number;
  label: string;
  isPositive: boolean;
  isNeutral: boolean;
} {
  if (previous <= 0) {
    if (current > 0) return { pct: 100, label: '+100%', isPositive: true, isNeutral: false };
    return { pct: 0, label: '0%', isPositive: true, isNeutral: true };
  }
  const diff = ((current - previous) / previous) * 100;
  const rounded = Math.round(diff * 10) / 10;
  if (rounded > 0) return { pct: rounded, label: `+${rounded}%`, isPositive: true, isNeutral: false };
  if (rounded < 0) return { pct: rounded, label: `${rounded}%`, isPositive: false, isNeutral: false };
  return { pct: 0, label: '0%', isPositive: true, isNeutral: true };
}

function exportAnalyticsCsv(analytics: AdminDashboardAnalytics) {
  const rows: string[][] = [
    ['UNB Premium Executive Analytics Snapshot'],
    ['Generated At', new Date().toISOString()],
    ['Selected Timeframe', analytics.timeframe.is_all_time ? 'All Time' : `${analytics.timeframe.days} Days`],
    ['Window Start', analytics.timeframe.start_date],
    ['Window End', analytics.timeframe.end_date],
    [],
    ['EXECUTIVE FINANCIAL KPIS', 'METRIC VALUE'],
    ['Gross Merchandise Volume (PKR)', String(analytics.kpis.gmv_pkr)],
    ['Previous Window GMV (PKR)', String(analytics.kpis.prev_gmv_pkr)],
    ['Verified Orders Count', String(analytics.kpis.verified_orders_count)],
    ['Previous Window Orders Count', String(analytics.kpis.prev_verified_orders_count)],
    ['Platform Fee Accrued (PKR)', String(analytics.kpis.platform_fee_accrued_pkr)],
    ['Platform Fee Settled (PKR)', String(analytics.kpis.platform_fee_settled_pkr)],
    ['Unpaid Platform Fee Exposure (PKR)', String(analytics.kpis.unpaid_fee_exposure_pkr)],
    ['Writer Net Earnings (PKR)', String(analytics.kpis.writer_net_earnings_pkr)],
    ['Average Order Value (PKR)', String(analytics.kpis.avg_order_value_pkr)],
    ['Verified Reader Tips (PKR)', String(analytics.kpis.verified_tips_pkr)],
    ['Verified Tips Count', String(analytics.kpis.verified_tips_count)],
    ['Order Conversion Rate (%)', `${analytics.kpis.conversion_rate_pct}%`],
    [],
    ['ORDER FUNNEL BREAKDOWN', 'COUNT'],
    ['Verified Orders', String(analytics.order_funnel.verified)],
    ['Awaiting Verification', String(analytics.order_funnel.pending_verification)],
    ['Pending Payment', String(analytics.order_funnel.pending_payment)],
    ['Rejected Submissions', String(analytics.order_funnel.rejected)],
    ['Cancelled Orders', String(analytics.order_funnel.cancelled)],
    ['Disputed Orders', String(analytics.order_funnel.disputed)],
    ['Refunded / Adjusted Orders', String(analytics.order_funnel.refunded_adjusted)],
    ['Total Order Intents', String(analytics.order_funnel.total_orders)],
    [],
    ['DECISION RADAR BOTTLENECKS', 'ACTIVE COUNT'],
    ['Stale Orders (> 24h)', String(analytics.decision_radar.stale_pending_orders_24h)],
    ['Open Disputes', String(analytics.decision_radar.open_disputes_count)],
    ['Pending Refund Requests', String(analytics.decision_radar.pending_refund_requests_count)],
    ['Pending Author Applications', String(analytics.decision_radar.pending_writer_applications_count)],
    ['Novels in Editorial Review', String(analytics.decision_radar.pending_novel_moderation_count)],
    ['Overdue Platform Fee Invoices', String(analytics.decision_radar.overdue_invoices_count)],
    ['Failed Outbox Emails', String(analytics.decision_radar.failed_emails_count)],
  ];

  const csvContent =
    'data:text/csv;charset=utf-8,' +
    rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `unb_executive_analytics_${analytics.timeframe.is_all_time ? 'all_time' : `${analytics.timeframe.days}d`}_${new Date().toISOString().split('T')[0]}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function AdminDashboardClient({ initialAnalytics, initialDays }: Props) {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AdminDashboardAnalytics>(initialAnalytics);
  const [selectedDays, setSelectedDays] = useState<number>(initialDays);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSelectTimeframe(days: number) {
    setSelectedDays(days);
    setErrorMessage(null);

    // Update query string in URL without full reload
    const url = new URL(window.location.href);
    url.searchParams.set('days', String(days));
    window.history.replaceState({}, '', url.toString());

    startTransition(async () => {
      const res = await getAdminDashboardAnalyticsAction(days);
      if (res.success && res.data) {
        setAnalytics(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to refresh analytics for selected timeframe.');
      }
    });
  }

  function handleRefresh() {
    handleSelectTimeframe(selectedDays);
  }

  // Financial Growth Calculations
  const gmvGrowth = calculateGrowth(analytics.kpis.gmv_pkr, analytics.kpis.prev_gmv_pkr);
  const ordersGrowth = calculateGrowth(
    analytics.kpis.verified_orders_count,
    analytics.kpis.prev_verified_orders_count
  );

  // Decision Radar Metrics
  const radar = analytics.decision_radar;
  const totalBottlenecks =
    radar.stale_pending_orders_24h +
    radar.open_disputes_count +
    radar.pending_refund_requests_count +
    radar.pending_writer_applications_count +
    radar.pending_novel_moderation_count +
    radar.overdue_invoices_count +
    radar.failed_emails_count;

  // Platform Fee settlement progress
  const feeSettlementRatio =
    analytics.kpis.platform_fee_accrued_pkr > 0
      ? Math.min(
          100,
          Math.round(
            (analytics.kpis.platform_fee_settled_pkr / analytics.kpis.platform_fee_accrued_pkr) * 100
          )
        )
      : 100;

  return (
    <div className="space-y-8">
      {/* SECTION A: TOP CONTROL BAR */}
      <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-main">
                Executive Analytics & Decision Center
              </h1>
            </div>
            <p className="text-xs text-muted">
              Live revenue distributions, period-over-period financial health, and actionable operational bottlenecks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isPending}
              className="p-2 rounded-xl bg-surface border border-border hover:bg-surface-elevated text-main text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title="Refresh Analytics"
            >
              <RotateCw className={`w-3.5 h-3.5 text-accent-admin ${isPending ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => exportAnalyticsCsv(analytics)}
              className="px-3 py-2 rounded-xl bg-surface border border-border hover:bg-surface-elevated text-main text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-accent-admin" />
              <span>Export CSV</span>
            </button>

            <Link
              href="/admin"
              className="px-3 py-2 rounded-xl bg-accent-admin/10 hover:bg-accent-admin/20 border border-accent-admin/30 text-accent-admin text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1"
            >
              <span>Admin Overview</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Timeframe Selector Pills */}
        <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-medium text-muted mr-1 shrink-0">Window:</span>
            {TIMEFRAMES.map((tf) => {
              const isSelected = selectedDays === tf.days;
              return (
                <button
                  key={tf.days}
                  type="button"
                  onClick={() => handleSelectTimeframe(tf.days)}
                  disabled={isPending}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-accent-admin text-white shadow-2xs'
                      : 'bg-surface border border-border text-muted hover:text-main hover:bg-surface-elevated'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-muted flex items-center gap-2">
            <span>
              Comparing against preceding{' '}
              {analytics.timeframe.is_all_time ? 'baseline window' : `${analytics.timeframe.days}-day window`}
            </span>
            {isPending && (
              <span className="inline-flex items-center gap-1 text-accent-admin font-semibold animate-pulse">
                <RotateCw className="w-3 h-3 animate-spin" /> Updating...
              </span>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-danger-text" />
          <div className="space-y-0.5">
            <h4 className="font-semibold text-sm">Failed to refresh analytics</h4>
            <p className="text-xs opacity-90">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* SECTION B: EXECUTIVE FINANCIAL KPIS (6 HERO CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Gross Merchandise Volume (GMV) */}
        <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Gross Merchandise Volume
            </span>
            <div className="w-8 h-8 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-main font-mono">
              {formatPkr(analytics.kpis.gmv_pkr)}
            </div>
            <p className="text-xs text-muted mt-0.5">
              Verified sales volume ({analytics.kpis.verified_orders_count.toLocaleString()} orders)
            </p>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted">Period Comparison:</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] border ${
                gmvGrowth.isNeutral
                  ? 'bg-surface-elevated text-muted border-border'
                  : gmvGrowth.isPositive
                  ? 'bg-success-soft text-success-text border-success-border'
                  : 'bg-danger-soft text-danger-text border-danger-border'
              }`}
            >
              {gmvGrowth.isNeutral ? (
                <Minus className="w-3 h-3" />
              ) : gmvGrowth.isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{gmvGrowth.label}</span>
            </span>
          </div>
        </div>

        {/* 2. Platform Fee Revenue */}
        <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Platform Fee Revenue
            </span>
            <div className="w-8 h-8 rounded-lg bg-info-soft border border-info-border flex items-center justify-center text-info-text">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-main font-mono">
              {formatPkr(analytics.kpis.platform_fee_accrued_pkr)}
            </div>
            <p className="text-xs text-muted mt-0.5">
              Accrued platform fees on novel sales
            </p>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted">Settled to Platform:</span>
            <span className="font-semibold text-main font-mono">
              {formatPkr(analytics.kpis.platform_fee_settled_pkr)}
            </span>
          </div>
        </div>

        {/* 3. Writer Net Earnings & AOV */}
        <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Author Net Earnings
            </span>
            <div className="w-8 h-8 rounded-lg bg-success-soft border border-success-border flex items-center justify-center text-success-text">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-main font-mono">
              {formatPkr(analytics.kpis.writer_net_earnings_pkr)}
            </div>
            <p className="text-xs text-muted mt-0.5">
              Disbursed directly via Pakistani direct rails
            </p>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted">Avg Order Value (AOV):</span>
            <span className="font-semibold text-main font-mono">
              {formatPkr(analytics.kpis.avg_order_value_pkr)}
            </span>
          </div>
        </div>

        {/* 4. Unpaid Fee Exposure */}
        <div
          className={`border shadow-xs rounded-2xl p-5 space-y-3 relative overflow-hidden ${
            analytics.kpis.unpaid_fee_exposure_pkr > 0
              ? 'bg-warning-soft/20 border-warning-border'
              : 'bg-surface border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Unpaid Fee Exposure
            </span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                analytics.kpis.unpaid_fee_exposure_pkr > 0
                  ? 'bg-warning-soft border border-warning-border text-warning-text'
                  : 'bg-surface border border-border text-muted'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-main font-mono">
              {formatPkr(analytics.kpis.unpaid_fee_exposure_pkr)}
            </div>
            <p className="text-xs text-muted mt-0.5">
              Outstanding platform balances across all authors
            </p>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted">Settlement Status:</span>
            <Link
              href="/admin/commission"
              className="text-xs font-semibold text-accent-admin hover:underline flex items-center gap-1"
            >
              <span>Manage Invoices</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* 5. Reader Appreciation (Tips) */}
        <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Reader Appreciation
            </span>
            <div className="w-8 h-8 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Heart className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-main font-mono">
              {formatPkr(analytics.kpis.verified_tips_pkr)}
            </div>
            <p className="text-xs text-muted mt-0.5">
              100% direct reader-to-author appreciation
            </p>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted">Total Tip Transactions:</span>
            <span className="font-semibold text-main font-mono">
              {analytics.kpis.verified_tips_count.toLocaleString()} tips
            </span>
          </div>
        </div>

        {/* 6. Order Verification Conversion Rate */}
        <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              Verification Conversion Rate
            </span>
            <div className="w-8 h-8 rounded-lg bg-info-soft border border-info-border flex items-center justify-center text-info-text">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-main font-mono">
              {analytics.kpis.conversion_rate_pct.toFixed(1)}%
            </div>
            <p className="text-xs text-muted mt-0.5">
              Verified orders out of total submitted payments
            </p>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted">Funnel Performance:</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] border ${
                analytics.kpis.conversion_rate_pct >= 80
                  ? 'bg-success-soft text-success-text border-success-border'
                  : analytics.kpis.conversion_rate_pct >= 60
                  ? 'bg-warning-soft text-warning-text border-warning-border'
                  : 'bg-danger-soft text-danger-text border-danger-border'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>
                {analytics.kpis.conversion_rate_pct >= 80
                  ? 'Healthy Rate'
                  : analytics.kpis.conversion_rate_pct >= 60
                  ? 'Moderate Drop-off'
                  : 'Needs Review'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* SECTION C: DECISION RADAR BOTTLENECK ALERTS */}
      <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-danger-soft border border-danger-border flex items-center justify-center text-danger-text">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-main">
                Operational Decision Radar & Bottlenecks
              </h3>
              <p className="text-xs text-muted">
                Immediate actionable tasks requiring administrator intervention.
              </p>
            </div>
          </div>

          <div className="text-xs">
            {totalBottlenecks === 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-success-soft text-success-text border border-success-border">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All Queues Clear
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning-soft text-warning-text border border-warning-border">
                <AlertTriangle className="w-3.5 h-3.5" />
                {totalBottlenecks} {totalBottlenecks === 1 ? 'Action Required' : 'Actions Required'}
              </span>
            )}
          </div>
        </div>

        {totalBottlenecks === 0 ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-success-soft border border-success-border text-success-text flex items-center justify-center mx-auto shadow-2xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-semibold text-sm text-main">
              All Systems Clear — Zero Operational Bottlenecks
            </h4>
            <p className="text-xs text-muted max-w-md mx-auto">
              There are no orders stuck in verification, zero open disputes, no pending refunds, and zero failed emails.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* 1. Stale Pending Orders */}
            {radar.stale_pending_orders_24h > 0 && (
              <Link
                href="/admin/orders"
                className="p-4 rounded-xl border border-warning-border bg-warning-soft/40 hover:bg-warning-soft text-main transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-warning-text mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-warning-text">
                      Stale Payment Proofs (&gt;24h)
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {radar.stale_pending_orders_24h} orders awaiting writer verification
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-warning-text group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            )}

            {/* 2. Open Disputes */}
            {radar.open_disputes_count > 0 && (
              <Link
                href="/admin/disputes"
                className="p-4 rounded-xl border border-danger-border bg-danger-soft/40 hover:bg-danger-soft text-main transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <Scale className="w-4 h-4 text-danger-text mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-danger-text">
                      Active Customer Disputes
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {radar.open_disputes_count} open dispute cases requiring review
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-danger-text group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            )}

            {/* 3. Pending Refunds */}
            {radar.pending_refund_requests_count > 0 && (
              <Link
                href="/admin/refunds"
                className="p-4 rounded-xl border border-info-border bg-info-soft/40 hover:bg-info-soft text-main transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <RotateCcw className="w-4 h-4 text-info-text mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-info-text">
                      Pending Refund Requests
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {radar.pending_refund_requests_count} refund requests awaiting decision
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-info-text group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            )}

            {/* 4. Pending Writer Applications */}
            {radar.pending_writer_applications_count > 0 && (
              <Link
                href="/admin/writers"
                className="p-4 rounded-xl border border-border bg-surface-elevated hover:bg-surface text-main transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <Users className="w-4 h-4 text-accent-admin mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-main">
                      Author Studio Applications
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {radar.pending_writer_applications_count} prospective authors awaiting approval
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            )}

            {/* 5. Pending Novel Moderation */}
            {radar.pending_novel_moderation_count > 0 && (
              <Link
                href="/admin/novels"
                className="p-4 rounded-xl border border-border bg-surface-elevated hover:bg-surface text-main transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <BookOpen className="w-4 h-4 text-accent-admin mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-main">
                      Novels Awaiting Editorial Review
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {radar.pending_novel_moderation_count} novels submitted for publishing
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            )}

            {/* 6. Overdue Platform Fee Invoices */}
            {radar.overdue_invoices_count > 0 && (
              <Link
                href="/admin/commission"
                className="p-4 rounded-xl border border-warning-border bg-warning-soft/40 hover:bg-warning-soft text-main transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <FileText className="w-4 h-4 text-warning-text mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-warning-text">
                      Overdue Platform Fee Invoices
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {radar.overdue_invoices_count} unpaid invoices past due date
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-warning-text group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            )}

            {/* 7. Failed Outbox Emails */}
            {radar.failed_emails_count > 0 && (
              <Link
                href="/admin"
                className="p-4 rounded-xl border border-danger-border bg-danger-soft/40 hover:bg-danger-soft text-main transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3">
                  <MailWarning className="w-4 h-4 text-danger-text mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-danger-text">
                      Failed Outbox Transmissions
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {radar.failed_emails_count} undelivered emails in outbox queue
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-danger-text group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* SECTION D: CUSTOM SVG REVENUE VELOCITY & LIFECYCLE FUNNEL CHARTS */}
      <RevenueVelocityChart
        data={analytics.daily_series}
        isAllTime={analytics.timeframe.is_all_time}
      />

      <OrderFunnelGenreCard
        funnel={analytics.order_funnel}
        genres={analytics.genre_breakdown}
      />

      {/* SECTION E: LEADERBOARDS (TOP NOVELS & TOP WRITERS) */}
      <DashboardLeaderboards
        novels={analytics.top_novels}
        writers={analytics.top_writers}
      />

      {/* SECTION F: INFRASTRUCTURE & 500MB DB QUOTA HEALTH */}
      <InfrastructureQuotaCard infrastructure={analytics.infrastructure} />
    </div>
  );
}

