'use client';

import React, { useState } from 'react';
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
    max_novel_price_pkr: number;
    support_email: string;
    updated_at: string;
  };
}

export function PlatformSettingsForm({ initialSettings }: PlatformSettingsFormProps) {
  const router = useRouter();
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
  const [maxPrice, setMaxPrice] = useState(
    initialSettings.max_novel_price_pkr.toString()
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
    const parsedMaxPrice = Number(maxPrice);

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

    if (isNaN(parsedMaxPrice) || parsedMaxPrice <= 0) {
      setError('Max novel price must be greater than zero.');
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
        maxNovelPricePkr: parsedMaxPrice,
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
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs text-rose-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-xs text-emerald-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Invariant Warning Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <span className="font-bold text-amber-300 block">
            Financial Invariant & Scope Notice:
          </span>
          <p className="text-amber-100/90 leading-relaxed">
            Modifications to the platform commission rate or unpaid limits apply strictly to <strong className="text-white">FUTURE sales and verifications</strong>.
            Existing orders and historical rows in the immutable <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">sales_ledger</code> maintain their locked snapshot rates. Every change produces an append-only audit log row.
          </p>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Default Commission Rate */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center gap-2">
              <Percent className="w-4 h-4 text-indigo-400" />
              <span>Default Platform Commission (%)</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">0.00% – 100.00%</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
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
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
              %
            </span>
          </div>
        </div>

        {/* Default Unpaid Commission Limit */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Unpaid Commission Pause Limit (PKR)</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">Default: 5,000 PKR</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Threshold balance of accrued platform commission. When a writer exceeds this, their order acceptance is automatically paused.
          </p>
          <div className="relative">
            <input
              type="number"
              min="0"
              required
              value={unpaidLimit}
              onChange={(e) => setUnpaidLimit(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
              PKR
            </span>
          </div>
        </div>

        {/* Dispute Window Days */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Reader Dispute Window (Days)</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">1 – 365 Days</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
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
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
              Days
            </span>
          </div>
        </div>

        {/* Max Novel Price */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-rose-400" />
              <span>Maximum Novel Price Ceiling (PKR)</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">Platform Cap</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Upper ceiling for novel listing prices enforced during author manuscript creation and editorial review.
          </p>
          <div className="relative">
            <input
              type="number"
              min="1"
              required
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">
              PKR
            </span>
          </div>
        </div>

        {/* Support Email */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-sky-400" />
              <span>Official Platform Support Email</span>
            </label>
            <span className="text-[10px] text-slate-500 font-mono">Public Contact</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Displayed on error dialogs, dispute resolution instructions, and invoice settlement receipts.
          </p>
          <input
            type="email"
            required
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
          />
        </div>
      </div>

      {/* Save Footer Bar */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Last modified: {new Date(initialSettings.updated_at).toLocaleString()}</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-600/20"
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
