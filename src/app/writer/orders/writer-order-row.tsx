'use client';

import React, { useState } from 'react';
import { UrduText } from '@/components/urdu/UrduText';
import {
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { verifyOrderPaymentAction, rejectOrderPaymentAction } from '@/app/actions/orders';

interface WriterOrderRowProps {
  order: {
    id: string;
    reader_id: string;
    reader_name?: string;
    reader_email?: string;
    novel_title_urdu?: string;
    novel_title_english?: string;
    amount_pkr: number;
    payment_method: string;
    status: string;
    created_at: string;
    submissions?: Array<{
      id: string;
      transaction_reference: string;
      screenshot_storage_path: string;
      reviewer_status: string;
      submitted_at: string;
    }>;
  };
}

export function WriterOrderRow({ order }: WriterOrderRowProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeSubmission = order.submissions?.find((s) => s.reviewer_status === 'pending');
  const latestSubmission = order.submissions?.[0];

  const handleFetchSignedProof = async (path: string) => {
    try {
      setLoadingProof(true);
      const res = await fetch(`/api/proofs/signed-url?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok || !data.signedUrl) {
        throw new Error(data.error || 'Failed to generate signed URL');
      }
      setProofUrl(data.signedUrl);
    } catch (err: unknown) {
      alert((err as Error).message || 'Unable to open private payment screenshot.');
    } finally {
      setLoadingProof(false);
    }
  };

  const handleVerify = async () => {
    if (!activeSubmission) return;
    if (!confirm('Confirm that you have received PKR ' + order.amount_pkr + ' in your account?')) return;

    setIsVerifying(true);
    setFeedback(null);
    try {
      const res = await verifyOrderPaymentAction(order.id, activeSubmission.id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Verification failed.' });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Payment verified.' });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSubmission) return;

    setIsRejecting(true);
    setFeedback(null);
    try {
      const res = await rejectOrderPaymentAction(order.id, activeSubmission.id, rejectionReason);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Rejection failed.' });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Payment rejected.' });
        setRejectModalOpen(false);
      }
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-secondary">
              Order #{order.id.slice(0, 8)}
            </span>
            <span className="text-xs text-secondary">•</span>
            <span className="text-xs text-secondary">
              {new Date(order.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="font-serif font-bold text-navy text-base mt-0.5">
            {order.novel_title_english || 'Novel Purchase'}
          </div>
          {order.novel_title_urdu && (
            <UrduText as="div" size="sm" className="text-accent py-0">
              {order.novel_title_urdu}
            </UrduText>
          )}
        </div>

        <div className="text-left sm:text-right">
          <div className="text-lg font-bold text-navy">
            PKR {order.amount_pkr.toLocaleString()}
          </div>
          <span className="inline-block text-[11px] font-medium uppercase px-2 py-0.5 rounded bg-surface-muted text-text">
            {order.payment_method}
          </span>
        </div>
      </div>

      {/* Reader & Submission Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <div className="text-secondary font-medium">Reader Info:</div>
          <div className="text-main font-semibold">{order.reader_name || 'Reader'}</div>
          <div className="text-secondary">{order.reader_email}</div>
        </div>

        <div className="space-y-1">
          <div className="text-secondary font-medium">Payment Submission:</div>
          {activeSubmission ? (
            <div>
              <div className="text-main font-semibold font-mono">
                TID: {activeSubmission.transaction_reference}
              </div>
              <div className="text-secondary text-[11px]">
                Submitted: {new Date(activeSubmission.submitted_at).toLocaleTimeString()}
              </div>
            </div>
          ) : latestSubmission ? (
            <div className="text-secondary">
              Last TID: <span className="font-mono">{latestSubmission.transaction_reference}</span> ({latestSubmission.reviewer_status})
            </div>
          ) : (
            <div className="text-secondary italic">No proof submitted yet.</div>
          )}
        </div>
      </div>

      {/* Proof Screenshot Viewer */}
      {(activeSubmission?.screenshot_storage_path || latestSubmission?.screenshot_storage_path) && (
        <div className="pt-2 border-t border-border flex items-center justify-between">
          <div className="text-xs text-secondary flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-success" />
            <span>Secure deposit proof (private bucket)</span>
          </div>

          <button
            type="button"
            onClick={() =>
              handleFetchSignedProof(
                (activeSubmission || latestSubmission)!.screenshot_storage_path
              )
            }
            disabled={loadingProof}
            className="inline-flex items-center text-xs font-semibold text-accent hover:text-accent-dark transition-colors"
          >
            {loadingProof ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <Eye className="w-3.5 h-3.5 mr-1" />
            )}
            View Proof Screenshot (60s Signed URL)
          </button>
        </div>
      )}

      {/* Render Proof Image if open */}
      {proofUrl && (
        <div className="p-3 bg-ivory rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>Secure Signed Proof Preview (valid 60 seconds):</span>
            <button
              onClick={() => setProofUrl(null)}
              className="text-danger-text hover:underline font-medium"
            >
              Close
            </button>
          </div>
          <div className="relative max-w-sm mx-auto overflow-hidden rounded-lg border border-border shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofUrl}
              alt="Payment Proof"
              className="w-full h-auto max-h-80 object-contain bg-white"
            />
          </div>
        </div>
      )}

      {/* Action Buttons for Pending Submission */}
      {order.status === 'payment_submitted' && activeSubmission && (
        <div className="pt-3 border-t border-border flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setRejectModalOpen(true)}
            disabled={isVerifying || isRejecting}
            className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold text-danger-text bg-danger-soft hover:bg-danger-soft border border-danger-border transition-colors"
          >
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Reject Deposit
          </button>

          <button
            type="button"
            onClick={handleVerify}
            disabled={isVerifying || isRejecting}
            className="inline-flex items-center px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-success hover:bg-success-hover shadow-sm transition-colors"
          >
            {isVerifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            Confirm Deposit & Unlock Novel
          </button>
        </div>
      )}

      {/* Status feedback message */}
      {feedback && (
        <div
          className={`text-xs p-3 rounded-lg border ${
            feedback.type === 'success'
              ? 'bg-success-soft border-success-border text-success-text'
              : 'bg-danger-soft border-danger-border text-danger-text'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm">
          <form
            onSubmit={handleReject}
            className="bg-surface rounded-2xl border border-border max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-serif font-bold text-navy">
                Reject Payment Submission
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="text-secondary hover:text-navy text-xs font-semibold"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              Please specify why this payment could not be confirmed (e.g. &quot;TID not found in bank statement&quot;, &quot;Amount received was PKR 500 instead of PKR 1,000&quot;).
              The reader will be allowed to resubmit proof.
            </p>

            <div>
              <label className="block text-xs font-semibold text-main mb-1">
                Rejection Reason (Visible to Reader)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                required
                rows={3}
                placeholder="Enter clear rejection reason..."
                className="w-full text-xs p-3 rounded-lg border border-border bg-ivory focus:bg-white focus:border-danger-border focus:ring-1 focus:ring-danger outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border text-secondary hover:bg-ivory"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isRejecting || rejectionReason.trim().length < 5}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-danger text-white hover:bg-danger-hover disabled:opacity-50"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
