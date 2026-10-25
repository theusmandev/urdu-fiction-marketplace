'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { adminUpdatePlatformSettingsAction } from '@/app/actions/admin';
import {
  Sliders,
  Percent,
  DollarSign,
  Clock,
  Mail,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface PlatformSettingsFormProps {
  initialSettings: {
    default_commission_rate: number;
    default_unpaid_commission_limit: number;
    dispute_window_days: number;
    min_novel_price_pkr: number;
    max_novel_price_pkr: number;
    max_orders_per_hour?: number;
    max_chapter_reads_per_window?: number;
    chapter_read_window_minutes?: number;
    invoice_due_days?: number;
    overdue_grace_days?: number;
    min_dispute_wait_hours?: number;
    verification_reminder_hours?: number;
    supportEmail?: string;
    support_email: string;
    updated_at: string;
  };
}

const emptySubscribe = () => () => {};

export function PlatformSettingsForm({ initialSettings }: PlatformSettingsFormProps) {
  const router = useRouter();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [commissionRate, setCommissionRate] = useState(
    initialSettings.default_commission_rate.toString()
  );
  const [unpaidLimit, setUnpaidLimit] = useState(
    initialSettings.default_unpaid_commission_limit.toString()
  );
  const [disputeDays, setDisputeDays] = useState(
    initialSettings.dispute_window_days.toString()
  );
  const [minPrice, setMinPrice] = useState(
    (initialSettings.min_novel_price_pkr ?? 50).toString()
  );
  const [maxPrice, setMaxPrice] = useState(
    initialSettings.max_novel_price_pkr.toString()
  );
  const [maxOrdersPerHour, setMaxOrdersPerHour] = useState(
    (initialSettings.max_orders_per_hour ?? 5).toString()
  );
  const [maxChapterReads, setMaxChapterReads] = useState(
    (initialSettings.max_chapter_reads_per_window ?? 20).toString()
  );
  const [chapterReadWindow, setChapterReadWindow] = useState(
    (initialSettings.chapter_read_window_minutes ?? 10).toString()
  );
  const [invoiceDueDays, setInvoiceDueDays] = useState(
    (initialSettings.invoice_due_days ?? 7).toString()
  );
  const [overdueGraceDays, setOverdueGraceDays] = useState(
    (initialSettings.overdue_grace_days ?? 3).toString()
  );
  const [minDisputeWaitHours, setMinDisputeWaitHours] = useState(
    (initialSettings.min_dispute_wait_hours ?? 24).toString()
  );
  const [verificationReminderHours, setVerificationReminderHours] = useState(
    (initialSettings.verification_reminder_hours ?? 12).toString()
  );
  const [supportEmail, setSupportEmail] = useState(initialSettings.support_email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const parsedRate = Number(commissionRate);
    const parsedLimit = Number(unpaidLimit);
    const parsedDispute = Number(disputeDays);
    const parsedMinPrice = Number(minPrice);
    const parsedMaxPrice = Number(maxPrice);
    const parsedOrdersPerHour = Number(maxOrdersPerHour);
    const parsedChapterReads = Number(maxChapterReads);
    const parsedWindowMinutes = Number(chapterReadWindow);

    if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      setError('Default commission rate must be between 0% and 100%.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      setError('Unpaid commission limit cannot be negative.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedDispute) || parsedDispute < 1 || parsedDispute > 365) {
      setError('Dispute window must be between 1 and 365 days.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedMinPrice) || parsedMinPrice < 1 || !Number.isInteger(parsedMinPrice)) {
      setError('Minimum novel price must be a whole rupee amount of at least 1 PKR.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedMaxPrice) || parsedMaxPrice <= 0 || !Number.isInteger(parsedMaxPrice)) {
      setError('Max novel price must be a whole rupee amount greater than zero.');
      setLoading(false);
      return;
    }

    if (parsedMinPrice > parsedMaxPrice) {
      setError('Minimum novel price cannot exceed maximum novel price ceiling.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedOrdersPerHour) || parsedOrdersPerHour < 1 || parsedOrdersPerHour > 100) {
      setError('Max orders per hour must be a whole number between 1 and 100.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedChapterReads) || parsedChapterReads < 1 || parsedChapterReads > 1000) {
      setError('Max chapter reads per window must be between 1 and 1000.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedWindowMinutes) || parsedWindowMinutes < 1 || parsedWindowMinutes > 1440) {
      setError('Chapter read window minutes must be between 1 and 1440.');
      setLoading(false);
      return;
    }

    const parsedInvoiceDueDays = Number(invoiceDueDays);
    const parsedOverdueGraceDays = Number(overdueGraceDays);
    const parsedMinDisputeWaitHours = Number(minDisputeWaitHours);
    const parsedVerificationReminderHours = Number(verificationReminderHours);

    if (isNaN(parsedInvoiceDueDays) || parsedInvoiceDueDays < 1 || parsedInvoiceDueDays > 90) {
      setError('Invoice due days must be a whole number between 1 and 90 days.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedOverdueGraceDays) || parsedOverdueGraceDays < 0 || parsedOverdueGraceDays > 60) {
      setError('Overdue grace days must be a whole number between 0 and 60 days.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedMinDisputeWaitHours) || parsedMinDisputeWaitHours < 0 || parsedMinDisputeWaitHours > 168) {
      setError('Min dispute wait hours must be a whole number between 0 and 168 hours.');
      setLoading(false);
      return;
    }

    if (isNaN(parsedVerificationReminderHours) || parsedVerificationReminderHours < 1 || parsedVerificationReminderHours > 168) {
      setError('Verification reminder hours must be a whole number between 1 and 168 hours.');
      setLoading(false);
      return;
    }

    if (!supportEmail || !supportEmail.includes('@')) {
      setError('Please provide a valid support email address.');
      setLoading(false);
      return;
    }

    try {
      const res = await adminUpdatePlatformSettingsAction({
        defaultCommissionRate: parsedRate,
        defaultUnpaidCommissionLimit: parsedLimit,
        disputeWindowDays: parsedDispute,
        minNovelPricePkr: parsedMinPrice,
        maxNovelPricePkr: parsedMaxPrice,
        maxOrdersPerHour: parsedOrdersPerHour,
        maxChapterReadsPerWindow: parsedChapterReads,
        chapterReadWindowMinutes: parsedWindowMinutes,
        invoiceDueDays: parsedInvoiceDueDays,
        overdueGraceDays: parsedOverdueGraceDays,
        minDisputeWaitHours: parsedMinDisputeWaitHours,
        verificationReminderHours: parsedVerificationReminderHours,
        supportEmail: supportEmail.trim(),
      });

      if (!res.success) {
        setError(res.error || 'Failed to update settings');
      } else {
        setSuccessMsg('Platform settings successfully saved to the database!');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Alert Notices */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs text-rose-600 hover:text-rose-800"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-xs text-emerald-600 hover:text-emerald-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Invariant Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <span className="font-bold text-amber-900 block">
            Financial Scope Notice:
          </span>
          <p className="text-amber-800 leading-relaxed">
            Modifications to the platform commission rate or unpaid limits apply strictly to <strong className="text-main">future sales and verifications</strong>.
            Existing orders and historical entries in the <code className="bg-amber-100/80 px-1 py-0.5 rounded text-amber-900 font-mono">sales_ledger</code> maintain their locked snapshot rates. Every change produces an audit log entry.
          </p>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Default Commission Rate */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Percent className="w-4 h-4 text-accent-admin" />
              <span>Default Platform Commission (%)</span>
            </label>
            <span className="text-[10px] text-muted font-mono">0.00% – 100.00%</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Standard percentage deducted on direct reader-to-writer verified novel orders. (Unless overridden per author).
          </p>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              required
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
              %
            </span>
          </div>
        </div>

        {/* Default Unpaid Commission Limit */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Unpaid Commission Pause Limit (PKR)</span>
            </label>
            <span className="text-[10px] text-muted font-mono">Default: 5,000 PKR</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Threshold balance of accrued platform commission. When a writer exceeds this, their order acceptance is automatically paused.
          </p>
          <div className="relative">
            <input
              type="number"
              min="0"
              required
              value={unpaidLimit}
              onChange={(e) => setUnpaidLimit(e.target.value)}
              className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
              PKR
            </span>
          </div>
        </div>

        {/* Dispute Window Days */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Reader Dispute Window (Days)</span>
            </label>
            <span className="text-[10px] text-muted font-mono">1 – 365 Days</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Timeframe during which a reader can file a payment dispute after an order submission or writer rejection.
          </p>
          <div className="relative">
            <input
              type="number"
              min="1"
              max="365"
              required
              value={disputeDays}
              onChange={(e) => setDisputeDays(e.target.value)}
              className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
              Days
            </span>
          </div>
        </div>

        {/* Min Novel Price */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Minimum Novel Price Floor (PKR)</span>
            </label>
            <span className="text-[10px] text-muted font-mono">Default: 50 PKR</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Minimum purchase price for novels on the marketplace (no free novels allowed). Whole rupees only.
          </p>
          <div className="relative">
            <input
              type="number"
              min="1"
              step="1"
              required
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
              PKR
            </span>
          </div>
        </div>

        {/* Max Novel Price */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-rose-600" />
              <span>Maximum Novel Price Ceiling (PKR)</span>
            </label>
            <span className="text-[10px] text-muted font-mono">Platform Cap</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Upper ceiling for novel listing prices enforced during author manuscript creation and editorial review.
          </p>
          <div className="relative">
            <input
              type="number"
              min="1"
              required
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
              PKR
            </span>
          </div>
        </div>

        {/* Max Orders Per Hour */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Max Reader Orders / Hour</span>
            </label>
            <span className="text-[10px] text-muted font-mono">1 - 100</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Limits how many new orders a single reader can generate per hour to protect writer payment account details from automated scraping.
          </p>
          <input
            type="number"
            min="1"
            max="100"
            required
            value={maxOrdersPerHour}
            onChange={(e) => setMaxOrdersPerHour(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
          />
        </div>

        {/* Max Chapter Reads Per Window */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-admin" />
              <span>Max Chapter Reads / Window</span>
            </label>
            <span className="text-[10px] text-muted font-mono">1 - 1000</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Maximum number of distinct chapters an entitled buyer can open within the sliding window before temporary rate limiting triggers.
          </p>
          <input
            type="number"
            min="1"
            max="1000"
            required
            value={maxChapterReads}
            onChange={(e) => setMaxChapterReads(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
          />
        </div>

        {/* Chapter Read Window Minutes */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-admin" />
              <span>Chapter Read Window (Minutes)</span>
            </label>
            <span className="text-[10px] text-muted font-mono">1 - 1440 min</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Duration of the sliding window for tracking reading request frequency and deterring bulk manuscript scrapers.
          </p>
          <input
            type="number"
            min="1"
            max="1440"
            required
            value={chapterReadWindow}
            onChange={(e) => setChapterReadWindow(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
          />
        </div>

        {/* Invoice Due Days */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Invoice Due Days</span>
            </label>
            <span className="text-[10px] text-muted font-mono">1 – 90 days (Default: 7)</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Standard number of days from issuance until an author commission invoice becomes due.
          </p>
          <input
            type="number"
            min="1"
            max="90"
            required
            value={invoiceDueDays}
            onChange={(e) => setInvoiceDueDays(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
          />
        </div>

        {/* Overdue Grace Days */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Overdue Grace Days</span>
            </label>
            <span className="text-[10px] text-muted font-mono">0 – 60 days (Default: 3)</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Grace period days permitted past due date before overdue rules allow administrators to pause new orders.
          </p>
          <input
            type="number"
            min="0"
            max="60"
            required
            value={overdueGraceDays}
            onChange={(e) => setOverdueGraceDays(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
          />
        </div>

        {/* Min Dispute Wait Hours */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Min Dispute Wait Hours</span>
            </label>
            <span className="text-[10px] text-muted font-mono">0 – 168 hrs (Default: 24)</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Mandatory cooldown hours readers must wait after submitting payment before opening a formal dispute.
          </p>
          <input
            type="number"
            min="0"
            max="168"
            required
            value={minDisputeWaitHours}
            onChange={(e) => setMinDisputeWaitHours(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
          />
        </div>

        {/* Verification Reminder Hours */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-admin" />
              <span>Verification Reminder Hours</span>
            </label>
            <span className="text-[10px] text-muted font-mono">1 – 168 hrs (Default: 12)</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Hours after payment submission before the first automated reminder is dispatched to the author.
          </p>
          <input
            type="number"
            min="1"
            max="168"
            required
            value={verificationReminderHours}
            onChange={(e) => setVerificationReminderHours(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
          />
        </div>

        {/* Support Email */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 md:col-span-2 shadow-card">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-main flex items-center gap-2">
              <Mail className="w-4 h-4 text-accent-admin" />
              <span>Official Platform Support Email</span>
            </label>
            <span className="text-[10px] text-muted font-mono">Public Contact</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Displayed on error dialogs, dispute resolution instructions, and invoice settlement receipts.
          </p>
          <input
            type="email"
            required
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2.5 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin font-mono transition-colors"
          />
        </div>
      </div>

      {/* Save Footer Bar */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-card">
        <div className="text-xs text-muted font-mono flex items-center gap-1.5" suppressHydrationWarning>
          <HelpCircle className="w-3.5 h-3.5" />
          <span suppressHydrationWarning>
            Last modified:{' '}
            {mounted && initialSettings.updated_at
              ? new Date(initialSettings.updated_at).toLocaleString()
              : initialSettings.updated_at || 'Never'}
          </span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 rounded-xl bg-accent-admin hover:bg-accent-admin-dark text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sliders className="w-4 h-4" />
          )}
          <span>Save Platform Settings</span>
        </button>
      </div>
    </form>
  );
}
