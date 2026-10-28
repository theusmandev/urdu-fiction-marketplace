'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminApproveWriterAction,
  adminRejectWriterAction,
  adminSuspendWriterAction,
  adminSetWriterCommissionTermsAction,
} from '@/app/actions/admin';
import { ReasonConfirmDialog } from './ReasonConfirmDialog';
import { CheckCircle2, XCircle, AlertOctagon, Sliders, Loader2 } from 'lucide-react';

interface WriterActionsProps {
  writerId: string;
  status: string;
  customRate: number | null;
  unpaidLimit: number;
}

export function WriterActions({
  writerId,
  status,
  customRate,
  unpaidLimit,
}: WriterActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal dialog states
  const [activeDialog, setActiveDialog] = useState<
    'approve' | 'reject' | 'suspend' | 'terms' | null
  >(null);

  // Commission terms edit form state
  const [rateInput, setRateInput] = useState<string>(
    customRate !== null ? customRate.toString() : ''
  );
  const [limitInput, setLimitInput] = useState<string>(unpaidLimit.toString());
  const [termsReason, setTermsReason] = useState<string>('');

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApproveWriterAction(writerId);
      if (!res.success) {
        setError(res.error || 'Failed to approve writer');
      } else {
        setSuccessMsg('Writer successfully approved!');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setActiveDialog(null);
    }
  };

  const handleReject = async (reason: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminRejectWriterAction(writerId, reason);
      if (!res.success) {
        setError(res.error || 'Failed to reject writer');
      } else {
        setSuccessMsg('Writer application rejected.');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setActiveDialog(null);
    }
  };

  const handleSuspend = async (reason: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminSuspendWriterAction(writerId, reason);
      if (!res.success) {
        setError(res.error || 'Failed to suspend writer');
      } else {
        setSuccessMsg('Writer account suspended.');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setActiveDialog(null);
    }
  };

  const handleUpdateTerms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsReason || termsReason.trim().length < 3) {
      setError('A justification reason is required to update platform fee terms.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const parsedRate = rateInput.trim() === '' ? null : Number(rateInput);
      const parsedLimit = limitInput.trim() === '' ? undefined : Number(limitInput);

      const res = await adminSetWriterCommissionTermsAction(
        writerId,
        parsedRate,
        parsedLimit,
        termsReason.trim()
      );

      if (!res.success) {
        setError(res.error || 'Failed to update platform fee terms');
      } else {
        setSuccessMsg('Writer platform fee terms successfully updated!');
        setActiveDialog(null);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3.5 rounded-xl bg-danger-soft border border-danger-border text-danger-text text-xs">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-success-soft border border-success-border text-success-text text-xs">
          {successMsg}
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center gap-2.5">
        {status === 'pending_approval' && (
          <>
            <button
              type="button"
              onClick={() => setActiveDialog('approve')}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-success hover:bg-success-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve Writer</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveDialog('reject')}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-danger hover:bg-danger-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            >
              <XCircle className="w-4 h-4" />
              <span>Reject Application</span>
            </button>
          </>
        )}

        {status === 'approved' && (
          <button
            type="button"
            onClick={() => setActiveDialog('suspend')}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-danger hover:bg-danger-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
          >
            <AlertOctagon className="w-4 h-4" />
            <span>Suspend Writer</span>
          </button>
        )}

        {status === 'suspended' && (
          <button
            type="button"
            onClick={() => setActiveDialog('approve')}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-success hover:bg-success-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Re-Approve Writer</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveDialog('terms')}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-muted text-main border border-border text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
        >
          <Sliders className="w-4 h-4 text-muted" />
          <span>Edit Platform Fee Terms</span>
        </button>
      </div>

      {/* Confirmation Dialogs */}
      <ReasonConfirmDialog
        isOpen={activeDialog === 'approve'}
        title="Approve Writer Account"
        description="This will transition the writer status to 'approved', grant them author publishing permissions, and notify them."
        confirmText="Confirm Approval"
        confirmVariant="primary"
        requireReason={false}
        isLoading={loading}
        onConfirm={handleApprove}
        onCancel={() => setActiveDialog(null)}
      />

      <ReasonConfirmDialog
        isOpen={activeDialog === 'reject'}
        title="Reject Writer Application"
        description="Please provide an editorial reason for rejecting this author application. The reason will be sent to the applicant."
        reasonLabel="Rejection Justification"
        reasonPlaceholder="e.g. Incomplete manuscript samples or formatting issues..."
        confirmText="Reject Application"
        confirmVariant="destructive"
        requireReason={true}
        isLoading={loading}
        onConfirm={handleReject}
        onCancel={() => setActiveDialog(null)}
      />

      <ReasonConfirmDialog
        isOpen={activeDialog === 'suspend'}
        title="Suspend Writer Account"
        description="Suspending this writer will immediately pause their order processing and prevent publication of new works. Provide a mandatory reason."
        reasonLabel="Suspension Reason"
        reasonPlaceholder="e.g. Terms violation or copyright complaint..."
        confirmText="Suspend Account"
        confirmVariant="destructive"
        requireReason={true}
        isLoading={loading}
        onConfirm={handleSuspend}
        onCancel={() => setActiveDialog(null)}
      />

      {/* Commission Terms Edit Modal */}
      {activeDialog === 'terms' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleUpdateTerms}
            className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-main">
                  Custom Platform Fee & Limits
                </h3>
                <p className="text-xs text-muted mt-1">
                  Changes affect future sales only.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-main block mb-1">
                  Custom Platform Fee Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="Leave blank for platform default (20%)"
                  className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin"
                />
                <span className="text-[10px] text-muted">
                  Empty = uses platform default rate.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-main block mb-1">
                  Unpaid Platform Fee Limit (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  required
                  className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-main block mb-1">
                  Justification Reason <span className="text-danger-text font-mono">*</span>
                </label>
                <textarea
                  rows={2}
                  value={termsReason}
                  onChange={(e) => setTermsReason(e.target.value)}
                  required
                  placeholder="Reason for rate/threshold adjustment..."
                  className="w-full bg-surface-muted border border-border rounded-xl px-3.5 py-2 text-xs text-main placeholder-muted focus:outline-none focus:ring-2 focus:ring-ring-admin/20 focus:border-accent-admin resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setActiveDialog(null)}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-main hover:bg-surface border border-border transition-colors disabled:opacity-50 bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent-admin hover:bg-accent-admin-dark text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Terms</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
