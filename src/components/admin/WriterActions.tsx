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
      setError('A justification reason is required to update commission terms.');
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
        setError(res.error || 'Failed to update commission terms');
      } else {
        setSuccessMsg('Writer commission terms successfully updated!');
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
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
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
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve Writer</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveDialog('reject')}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
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
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
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
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Re-Approve Writer</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveDialog('terms')}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Sliders className="w-4 h-4 text-slate-400" />
          <span>Edit Commission Terms</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleUpdateTerms}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Custom Commission & Limits
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Changes affect future sales only. Past sales ledger entries remain immutable.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Custom Commission Rate (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="Leave blank for platform default (20%)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <span className="text-[10px] text-slate-500">
                  Empty = uses platform default rate.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Unpaid Commission Limit (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Justification Reason <span className="text-rose-400 font-mono">*</span>
                </label>
                <textarea
                  rows={2}
                  value={termsReason}
                  onChange={(e) => setTermsReason(e.target.value)}
                  required
                  placeholder="Reason for rate/threshold adjustment..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setActiveDialog(null)}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
