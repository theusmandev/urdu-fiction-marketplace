'use client';

import React, { useState, useTransition } from 'react';
import { updateNotificationPreferencesAction } from '@/app/actions/notifications';
import {
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';

interface NotificationPreferencesClientProps {
  initialEmailEnabled: boolean;
}

export function NotificationPreferencesClient({
  initialEmailEnabled,
}: NotificationPreferencesClientProps) {
  const [isPending, startTransition] = useTransition();
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const handleToggle = (checked: boolean) => {
    setEmailEnabled(checked);
    setFeedback(null);

    startTransition(async () => {
      const res = await updateNotificationPreferencesAction(checked);
      if (!res.success) {
        setEmailEnabled(!checked); // rollback
        setFeedback({ type: 'error', message: res.error || 'Failed to update preferences.' });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Preferences updated.' });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h2 className="text-base font-bold font-serif text-navy flex items-center gap-2">
          <Mail className="w-5 h-5 text-accent" />
          <span>Email &amp; Notification Preferences</span>
        </h2>
        <p className="text-xs text-secondary mt-1">
          Control how and when UNB Premium sends automated email notifications to your verified address.
        </p>
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

      {/* Main Email Toggle Card */}
      <div className="rounded-2xl bg-surface border border-border p-6 space-y-4 shadow-card">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="font-bold text-sm text-navy">General Email Notifications</span>
            <p className="text-xs text-secondary">
              Receive updates regarding new chapter releases, payment reminders, and portal news.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              disabled={isPending}
              onChange={(e) => handleToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
          </label>
        </div>

        {isPending && (
          <div className="flex items-center gap-2 text-xs text-accent pt-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Updating preferences on server...</span>
          </div>
        )}
      </div>

      {/* Critical System Notice Policy */}
      <div className="rounded-2xl bg-surface-muted border border-border p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-navy uppercase tracking-wider">
          <Lock className="w-4 h-4 text-purple-600" />
          <span>Critical Transaction &amp; Security Notices (Always Sent)</span>
        </div>
        <p className="text-xs text-secondary leading-relaxed">
          To ensure platform financial safety, legal compliance, and order delivery, critical operational
          notifications are <strong className="text-navy font-semibold">always dispatched</strong> to your confirmed email even if general emails
          are toggled off:
        </p>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-navy">
          <li className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-border shadow-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Payment Verified / Rejected Notices</span>
          </li>
          <li className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-border shadow-sm">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Dispute Opened &amp; Resolution Decisions</span>
          </li>
          <li className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-border shadow-sm">
            <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Commission Invoice &amp; Overdue Warnings</span>
          </li>
          <li className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-border shadow-sm">
            <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Author &amp; Novel Editorial Approvals</span>
          </li>
        </ul>
      </div>

      {/* Zero Sensitive Data Guarantee */}
      <div className="rounded-2xl bg-surface border border-border p-5 text-xs text-secondary space-y-1.5 leading-relaxed shadow-card">
        <span className="font-bold text-navy block">Strict Non-Sensitive Email Invariant</span>
        <p>
          UNB Premium emails NEVER include banking passwords, IBAN numbers, full bank account digits, or
          payment screenshot receipts. All financial proofs and sensitive data remain strictly encrypted
          inside our portal behind authentication.
        </p>
      </div>
    </div>
  );
}
