'use client';

import React from 'react';
import Link from 'next/link';
import {
  Server,
  Database,
  HardDrive,
  FileText,
  Activity,
  Layers,
  Mail,
  Bell,
  Eye,
  Archive,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type { DashboardInfrastructureHealth } from '@/types/database';
import { formatBytes } from '@/lib/retention/format';

interface Props {
  infrastructure: DashboardInfrastructureHealth;
}

export function InfrastructureQuotaCard({ infrastructure }: Props) {
  const dbBytes = infrastructure.db_size_bytes || 0;
  const quotaBytes = infrastructure.db_quota_limit_bytes || 524288000; // 500 MB Free Tier
  const usedRatio = quotaBytes > 0 ? (dbBytes / quotaBytes) * 100 : 0;
  const usedPct = Math.min(100, Math.round(usedRatio * 10) / 10);

  // Status threshold
  const isHealthy = usedPct < 70;
  const isWarning = usedPct >= 70 && usedPct < 90;
  const isDanger = usedPct >= 90;

  const tables = infrastructure.table_counts || {
    orders: 0,
    chapters: 0,
    audit_logs: 0,
    chapter_reads: 0,
    email_outbox: 0,
    notifications: 0,
  };

  const totalProofs =
    infrastructure.active_payment_proofs_count + infrastructure.pruned_payment_proofs_count;
  const prunedRatio =
    totalProofs > 0
      ? Math.round((infrastructure.pruned_payment_proofs_count / totalProofs) * 100)
      : 0;

  return (
    <div className="bg-surface border border-border shadow-xs rounded-2xl p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-main">
              Infrastructure & Free-Tier Quota Health Meter
            </h3>
            <p className="text-xs text-muted">
              Live PostgreSQL database footprint, table growth telemetry, and binary storage retention.
            </p>
          </div>
        </div>

        <Link
          href="/admin/settings"
          className="text-xs font-semibold text-accent-admin hover:underline flex items-center gap-1 self-start sm:self-auto"
        >
          <span>Retention Settings</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Supabase 500 MB Database Meter */}
        <div className="p-4 rounded-xl border border-border bg-surface-elevated space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-main flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-accent-admin" />
              Postgres Database Quota
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] border ${
                isHealthy
                  ? 'bg-success-soft text-success-text border-success-border'
                  : isWarning
                  ? 'bg-warning-soft text-warning-text border-warning-border'
                  : 'bg-danger-soft text-danger-text border-danger-border'
              }`}
            >
              {isHealthy ? (
                <ShieldCheck className="w-3 h-3" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              <span>{usedPct}% Quota</span>
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-2xl font-extrabold text-main font-mono">
                {formatBytes(dbBytes)}
              </span>
              <span className="text-xs text-muted font-mono">
                / {formatBytes(quotaBytes)} Limit
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 rounded-full bg-surface border border-border overflow-hidden p-0.5">
              <div
                style={{ width: `${Math.max(usedPct, 2)}%` }}
                className={`h-full rounded-full transition-all ${
                  isHealthy
                    ? 'bg-success-soft border border-success-border'
                    : isWarning
                    ? 'bg-warning-soft border border-warning-border'
                    : 'bg-danger-soft border border-danger-border'
                }`}
              />
            </div>
          </div>

          <p className="text-[11px] text-muted leading-relaxed">
            Live database size measured via PostgreSQL catalog telemetry against the 500 MB Supabase Free Tier limit.
          </p>
        </div>

        {/* 2. High-Velocity Table Counts */}
        <div className="p-4 rounded-xl border border-border bg-surface-elevated space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-main flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-accent-admin" />
              High-Velocity Database Tables
            </span>
            <span className="text-[11px] text-muted">Real-time row counts</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {/* Orders */}
            <div className="p-2.5 bg-surface rounded-lg border border-border space-y-0.5">
              <div className="text-[11px] text-muted flex items-center gap-1">
                <FileText className="w-3 h-3 text-accent-admin" />
                <span>Orders</span>
              </div>
              <div className="text-sm font-bold text-main font-mono">
                {tables.orders.toLocaleString()}
              </div>
            </div>

            {/* Chapters */}
            <div className="p-2.5 bg-surface rounded-lg border border-border space-y-0.5">
              <div className="text-[11px] text-muted flex items-center gap-1">
                <Activity className="w-3 h-3 text-accent-admin" />
                <span>Chapters</span>
              </div>
              <div className="text-sm font-bold text-main font-mono">
                {tables.chapters.toLocaleString()}
              </div>
            </div>

            {/* Audit Logs */}
            <div className="p-2.5 bg-surface rounded-lg border border-border space-y-0.5">
              <div className="text-[11px] text-muted flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-muted" />
                <span>Audit Logs</span>
              </div>
              <div className="text-sm font-bold text-main font-mono">
                {tables.audit_logs.toLocaleString()}
              </div>
            </div>

            {/* Chapter Reads */}
            <div className="p-2.5 bg-surface rounded-lg border border-border space-y-0.5">
              <div className="text-[11px] text-muted flex items-center gap-1">
                <Eye className="w-3 h-3 text-muted" />
                <span>Chapter Reads</span>
              </div>
              <div className="text-sm font-bold text-main font-mono">
                {tables.chapter_reads.toLocaleString()}
              </div>
            </div>

            {/* Email Outbox */}
            <div className="p-2.5 bg-surface rounded-lg border border-border space-y-0.5">
              <div className="text-[11px] text-muted flex items-center gap-1">
                <Mail className="w-3 h-3 text-muted" />
                <span>Email Outbox</span>
              </div>
              <div className="text-sm font-bold text-main font-mono">
                {tables.email_outbox.toLocaleString()}
              </div>
            </div>

            {/* Notifications */}
            <div className="p-2.5 bg-surface rounded-lg border border-border space-y-0.5">
              <div className="text-[11px] text-muted flex items-center gap-1">
                <Bell className="w-3 h-3 text-muted" />
                <span>Notifications</span>
              </div>
              <div className="text-sm font-bold text-main font-mono">
                {tables.notifications.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Storage Proofs Sub-Meter */}
      <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-accent-admin shrink-0" />
          <span>
            Payment Proof Screenshots:{' '}
            <strong className="text-main font-mono font-semibold">
              {infrastructure.active_payment_proofs_count.toLocaleString()} active
            </strong>
            {' '}/ {infrastructure.pruned_payment_proofs_count.toLocaleString()} pruned by retention policy ({prunedRatio}% reclaimed)
          </span>
        </div>

        <Link
          href="/admin/settings"
          className="text-xs font-semibold text-accent-admin hover:underline flex items-center gap-1 shrink-0"
        >
          <span>Run Pruning Maintenance</span>
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

