'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  resolveDisputeVerifyAction,
  resolveDisputeRefundAction,
  resolveDisputeForWriterAction,
  closeDisputeAction,
} from '@/app/actions/admin-disputes';
import { addDisputeMessageAction } from '@/app/actions/disputes';
import { getDisputeStatusMeta } from '@/lib/disputes/status-meta';
import { formatPKR } from '@/lib/utils';
import type { DisputeDetailPayload } from '@/types/database';
import {
  ArrowLeft,
  Scale,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  ExternalLink,
  Loader2,
  X,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface AdminDisputeDetailClientProps {
  payload: DisputeDetailPayload;
}

type OutcomeType = 'verify_reader' | 'refund_adjustment' | 'resolve_writer' | 'close_dispute' | null;

export function AdminDisputeDetailClient({ payload }: AdminDisputeDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { dispute, order, messages, submissions } = payload;
  const statusMeta = getDisputeStatusMeta(dispute.status);

  // Outcome modal states
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeType>(null);
  const [adminNote, setAdminNote] = useState('');
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [outcomeSuccess, setOutcomeSuccess] = useState<string | null>(null);

  // Message reply states
  const [replyBody, setReplyBody] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);

  // Lightbox for proof inspection
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState<string | null>(null);

  const isResolved = ['resolved_for_reader', 'resolved_for_writer', 'closed'].includes(dispute.status);

  // Fetch temporary signed URL for private proofs
  const handleInspectProof = async (path: string) => {
    try {
      setLoadingProof(path);
      const res = await fetch(`/api/proofs/signed-url?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok && data.url) {
        setLightboxUrl(data.url);
      } else {
        alert(data.error || 'Failed to generate secure preview link for receipt.');
      }
    } catch {
      alert('Network error while requesting signed proof URL.');
    } finally {
      setLoadingProof(null);
    }
  };

  // Submit outcome adjudication
  const handleExecuteOutcome = () => {
    if (!adminNote.trim()) {
      setOutcomeError('A detailed administrative justification note is mandatory.');
      return;
    }

    setOutcomeError(null);
    startTransition(async () => {
      let res;
      if (selectedOutcome === 'verify_reader') {
        res = await resolveDisputeVerifyAction(dispute.id, adminNote);
      } else if (selectedOutcome === 'refund_adjustment') {
        res = await resolveDisputeRefundAction(dispute.id, adminNote);
      } else if (selectedOutcome === 'resolve_writer') {
        res = await resolveDisputeForWriterAction(dispute.id, adminNote);
      } else if (selectedOutcome === 'close_dispute') {
        res = await closeDisputeAction(dispute.id, adminNote);
      }

      if (res && !res.success) {
        setOutcomeError(res.error || 'Failed to execute adjudication.');
      } else if (res && res.success) {
        setOutcomeSuccess(res.message || 'Adjudication executed successfully.');
        setSelectedOutcome(null);
        setAdminNote('');
        router.refresh();
      }
    });
  };

  // Send message to thread
  const handlePostReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;

    setReplyError(null);
    startTransition(async () => {
      const res = await addDisputeMessageAction(dispute.id, replyBody, null);
      if (!res.success) {
        setReplyError(res.error || 'Failed to post administrative message.');
      } else {
        setReplyBody('');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Back button and title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <Link
            href="/admin/disputes"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-main transition-colors mb-2 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Disputes Queue</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-serif font-bold text-main tracking-tight">
              Adjudicate Dispute #{dispute.id.slice(0, 8)}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                statusMeta.variant === 'warning'
                  ? 'bg-warning-soft text-warning-text border border-warning-border'
                  : statusMeta.variant === 'success'
                  ? 'bg-success-soft text-success-text border border-success-border'
                  : statusMeta.variant === 'destructive'
                  ? 'bg-danger-soft text-danger-text border border-danger-border'
                  : 'bg-surface-muted text-muted border border-border'
              }`}
            >
              {statusMeta.label}
            </span>
            <span className="text-xs text-muted font-urdu">{statusMeta.urduLabel}</span>
          </div>
        </div>

        {/* Action button summary */}
        {!isResolved && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-warning-text font-medium flex items-center gap-1.5 bg-warning-soft border border-warning-border px-3 py-1.5 rounded-lg shadow-sm">
              <AlertTriangle className="w-4 h-4 text-accent-strong" />
              <span>Awaiting Administrative Ruling</span>
            </span>
          </div>
        )}
      </div>

      {outcomeSuccess && (
        <div className="p-4 rounded-xl bg-success-soft border border-success-border text-success-text text-xs flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
          <span>{outcomeSuccess}</span>
        </div>
      )}

      {/* Two Column Layout: Left Column Details & Proofs, Right Column Ruling Actions & Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (1/3) */}
        <div className="space-y-6">
          {/* Order Details Card */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-4 shadow-card">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs font-bold text-muted uppercase tracking-wider">
                Order Snapshot
              </span>
              <Link
                href={`/admin/orders?search=${encodeURIComponent(order.order_number)}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-[11px] text-accent-admin hover:text-accent-admin-dark font-medium"
              >
                <span>Full Order</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Order Number:</span>
                <span className="font-mono font-bold text-main">#{order.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Novel:</span>
                <span className="font-medium text-main line-clamp-1">{order.novel_title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Amount:</span>
                <span className="font-mono font-bold text-accent-admin">
                  {formatPKR(order.amount_pkr)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Current Order Status:</span>
                <span className="font-mono font-semibold text-main uppercase text-[11px]">
                  {order.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Reader:</span>
                <span className="text-main font-medium">{order.reader_display_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Author:</span>
                <span className="text-main font-medium">
                  {order.writer_pen_name} ({order.writer_pen_name_urdu})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Created:</span>
                <span className="text-muted font-mono text-[11px]">
                  {new Date(order.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Dispute Context Card */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-3 shadow-card">
            <span className="text-xs font-bold text-muted uppercase tracking-wider block border-b border-border pb-2">
              Dispute Reason
            </span>
            <p className="text-xs text-main italic leading-relaxed bg-surface-muted p-3 rounded-xl border border-border">
              &quot;{dispute.reason}&quot;
            </p>

            {dispute.resolution_note && (
              <div className="space-y-1 pt-2 border-t border-border">
                <span className="text-[11px] font-bold text-muted">Resolution Note:</span>
                <p className="text-xs text-main bg-surface-muted p-2.5 rounded-xl border border-border">
                  {dispute.resolution_note}
                </p>
                {dispute.resolved_at && (
                  <span className="text-[10px] text-muted font-mono block">
                    Resolved at: {new Date(dispute.resolved_at).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Payment Proofs Submissions */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-3 shadow-card">
            <span className="text-xs font-bold text-muted uppercase tracking-wider block border-b border-border pb-2">
              Payment Deposit Submissions ({submissions.length})
            </span>

            {submissions.length === 0 ? (
              <p className="text-xs text-muted italic">No deposit submissions on record.</p>
            ) : (
              <div className="space-y-3">
                {submissions.map((sub, idx) => (
                  <div
                    key={sub.id}
                    className="p-3 bg-surface-muted rounded-xl border border-border text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-border pb-1.5">
                      <span className="font-bold text-main">Submission #{idx + 1}</span>
                      <span className="text-[10px] text-muted font-mono">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted">TID Reference:</span>
                        <span className="font-mono font-bold text-accent-admin">
                          {sub.transaction_reference_tid}
                        </span>
                      </div>
                      {sub.sender_account_name && (
                        <div className="flex justify-between">
                          <span className="text-muted">Sender:</span>
                          <span className="text-main font-medium">{sub.sender_account_name}</span>
                        </div>
                      )}
                      {sub.paid_amount_claimed_pkr && (
                        <div className="flex justify-between">
                          <span className="text-muted">Claimed Amount:</span>
                          <span className="font-mono text-main">
                            {formatPKR(sub.paid_amount_claimed_pkr)}
                          </span>
                        </div>
                      )}
                      {sub.reader_note && (
                        <div className="text-[11px] text-muted italic pt-1">
                          Note: &quot;{sub.reader_note}&quot;
                        </div>
                      )}
                    </div>

                    {sub.screenshot_url && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleInspectProof(sub.screenshot_url)}
                          disabled={loadingProof === sub.screenshot_url}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-muted text-main border border-border rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
                        >
                          {loadingProof === sub.screenshot_url ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-admin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5 text-accent-admin" />
                          )}
                          <span>Inspect Receipt Image</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Adjudication Outcome Actions Card */}
          <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-card">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Scale className="w-5 h-5 text-accent-admin" />
              <div>
                <h2 className="text-sm font-bold text-main font-serif">Administrative Adjudication Ruling</h2>
                <p className="text-[11px] text-muted">
                  Select an authoritative ruling. All actions write immutable audit records.
                </p>
              </div>
            </div>

            {isResolved ? (
              <div className="p-4 rounded-xl bg-surface-muted border border-border text-xs space-y-1">
                <span className="font-bold text-main">Dispute is Finalized</span>
                <p className="text-muted">
                  This dispute has already been adjudicated with status &apos;{dispute.status}&apos;. No further outcome changes can be applied.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Outcome A: Verify for Reader */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOutcome('verify_reader');
                    setOutcomeError(null);
                  }}
                  className="p-4 rounded-xl border border-success-border bg-success-soft/50 hover:bg-success-soft text-left transition-all group cursor-pointer space-y-1.5 shadow-sm"
                >
                  <div className="flex items-center gap-2 text-success-text font-bold text-xs">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <span>A. Verify for Reader</span>
                  </div>
                  <p className="text-[11px] text-success-text leading-relaxed">
                    Deposit verified real. Grants novel access, logs sales ledger sale, and accrues author commission.
                  </p>
                </button>

                {/* Outcome B: Refund Adjustment */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOutcome('refund_adjustment');
                    setOutcomeError(null);
                  }}
                  className="p-4 rounded-xl border border-info-border bg-info-soft/50 hover:bg-info-soft text-left transition-all group cursor-pointer space-y-1.5 shadow-sm"
                >
                  <div className="flex items-center gap-2 text-info-text font-bold text-xs">
                    <RotateCcw className="w-4 h-4 text-info-text" />
                    <span>B. Refund Adjustment</span>
                  </div>
                  <p className="text-[11px] text-info-text leading-relaxed">
                    Author returned funds off-platform. Logs negative sales ledger adjustment and revokes access.
                  </p>
                </button>

                {/* Outcome C: Resolve for Writer */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOutcome('resolve_writer');
                    setOutcomeError(null);
                  }}
                  className="p-4 rounded-xl border border-border bg-surface hover:bg-surface-muted text-left transition-all group cursor-pointer space-y-1.5 shadow-sm"
                >
                  <div className="flex items-center gap-2 text-main font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-muted" />
                    <span>C. Resolve for Writer</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Payment not verified or fraudulent. Order remains unchanged with zero ledger mutation.
                  </p>
                </button>

                {/* Outcome D: Dismiss / Close */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOutcome('close_dispute');
                    setOutcomeError(null);
                  }}
                  className="p-4 rounded-xl border border-border bg-surface hover:bg-surface-muted text-left transition-all group cursor-pointer space-y-1.5 shadow-sm"
                >
                  <div className="flex items-center gap-2 text-muted font-bold text-xs">
                    <XCircle className="w-4 h-4 text-muted" />
                    <span>D. Close Dispute</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Dismisses dispute thread without outcome changes or entitlement alterations.
                  </p>
                </button>
              </div>
            )}
          </div>

          {/* Discussion Thread */}
          <div className="rounded-2xl border border-border bg-surface p-6 space-y-6 shadow-card">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-main font-serif flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted" />
                <span>Investigation Messages ({messages.length})</span>
              </h2>
              <span className="text-[10px] text-muted">
                Immutable chronological log
              </span>
            </div>

            {/* Messages Listing */}
            <div className="space-y-4">
              {messages.length === 0 ? (
                <p className="text-xs text-muted text-center py-4 italic">
                  No messages exchanged on this dispute.
                </p>
              ) : (
                messages.map((msg) => {
                  const isAdmin = msg.author_role === 'admin';
                  const isWriter = msg.author_role === 'writer';
                  return (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-xl text-xs space-y-2 border ${
                        isAdmin
                          ? 'bg-info-soft/70 border-info-border text-text'
                          : isWriter
                          ? 'bg-warning-soft/60 border-warning-border text-warning-text'
                          : 'bg-surface-muted border-border text-main'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${
                              isAdmin
                                ? 'text-accent-admin'
                                : isWriter
                                ? 'text-warning-text'
                                : 'text-main'
                            }`}
                          >
                            {msg.author_name}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                              isAdmin
                                ? 'bg-accent-admin/10 text-accent-admin border border-accent-admin/20'
                                : isWriter
                                ? 'bg-warning-soft text-warning-text border border-warning-border'
                                : 'bg-surface text-muted border border-border'
                            }`}
                          >
                            {msg.author_role}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted font-mono">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>

                      <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>

                      {msg.attachment_path && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleInspectProof(msg.attachment_path!)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-muted text-accent-admin text-[11px] font-semibold border border-border transition-colors shadow-sm"
                          >
                            <Eye className="w-3 h-3 text-accent-admin" />
                            <span>View Attachment</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Post Admin Reply Form */}
            {!isResolved && (
              <form onSubmit={handlePostReply} className="space-y-3 pt-4 border-t border-border">
                <span className="text-xs font-bold text-main">
                  Post Administrative Message / Inquiry
                </span>

                {replyError && (
                  <div className="p-3 rounded-lg bg-danger-soft border border-danger-border text-danger-text text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-danger-text" />
                    <span>{replyError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Enter official inquiry or administrative instruction to reader or author..."
                    className="w-full bg-surface border border-border text-main text-xs p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-ring-admin focus:border-accent-admin resize-y"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isPending || !replyBody.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-accent-admin hover:bg-accent-admin-dark text-white font-bold text-xs rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Post Admin Message</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Adjudication Outcome Confirmation Modal */}
      {selectedOutcome && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-main font-serif">
                <Scale className="w-4 h-4 text-accent-admin" />
                <span>
                  Confirm Adjudication:{' '}
                  {selectedOutcome === 'verify_reader'
                    ? 'Verify for Reader (Access + Platform Fee)'
                    : selectedOutcome === 'refund_adjustment'
                    ? 'Refund Adjustment (Ledger - & Revoke)'
                    : selectedOutcome === 'resolve_writer'
                    ? 'Resolve for Writer (Dismiss Claim)'
                    : 'Close Dispute Thread'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOutcome(null)}
                className="text-muted hover:text-main"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Financial Warning Callout */}
            <div
              className={`p-3.5 rounded-xl text-xs space-y-1.5 border ${
                selectedOutcome === 'verify_reader'
                  ? 'bg-success-soft border-success-border text-success-text'
                  : selectedOutcome === 'refund_adjustment'
                  ? 'bg-info-soft border-info-border text-info-text'
                  : 'bg-warning-soft border-warning-border text-warning-text'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Authoritative Financial &amp; Entitlement Impact</span>
              </div>
              <p className="leading-relaxed">
                {selectedOutcome === 'verify_reader' &&
                  'This action will grant reading access to the reader, append a verified sale to the immutable sales ledger, and accrue platform fee against the writer. This cannot be undone.'}
                {selectedOutcome === 'refund_adjustment' &&
                  'This action records an append-only negative refund_adjustment row in sales ledger, revokes the reader access entitlement, and reduces platform fee debt. The platform does NOT handle bank cash.'}
                {selectedOutcome === 'resolve_writer' &&
                  'This action confirms the payment was not received or unverified. No financial ledger changes are made and the order remains rejected.'}
                {selectedOutcome === 'close_dispute' &&
                  'This action closes the dispute without modifying any entitlements or ledger transactions.'}
              </p>
            </div>

            {outcomeError && (
              <div className="p-3 rounded-lg bg-danger-soft border border-danger-border text-danger-text text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-danger-text" />
                <span>{outcomeError}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-bold text-main">
                Administrative Justification Note <span className="text-danger-text">*</span>
              </label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="State the verifiable reason, bank confirmation reference, or policy justification..."
                className="w-full bg-surface border border-border text-main text-xs p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-ring-admin focus:border-accent-admin resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedOutcome(null)}
                disabled={isPending}
                className="px-4 py-2 bg-surface hover:bg-surface-muted text-muted hover:text-main border border-border text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteOutcome}
                disabled={isPending || !adminNote.trim()}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
                  selectedOutcome === 'verify_reader'
                    ? 'bg-success hover:bg-success-hover text-white'
                    : selectedOutcome === 'refund_adjustment'
                    ? 'bg-info hover:bg-info/90 text-white'
                    : selectedOutcome === 'resolve_writer'
                    ? 'bg-warning hover:bg-primary text-white'
                    : 'bg-danger hover:bg-danger-hover text-white'
                } disabled:opacity-50 shadow-sm`}
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm &amp; Execute Ruling</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Lightbox Modal */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-3xl flex justify-end pb-2">
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="p-2 bg-surface rounded-full text-main hover:bg-surface-muted border border-border transition-colors shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="max-w-3xl max-h-[85vh] overflow-auto bg-surface p-2 rounded-2xl border border-border shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Payment deposit receipt proof"
              className="max-h-[80vh] w-auto mx-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
