'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Check,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Home,
  CheckCircle2,
  XCircle,
  Send,
  Loader2,
} from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';
import { ImageUploader } from '@/components/ui/image-uploader';
import { createClient } from '@/lib/supabase/browser';
import { getTipStatusMeta } from '@/lib/tips/state';
import { validateTid } from '@/lib/tips/validation';
import { HOW_TIPS_WORK } from '@/lib/copy/tips';
import type { TipStatus } from '@/types/database';

export interface TipDetailPayload {
  id: string;
  tip_number: string;
  reader_id: string;
  reader_display_name: string;
  writer_id: string;
  writer_pen_name: string;
  writer_pen_name_urdu: string;
  novel_id: string | null;
  novel_title: string | null;
  chapter_id: string | null;
  amount_pkr: number;
  currency: string;
  status: TipStatus;
  payment_instructions_snapshot: {
    method_type: string;
    account_title: string;
    account_number_or_iban: string;
    bank_name: string | null;
    instructions_note: string | null;
  };
  transaction_reference_tid: string | null;
  screenshot_path: string | null;
  sender_account_name: string | null;
  reader_message: string | null;
  message_status: string;
  is_anonymous: boolean;
  writer_reply: string | null;
  confirmed_at: string | null;
  not_received_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TipDetailClientProps {
  initialTip: TipDetailPayload;
  isWaitingOver72Hours?: boolean;
}

export function TipDetailClient({
  initialTip,
  isWaitingOver72Hours = false,
}: TipDetailClientProps) {
  const router = useRouter();
  const [tip, setTip] = useState<TipDetailPayload>(initialTip);

  // Form states for pending payment
  const [tid, setTid] = useState(tip.transaction_reference_tid || '');
  const [senderName, setSenderName] = useState(tip.sender_account_name || '');
  const [screenshotPath, setScreenshotPath] = useState<string | null>(tip.screenshot_path);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copyField, setCopyField] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  const statusMeta = getTipStatusMeta(tip.status);
  const snapshot = tip.payment_instructions_snapshot || {
    method_type: 'bank_transfer',
    account_title: '',
    account_number_or_iban: '',
    bank_name: null,
    instructions_note: null,
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopyField(fieldName);
    setTimeout(() => {
      setCopyField(null);
    }, 2000);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const tidValidation = validateTid(tid);
    if (!tidValidation.valid) {
      setFormError(tidValidation.error || 'Invalid transaction reference (TID).');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('submit_tip_payment', {
        p_tip_id: tip.id,
        p_tid: tid.trim(),
        p_screenshot_path: screenshotPath || null,
        p_sender_name: senderName.trim() || null,
      });

      if (error) {
        console.error('submit_tip_payment error:', error);
        setFormError(error.message || 'Failed to submit payment details.');
        setIsSubmitting(false);
        return;
      }

      const updated = data as unknown as TipDetailPayload;
      setTip((prev) => ({
        ...prev,
        status: updated.status || 'payment_submitted',
        transaction_reference_tid: updated.transaction_reference_tid || tid.trim(),
        screenshot_path: updated.screenshot_path || screenshotPath,
        sender_account_name: updated.sender_account_name || senderName.trim(),
      }));
      setIsSubmitting(false);
      router.refresh();
    } catch (err: unknown) {
      console.error('submit_tip_payment exception:', err);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setFormError(msg);
      setIsSubmitting(false);
    }
  };

  const handleCancelTip = async () => {
    if (!window.confirm('Are you sure you want to cancel this tip?')) {
      return;
    }

    setIsCancelling(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('cancel_tip', {
        p_tip_id: tip.id,
      });

      if (error) {
        alert(error.message || 'Unable to cancel tip.');
        setIsCancelling(false);
        return;
      }

      const updated = data as unknown as TipDetailPayload;
      setTip((prev) => ({
        ...prev,
        status: updated.status || 'cancelled',
      }));
      setIsCancelling(false);
      router.refresh();
    } catch (err) {
      console.error('cancel_tip error:', err);
      setIsCancelling(false);
    }
  };

  const handleViewProof = async () => {
    if (!tip.screenshot_path) return;

    setProofLoading(true);
    try {
      const res = await fetch(
        `/api/proofs/signed-url?path=${encodeURIComponent(tip.screenshot_path)}`
      );
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        alert(data.error || 'Failed to load receipt proof.');
      }
    } catch (err) {
      console.error('Proof loading error:', err);
      alert('Unable to load receipt proof.');
    } finally {
      setProofLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-secondary">
        <Link href="/" className="hover:text-navy flex items-center gap-1 transition-colors">
          <Home className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <Link href="/tips" className="hover:text-navy transition-colors">
          My Thanks
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <span className="font-mono text-navy font-semibold">{tip.tip_number}</span>
      </nav>

      {/* Main Status & Header Card */}
      <div className="rounded-3xl border border-warning-border/70 bg-surface p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-secondary">
                {tip.tip_number}
              </span>
              <span
                className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
              >
                {statusMeta.label}
              </span>
            </div>

            <div className="flex items-baseline gap-2 pt-1">
              <h1 className="text-xl sm:text-2xl font-bold font-serif text-main">
                To {tip.writer_pen_name}
              </h1>
              {tip.writer_pen_name_urdu && (
                <UrduText as="span" size="sm" className="text-secondary py-0">
                  {tip.writer_pen_name_urdu}
                </UrduText>
              )}
            </div>

            {tip.novel_title && (
              <p className="text-xs text-secondary">
                Story: <span className="font-medium text-main">{tip.novel_title}</span>
              </p>
            )}
          </div>

          <div className="sm:text-right">
            <div className="text-2xl sm:text-3xl font-bold text-warning-text">
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

        {/* Reader message if attached */}
        {tip.reader_message && (
          <div className="p-4 rounded-xl bg-surface-elevated border border-border/60 space-y-1">
            <span className="text-[11px] font-medium text-secondary">
              Your message to the author {tip.is_anonymous ? '(sent anonymously)' : ''}:
            </span>
            <p className="text-xs text-main italic whitespace-pre-wrap leading-relaxed">
              &ldquo;{tip.reader_message}&rdquo;
            </p>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* CASE 1: PENDING PAYMENT (Instructions & Submit TID)                */}
        {/* ------------------------------------------------------------------ */}
        {tip.status === 'pending_payment' && (
          <div className="space-y-6 pt-2">
            {/* Step 2: Payment Instructions Snapshot */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-main">
                  Step 2: Pay to author&apos;s account
                </h2>
                <span className="text-xs text-warning-text dark:text-accent-strong capitalize font-medium">
                  {snapshot.method_type.replace('_', ' ')}
                </span>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-warning-soft/50 border border-warning-border/60 space-y-3.5">
                {/* Bank / Provider Name */}
                {snapshot.bank_name && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-secondary">Bank / Service:</span>
                    <span className="font-semibold text-main">{snapshot.bank_name}</span>
                  </div>
                )}

                {/* Account Title */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary">Account Title:</span>
                  <div className="flex items-center gap-1.5 font-semibold text-main">
                    <span>{snapshot.account_title}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(snapshot.account_title, 'title')}
                      className="p-1 rounded text-secondary hover:text-main"
                      title="Copy account title"
                    >
                      {copyField === 'title' ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Account Number / IBAN */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary">Account Number / IBAN:</span>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-main">
                    <span>{snapshot.account_number_or_iban}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(snapshot.account_number_or_iban, 'iban')}
                      className="p-1 rounded text-secondary hover:text-main"
                      title="Copy account number"
                    >
                      {copyField === 'iban' ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Exact Amount */}
                <div className="flex items-center justify-between text-xs border-t border-warning-border/40 pt-3">
                  <span className="text-secondary font-medium">Exact Amount:</span>
                  <div className="flex items-center gap-1.5 font-bold text-warning-text text-sm">
                    <span>PKR {Number(tip.amount_pkr).toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(tip.amount_pkr.toString(), 'amount')}
                      className="p-1 rounded text-secondary hover:text-main"
                      title="Copy amount"
                    >
                      {copyField === 'amount' ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Custom writer note if any */}
                {snapshot.instructions_note && (
                  <p className="text-[11px] text-secondary italic border-t border-warning-border/40 pt-2">
                    Note from author: {snapshot.instructions_note}
                  </p>
                )}
              </div>

              {/* Warning to pay only the exact amount and account */}
              <div className="p-3 rounded-xl bg-warning-soft/50 text-xs text-warning-text flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-warning-text dark:text-accent-strong shrink-0 mt-0.5" />
                <p>
                  Please send the <strong>exact amount</strong> to the account details above via your mobile banking app or wallet. The entire amount goes directly to the author.
                </p>
              </div>
            </div>

            {/* Step 3: Submission Form */}
            <form onSubmit={handleSubmitPayment} className="space-y-4 pt-2">
              <h2 className="text-sm font-semibold text-main">
                Step 3: Submit transaction details
              </h2>

              {/* TID Input */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Transaction Reference (TID) *
                </label>
                <input
                  type="text"
                  value={tid}
                  onChange={(e) => setTid(e.target.value.toUpperCase())}
                  placeholder="e.g. 123456789012"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/80 bg-surface text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-ring/30"
                  required
                />
                <p className="text-[11px] text-secondary mt-1">
                  6-40 alphanumeric characters found on your payment confirmation SMS or receipt.
                </p>
              </div>

              {/* Sender Name */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Sender Account Name (Optional)
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Muhammad Usman"
                  maxLength={100}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/80 bg-surface text-sm focus:outline-hidden focus:ring-2 focus:ring-ring/30"
                />
                <p className="text-[11px] text-secondary mt-1">
                  Helps the author match the deposit in their bank statement.
                </p>
              </div>

              {/* Screenshot Upload */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Payment Screenshot (Optional)
                </label>
                <ImageUploader
                  bucket="payment-proofs"
                  preset="payment-screenshot"
                  folder={tip.id}
                  value={screenshotPath}
                  onChange={(val) => setScreenshotPath(val)}
                  label="Upload receipt screenshot"
                  helperText="Supports WebP, JPEG, PNG up to 2MB"
                />
              </div>

              {/* Form Error */}
              {formError && (
                <div className="p-3 rounded-xl bg-danger-soft border border-danger-border text-xs text-danger-text flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto flex-1 py-3 px-6 rounded-xl bg-primary hover:bg-primary-hover dark:bg-warning text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 min-h-[48px] shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>I Have Paid — Submit TID</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCancelTip}
                  disabled={isCancelling}
                  className="w-full sm:w-auto px-4 py-3 rounded-xl border border-border hover:bg-surface-elevated text-secondary hover:text-main text-xs font-semibold transition-colors min-h-[48px] cursor-pointer"
                >
                  {isCancelling ? 'Cancelling...' : 'Cancel Tip'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* CASE 2: PAYMENT SUBMITTED (Calm Waiting Screen)                    */}
        {/* ------------------------------------------------------------------ */}
        {tip.status === 'payment_submitted' && (
          <div className="p-6 rounded-2xl bg-info-soft/60 border border-info-border/60 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-info-soft text-info-text shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-info-text">
                  Sent — Waiting for author to confirm
                </h2>
                <UrduText as="p" size="xs" className="text-info-text/80 py-0">
                  شکریہ بھیج دیا گیا — مصنف کی تصدیق کا انتظار ہے
                </UrduText>
                <p className="text-xs text-secondary leading-relaxed pt-1">
                  Your appreciation and payment details have been forwarded to the author. Once they verify the deposit in their account, you will receive their thank-you message here.
                </p>
              </div>
            </div>

            {/* TID Review info */}
            <div className="pt-2 border-t border-info-border/40 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <span className="text-secondary">Submitted TID:</span>
                <div className="font-mono font-bold text-main">
                  {tip.transaction_reference_tid}
                </div>
              </div>

              {tip.screenshot_path && (
                <button
                  type="button"
                  onClick={handleViewProof}
                  disabled={proofLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-info-border bg-surface text-info-text hover:bg-info-soft text-xs font-medium transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{proofLoading ? 'Loading...' : 'View Receipt'}</span>
                </button>
              )}
            </div>

            {/* Support link if waiting > 72h */}
            {isWaitingOver72Hours && (
              <div className="p-3 rounded-xl bg-warning-soft border border-warning-border text-xs text-warning-text flex items-center justify-between gap-3">
                <span>Waiting longer than 72 hours for confirmation?</span>
                <Link
                  href={`/support?subject=${encodeURIComponent(`Tip ${tip.tip_number} confirmation enquiry`)}`}
                  className="px-3 py-1.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition-colors shrink-0 text-xs"
                >
                  Contact Support
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* CASE 3: CONFIRMED (Author Thank You Card)                         */}
        {/* ------------------------------------------------------------------ */}
        {tip.status === 'confirmed' && (
          <div className="p-6 sm:p-7 rounded-2xl bg-warning-soft/70 border border-warning-border/70 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-success-soft text-success-text shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-main">
                  Payment confirmed by author
                </h2>
                <p className="text-[11px] text-secondary">
                  Confirmed on{' '}
                  {tip.confirmed_at
                    ? new Date(tip.confirmed_at).toLocaleDateString('en-PK', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Recently'}
                </p>
              </div>
            </div>

            {/* Warm Thank You Message Box */}
            <div className="p-4 sm:p-5 rounded-xl bg-surface border border-warning-border/60 space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-warning-text font-semibold text-xs">
                <Sparkles className="w-4 h-4" />
                <span>Message from {tip.writer_pen_name}:</span>
              </div>
              <UrduText as="p" size="base" className="text-main leading-relaxed py-0">
                {tip.writer_reply || 'شکریہ! آپ کی پزیرائی کا بہت شکریہ۔'}
              </UrduText>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* CASE 4: NOT RECEIVED                                              */}
        {/* ------------------------------------------------------------------ */}
        {tip.status === 'not_received' && (
          <div className="p-6 rounded-2xl bg-danger-soft/60 border border-danger-border/60 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-danger-soft text-danger-text shrink-0">
                <XCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-danger-text">
                  Author could not locate this payment
                </h2>
                <UrduText as="p" size="xs" className="text-danger-text/80 py-0">
                  مصنف کو یہ ادائیگی موصول نہیں ہوئی
                </UrduText>
                <p className="text-xs text-secondary leading-relaxed pt-1">
                  The author checked their account statement and reported that they did not receive the deposit matching TID {tip.transaction_reference_tid}. If you believe this is an error, please reach out to UNB Premium support.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href={`/support?subject=${encodeURIComponent(`Tip ${tip.tip_number} not received enquiry`)}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-main text-surface text-xs font-semibold hover:bg-main/90 transition-colors"
              >
                <span>Contact Support</span>
              </Link>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* CASE 5: CANCELLED OR EXPIRED                                       */}
        {/* ------------------------------------------------------------------ */}
        {(tip.status === 'cancelled' || tip.status === 'expired') && (
          <div className="p-5 rounded-2xl bg-surface-elevated border border-border text-xs text-secondary space-y-1">
            <p className="font-semibold text-main">
              This tip is {tip.status === 'cancelled' ? 'cancelled' : 'expired'}.
            </p>
            <p>
              No payment was processed. If you wish to say thanks to this author, you can initiate a new appreciation gift from their novel or profile.
            </p>
          </div>
        )}

        {/* Honest Disclosure Reminder */}
        <div className="p-4 rounded-xl bg-warning-soft/50 border border-warning-border/40 flex items-start gap-2.5 text-xs">
          <Sparkles className="w-4 h-4 text-warning-text dark:text-accent-strong shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-warning-text font-medium">
              {HOW_TIPS_WORK.honestLine}
            </p>
            <UrduText as="p" size="xs" className="text-[11px] text-warning-text/80 py-0">
              {HOW_TIPS_WORK.honestLineUrdu}
            </UrduText>
          </div>
        </div>
      </div>
    </div>
  );
}
