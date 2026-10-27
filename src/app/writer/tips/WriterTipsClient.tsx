'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Heart,
  Settings,
  ListFilter,
  CheckCircle2,
  XCircle,
  Sparkles,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Save,
  Loader2,
  EyeOff,
  X,
} from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';
import { createClient } from '@/lib/supabase/browser';
import { validatePresetAmounts } from '@/lib/tips/validation';
import { getTipStatusMeta } from '@/lib/tips/state';
import { WRITER_STUDIO_COPY, PRESET_LABELS } from '@/lib/copy/tips';
import type {
  WriterTipSettingsRow,
  WriterPaymentMethodRow,
  TipStatus,
  TipSummaryPayload,
} from '@/types/database';

export interface WriterReceivedTipItem {
  id: string;
  tip_number: string;
  reader_display_name: string;
  is_anonymous: boolean;
  novel_id: string | null;
  novel_title: string | null;
  amount_pkr: number;
  currency: string;
  status: TipStatus;
  transaction_reference_tid: string | null;
  is_duplicate_tid_flagged: boolean;
  screenshot_path: string | null;
  sender_account_name: string | null;
  reader_message: string | null;
  message_status: string;
  writer_reply: string | null;
  confirmed_at: string | null;
  not_received_at: string | null;
  created_at: string;
}

interface WriterTipsClientProps {
  initialSettings: WriterTipSettingsRow;
  initialPaymentMethods: WriterPaymentMethodRow[];
  initialTips: WriterReceivedTipItem[];
  initialSummary: TipSummaryPayload;
  writerPenName: string;
}

type MainTab = 'queue' | 'settings' | 'summary';
type QueueFilter = 'all' | 'payment_submitted' | 'confirmed' | 'not_received';

export function WriterTipsClient({
  initialSettings,
  initialPaymentMethods,
  initialTips,
  initialSummary,
  writerPenName,
}: WriterTipsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MainTab>('queue');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('payment_submitted');

  // Tips state
  const [tips, setTips] = useState<WriterReceivedTipItem[]>(initialTips);
  const [summary, setSummary] = useState<TipSummaryPayload>(initialSummary);
  const [paymentMethods, setPaymentMethods] = useState<WriterPaymentMethodRow[]>(initialPaymentMethods);

  // Settings form state
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [thankYouMessage, setThankYouMessage] = useState(initialSettings.thank_you_message);
  const [presetAmounts, setPresetAmounts] = useState<number[]>(initialSettings.preset_amounts || [100, 250, 500]);
  const [minAmount, setMinAmount] = useState<string>(initialSettings.min_amount?.toString() || '');
  const [maxAmount, setMaxAmount] = useState<string>(initialSettings.max_amount?.toString() || '');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showReaderStepsModal, setShowReaderStepsModal] = useState(false);

  // Modal states for tip confirmation / rejection
  const [confirmingTip, setConfirmingTip] = useState<WriterReceivedTipItem | null>(null);
  const [confirmReplyText, setConfirmReplyText] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const [rejectingTip, setRejectingTip] = useState<WriterReceivedTipItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Copy helper
  const [copiedTid, setCopiedTid] = useState<string | null>(null);
  const [proofLoadingId, setProofLoadingId] = useState<string | null>(null);

  const handleCopyTid = (tid: string, tipId: string) => {
    navigator.clipboard.writeText(tid);
    setCopiedTid(tipId);
    setTimeout(() => setCopiedTid(null), 2000);
  };

  const handleViewProof = async (tipId: string, path: string) => {
    setProofLoadingId(tipId);
    try {
      const res = await fetch(`/api/proofs/signed-url?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        alert(data.error || 'Failed to load receipt.');
      }
    } catch (err) {
      console.error('Proof loading error:', err);
      alert('Unable to load receipt.');
    } finally {
      setProofLoadingId(null);
    }
  };

  // Action: Confirm Tip Received
  const handleOpenConfirm = (tip: WriterReceivedTipItem) => {
    setConfirmingTip(tip);
    setConfirmReplyText(thankYouMessage || 'شکریہ! آپ کی پزیرائی کا بہت شکریہ۔');
  };

  const handleSubmitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingTip) return;

    setIsConfirming(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('confirm_tip_received', {
        p_tip_id: confirmingTip.id,
        p_reply: confirmReplyText.trim() || null,
      });

      if (error) {
        alert(error.message || 'Failed to confirm tip.');
        setIsConfirming(false);
        return;
      }

      setTips((prev) =>
        prev.map((t) =>
          t.id === confirmingTip.id
            ? {
                ...t,
                status: 'confirmed',
                writer_reply: confirmReplyText.trim(),
                confirmed_at: new Date().toISOString(),
              }
            : t
        )
      );

      setSummary((prev) => ({
        ...prev,
        confirmed_tips_count: prev.confirmed_tips_count + 1,
        confirmed_total_pkr: prev.confirmed_total_pkr + Number(confirmingTip.amount_pkr),
        pending_confirmation_count: Math.max(0, prev.pending_confirmation_count - 1),
      }));

      setConfirmingTip(null);
      setIsConfirming(false);
      router.refresh();
    } catch (err) {
      console.error('confirm_tip_received error:', err);
      setIsConfirming(false);
    }
  };

  // Action: Mark Tip Not Received
  const handleOpenReject = (tip: WriterReceivedTipItem) => {
    setRejectingTip(tip);
    setRejectReason('');
  };

  const handleSubmitReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingTip) return;

    setIsRejecting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('mark_tip_not_received', {
        p_tip_id: rejectingTip.id,
        p_note: rejectReason.trim() || null,
      });

      if (error) {
        alert(error.message || 'Failed to mark tip as not received.');
        setIsRejecting(false);
        return;
      }

      setTips((prev) =>
        prev.map((t) =>
          t.id === rejectingTip.id
            ? {
                ...t,
                status: 'not_received',
                not_received_at: new Date().toISOString(),
              }
            : t
        )
      );

      setSummary((prev) => ({
        ...prev,
        pending_confirmation_count: Math.max(0, prev.pending_confirmation_count - 1),
      }));

      setRejectingTip(null);
      setIsRejecting(false);
      router.refresh();
    } catch (err) {
      console.error('mark_tip_not_received error:', err);
      setIsRejecting(false);
    }
  };

  // Action: Hide / Report offensive message
  const handleToggleHideMessage = async (tipId: string, currentStatus: string) => {
    const isHidden = currentStatus === 'hidden_by_writer';
    const targetHide = !isHidden;

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('hide_tip_message', {
        p_tip_id: tipId,
        p_hidden: targetHide,
      });

      if (error) {
        alert(error.message || 'Failed to update message status.');
        return;
      }

      setTips((prev) =>
        prev.map((t) =>
          t.id === tipId
            ? {
                ...t,
                message_status: targetHide ? 'hidden_by_writer' : 'visible',
              }
            : t
        )
      );
    } catch (err) {
      console.error('hide_tip_message error:', err);
    }
  };

  // Action: Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsFeedback(null);

    const presetValidation = validatePresetAmounts(presetAmounts, 20, 50000);
    if (!presetValidation.valid) {
      setSettingsFeedback({ type: 'error', text: presetValidation.error || 'Invalid preset amounts.' });
      return;
    }

    const parsedMin = minAmount ? parseInt(minAmount, 10) : null;
    const parsedMax = maxAmount ? parseInt(maxAmount, 10) : null;

    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      setSettingsFeedback({ type: 'error', text: 'Minimum amount cannot exceed maximum amount.' });
      return;
    }

    setIsSavingSettings(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('set_my_tip_settings', {
        p_enabled: enabled,
        p_thank_you_message: thankYouMessage.trim(),
        p_preset_amounts: presetAmounts,
        p_min_amount: parsedMin,
        p_max_amount: parsedMax,
      });

      if (error) {
        setSettingsFeedback({ type: 'error', text: error.message || 'Failed to save settings.' });
        setIsSavingSettings(false);
        return;
      }

      setSettingsFeedback({ type: 'success', text: 'Tip settings updated successfully.' });
      setIsSavingSettings(false);
      router.refresh();
    } catch (err: unknown) {
      console.error('set_my_tip_settings error:', err);
      const msg = err instanceof Error ? err.message : 'An error occurred while saving.';
      setSettingsFeedback({ type: 'error', text: msg });
      setIsSavingSettings(false);
    }
  };

  // Toggle account for tips
  const handleToggleAccountForTips = async (methodId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('writer_payment_methods')
        .update({ use_for_tips: newVal })
        .eq('id', methodId);

      if (error) {
        alert(error.message || 'Failed to update payment method.');
        return;
      }

      setPaymentMethods((prev) =>
        prev.map((m) => (m.id === methodId ? { ...m, use_for_tips: newVal } : m))
      );
    } catch (err) {
      console.error('Failed to update method:', err);
    }
  };

  const filteredTips = tips.filter((t) => {
    if (queueFilter === 'all') return true;
    return t.status === queueFilter;
  });

  const pendingCount = summary.pending_confirmation_count || 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Policy Reminder Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-main leading-relaxed space-y-1">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{WRITER_STUDIO_COPY.reminderBannerTitle}</span>
        </div>
        <p className="text-secondary">
          {WRITER_STUDIO_COPY.reminderBannerBody}
        </p>
      </div>

      {/* Header and Tab Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold font-serif text-main">
                {WRITER_STUDIO_COPY.title}
              </h1>
              <UrduText as="span" size="sm" className="text-secondary py-0">
                {WRITER_STUDIO_COPY.titleUrdu}
              </UrduText>
            </div>
            <p className="text-xs text-secondary mt-0.5">
              Direct reader appreciation payments with 0% platform share.
            </p>
          </div>

          {/* Tab buttons */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-surface-elevated border border-border/80 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all min-h-[40px] ${
                activeTab === 'queue'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-secondary hover:text-main'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Queue</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-900 text-white text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all min-h-[40px] ${
                activeTab === 'settings'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-secondary hover:text-main'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all min-h-[40px] ${
                activeTab === 'summary'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-secondary hover:text-main'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Summary</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: QUEUE                                                         */}
      {/* ==================================================================== */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          {/* Sub-filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setQueueFilter('payment_submitted')}
              className={`px-3 py-1.5 rounded-xl border transition-all ${
                queueFilter === 'payment_submitted'
                  ? 'border-amber-500 bg-amber-100/60 dark:bg-amber-900/40 text-amber-950 dark:text-amber-100 font-semibold'
                  : 'border-border/60 bg-surface text-secondary hover:text-main'
              }`}
            >
              Awaiting Confirmation ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setQueueFilter('confirmed')}
              className={`px-3 py-1.5 rounded-xl border transition-all ${
                queueFilter === 'confirmed'
                  ? 'border-amber-500 bg-amber-100/60 dark:bg-amber-900/40 text-amber-950 dark:text-amber-100 font-semibold'
                  : 'border-border/60 bg-surface text-secondary hover:text-main'
              }`}
            >
              Confirmed
            </button>
            <button
              type="button"
              onClick={() => setQueueFilter('not_received')}
              className={`px-3 py-1.5 rounded-xl border transition-all ${
                queueFilter === 'not_received'
                  ? 'border-amber-500 bg-amber-100/60 dark:bg-amber-900/40 text-amber-950 dark:text-amber-100 font-semibold'
                  : 'border-border/60 bg-surface text-secondary hover:text-main'
              }`}
            >
              Not Received
            </button>
            <button
              type="button"
              onClick={() => setQueueFilter('all')}
              className={`px-3 py-1.5 rounded-xl border transition-all ${
                queueFilter === 'all'
                  ? 'border-amber-500 bg-amber-100/60 dark:bg-amber-900/40 text-amber-950 dark:text-amber-100 font-semibold'
                  : 'border-border/60 bg-surface text-secondary hover:text-main'
              }`}
            >
              All Tips ({tips.length})
            </button>
          </div>

          {/* List */}
          {filteredTips.length === 0 ? (
            <div className="p-10 rounded-2xl bg-surface border border-border/80 text-center space-y-2">
              <Heart className="w-8 h-8 text-amber-500/30 mx-auto" />
              <p className="text-sm font-semibold text-main">No tips in this queue</p>
              <p className="text-xs text-secondary">
                {queueFilter === 'payment_submitted'
                  ? 'You have zero pending tip payments awaiting verification.'
                  : 'No tips matching this filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTips.map((tip) => {
                const statusMeta = getTipStatusMeta(tip.status);
                const isPending = tip.status === 'payment_submitted';

                return (
                  <div
                    key={tip.id}
                    className="p-5 sm:p-6 rounded-2xl bg-surface border border-border/80 hover:border-amber-300/80 transition-all shadow-xs space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-main">
                            {tip.tip_number}
                          </span>
                          <span
                            className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                          {tip.is_duplicate_tid_flagged && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              <span>Duplicate TID</span>
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-semibold text-main">
                          From: {tip.reader_display_name}{' '}
                          {tip.is_anonymous && (
                            <span className="text-xs font-normal text-secondary italic">
                              (Anonymous Reader)
                            </span>
                          )}
                          {tip.novel_title && (
                            <span className="text-xs font-normal text-secondary ml-2">
                              • on &ldquo;{tip.novel_title}&rdquo;
                            </span>
                          )}
                        </div>

                        {/* Transaction TID & Sender Info */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-secondary pt-1">
                          {tip.transaction_reference_tid && (
                            <div className="flex items-center gap-1.5">
                              <span>TID:</span>
                              <span className="font-mono font-bold text-main">
                                {tip.transaction_reference_tid}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyTid(tip.transaction_reference_tid!, tip.id)}
                                className="p-1 hover:text-main"
                                title="Copy TID"
                              >
                                {copiedTid === tip.id ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          )}

                          {tip.sender_account_name && (
                            <div>
                              <span>Sender:</span>{' '}
                              <span className="font-medium text-main">
                                {tip.sender_account_name}
                              </span>
                            </div>
                          )}

                          {tip.screenshot_path && (
                            <button
                              type="button"
                              onClick={() => handleViewProof(tip.id, tip.screenshot_path!)}
                              disabled={proofLoadingId === tip.id}
                              className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 hover:underline font-medium"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>{proofLoadingId === tip.id ? 'Loading...' : 'View Receipt'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="sm:text-right">
                        <div className="text-lg sm:text-xl font-bold text-amber-900 dark:text-amber-200">
                          PKR {Number(tip.amount_pkr).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-secondary">
                          {new Date(tip.created_at).toLocaleDateString('en-PK', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Reader Message (if any) */}
                    {tip.reader_message && (
                      <div className="p-3.5 rounded-xl bg-surface-elevated border border-border/60 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-secondary">
                            Reader&apos;s note:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleHideMessage(tip.id, tip.message_status)}
                            className="text-[11px] text-secondary hover:text-main flex items-center gap-1"
                          >
                            <EyeOff className="w-3 h-3" />
                            <span>
                              {tip.message_status === 'hidden_by_writer' ? 'Unhide' : 'Hide note'}
                            </span>
                          </button>
                        </div>
                        <p className="text-main italic whitespace-pre-wrap leading-relaxed">
                          &ldquo;{tip.reader_message}&rdquo;
                        </p>
                      </div>
                    )}

                    {/* Author Reply (if already confirmed) */}
                    {tip.status === 'confirmed' && tip.writer_reply && (
                      <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 text-xs">
                        <span className="font-semibold text-amber-800 dark:text-amber-300">
                          Your sent reply:
                        </span>
                        <UrduText as="p" size="sm" className="text-main mt-0.5 py-0 leading-relaxed">
                          {tip.writer_reply}
                        </UrduText>
                      </div>
                    )}

                    {/* Actions for pending tips */}
                    {isPending && (
                      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-border/40">
                        <button
                          type="button"
                          onClick={() => handleOpenConfirm(tip)}
                          className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 text-white font-medium text-xs transition-colors flex items-center gap-1.5 min-h-[40px] shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>I received it</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenReject(tip)}
                          className="px-4 py-2 rounded-xl border border-border hover:bg-surface-elevated text-secondary hover:text-rose-600 font-medium text-xs transition-colors flex items-center gap-1.5 min-h-[40px] cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Not received</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: SETTINGS & LIVE PREVIEW                                       */}
      {/* ==================================================================== */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left 7 cols: Form Controls */}
            <div className="lg:col-span-7 space-y-6">
              {/* Enable Switch */}
              <div className="p-6 rounded-2xl bg-surface border border-border/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-sm font-semibold text-main">
                        {WRITER_STUDIO_COPY.enableSwitchLabel}
                      </h2>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                          enabled
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                            : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-300 dark:border-stone-700'
                        }`}
                      >
                        {enabled ? 'ON • فعال' : 'OFF • غیر فعال'}
                      </span>
                    </div>
                    <p className="text-xs text-secondary mt-1">
                      {WRITER_STUDIO_COPY.enableSwitchDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => setEnabled(!enabled)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-amber-500/40 ${
                      enabled ? 'bg-amber-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span className="sr-only">Accept reader appreciation tips</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Receiving Accounts Selection */}
              <div className="p-6 rounded-2xl bg-surface border border-border/80 shadow-xs space-y-3">
                <h2 className="text-sm font-semibold text-main">
                  Receiving Payment Accounts
                </h2>
                <p className="text-xs text-secondary">
                  Choose which of your accounts can receive tips from readers.
                </p>

                <div className="space-y-2 pt-2">
                  {paymentMethods.length === 0 ? (
                    <p className="text-xs text-secondary italic">
                      No payment methods found. Add accounts in Writer Settings first.
                    </p>
                  ) : (
                    paymentMethods.map((method) => {
                      const isUsed = method.use_for_tips ?? true;
                      return (
                        <label
                          key={method.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-border/60 hover:bg-surface-elevated cursor-pointer select-none"
                        >
                          <div>
                            <span className="text-xs font-semibold capitalize text-main">
                              {method.bank_name || method.method_type.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-secondary ml-2 font-mono">
                              •••• {method.account_number_or_iban.slice(-4)}
                            </span>
                            <span className="block text-[11px] text-secondary">
                              {method.account_title}
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isUsed}
                            onChange={() => handleToggleAccountForTips(method.id, isUsed)}
                            className="w-4 h-4 rounded border-border text-amber-600 focus:ring-amber-500/30"
                          />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Presets Editor */}
              <div className="p-6 rounded-2xl bg-surface border border-border/80 shadow-xs space-y-3">
                <h2 className="text-sm font-semibold text-main">
                  Appreciation Presets (PKR)
                </h2>
                <p className="text-xs text-secondary">
                  Configure up to 4 suggested amounts for your readers.
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                  {presetAmounts.map((preset, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 text-xs font-semibold"
                    >
                      <span>PKR</span>
                      <input
                        type="number"
                        value={preset}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          const next = [...presetAmounts];
                          next[idx] = isNaN(val) ? 0 : val;
                          setPresetAmounts(next);
                        }}
                        className="w-16 bg-transparent outline-none font-bold"
                      />
                      {presetAmounts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPresetAmounts(presetAmounts.filter((_, i) => i !== idx));
                          }}
                          className="text-secondary hover:text-rose-600 ml-1 font-bold"
                          title="Remove preset"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}

                  {presetAmounts.length < 4 && (
                    <button
                      type="button"
                      onClick={() => setPresetAmounts([...presetAmounts, 1000])}
                      className="px-3 py-1.5 rounded-xl border border-dashed border-border hover:border-amber-500 text-xs text-secondary hover:text-main font-medium"
                    >
                      + Add preset
                    </button>
                  )}
                </div>
              </div>

              {/* Custom Min / Max Bounds */}
              <div className="p-6 rounded-2xl bg-surface border border-border/80 shadow-xs space-y-3">
                <h2 className="text-sm font-semibold text-main">Custom Bounds (PKR)</h2>
                <p className="text-xs text-secondary">
                  Leave blank to use platform defaults (min PKR 20, max PKR 5,000).
                </p>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-secondary mb-1">
                      Minimum Tip (PKR)
                    </label>
                    <input
                      type="number"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      placeholder="20"
                      className="w-full p-2.5 rounded-xl border border-border bg-surface text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-secondary mb-1">
                      Maximum Tip (PKR)
                    </label>
                    <input
                      type="number"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      placeholder="5000"
                      className="w-full p-2.5 rounded-xl border border-border bg-surface text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Thank You Message Editor */}
              <div className="p-6 rounded-2xl bg-surface border border-border/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-main">
                    Thank-You Reply Message
                  </h2>
                  <span className="text-[11px] text-secondary">
                    {thankYouMessage.length} / 500
                  </span>
                </div>
                <p className="text-xs text-secondary">
                  Sent to the reader once you confirm receipt of their appreciation gift. Urdu is fully supported!
                </p>

                <textarea
                  dir="auto"
                  value={thankYouMessage}
                  onChange={(e) => setThankYouMessage(e.target.value.slice(0, 500))}
                  rows={3}
                  className="w-full p-3 rounded-xl border border-border bg-surface text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 resize-none font-urdu leading-[2.2] text-start"
                  placeholder="شکریہ! آپ کی پزیرائی کا بہت شکریہ۔"
                />
              </div>

              {/* Feedback Alert */}
              {settingsFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    settingsFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{settingsFeedback.text}</span>
                </div>
              )}

              {/* Save Button */}
              <button
                type="submit"
                disabled={isSavingSettings}
                className="w-full py-3 px-6 rounded-xl bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 min-h-[48px] shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isSavingSettings ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving settings...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Tip Settings</span>
                  </>
                )}
              </button>
            </div>

            {/* Right 5 cols: Live Reader Preview */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  Live Reader Preview
                </span>
                <button
                  type="button"
                  onClick={() => setShowReaderStepsModal(true)}
                  className="text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>See reader&apos;s steps</span>
                  <span aria-hidden="true">&rarr;</span>
                </button>
              </div>

              {/* Preview card mock */}
              <div
                role="img"
                aria-label="Non-interactive visual preview of reader appreciation card"
                className={`relative rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-[#fdfbf7] dark:bg-[#1a1714] p-5 shadow-xs text-main space-y-4 pointer-events-none select-none overflow-hidden transition-opacity duration-200 ${
                  enabled ? 'opacity-100' : 'opacity-40 grayscale-25'
                }`}
              >
                {/* Preview Ribbon */}
                <div className="absolute top-3 right-3">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full border border-amber-300/80 dark:border-amber-700">
                    PREVIEW • پیش منظر
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Heart className="w-4 h-4 fill-amber-600/30" />
                  </div>
                  <div className="pr-16">
                    <h3 className="font-semibold text-sm">Say thanks to {writerPenName}</h3>
                    <UrduText as="p" size="xs" className="text-secondary py-0">
                      یہ کہانی پسند آئی؟ مصنف کو شکریہ کہیں
                    </UrduText>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {presetAmounts.slice(0, 3).map((amt) => {
                    const meta = PRESET_LABELS[amt as keyof typeof PRESET_LABELS];
                    return (
                      <div
                        key={amt}
                        className="py-2 px-1 text-center rounded-lg border border-border/60 bg-surface/80 text-xs"
                      >
                        <div className="font-medium text-[11px] text-secondary">{meta?.name || 'Tip'}</div>
                        <div className="font-bold text-main">PKR {amt}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-2.5 rounded-lg bg-amber-100/50 dark:bg-amber-950/20 text-[11px] text-secondary">
                  Optional. The whole amount goes directly to the author; UNB Premium takes no share.
                </div>

                <div className="w-full py-2.5 rounded-xl bg-amber-700 text-white font-medium text-xs text-center cursor-default pointer-events-none shadow-none">
                  Continue • آگے بڑھیں
                </div>
              </div>

              {/* Dimmed Notice when tips are off */}
              {!enabled && (
                <div className="p-3 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-center space-y-0.5">
                  <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                    Tips are off — readers do not see this card
                  </p>
                  <UrduText as="p" size="xs" className="text-stone-500 dark:text-stone-400 py-0">
                    ٹپس غیر فعال ہیں — قارئین کو یہ کارڈ نظر نہیں آئے گا
                  </UrduText>
                </div>
              )}
            </div>
          </div>
        </form>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: PRIVATE MONTHLY SUMMARY                                       */}
      {/* ==================================================================== */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-6 rounded-2xl bg-surface border border-border/80 shadow-xs space-y-1">
              <span className="text-xs text-secondary font-medium">Total Received (Gifts)</span>
              <div className="text-2xl sm:text-3xl font-bold text-amber-900 dark:text-amber-200">
                PKR {Number(summary.confirmed_total_pkr || 0).toLocaleString()}
              </div>
              <p className="text-[11px] text-secondary">0% platform commission deducted</p>
            </div>

            <div className="p-6 rounded-2xl bg-surface border border-border/80 shadow-xs space-y-1">
              <span className="text-xs text-secondary font-medium">Confirmed Thanks</span>
              <div className="text-2xl sm:text-3xl font-bold text-main">
                {summary.confirmed_tips_count || 0}
              </div>
              <p className="text-[11px] text-secondary">Total appreciation gifts confirmed</p>
            </div>

            <div className="p-6 rounded-2xl bg-surface border border-border/80 shadow-xs space-y-1">
              <span className="text-xs text-secondary font-medium">Unique Supporters</span>
              <div className="text-2xl sm:text-3xl font-bold text-main">
                {summary.unique_supporters_count || 0}
              </div>
              <p className="text-[11px] text-secondary">Readers who said thanks</p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-surface-elevated border border-border/60 text-xs text-secondary space-y-2">
            <div className="flex items-center gap-2 font-semibold text-main">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Strictly Private to Author</span>
            </div>
            <p className="leading-relaxed">
              UNB Premium never publishes tip totals, leaderboards, or donor lists. Tips exist purely as reader-to-author appreciation and are kept completely private to your studio.
            </p>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CONFIRMATION MODAL                                                   */}
      {/* ==================================================================== */}
      {confirmingTip && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-main">Confirm Receipt</h3>
                <p className="text-xs text-secondary">
                  PKR {Number(confirmingTip.amount_pkr).toLocaleString()} from {confirmingTip.reader_display_name}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitConfirm} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-secondary">
                    Thank-you note to the reader (Urdu or English)
                  </label>
                  <span className="text-[11px] text-secondary">
                    {confirmReplyText.length} / 500
                  </span>
                </div>
                <textarea
                  dir="auto"
                  value={confirmReplyText}
                  onChange={(e) => setConfirmReplyText(e.target.value.slice(0, 500))}
                  rows={3}
                  className="w-full p-3 rounded-xl border border-border bg-surface text-sm focus:outline-hidden font-urdu leading-[2.2] text-start resize-none"
                  placeholder="شکریہ! آپ کی پزیرائی کا بہت شکریہ۔"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmingTip(null)}
                  className="px-4 py-2.5 rounded-xl border border-border text-secondary hover:text-main text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConfirming}
                  className="px-5 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold flex items-center gap-2"
                >
                  {isConfirming ? 'Confirming...' : 'Yes, I Received It'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* NOT RECEIVED MODAL                                                   */}
      {/* ==================================================================== */}
      {rejectingTip && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-main">Mark Payment Not Received</h3>
                <p className="text-xs text-secondary">
                  TID: {rejectingTip.transaction_reference_tid}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitReject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Reason or note for internal records (Optional)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value.slice(0, 300))}
                  rows={2}
                  className="w-full p-3 rounded-xl border border-border bg-surface text-sm focus:outline-hidden resize-none"
                  placeholder="e.g. Deposit does not appear in bank statement"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingTip(null)}
                  className="px-4 py-2.5 rounded-xl border border-border text-secondary hover:text-main text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRejecting}
                  className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold flex items-center gap-2"
                >
                  {isRejecting ? 'Submitting...' : 'Mark Not Received'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* STATIC 3-STEP READER FLOW MODAL (Safe Preview, No Network)           */}
      {/* ==================================================================== */}
      {showReaderStepsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reader-steps-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-3xl bg-surface border border-border p-6 sm:p-7 shadow-2xl space-y-6">
            <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-4">
              <div>
                <h3 id="reader-steps-modal-title" className="font-bold font-serif text-lg text-main">
                  How Readers See &amp; Send Appreciation
                </h3>
                <UrduText as="p" size="xs" className="text-secondary py-0">
                  قاری کے لیے شکریہ بھیجنے کے ۳ مراحل
                </UrduText>
              </div>
              <button
                type="button"
                onClick={() => setShowReaderStepsModal(false)}
                className="p-1 rounded-lg text-secondary hover:text-main min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-secondary">
              {/* Step 1 */}
              <div className="p-4 rounded-2xl bg-surface-elevated border border-border/60 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-main">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs">
                    1
                  </span>
                  <span>Step 1: Reader Selects Amount &amp; Message</span>
                </div>
                <p className="leading-relaxed">
                  The reader picks an appreciation preset (e.g. PKR 250 Mithai) or custom amount, selects your payment channel (JazzCash, EasyPaisa, or Bank), and optionally writes a warm encouragement note.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-2xl bg-surface-elevated border border-border/60 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-main">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs">
                    2
                  </span>
                  <span>Step 2: Direct Transfer &amp; TID Submission</span>
                </div>
                <p className="leading-relaxed">
                  The reader opens their banking app, transfers the exact amount directly to your account number, and submits the Transaction Reference (TID) and screenshot.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-4 rounded-2xl bg-surface-elevated border border-border/60 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-main">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs">
                    3
                  </span>
                  <span>Step 3: You Confirm Receipt &amp; Reply</span>
                </div>
                <p className="leading-relaxed">
                  The tip arrives in your Studio Queue. Once you confirm the deposit in your account statement, your configured thank-you message is delivered directly to the reader.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowReaderStepsModal(false)}
                className="px-5 py-2.5 rounded-xl bg-navy hover:bg-navy-light text-white text-xs font-semibold cursor-pointer"
              >
                Got it • سمجھ گیا
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
