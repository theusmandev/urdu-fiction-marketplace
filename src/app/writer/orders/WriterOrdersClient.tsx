'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import { formatPKR } from '@/lib/utils';
import {
  verifyOrderPaymentAction,
  rejectOrderPaymentAction,
} from '@/app/actions/writer-orders';
import { requestRefundAction } from '@/app/actions/refunds';
import { ImageUploader } from '@/components/ui/image-uploader';
import type { OrderStatus } from '@/types/database';
import {
  Receipt,
  ArrowLeft,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  X,
  Loader2,
  ShieldCheck,
  Info,
} from 'lucide-react';

export interface WriterOrderSubmission {
  id: string;
  tid: string;
  screenshotPath: string;
  claimedAmount: number;
  senderAccountName: string | null;
  readerNote: string | null;
  reviewerStatus: string;
  reviewerNote: string | null;
  isDuplicateTidFlagged: boolean;
  createdAt: string;
}

export interface WriterOrderCardData {
  id: string;
  orderNumber: string;
  readerId: string;
  readerDisplayName: string;
  novelTitleUrdu: string;
  novelTitleEnglish: string;
  novelSlug: string;
  amountPkr: number;
  paymentMethod: string;
  status: OrderStatus;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
  submissions: WriterOrderSubmission[];
  hasPendingRefund?: boolean;
  pendingRefundReason?: string | null;
}

interface WriterOrdersClientProps {
  initialOrders: WriterOrderCardData[];
}

type TabType = 'awaiting' | 'verified' | 'rejected' | 'all';

function CopyTidButton({ tid }: { tid: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tid);
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
      title="Copy TID"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 transition-colors cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-600" />
          <span className="text-emerald-700">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy TID</span>
        </>
      )}
    </button>
  );
}

function WriterScreenshotThumbnail({ path }: { path: string }) {
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
      <div className="w-20 h-20 rounded-xl bg-ivory border border-border flex items-center justify-center text-secondary">
        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
      </div>
    );
  }

  if (!url) {
    return (
      <div className="w-20 h-20 rounded-xl bg-ivory border border-border flex items-center justify-center text-[10px] text-secondary text-center p-2">
        Receipt unavailable
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="relative group w-20 h-20 rounded-xl overflow-hidden border border-border hover:border-accent transition-all cursor-pointer block shrink-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Receipt proof" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-navy/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold gap-1">
          <Eye className="w-3.5 h-3.5" />
          <span>Zoom</span>
        </div>
      </button>

      {/* Zoom Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-2xl w-full bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="text-xs font-bold text-navy uppercase tracking-wider">
                Payment Proof Screenshot
              </h4>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-secondary hover:text-navy p-1 rounded-lg hover:bg-ivory cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl flex items-center justify-center bg-ivory/50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Payment Receipt Proof" className="max-h-[70vh] w-auto object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function WriterOrdersClient({ initialOrders }: WriterOrdersClientProps) {
  const router = useRouter();
  const [orders] = useState<WriterOrderCardData[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<TabType>('awaiting');
  const [isPending, startTransition] = useTransition();

  // Verification dialog state
  const [verifyTarget, setVerifyTarget] = useState<{
    order: WriterOrderCardData;
    submission: WriterOrderSubmission;
  } | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Rejection dialog state
  const [rejectTarget, setRejectTarget] = useState<{
    order: WriterOrderCardData;
    submission: WriterOrderSubmission;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Refund Modal state
  const [refundTarget, setRefundTarget] = useState<WriterOrderCardData | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundEvidenceNote, setRefundEvidenceNote] = useState('');
  const [refundEvidencePath, setRefundEvidencePath] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Filter tabs
  const awaitingOrders = orders.filter((o) => o.status === 'payment_submitted');
  const verifiedOrders = orders.filter((o) => o.status === 'verified');
  const rejectedOrders = orders.filter((o) => o.status === 'rejected');

  const displayedOrders =
    activeTab === 'awaiting'
      ? awaitingOrders
      : activeTab === 'verified'
      ? verifiedOrders
      : activeTab === 'rejected'
      ? rejectedOrders
      : orders;

  // Handle Verify Confirmation
  const handleConfirmVerification = () => {
    if (!verifyTarget) return;
    setVerifyError(null);

    const requiredText = `I confirm that PKR ${verifyTarget.order.amountPkr} has been received in my account for order ${verifyTarget.order.orderNumber}`;

    startTransition(async () => {
      const res = await verifyOrderPaymentAction({
        orderId: verifyTarget.order.id,
        submissionId: verifyTarget.submission.id,
        confirmationText: requiredText,
        writerNote: verifyNote.trim() || undefined,
      });

      if (!res.success) {
        setVerifyError(res.error || 'Failed to verify payment.');
        return;
      }

      setVerifyTarget(null);
      setVerifyNote('');
      router.refresh();
    });
  };

  // Handle Reject Confirmation
  const handleConfirmRejection = () => {
    if (!rejectTarget) return;
    setRejectError(null);

    if (rejectReason.trim().length < 5) {
      setRejectError('Please provide a clear reason of at least 5 characters.');
      return;
    }

    startTransition(async () => {
      const res = await rejectOrderPaymentAction({
        orderId: rejectTarget.order.id,
        submissionId: rejectTarget.submission.id,
        reason: rejectReason.trim(),
      });

      if (!res.success) {
        setRejectError(res.error || 'Failed to reject payment.');
        return;
      }

      setRejectTarget(null);
      setRejectReason('');
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/writer"
              className="text-xs text-secondary hover:text-navy flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Writer Studio</span>
            </Link>
            <span className="text-secondary text-xs">•</span>
            <span className="text-xs font-semibold text-accent">Payment Verification</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy mt-1">
            Reader Payment Verifications
          </h1>
          <p className="text-xs text-secondary">
            Inspect direct reader deposits, verify receipts, and grant immediate novel access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            {awaitingOrders.length} Awaiting Verification
          </span>
        </div>
      </div>

      {/* Writer Obligation & Legal Compliance Notice */}
      <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 sm:p-5 space-y-2">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Writer Verification Agreement & Platform Fee Policy
            </h2>
            <p className="text-xs text-stone-700 leading-relaxed">
              Verifying an order immediately creates the reader’s permanent access to your novel and records a platform
              fee obligation on your writer balance. False verification or hiding completed sales violates the writer agreement
              and can result in store suspension.
            </p>
            <div className="pt-0.5">
              <UrduText as="p" size="xs" className="text-amber-900 leading-[2.2]">
                تصدیق کرنے سے قاری کو فوری رسائی مل جائے گی اور پلیٹ فارم فیس ریکارڈ ہو گی۔ غلط تصدیق یا خفیہ فروخت معاہدے کی خلاف ورزی ہے۔
              </UrduText>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border overflow-x-auto pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('awaiting')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'awaiting'
              ? 'border-accent text-navy'
              : 'border-transparent text-secondary hover:text-navy hover:border-border'
          }`}
        >
          <span>Awaiting Verification</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-semibold">
            {awaitingOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('verified')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'verified'
              ? 'border-accent text-navy'
              : 'border-transparent text-secondary hover:text-navy hover:border-border'
          }`}
        >
          <span>Verified Orders</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
            {verifiedOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rejected')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'rejected'
              ? 'border-accent text-navy'
              : 'border-transparent text-secondary hover:text-navy hover:border-border'
          }`}
        >
          <span>Rejected</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800 font-semibold">
            {rejectedOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'all'
              ? 'border-accent text-navy'
              : 'border-transparent text-secondary hover:text-navy hover:border-border'
          }`}
        >
          <span>All Orders</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-ivory text-secondary font-semibold border border-border">
            {orders.length}
          </span>
        </button>
      </div>

      {/* Orders List */}
      {displayedOrders.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
            <Receipt className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-base text-navy">
              No orders found in this view
            </h3>
            <p className="text-xs text-secondary max-w-md mx-auto">
              {activeTab === 'awaiting'
                ? 'All pending reader payment submissions have been verified or addressed.'
                : 'No orders currently match the selected filter tab.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedOrders.map((order) => {
            const activeSubmission =
              order.submissions.find((s) => s.reviewerStatus === 'pending') || order.submissions[0];
            const hasMismatch =
              activeSubmission &&
              Math.abs(activeSubmission.claimedAmount - order.amountPkr) > 0.01;

            return (
              <div
                key={order.id}
                className="bg-surface rounded-2xl border border-border p-5 sm:p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Top strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-navy bg-ivory px-2.5 py-1 rounded-lg border border-border">
                      {order.orderNumber}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                        order.status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.status === 'payment_submitted'
                          ? 'bg-amber-100 text-amber-800'
                          : order.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {order.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-secondary">
                    <span>Reader: <strong className="text-navy">{order.readerDisplayName}</strong></span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Main Content Card Body */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Novel Details (4 cols) */}
                  <div className="lg:col-span-4 space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-secondary block">
                      Purchased Novel
                    </span>
                    <h3 className="text-sm font-bold text-navy truncate">
                      {order.novelTitleEnglish}
                    </h3>
                    <UrduText as="h4" size="xs" className="text-accent truncate leading-[2.2]">
                      {order.novelTitleUrdu}
                    </UrduText>
                    <div className="pt-2 flex items-baseline gap-2">
                      <span className="text-xs text-secondary">Amount Due:</span>
                      <span className="font-serif text-base font-bold text-navy">
                        {formatPKR(order.amountPkr)}
                      </span>
                    </div>
                  </div>

                  {/* Payment Submission Details (5 cols) */}
                  <div className="lg:col-span-5 space-y-3">
                    {activeSubmission ? (
                      <div className="space-y-3">
                        {/* Duplicate TID Warning Banner */}
                        {activeSubmission.isDuplicateTidFlagged && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-800 space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-rose-900">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>DUPLICATE TID WARNING</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                              This TID has already been submitted on another order! Inspect your bank statement
                              carefully to verify that a separate deposit was actually received before confirming.
                            </p>
                          </div>
                        )}

                        <div className="flex gap-4 items-start">
                          <WriterScreenshotThumbnail path={activeSubmission.screenshotPath} />

                          <div className="space-y-1.5 min-w-0 flex-1 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-navy">
                                {activeSubmission.tid}
                              </span>
                              <CopyTidButton tid={activeSubmission.tid} />
                            </div>

                            {/* Amount Paid Claimed & Mismatch Flag */}
                            <div className="text-[11px]">
                              <span className="text-secondary">Reader claims paid: </span>
                              <span
                                className={`font-bold ${
                                  hasMismatch ? 'text-rose-600 bg-rose-50 px-1 rounded' : 'text-navy'
                                }`}
                              >
                                {formatPKR(activeSubmission.claimedAmount)}
                              </span>
                              {hasMismatch && (
                                <span className="ml-1 text-[10px] text-rose-600 font-semibold block">
                                  ⚠ Amount mismatch with invoice ({formatPKR(order.amountPkr)})!
                                </span>
                              )}
                            </div>

                            {activeSubmission.senderAccountName && (
                              <p className="text-[11px] text-secondary truncate">
                                Sender Name:{' '}
                                <span className="text-navy font-medium">
                                  {activeSubmission.senderAccountName}
                                </span>
                              </p>
                            )}

                            {activeSubmission.readerNote && (
                              <p className="text-[11px] text-secondary italic bg-ivory/60 p-1.5 rounded-lg border border-border">
                                Note: &quot;{activeSubmission.readerNote}&quot;
                              </p>
                            )}

                            <span className="text-[10px] text-secondary block pt-1">
                              Submitted {new Date(activeSubmission.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-ivory text-xs text-secondary text-center">
                        No payment proof submitted yet for this order.
                      </div>
                    )}
                  </div>

                  {/* Actions (3 cols) */}
                  <div className="lg:col-span-3 flex flex-col gap-2 pt-2 lg:pt-0">
                    {order.status === 'payment_submitted' && activeSubmission && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyTarget({ order, submission: activeSubmission });
                            setVerifyError(null);
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Verify Payment</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRejectTarget({ order, submission: activeSubmission });
                            setRejectReason('');
                            setRejectError(null);
                          }}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Reject Proof</span>
                        </button>
                      </>
                    )}

                    {order.status === 'verified' && (
                      <div className="space-y-2">
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-1">
                          <div className="flex items-center gap-1 font-bold text-emerald-900">
                            <Check className="w-4 h-4" />
                            <span>Verified & Access Active</span>
                          </div>
                          <p className="text-[11px]">
                            Verified on {new Date(order.updatedAt).toLocaleDateString()}.
                          </p>
                        </div>

                        {order.hasPendingRefund ? (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1">
                            <span className="font-bold block">Refund Request Under Review</span>
                            <p className="text-[10px] text-amber-800">
                              Administrators are verifying your off-platform refund.
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRefundTarget(order);
                              setRefundReason('');
                              setRefundEvidenceNote('');
                              setRefundEvidencePath(null);
                              setRefundError(null);
                            }}
                            className="w-full text-center px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-ivory text-secondary hover:text-navy text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            Record Off-Platform Refund
                          </button>
                        )}
                      </div>
                    )}

                    {order.status === 'refunded_adjusted' && (
                      <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-1">
                        <span className="font-bold block">Refund Adjusted</span>
                        <p className="text-[11px] text-purple-700">
                          Sale reversed: Negative platform fee line recorded in ledger & access revoked.
                        </p>
                      </div>
                    )}

                    {order.status === 'rejected' && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                        <span className="font-bold block">Rejected</span>
                        {order.rejectedReason && (
                          <p className="text-[11px] italic text-rose-900">
                            &quot;{order.rejectedReason}&quot;
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VERIFICATION CONFIRMATION DIALOG                                  */}
      {/* ========================================================================= */}
      {verifyTarget && (
        <div className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-surface border border-border rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-serif font-bold text-navy flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Confirm Payment Receipt</span>
              </h3>
              <button
                type="button"
                onClick={() => setVerifyTarget(null)}
                className="text-secondary hover:text-navy cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mandatory confirmation text explanation */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-900">
              <p className="font-bold">
                &quot;I confirm that PKR {verifyTarget.order.amountPkr} has been received in my account for order {verifyTarget.order.orderNumber}&quot;
              </p>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                By confirming, you certify that you have checked your personal bank/wallet statement and
                positively confirmed this deposit. The reader will be granted novel access immediately.
              </p>
            </div>

            {/* Optional note */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-navy block">
                Verification Note to Reader (Optional)
              </label>
              <input
                type="text"
                maxLength={500}
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
                placeholder="e.g. Received in Meezan Bank account. Enjoy reading!"
                className="w-full px-3 py-2 text-xs rounded-xl bg-ivory border border-border focus:outline-none focus:border-accent"
              />
            </div>

            {verifyError && (
              <p className="text-xs text-rose-600 font-semibold">{verifyError}</p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setVerifyTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVerification}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {isPending ? 'Verifying...' : 'Confirm Receipt & Unlock Novel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REJECTION DIALOG (MANDATORY REASON)                               */}
      {/* ========================================================================= */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-serif font-bold text-navy flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                <span>Reject Payment Proof</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="text-secondary hover:text-navy cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              If the funds have not been deposited in your account or the receipt is invalid, provide a clear
              explanation so the reader can resubmit with correct details.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-navy block">
                Rejection Reason <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={3}
                required
                maxLength={500}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. TID not found in bank statement, or amount received is less than due."
                className="w-full px-3 py-2 text-xs rounded-xl bg-ivory border border-border focus:outline-none focus:border-rose-400"
              />
              <p className="text-[10px] text-secondary">Minimum 5 characters.</p>
            </div>

            {rejectError && (
              <p className="text-xs text-rose-600 font-semibold">{rejectError}</p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejection}
                disabled={isPending || rejectReason.trim().length < 5}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {isPending ? 'Rejecting...' : 'Reject Payment Proof'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECORD OFF-PLATFORM REFUND REQUEST                                  */}
      {/* ========================================================================= */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-surface border border-border rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-serif font-bold text-navy flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-600" />
                <span>Record Off-Platform Refund (Order #{refundTarget.orderNumber})</span>
              </h3>
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="text-secondary hover:text-navy cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5 leading-relaxed">
              <span className="font-bold block">Important Notice:</span>
              <p>
                You are declaring that you have returned PKR {refundTarget.amountPkr} directly to the reader
                outside the platform (e.g. via JazzCash, EasyPaisa, or Raast).
              </p>
              <p className="text-[11px] text-amber-800">
                After an administrator reviews and approves this request, a negative adjustment row will be
                appended to your sales ledger (reducing your platform fee balance) and the reader&apos;s library
                access will be revoked.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-navy block">
                Reason for Refund <span className="text-rose-600">*</span>
              </label>
              <textarea
                rows={2}
                required
                maxLength={500}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Reader requested cancellation; transferred back full amount."
                className="w-full px-3 py-2 text-xs rounded-xl bg-ivory border border-border focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-navy block">
                Evidence Note / Return TID
              </label>
              <input
                type="text"
                maxLength={200}
                value={refundEvidenceNote}
                onChange={(e) => setRefundEvidenceNote(e.target.value)}
                placeholder="e.g. Transferred via EasyPaisa TID: 11223344"
                className="w-full px-3 py-2 text-xs rounded-xl bg-ivory border border-border focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-navy block">
                Optional Refund Transfer Screenshot
              </label>
              <ImageUploader
                bucket="payment-proofs"
                preset="payment-screenshot"
                folder={refundTarget.id}
                value={refundEvidencePath}
                onChange={(path) => setRefundEvidencePath(path)}
                disabled={isPending}
                helperText="Upload refund receipt screenshot for admin verification."
              />
            </div>

            {refundError && (
              <p className="text-xs text-rose-600 font-semibold">{refundError}</p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!refundReason.trim()) {
                    setRefundError('A reason for the refund is required.');
                    return;
                  }
                  setRefundError(null);
                  startTransition(async () => {
                    const res = await requestRefundAction(
                      refundTarget.id,
                      refundReason,
                      refundEvidenceNote,
                      refundEvidencePath
                    );
                    if (!res.success) {
                      setRefundError(res.error || 'Failed to submit refund request.');
                    } else {
                      setRefundTarget(null);
                      router.refresh();
                    }
                  });
                }}
                disabled={isPending || !refundReason.trim()}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {isPending ? 'Submitting...' : 'Submit Refund Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
