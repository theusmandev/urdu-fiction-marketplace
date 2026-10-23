'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { retryFailedEmailsAction } from '@/app/actions/admin-disputes';
import type { EmailOutboxStats } from '@/types/database';
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

interface EmailOutboxCardProps {
  stats: EmailOutboxStats;
}

export function EmailOutboxCard({ stats }: EmailOutboxCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const handleRetry = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await retryFailedEmailsAction();
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Failed to retry emails.' });
      } else {
        setFeedback({
          type: 'success',
          message: res.message || `Reset failed emails to pending.`,
        });
        router.refresh();
      }
    });
  };

  const hasFailures = (stats.failed_count || 0) > 0;

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">Automated Email Outbox Engine</h2>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  hasFailures
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {hasFailures ? 'Attention Needed' : 'Healthy Outbox'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Reliable asynchronous email dispatch engine via transaction outbox table.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRetry}
          disabled={isPending || stats.failed_count === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
          )}
          <span>Retry Failed Emails</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Pending */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Pending</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400">
            {stats.pending_count ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">In dispatch queue</span>
        </div>

        {/* Sent */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Dispatched</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {stats.sent_count ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Successfully sent</span>
        </div>

        {/* Failed */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Failed</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-400">
            {stats.failed_count ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">Awaiting retry</span>
        </div>

        {/* Skipped */}
        <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Skipped</span>
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-bold font-mono text-sky-400">
            {stats.skipped_count ?? 0}
          </div>
          <span className="text-[10px] text-slate-500">User opted out</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 pt-1">
        <span className="flex items-center gap-1.5 font-mono text-slate-500 text-[10px]">
          Runs on automated cron worker (/api/cron/send-emails)
        </span>
        <span className="text-slate-500 text-[10px]">
          Constant-time CRON_SECRET &amp; Nodemailer SMTP Engine
        </span>
      </div>
    </div>
  );
}
