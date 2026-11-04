'use client';

import React, { useState, useTransition } from 'react';
import {
  Database,
  Trash2,
  Clock,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  updateRetentionSettingsAction,
  runRetentionCleanupAction,
} from '@/app/actions/admin';
import { formatBytes } from '@/lib/retention/format';
import type { RetentionSettings, RetentionCleanupSummary } from '@/types/database';

export { formatBytes };

interface Props {
  initialSettings: RetentionSettings;
  lastCleanupAt?: string | null;
  lastCleanupSummary?: RetentionCleanupSummary | null;
}

interface CategoryConfig {
  key: keyof RetentionSettings;
  label: string;
  description: string;
  defaultDays: number;
  icon: React.ReactNode;
  storageTarget: 'Database' | 'Storage Bucket';
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'retention_audit_logs_days',
    label: 'System Audit Logs',
    description: 'Admin actions, settings changes, and governance records.',
    defaultDays: 30,
    icon: <ShieldCheck className="w-4 h-4" />,
    storageTarget: 'Database',
  },
  {
    key: 'retention_chapter_reads_days',
    label: 'Reader Telemetry & Anti-Scraping',
    description: 'Ephemeral chapter reading window counters.',
    defaultDays: 7,
    icon: <Database className="w-4 h-4" />,
    storageTarget: 'Database',
  },
  {
    key: 'retention_chapter_revisions_days',
    label: 'Chapter Revision History',
    description: 'Historical content diffs and prior chapter drafts.',
    defaultDays: 30,
    icon: <Database className="w-4 h-4" />,
    storageTarget: 'Database',
  },
  {
    key: 'retention_email_outbox_days',
    label: 'Dispatched Email Outbox',
    description: 'Sent, skipped, and failed notification delivery records.',
    defaultDays: 30,
    icon: <Database className="w-4 h-4" />,
    storageTarget: 'Database',
  },
  {
    key: 'retention_notifications_days',
    label: 'User In-App Notifications',
    description: 'Read alerts (unread notifications retained 3x longer).',
    defaultDays: 30,
    icon: <Database className="w-4 h-4" />,
    storageTarget: 'Database',
  },
  {
    key: 'retention_rate_limits_days',
    label: 'Rate Limits Telemetry',
    description: 'Sliding-window rate limit access logs.',
    defaultDays: 2,
    icon: <Database className="w-4 h-4" />,
    storageTarget: 'Database',
  },
  {
    key: 'retention_chapter_drafts_days',
    label: 'Stale Chapter Drafts',
    description: 'Abandoned unpublished chapter drafts with no activity.',
    defaultDays: 90,
    icon: <Database className="w-4 h-4" />,
    storageTarget: 'Database',
  },
  {
    key: 'retention_payment_proofs_days',
    label: 'Storage Payment Receipts',
    description: 'Screenshot images in private storage bucket. Financial records & TIDs remain permanent.',
    defaultDays: 90,
    icon: <HardDrive className="w-4 h-4" />,
    storageTarget: 'Storage Bucket',
  },
];

const PRESET_OPTIONS = [
  { label: '2 Days', value: 2 },
  { label: '7 Days (1 Wk)', value: 7 },
  { label: '14 Days (2 Wks)', value: 14 },
  { label: '30 Days (1 Mo)', value: 30 },
  { label: '60 Days (2 Mos)', value: 60 },
  { label: '90 Days (3 Mos)', value: 90 },
  { label: '180 Days (6 Mos)', value: 180 },
  { label: '365 Days (1 Yr)', value: 365 },
  { label: 'Unlimited (Never Delete)', value: -1 },
];

export function DataRetentionSettingsCard({
  initialSettings,
  lastCleanupAt,
  lastCleanupSummary,
}: Props) {
  const [settings, setSettings] = useState<RetentionSettings>(initialSettings);
  const [isSaving, startSavingTransition] = useTransition();
  const [isRunning, startRunningTransition] = useTransition();

  const [saveStatus, setSaveStatus] = useState<{ success?: boolean; error?: string } | null>(null);
  const [cleanupStatus, setCleanupStatus] = useState<{
    success?: boolean;
    summary?: any;
    filesDeleted?: number;
    error?: string;
  } | null>(null);

  const [activeSummary, setActiveSummary] = useState<RetentionCleanupSummary | null>(
    lastCleanupSummary ?? null
  );
  const [activeLastRunAt, setActiveLastRunAt] = useState<string | null>(
    lastCleanupAt ?? null
  );

  function handleDaysChange(key: keyof RetentionSettings, value: number) {
    const clamped = Math.min(3650, Math.max(-1, value));
    setSettings((prev) => ({ ...prev, [key]: clamped }));
    setSaveStatus(null);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveStatus(null);
    startSavingTransition(async () => {
      const res = await updateRetentionSettingsAction(settings);
      setSaveStatus(res);
    });
  }

  function handleRunCleanup() {
    setCleanupStatus(null);
    startRunningTransition(async () => {
      const res = await runRetentionCleanupAction();
      if (res.success && res.data) {
        setCleanupStatus({
          success: true,
          summary: res.data.dbSummary,
          filesDeleted: res.data.filesDeleted,
        });
        setActiveSummary(res.data.dbSummary as RetentionCleanupSummary);
        setActiveLastRunAt(new Date().toISOString());
      } else {
        setCleanupStatus({
          success: false,
          error: res.error || 'Failed to execute retention cleanup',
        });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-admin-soft text-accent-admin border border-accent-admin-border flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-main text-base sm:text-lg flex items-center gap-2">
              Data & Storage Retention Policies
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Control storage bloat by configuring automatic pruning windows. Set any category to{' '}
              <span className="font-semibold text-main">Unlimited (-1)</span> to retain data forever.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRunCleanup}
          disabled={isRunning || isSaving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-accent-admin hover:bg-accent-admin-hover text-accent-admin-contrast transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Running Cleanup...</span>
            </>
          ) : (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              <span>Run Cleanup Now</span>
            </>
          )}
        </button>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-3.5 rounded-xl border border-border bg-surface-muted flex items-start gap-3 text-xs text-muted">
        <Info className="w-4 h-4 text-accent-admin shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-main">
            Financial & Legal Immutability Guard
          </p>
          <p>
            Orders, platform fee invoices, author earnings, reader entitlements, and profile identities are{' '}
            <span className="font-semibold text-main">strictly permanent</span> and excluded from all deletion routines. Pruning only removes transient telemetry, revision history, and expired binary receipts.
          </p>
        </div>
      </div>

      {/* Retention Categories Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CATEGORIES.map(({ key, label, description, defaultDays, icon, storageTarget }) => {
            const currentVal = settings[key] ?? defaultDays;
            const isUnlimited = currentVal <= 0;

            return (
              <div
                key={key}
                className="p-4 rounded-xl border border-border bg-surface-muted/50 hover:border-border-strong transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-accent-admin">{icon}</span>
                    <span className="font-semibold text-main text-xs sm:text-sm">{label}</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                      storageTarget === 'Storage Bucket'
                        ? 'bg-warning-soft text-warning-text border border-warning-border'
                        : 'bg-surface text-muted border border-border'
                    }`}
                  >
                    {storageTarget}
                  </span>
                </div>

                <p className="text-xs text-muted leading-relaxed min-h-[32px]">{description}</p>

                <div className="flex items-center gap-2 pt-1">
                  {/* Preset Selector */}
                  <select
                    value={
                      PRESET_OPTIONS.some((p) => p.value === currentVal)
                        ? currentVal
                        : 'custom'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== 'custom') {
                        handleDaysChange(key, parseInt(val, 10));
                      }
                    }}
                    className="flex-1 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-main focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin"
                  >
                    {PRESET_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                    {!PRESET_OPTIONS.some((p) => p.value === currentVal) && (
                      <option value="custom">Custom ({currentVal} days)</option>
                    )}
                  </select>

                  {/* Manual Days Input */}
                  <div className="w-24 relative">
                    <input
                      type="number"
                      min={-1}
                      max={3650}
                      value={currentVal}
                      onChange={(e) => handleDaysChange(key, parseInt(e.target.value || '0', 10))}
                      placeholder="Days"
                      className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-main font-mono text-center focus:outline-none focus:ring-2 focus:ring-accent-admin/30 focus:border-accent-admin"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-muted flex items-center justify-between">
                  <span>
                    Status:{' '}
                    {isUnlimited ? (
                      <span className="font-semibold text-accent-admin">Unlimited (Never pruned)</span>
                    ) : (
                      <span className="font-semibold text-main">Retain for {currentVal} days</span>
                    )}
                  </span>
                  <span className="text-[10px] text-muted/80">Default: {defaultDays}d</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Clock className="w-3.5 h-3.5 text-muted" />
            <span>
              Last executed:{' '}
              {activeLastRunAt ? (
                <span className="font-semibold text-main">
                  {new Date(activeLastRunAt).toLocaleString()}
                </span>
              ) : (
                <span className="italic">Never run yet</span>
              )}
            </span>
          </div>

          <button
            type="submit"
            disabled={isSaving || isRunning}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-accent-admin hover:bg-accent-admin-hover text-accent-admin-contrast transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Policies...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save Retention Policies</span>
              </>
            )}
          </button>
        </div>

        {/* Save Result Notification */}
        {saveStatus && (
          <div
            className={`flex items-start gap-2 p-3 rounded-xl text-xs ${
              saveStatus.success
                ? 'bg-success-soft border border-success-border text-success-text'
                : 'bg-danger-soft border border-danger-border text-danger-text'
            }`}
          >
            {saveStatus.success ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>
              {saveStatus.success
                ? 'Data retention policies saved successfully. Automatic background maintenance will adhere to these windows.'
                : saveStatus.error}
            </span>
          </div>
        )}

        {/* Cleanup Run Result Notification */}
        {cleanupStatus && (
          <div
            className={`flex items-start gap-2 p-3.5 rounded-xl text-xs ${
              cleanupStatus.success
                ? 'bg-success-soft border border-success-border text-success-text'
                : 'bg-danger-soft border border-danger-border text-danger-text'
            }`}
          >
            {cleanupStatus.success ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div className="space-y-1">
              <p className="font-semibold">
                {cleanupStatus.success
                  ? 'Retention cleanup finished successfully!'
                  : 'Retention cleanup failed'}
              </p>
              {cleanupStatus.success && (
                <p>
                  Pruned{' '}
                  <span className="font-bold">
                    {cleanupStatus.summary?.total_rows_deleted ?? 0}
                  </span>{' '}
                  database telemetry rows and{' '}
                  <span className="font-bold">
                    {cleanupStatus.filesDeleted ?? 0}
                  </span>{' '}
                  expired storage receipt files (freed approx.{' '}
                  <span className="font-bold text-success-text">
                    {formatBytes(cleanupStatus.summary?.total_bytes_freed ?? cleanupStatus.summary?.db_bytes_freed)}
                  </span>
                  ).
                </p>
              )}
              {cleanupStatus.error && <p>{cleanupStatus.error}</p>}
            </div>
          </div>
        )}
      </form>

      {/* Last Cleanup Summary Details */}
      {activeSummary && (
        <div className="p-4 rounded-xl border border-border bg-surface-muted/40 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-main flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-accent-admin" />
              Latest Retention Cleanup Report
            </h3>
            <span className="text-[10px] text-muted">
              {activeSummary.cleaned_at
                ? new Date(activeSummary.cleaned_at).toLocaleString()
                : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-surface border border-border text-center">
              <span className="block text-[10px] text-muted uppercase tracking-wider">
                Total Rows Pruned
              </span>
              <span className="text-base font-bold text-main font-mono">
                {activeSummary.total_rows_deleted ?? 0}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-accent-admin-border bg-accent-admin-soft/40 text-center">
              <span className="block text-[10px] text-accent-admin font-bold uppercase tracking-wider">
                Storage Freed
              </span>
              <span className="text-base font-bold text-accent-admin font-mono">
                {formatBytes(activeSummary.total_bytes_freed ?? activeSummary.db_bytes_freed)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-border text-center">
              <span className="block text-[10px] text-muted uppercase tracking-wider">
                Audit Logs
              </span>
              <span className="text-base font-bold text-main font-mono">
                {activeSummary.audit_logs_deleted ?? 0}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-border text-center">
              <span className="block text-[10px] text-muted uppercase tracking-wider">
                Outbox & Alerts
              </span>
              <span className="text-base font-bold text-main font-mono">
                {(activeSummary.email_outbox_deleted ?? 0) +
                  (activeSummary.notifications_deleted ?? 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface border border-border text-center col-span-2 sm:col-span-1">
              <span className="block text-[10px] text-muted uppercase tracking-wider">
                Read Telemetry
              </span>
              <span className="text-base font-bold text-main font-mono">
                {activeSummary.chapter_reads_deleted ?? 0}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

