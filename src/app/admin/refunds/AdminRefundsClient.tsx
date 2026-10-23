'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  approveRefundRequestAction,
  rejectRefundRequestAction,
} from '@/app/actions/admin-disputes';
import { getRefundStatusMeta } from '@/lib/disputes/status-meta';
import { formatPKR } from '@/lib/utils';
import type { RefundRequestItem } from '@/types/database';
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  ExternalLink,
  Loader2,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface AdminRefundsClientProps {
  requests: RefundRequestItem[];
  totalCount: number;
  currentStatus: string;
  currentPage: number;
  totalPages: number;
}

export function AdminRefundsClient({
  requests,
  totalCount,
  currentStatus,
  currentPage,
  totalPages,
}: AdminRefundsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Action modals
  const [activeRequest, setActiveRequest] = useState<RefundRequestItem | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Proof inspection lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState<string | null>(null);

  const handleInspectProof = async (path: string) => {
    try {
      setLoadingProof(path);
      const res = await fetch(`/api/proofs/signed-url?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok && data.url) {
        setLightboxUrl(data.url);
      } else {
        alert(data.error || 'Failed to generate signed preview link.');
      }
    } catch {
      alert('Network error while requesting signed proof.');
    } finally {
      setLoadingProof(null);
    }
  };

  const handleExecuteAction = () => {
    if (!activeRequest || !actionType) return;
    if (!adminNote.trim()) {
      setFeedback({ type: 'error', message: 'A mandatory administrative note is required.' });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      let res;
      if (actionType === 'approve') {
        res = await approveRefundRequestAction(activeRequest.id, adminNote);
      } else {
        res = await rejectRefundRequestAction(activeRequest.id, adminNote);
      }

      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Action failed.' });
      } else {
        setFeedback({ type: 'success', message: res.message || 'Action executed successfully.' });
        setActiveRequest(null);
        setActionType(null);
        setAdminNote('');
        router.refresh();
      }
    });
  };

  const tabs = [
    { key: 'all', label: 'All Requests' },
    { key: 'pending', label: 'Pending Review' },
    { key: 'approved', label: 'Approved & Adjusted' },
    { key: 'rejected', label: 'Declined' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-sky-400" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Refund Adjustments Queue
            </h1>
            <span className="text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full font-mono">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Review writer requests for off-platform refunds. Approving applies an append-only negative sales ledger row and revokes reader access.
          </p>
        </div>

        <Link
          href="/admin/disputes"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
        >
          <span>Disputes Desk</span>
        </Link>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 ${
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

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 pb-2">
        {tabs.map((tab) => {
          const isActive = currentStatus === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/admin/refunds?status=${tab.key}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-sky-500 text-stone-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Requests Table */}
      {requests.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-12 text-center space-y-3">
          <RotateCcw className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">No refund requests found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {currentStatus !== 'all'
              ? `There are no ${currentStatus} refund adjustment requests.`
              : 'No author has submitted a refund adjustment request yet.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-mono">
                <tr>
                  <th className="py-3 px-4">Order / Novel</th>
                  <th className="py-3 px-4">Parties</th>
                  <th className="py-3 px-4">Refund Reason &amp; Proof</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status &amp; Review</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {requests.map((req) => {
                  const meta = getRefundStatusMeta(req.status);
                  const isPendingReview = req.status === 'pending';

                  return (
                    <tr key={req.id} className="hover:bg-slate-900/40 transition-colors">
                      {/* Order / Novel */}
                      <td className="py-3.5 px-4 space-y-0.5">
                        <Link
                          href={`/admin/orders?search=${encodeURIComponent(req.order_number)}`}
                          target="_blank"
                          className="font-mono font-bold text-amber-400 text-xs hover:underline inline-flex items-center gap-1"
                        >
                          <span>#{req.order_number}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </Link>
                        <div className="font-medium text-white line-clamp-1">
                          {req.novel_title}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(req.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>

                      {/* Parties */}
                      <td className="py-3.5 px-4 space-y-1">
                        <div className="text-[11px]">
                          <span className="text-slate-500">Author: </span>
                          <span className="text-amber-300 font-medium">{req.writer_pen_name}</span>
                        </div>
                        <div className="text-[11px]">
                          <span className="text-slate-500">Reader: </span>
                          <span className="text-white font-medium">{req.reader_name}</span>
                        </div>
                      </td>

                      {/* Refund Reason & Proof */}
                      <td className="py-3.5 px-4 max-w-xs space-y-1.5">
                        <p className="text-slate-300 leading-snug">
                          <span className="font-semibold text-white">Reason: </span>
                          {req.reason}
                        </p>
                        {req.evidence_note && (
                          <p className="text-[11px] text-slate-400 italic">
                            Proof note: &quot;{req.evidence_note}&quot;
                          </p>
                        )}
                        {req.evidence_path && (
                          <div className="pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleInspectProof(req.evidence_path!)}
                              disabled={loadingProof === req.evidence_path}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspect Off-Platform Refund Receipt</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                        {formatPKR(req.amount_pkr)}
                      </td>

                      {/* Status & Review */}
                      <td className="py-3.5 px-4 space-y-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            meta.variant === 'warning'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : meta.variant === 'success'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {meta.label}
                        </span>

                        {req.admin_note && (
                          <p className="text-[11px] text-slate-400 italic line-clamp-1">
                            &quot;{req.admin_note}&quot;
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {isPendingReview ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveRequest(req);
                                setActionType('approve');
                                setAdminNote('');
                                setFeedback(null);
                              }}
                              className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveRequest(req);
                                setActionType('reject');
                                setAdminNote('');
                                setFeedback(null);
                              }}
                              className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">
                            {req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString() : 'Reviewed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-slate-900/60 border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
              <div>
                Page {currentPage} of {totalPages} ({totalCount} total)
              </div>
              <div className="flex items-center gap-2">
                {currentPage > 1 && (
                  <Link
                    href={`/admin/refunds?status=${currentStatus}&page=${currentPage - 1}`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link
                    href={`/admin/refunds?status=${currentStatus}&page=${currentPage + 1}`}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {activeRequest && actionType && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <RotateCcw className="w-4 h-4 text-sky-400" />
                <span>
                  {actionType === 'approve'
                    ? `Approve Refund Adjustment — Order #${activeRequest.order_number}`
                    : `Decline Refund Request — Order #${activeRequest.order_number}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveRequest(null);
                  setActionType(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Warning Callout */}
            <div
              className={`p-3.5 rounded-xl text-xs space-y-1.5 border ${
                actionType === 'approve'
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Authoritative Ledger Impact</span>
              </div>
              <p className="leading-relaxed">
                {actionType === 'approve'
                  ? `Approving confirms that author ${activeRequest.writer_pen_name} refunded ${formatPKR(activeRequest.amount_pkr)} off-platform. An immutable negative adjustment row will be written to sales_ledger, reducing the author's platform commission debt and revoking reader ${activeRequest.reader_name}'s novel reading access.`
                  : `Declining dismisses the author's request for platform commission reduction. Reader access and original verified sale remain unchanged.`}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                Administrative Reason / Review Note <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="State the justification, bank reference, or reason for this ruling..."
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs p-3 rounded-xl focus:outline-none focus:border-sky-500/50 resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveRequest(null);
                  setActionType(null);
                }}
                disabled={isPending}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={isPending || !adminNote.trim()}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
                  actionType === 'approve'
                    ? 'bg-sky-500 hover:bg-sky-400 text-stone-950'
                    : 'bg-rose-500 hover:bg-rose-400 text-white'
                } disabled:opacity-50`}
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {actionType === 'approve' ? 'Approve & Adjust Ledger' : 'Decline Request'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Lightbox Modal */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-3xl flex justify-end pb-2">
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="p-2 bg-stone-900 rounded-full text-white hover:bg-stone-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="max-w-3xl max-h-[85vh] overflow-auto bg-stone-950 p-2 rounded-2xl border border-stone-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Off-platform refund proof receipt"
              className="max-h-[80vh] w-auto mx-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
