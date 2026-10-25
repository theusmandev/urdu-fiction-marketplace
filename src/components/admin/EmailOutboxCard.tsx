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
    <div className="bg-surface border border-border shadow-card rounded-2xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-admin-light border border-accent-admin-border text-accent-admin">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-navy">Automated Email Notifications</h2>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  hasFailures
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {hasFailures ? 'Attention Needed' : 'Healthy Outbox'}
              </span>
            </div>
            <p className="text-xs text-secondary">
              Email notifications and platform delivery status.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRetry}
          disabled={isPending || stats.failed_count === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-main bg-surface hover:bg-ivory border border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-accent-admin" />
          )}
          <span>Retry Failed Emails</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Pending */}
        <div className="bg-ivory/60 p-3.5 rounded-xl border border-border space-y-1">
          <div className="flex items-center justify-between text-secondary text-xs">
            <span>Pending</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-700">
            {stats.pending_count ?? 0}
          </div>
          <span className="text-[10px] text-secondary">In dispatch queue</span>
        </div>

        {/* Sent */}
        <div className="bg-ivory/60 p-3.5 rounded-xl border border-border space-y-1">
          <div className="flex items-center justify-between text-secondary text-xs">
            <span>Dispatched</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-700">
            {stats.sent_count ?? 0}
          </div>
          <span className="text-[10px] text-secondary">Successfully sent</span>
        </div>

        {/* Failed */}
        <div className="bg-ivory/60 p-3.5 rounded-xl border border-border space-y-1">
          <div className="flex items-center justify-between text-secondary text-xs">
            <span>Failed</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-700">
            {stats.failed_count ?? 0}
          </div>
          <span className="text-[10px] text-secondary">Awaiting retry</span>
        </div>

        {/* Skipped */}
        <div className="bg-ivory/60 p-3.5 rounded-xl border border-border space-y-1">
          <div className="flex items-center justify-between text-secondary text-xs">
            <span>Skipped</span>
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="text-xl font-bold font-mono text-sky-700">
            {stats.skipped_count ?? 0}
          </div>
          <span className="text-[10px] text-secondary">User opted out</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-secondary pt-1">
        <span>Automatic delivery runs in the background.</span>
        <span>Emails are securely dispatched to recipients.</span>
      </div>
    </div>
  );
}
