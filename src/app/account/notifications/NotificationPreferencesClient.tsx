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
      <div className="border-b border-stone-800 pb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Mail className="w-5 h-5 text-amber-500" />
          <span>Email &amp; Notification Preferences</span>
        </h2>
        <p className="text-xs text-stone-400 mt-1">
          Control how and when UNB Premium sends automated email notifications to your verified address.
        </p>
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

      {/* Main Email Toggle Card */}
      <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="font-bold text-sm text-white">General Email Notifications</span>
            <p className="text-xs text-stone-400">
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
            <div className="w-11 h-6 bg-stone-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
          </label>
        </div>

        {isPending && (
          <div className="flex items-center gap-2 text-xs text-amber-400 pt-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Updating preferences on server...</span>
          </div>
        )}
      </div>

      {/* Critical System Notice Policy */}
      <div className="rounded-2xl bg-stone-900/60 border border-stone-800 p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-stone-300 uppercase tracking-wider">
          <Lock className="w-4 h-4 text-purple-400" />
          <span>Critical Transaction &amp; Security Notices (Always Sent)</span>
        </div>
        <p className="text-xs text-stone-400 leading-relaxed">
          To ensure platform financial safety, legal compliance, and order delivery, critical operational
          notifications are <strong>always dispatched</strong> to your confirmed email even if general emails
          are toggled off:
        </p>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-stone-300">
          <li className="flex items-center gap-2 bg-stone-950 p-2.5 rounded-xl border border-stone-800">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Payment Verified / Rejected Notices</span>
          </li>
          <li className="flex items-center gap-2 bg-stone-950 p-2.5 rounded-xl border border-stone-800">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Dispute Opened &amp; Resolution Decisions</span>
          </li>
          <li className="flex items-center gap-2 bg-stone-950 p-2.5 rounded-xl border border-stone-800">
            <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Commission Invoice &amp; Overdue Warnings</span>
          </li>
          <li className="flex items-center gap-2 bg-stone-950 p-2.5 rounded-xl border border-stone-800">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Author &amp; Novel Editorial Approvals</span>
          </li>
        </ul>
      </div>

      {/* Zero Sensitive Data Guarantee */}
      <div className="rounded-2xl bg-stone-950 border border-stone-800 p-5 text-xs text-stone-400 space-y-1.5 leading-relaxed">
        <span className="font-bold text-white block">Strict Non-Sensitive Email Invariant</span>
        <p>
          UNB Premium emails NEVER include banking passwords, IBAN numbers, full bank account digits, or
          payment screenshot receipts. All financial proofs and sensitive data remain strictly encrypted
          inside our portal behind authentication.
        </p>
      </div>
    </div>
  );
}
