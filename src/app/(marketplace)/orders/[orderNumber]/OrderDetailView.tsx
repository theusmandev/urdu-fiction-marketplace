'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import { formatPKR } from '@/lib/utils';
import { ImageUploader } from '@/components/ui/image-uploader';
import {
  submitPaymentAction,
  cancelOrderAction,
  openDisputeAction,
} from '@/app/actions/checkout';
import {
  formatOrderStatusTimeline,
  type OrderStatusDetails,
} from '@/lib/checkout/schemas';
import { calculateDisputeWaitStatus } from '@/lib/disputes/status-meta';
import type { OrderStatus } from '@/types/database';
import {
  Copy,
  Check,
  CreditCard,
  ShieldAlert,
  AlertCircle,
  Clock,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  BookOpen,
  Eye,
  X,
  HelpCircle,
} from 'lucide-react';

interface OrderDetailViewProps {
  order: {
    id: string;
    orderNumber: string;
    amountPkr: number;
    status: OrderStatus;
    paymentMethod: string;
    instructionsSnapshot: Record<string, unknown> | null;
    rejectedReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  novel: {
    id: string;
    titleEnglish: string;
    titleUrdu: string;
    slug: string;
    coverImageUrl: string | null;
  };
  writer: {
    penNameEnglish: string;
    penNameUrdu: string;
  };
  submissions: Array<{
    id: string;
    transaction_reference_tid: string;
    screenshot_path: string;
    paid_amount_claimed_pkr: number;
    sender_account_name: string | null;
    reader_note: string | null;
    reviewer_status: string;
    reviewer_note: string | null;
    is_duplicate_tid_flagged: boolean;
    created_at: string;
  }>;
  disputes: Array<{
    id: string;
    reason: string;
    status: string;
    resolution: string | null;
    created_at: string;
    resolved_at: string | null;
  }>;
  disputeWindowDays: number;
  minDisputeWaitHours?: number;
  currentTimestamp?: number;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${label || text}`}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300/60 px-2 py-0.5 rounded transition-colors cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-600" />
          <span className="text-emerald-700">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>{label || 'Copy'}</span>
        </>
      )}
    </button>
  );
}

function SignedScreenshotPreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/proofs/signed-url?path=${encodeURIComponent(path)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted) {
          setUrl(data?.url || null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [path]);

  if (loading) {
    return (
      <div className="w-24 h-24 rounded-xl bg-surface-muted border border-border flex items-center justify-center text-secondary text-xs">
        <Loader2 className="w-4 h-4 animate-spin text-accent" />
      </div>
    );
  }

  if (!url) {
    return (
      <div className="w-24 h-24 rounded-xl bg-surface-muted border border-border flex items-center justify-center text-secondary text-[10px] text-center p-2">
        Preview Expired
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="relative group w-24 h-24 rounded-xl overflow-hidden border border-border hover:border-accent transition-all cursor-pointer block bg-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Payment Receipt" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-navy/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold gap-1">
          <Eye className="w-3.5 h-3.5" />
          <span>Zoom</span>
        </div>
      </button>

      {/* Zoom Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-2xl w-full bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="text-xs font-bold text-navy uppercase tracking-wider">
                Payment Proof Receipt
              </h4>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-secondary hover:text-main p-1 rounded-lg hover:bg-surface-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl flex items-center justify-center bg-slate-100 p-2 border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Full Payment Receipt" className="max-h-[70vh] w-auto object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OrderDetailView({
  order,
  novel,
  writer,
  submissions,
  disputes,
  disputeWindowDays,
  minDisputeWaitHours = 24,
  currentTimestamp = 0,
}: OrderDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Payment form states
  const [tid, setTid] = useState('');
  const [senderName, setSenderName] = useState('');
  const [claimedAmount, setClaimedAmount] = useState<number>(order.amountPkr);
  const [readerNote, setReaderNote] = useState('');
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  const timeline: OrderStatusDetails = formatOrderStatusTimeline(order.status);
  const latestSubmission = submissions[0] || null;

  // Snapshot instructions
  const instructions = order.instructionsSnapshot || {};
  const accountTitle = (instructions.account_title as string) || '';
  const accountNumberOrIban = (instructions.account_number_or_iban as string) || '';
  const bankName = (instructions.bank_name as string) || '';
  const instructionsNote = (instructions.instructions_note as string) || '';

  // Dispute cooldown wait check for payment_submitted orders
  const waitStatus = latestSubmission
    ? calculateDisputeWaitStatus(latestSubmission.created_at, minDisputeWaitHours)
    : { canDispute: true, remainingHours: 0, remainingMinutes: 0 };

  // Time check for dispute window (from updated_at or created_at)
  const isInsideDisputeWindow =
    currentTimestamp > 0 &&
    currentTimestamp - new Date(order.updatedAt).getTime() < disputeWindowDays * 24 * 60 * 60 * 1000;

  // Handle Payment Submit
  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!tid.trim()) {
      setFormError('Please enter the transaction reference (TID) from your bank/wallet receipt.');
      return;
    }

    if (!screenshotPath) {
      setFormError('Please upload a screenshot of your payment transfer confirmation.');
      return;
    }

    startTransition(async () => {
      const res = await submitPaymentAction({
        orderId: order.id,
        tid: tid.trim(),
        screenshotPath,
        claimedAmount: Number(claimedAmount) || order.amountPkr,
        senderAccountName: senderName.trim() || undefined,
        readerNote: readerNote.trim() || undefined,
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to submit payment proof.');
        return;
      }

      router.refresh();
    });
  };

  // Handle Cancel Order
  const handleCancelOrder = () => {
    startTransition(async () => {
      const res = await cancelOrderAction({
        orderId: order.id,
        reason: cancelReason.trim() || 'Cancelled by reader',
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to cancel order.');
        return;
      }

      setShowCancelModal(false);
      router.refresh();
    });
  };

  // Handle Open Dispute
  const handleOpenDispute = () => {
    startTransition(async () => {
      const res = await openDisputeAction({
        orderId: order.id,
        reason: disputeReason.trim(),
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to open dispute.');
        return;
      }

      setShowDisputeModal(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Orders</span>
        </Link>
        <div className="text-right">
          <span className="text-[11px] font-mono text-secondary font-bold">
            {order.orderNumber}
          </span>
        </div>
      </div>

      {/* Main Order Card */}
      <div className="rounded-3xl bg-surface border border-border p-6 sm:p-8 space-y-6 shadow-card">
        {/* Header & Status Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${timeline.badgeClass}`}
              >
                {timeline.label}
              </span>
              <UrduText as="span" size="sm" className="text-accent py-0">
                {timeline.urduLabel}
              </UrduText>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-serif text-navy">{timeline.headline}</h1>
            <p className="text-xs text-secondary max-w-2xl">{timeline.explanation}</p>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <span className="text-xs text-secondary block">Total Amount</span>
            <span className="text-2xl font-bold font-mono text-navy">{formatPKR(order.amountPkr)}</span>
          </div>
        </div>

        {/* Novel Card Strip */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-surface-muted border border-border">
          {novel.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={novel.coverImageUrl}
              alt={novel.titleEnglish}
              className="w-14 h-20 object-cover rounded-xl border border-border shrink-0"
            />
          ) : (
            <div className="w-14 h-20 rounded-xl bg-surface border border-border flex items-center justify-center text-secondary shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-navy truncate">{novel.titleEnglish}</h2>
            <UrduText as="h3" size="xs" className="text-accent truncate leading-[2.2]">
              {novel.titleUrdu}
            </UrduText>
            <p className="text-xs text-secondary mt-0.5">
              Author:{' '}
              <span className="text-navy font-semibold">
                {writer.penNameUrdu || writer.penNameEnglish}
              </span>
            </p>
          </div>

          <div>
            <Link
              href={`/novels/${novel.slug}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-dark transition-colors"
            >
              <span>Novel Details</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Inline General Errors */}
        {formError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASE 1: PENDING PAYMENT (Instructions + Payment Submission Form)          */}
        {/* ========================================================================= */}
        {(order.status === 'pending_payment' || order.status === 'rejected') && (
          <div className="space-y-6 pt-2">
            {/* Rejection Notice if rejected */}
            {order.status === 'rejected' && order.rejectedReason && (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 sm:p-5 space-y-2">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800">
                      Author Rejection Reason
                    </h3>
                    <p className="text-xs text-rose-950 leading-relaxed font-mono bg-white p-2.5 rounded-lg border border-rose-200">
                      &quot;{order.rejectedReason}&quot;
                    </p>
                    <p className="text-[11px] text-rose-700">
                      Please verify your deposit against the instructions below and resubmit your payment
                      proof, or cancel this order.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Need Help Paying? Guide Link */}
            <div className="rounded-xl bg-surface-muted border border-border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-main">
                <HelpCircle className="w-4 h-4 text-accent shrink-0" />
                <span>Need help with direct payment? Follow our step-by-step payment guide.</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] shrink-0 font-medium">
                <Link
                  href="/how-to-pay"
                  className="text-accent hover:text-accent-dark underline font-semibold"
                >
                  Payment Guide
                </Link>
                <span className="text-border">|</span>
                <Link
                  href="/how-it-works"
                  className="text-secondary hover:text-navy underline"
                >
                  How it Works
                </Link>
                <span className="text-border">|</span>
                <Link
                  href="/refund-policy"
                  className="text-secondary hover:text-navy underline"
                >
                  Refund Policy
                </Link>
              </div>
            </div>

            {/* Writer's Payment Instructions Card */}
            <div className="rounded-2xl bg-surface border border-border p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-accent" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
                    Writer&apos;s Payment Instructions
                  </h3>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                  {order.paymentMethod}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-secondary block text-[11px]">Account Title</span>
                  <div className="flex items-center justify-between bg-surface-muted p-2.5 rounded-xl border border-border">
                    <span className="font-semibold text-navy truncate">{accountTitle}</span>
                    <CopyButton text={accountTitle} />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-secondary block text-[11px]">
                    {bankName ? `IBAN / Account (${bankName})` : 'Account Number / Mobile Number'}
                  </span>
                  <div className="flex items-center justify-between bg-surface-muted p-2.5 rounded-xl border border-border">
                    <span className="font-mono font-bold text-navy truncate">
                      {accountNumberOrIban}
                    </span>
                    <CopyButton text={accountNumberOrIban} />
                  </div>
                </div>
              </div>

              {/* Exact Amount & Reference Warning */}
              <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-amber-950 font-medium">
                    Payment Reference / Note:{' '}
                    <span className="font-mono font-bold text-amber-900">{order.orderNumber}</span>
                  </span>
                  <CopyButton text={order.orderNumber} label="Copy Ref" />
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  <strong className="text-amber-950 font-bold">Important:</strong> Transfer exactly{' '}
                  <strong className="text-amber-950 font-bold">{formatPKR(order.amountPkr)}</strong> to the author&apos;s
                  account. Include <strong className="text-amber-950 font-bold">{order.orderNumber}</strong> in your
                  bank transfer note for faster verification.
                </p>
                {instructionsNote && (
                  <p className="text-[11px] text-amber-900/80 italic pt-1 border-t border-amber-200/60">
                    Author note: &quot;{instructionsNote}&quot;
                  </p>
                )}
              </div>
            </div>

            {/* Payment Proof Submission Form */}
            <form onSubmit={handlePaymentSubmit} className="space-y-5 rounded-2xl bg-surface border border-border p-5 shadow-sm">
              <div className="border-b border-border pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
                  Step 2: Submit Payment Proof
                </h3>
                <p className="text-[11px] text-secondary mt-0.5">
                  After transferring funds, enter your bank reference TID and upload the receipt screenshot.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* TID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-secondary block">
                    Transaction Reference (TID) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={tid}
                    onChange={(e) => setTid(e.target.value)}
                    placeholder="e.g. 12345678901 or TID-JC-987"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-xs text-navy placeholder:text-muted focus:outline-none focus:border-accent focus:bg-white transition-colors"
                  />
                  <p className="text-[10px] text-secondary">
                    6 to 40 characters (letters, numbers, hyphens, underscores).
                  </p>
                </div>

                {/* Amount Paid Claimed */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-secondary block">
                    Amount Paid (PKR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={claimedAmount}
                    onChange={(e) => setClaimedAmount(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-xs text-navy focus:outline-none focus:border-accent focus:bg-white transition-colors font-mono"
                  />
                  {claimedAmount !== order.amountPkr && (
                    <p className="text-[10px] text-amber-700 font-medium">
                      Amount differs from invoice total ({formatPKR(order.amountPkr)}).
                    </p>
                  )}
                </div>

                {/* Sender Account Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-secondary block">
                    Sender Account Name (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g. Muhammad Usman"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-xs text-navy placeholder:text-muted focus:outline-none focus:border-accent focus:bg-white transition-colors"
                  />
                  <p className="text-[10px] text-secondary">
                    Name on the account you sent the money from.
                  </p>
                </div>

                {/* Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-secondary block">
                    Note to Author (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    value={readerNote}
                    onChange={(e) => setReaderNote(e.target.value)}
                    placeholder="e.g. Paid via JazzCash app at 2:30 PM"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-xs text-navy placeholder:text-muted focus:outline-none focus:border-accent focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Screenshot Proof Uploader */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-secondary block">
                  Payment Screenshot Proof <span className="text-rose-500">*</span>
                </label>
                <ImageUploader
                  bucket="payment-proofs"
                  preset="payment-screenshot"
                  folder={order.id}
                  value={screenshotPath}
                  onChange={(path) => setScreenshotPath(path)}
                  disabled={isPending}
                  helperText="Upload your bank/wallet transfer receipt screenshot (auto-compressed to <= 150 KB webp)"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-secondary hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  Cancel Order
                </button>

                <button
                  type="submit"
                  disabled={isPending || !tid.trim() || !screenshotPath}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-navy bg-accent hover:bg-accent-dark active:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Proof...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Submit Payment Proof</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* CASE 2: PAYMENT SUBMITTED (Awaiting Author Verification)                  */}
        {/* ========================================================================= */}
        {order.status === 'payment_submitted' && latestSubmission && (
          <div className="space-y-6 pt-2">
            <div className="rounded-2xl bg-surface border border-border p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
                    Submitted Payment Details
                  </h3>
                </div>
                <span className="text-[11px] text-secondary">
                  Submitted {new Date(latestSubmission.created_at).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-secondary block text-[11px]">Transaction Reference (TID)</span>
                  <div className="flex items-center justify-between bg-surface-muted p-2.5 rounded-xl border border-border">
                    <span className="font-mono font-bold text-navy truncate">
                      {latestSubmission.transaction_reference_tid}
                    </span>
                    <CopyButton text={latestSubmission.transaction_reference_tid} />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-secondary block text-[11px]">Amount Claimed</span>
                  <div className="bg-surface-muted p-2.5 rounded-xl border border-border font-semibold font-mono text-navy">
                    {formatPKR(latestSubmission.paid_amount_claimed_pkr)}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-secondary block text-[11px]">Payment Proof</span>
                  <SignedScreenshotPreview path={latestSubmission.screenshot_path} />
                </div>
              </div>

              {latestSubmission.reader_note && (
                <div className="pt-2 text-xs text-secondary">
                  <span className="text-secondary block text-[11px]">Your Note</span>
                  <p className="bg-surface-muted p-2 rounded-lg border border-border mt-1 text-navy">
                    {latestSubmission.reader_note}
                  </p>
                </div>
              )}
            </div>

            {/* Waiting info & Dispute action after 24h */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
              <div className="space-y-1">
                <p className="font-semibold text-blue-900">The author has been notified</p>
                <p className="text-[11px] text-blue-800">
                  Verification usually occurs within a few hours. If the author does not respond within {minDisputeWaitHours} hours, you can raise an administrative dispute.
                  {!waitStatus.canDispute && (
                    <span className="block text-amber-800 mt-1 font-medium">
                      Cooldown active: Dispute option available in {waitStatus.remainingHours}h {waitStatus.remainingMinutes}m.
                    </span>
                  )}
                </p>
              </div>

              {waitStatus.canDispute ? (
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(true)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-100 hover:bg-rose-200 border border-rose-300 transition-colors shrink-0"
                >
                  Raise a Dispute
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title={`Cooldown active. Available in ${waitStatus.remainingHours}h ${waitStatus.remainingMinutes}m.`}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary bg-surface-muted border border-border opacity-60 cursor-not-allowed shrink-0"
                >
                  Dispute in {waitStatus.remainingHours}h {waitStatus.remainingMinutes}m
                </button>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASE 3: VERIFIED (Novel Unlocked & Library Link)                          */}
        {/* ========================================================================= */}
        {order.status === 'verified' && (
          <div className="space-y-6 pt-2">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-serif text-emerald-950">Your Access is Active!</h3>
                <p className="text-xs text-emerald-800 max-w-md mx-auto">
                  The author has verified your payment deposit. You can now read all locked and future chapters
                  for this novel in your library.
                </p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href={`/read/${novel.slug}/1`}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs text-navy bg-accent hover:bg-accent-dark transition-colors shadow-sm"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Start Reading Chapter 1 / پڑھنا شروع کریں</span>
                </Link>
                <Link
                  href="/library"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs text-navy bg-white border border-border hover:bg-surface-muted transition-colors"
                >
                  <span>Go to My Library</span>
                </Link>
              </div>
            </div>

            {/* Dispute option inside dispute window */}
            {isInsideDisputeWindow && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(true)}
                  className="text-[11px] font-semibold text-secondary hover:text-rose-600 transition-colors flex items-center gap-1"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Report a Problem / Raise Dispute</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASE 4: DISPUTED / CANCELLED / REFUNDED EXPLANATIONS                     */}
        {/* ========================================================================= */}
        {order.status === 'disputed' && (
          <div className="rounded-2xl bg-purple-50 border border-purple-200 p-5 space-y-3 text-xs text-purple-950 shadow-sm">
            <div className="flex items-center gap-2 text-purple-900 font-bold uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" />
              <span>Dispute In Review</span>
            </div>
            <p className="text-purple-800">
              This order is actively being reviewed by platform administrators. Both parties’ submission
              records and banking statements are being evaluated.
            </p>
            {disputes.length > 0 && (
              <div className="bg-white p-3 rounded-xl border border-purple-200 text-[11px] space-y-2">
                <span className="text-purple-900 block font-semibold">Dispute Details</span>
                <p className="text-navy font-mono">&quot;{disputes[0].reason}&quot;</p>
                <div className="pt-1">
                  <Link
                    href={`/disputes/${disputes[0].id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-900 bg-purple-100 hover:bg-purple-200 border border-purple-300 transition-colors"
                  >
                    <span>Open Dispute Thread & Evidence / گفتگو دیکھیں</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {order.status === 'cancelled' && (
          <div className="rounded-2xl bg-surface border border-border p-5 space-y-2 text-xs text-secondary shadow-sm">
            <div className="flex items-center gap-2 text-navy font-bold uppercase tracking-wider">
              <XCircle className="w-4 h-4 text-secondary" />
              <span>Order Cancelled</span>
            </div>
            <p>
              This order was cancelled before payment verification. If you still wish to read this novel,
              you may initiate a new checkout anytime.
            </p>
            <div className="pt-2">
              <Link
                href={`/checkout/${novel.slug}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-accent bg-surface-muted border border-border hover:border-accent transition-colors"
              >
                <span>Reorder Novel</span>
              </Link>
            </div>
          </div>
        )}

        {order.status === 'refunded_adjusted' && (
          <div className="rounded-2xl bg-surface border border-border p-5 space-y-2 text-xs text-secondary shadow-sm">
            <div className="flex items-center gap-2 text-navy font-bold uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 text-accent" />
              <span>Refunded / Adjusted</span>
            </div>
            <p>
              An administrative refund or adjustment was processed for this order, and purchase entitlement
              was revoked in accordance with our dispute policy.
            </p>
          </div>
        )}

        {/* Help & Policies Footer */}
        <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-secondary">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-accent" />
            <span>Need assistance with this order?</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <Link href="/how-to-pay" className="text-accent hover:underline">
              Payment Guide
            </Link>
            <span className="text-border">|</span>
            <Link href="/faq" className="text-secondary hover:text-navy hover:underline">
              Reader FAQ
            </Link>
            <span className="text-border">|</span>
            <Link href="/refund-policy" className="text-secondary hover:text-navy hover:underline">
              Refund Policy
            </Link>
            <span className="text-border">|</span>
            <Link href="/support" className="text-secondary hover:text-navy hover:underline">
              Reader Support
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CANCEL ORDER                                                      */}
      {/* ========================================================================= */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold font-serif text-navy">Cancel Order</h3>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="text-secondary hover:text-navy transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-secondary">
              Are you sure you want to cancel order <strong className="text-navy">{order.orderNumber}</strong>?
              This action cannot be undone.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary block">
                Reason for Cancellation (Optional)
              </label>
              <input
                type="text"
                maxLength={300}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Changed my mind"
                className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-xs text-navy placeholder:text-muted focus:outline-none focus:border-accent focus:bg-white transition-colors"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy transition-colors"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-colors shadow-sm"
              >
                {isPending ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: OPEN DISPUTE                                                      */}
      {/* ========================================================================= */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold font-serif text-navy flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-purple-600" />
                <span>Open Administrative Dispute</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                className="text-secondary hover:text-navy transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-secondary">
              A platform moderator will inspect your payment receipt and contact the author to resolve
              your order. Please describe the problem clearly below.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary block">
                Dispute Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                required
                maxLength={1000}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Explain the issue (e.g. transferred funds yesterday, author has not verified or replied)."
                className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-xs text-navy placeholder:text-muted focus:outline-none focus:border-accent focus:bg-white transition-colors"
              />
              <p className="text-[10px] text-secondary">Minimum 10 characters.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleOpenDispute}
                disabled={isPending || disputeReason.trim().length < 10}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 disabled:opacity-50 transition-colors shadow-sm"
              >
                {isPending ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
