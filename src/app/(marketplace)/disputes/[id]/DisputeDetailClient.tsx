'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addDisputeMessageAction } from '@/app/actions/disputes';
import { getDisputeStatusMeta, mapDisputeErrorMessage } from '@/lib/disputes/status-meta';
import { ImageUploader } from '@/components/ui/image-uploader';
import { formatPKR } from '@/lib/utils';
import type { DisputeDetailPayload } from '@/types/database';
import {
  ArrowLeft,
  ShieldAlert,
  Send,
  Paperclip,
  CheckCircle2,
  User,
  Shield,
  Loader2,
  Eye,
  X,
  AlertCircle,
} from 'lucide-react';

interface DisputeDetailClientProps {
  payload: DisputeDetailPayload;
  currentUserId?: string;
}

export function DisputeDetailClient({ payload }: DisputeDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { dispute, order, messages, submissions, caller_role } = payload;
  const statusMeta = getDisputeStatusMeta(dispute.status);

  // Form states
  const [messageBody, setMessageBody] = useState('');
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  const isClosed = ['resolved_for_reader', 'resolved_for_writer', 'closed'].includes(dispute.status);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageBody.trim()) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await addDisputeMessageAction(dispute.id, messageBody, attachmentPath);
      if (!res.success) {
        setErrorMsg(mapDisputeErrorMessage(res.error || 'Failed to post message.'));
      } else {
        setMessageBody('');
        setAttachmentPath(null);
        setShowUploader(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="min-h-screen bg-ivory text-main py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href={caller_role === 'writer' ? '/writer/disputes' : '/disputes'}
            className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-navy transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Disputes / واپسی</span>
          </Link>
        </div>

        {/* Dispute Header Card */}
        <div className="rounded-2xl bg-surface border border-border p-6 space-y-4 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-accent-strong">
                  Order #{order.order_number}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    statusMeta.variant === 'warning'
                      ? 'bg-warning-soft text-warning-text border border-warning-border'
                      : statusMeta.variant === 'success'
                      ? 'bg-success-soft text-success-text border border-success-border'
                      : statusMeta.variant === 'destructive'
                      ? 'bg-danger-soft text-danger-text border border-danger-border'
                      : 'bg-surface-muted text-text border border-border'
                  }`}
                >
                  {statusMeta.label}
                </span>
                <span className="text-xs text-secondary font-urdu">{statusMeta.urduLabel}</span>
              </div>
              <h1 className="text-lg font-bold font-serif text-navy">{order.novel_title}</h1>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs text-secondary block">Total Order Amount</span>
              <span className="text-base font-bold font-mono text-navy">
                {formatPKR(order.amount_pkr)}
              </span>
            </div>
          </div>

          {/* Participant Metas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-secondary pt-1">
            <div className="bg-surface-muted p-3 rounded-xl border border-border">
              <span className="text-secondary block text-[10px] uppercase font-bold tracking-wider">
                Reader / خریدار
              </span>
              <span className="font-semibold text-navy mt-0.5 block">{order.reader_display_name}</span>
            </div>

            <div className="bg-surface-muted p-3 rounded-xl border border-border">
              <span className="text-secondary block text-[10px] uppercase font-bold tracking-wider">
                Author / مصنف
              </span>
              <span className="font-semibold text-navy mt-0.5 block">
                {order.writer_pen_name}{' '}
                {order.writer_pen_name_urdu && (
                  <span className="font-urdu text-secondary text-xs">({order.writer_pen_name_urdu})</span>
                )}
              </span>
            </div>

            <div className="bg-surface-muted p-3 rounded-xl border border-border">
              <span className="text-secondary block text-[10px] uppercase font-bold tracking-wider">
                Disputed At
              </span>
              <span className="font-mono text-secondary mt-0.5 block">
                {new Date(dispute.created_at).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Dispute Reason Snapshot */}
          <div className="bg-warning-soft border border-warning-border p-3.5 rounded-xl text-xs space-y-1">
            <span className="text-warning-text font-bold block">Dispute Statement:</span>
            <p className="text-warning-text leading-relaxed">&quot;{dispute.reason}&quot;</p>
          </div>

          {/* Status Resolution Banner */}
          {dispute.resolution_note && (
            <div
              className={`p-4 rounded-xl text-xs space-y-1.5 border ${
                dispute.status === 'resolved_for_reader'
                  ? 'bg-success-soft border-success-border text-success-text'
                  : dispute.status === 'resolved_for_writer'
                  ? 'bg-info-soft border-info-border text-info-text'
                  : 'bg-surface-muted border-border text-main'
              }`}
            >
              <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px]">
                {dispute.status === 'resolved_for_reader' ? (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-info-text" />
                )}
                <span>Administrative Resolution Outcome</span>
              </div>
              <p className="leading-relaxed">{dispute.resolution_note}</p>
              {dispute.resolved_at && (
                <span className="text-[10px] text-secondary block pt-1">
                  Resolved on {new Date(dispute.resolved_at).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Payment Proofs Snapshot Section */}
        {submissions.length > 0 && (
          <div className="rounded-2xl bg-surface border border-border p-5 space-y-3 shadow-card">
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
              Payment Deposit Evidence on Record
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {submissions.map((sub, idx) => (
                <div
                  key={sub.id}
                  className="bg-surface-muted p-3.5 rounded-xl border border-border text-xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-bold text-navy">Submission #{idx + 1}</span>
                    <span className="font-mono text-secondary text-[11px]">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-secondary">Claimed TID:</span>
                      <span className="font-mono font-bold text-accent-strong">
                        {sub.transaction_reference_tid}
                      </span>
                    </div>
                    {sub.sender_account_name && (
                      <div className="flex justify-between">
                        <span className="text-secondary">Sender Name:</span>
                        <span className="text-text">{sub.sender_account_name}</span>
                      </div>
                    )}
                    {sub.reader_note && (
                      <div className="text-[11px] text-secondary italic pt-1">
                        &quot;{sub.reader_note}&quot;
                      </div>
                    )}
                  </div>

                  {sub.screenshot_url && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProofUrl(sub.screenshot_url)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-navy bg-surface hover:bg-surface-muted border border-border shadow-sm transition-colors cursor-pointer min-h-[44px]"
                      >
                        <Eye className="w-3.5 h-3.5 text-accent-strong" />
                        <span>Inspect Receipt Screenshot</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discussion Thread */}
        <div className="rounded-2xl bg-surface border border-border p-6 space-y-6 shadow-card">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h2 className="text-sm font-bold tracking-tight text-navy flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-accent-strong" />
              <span>Discussion &amp; Investigation Thread ({messages.length})</span>
            </h2>
            <span className="text-[11px] text-secondary">
              Only participants &amp; admin can see this thread
            </span>
          </div>

          {/* Messages Listing */}
          <div className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-xs text-secondary italic text-center py-4">
                No messages have been posted yet. You can submit additional evidence below.
              </p>
            ) : (
              messages.map((msg) => {
                const isAdmin = msg.author_role === 'admin';
                const isWriter = msg.author_role === 'writer';
                return (
                  <div
                    key={msg.id}
                    className={`rounded-2xl p-4 space-y-2 border ${
                      isAdmin
                        ? 'bg-info-soft/70 border-info-border'
                        : isWriter
                        ? 'bg-warning-soft/70 border-warning-border'
                        : 'bg-surface-muted border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <div className="flex items-center gap-2">
                        {isAdmin ? (
                          <Shield className="w-4 h-4 text-info-text" />
                        ) : (
                          <User className="w-4 h-4 text-text-muted" />
                        )}
                        <span className="font-bold text-xs text-navy">{msg.author_name}</span>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isAdmin
                              ? 'bg-info-soft text-info-text'
                              : isWriter
                              ? 'bg-warning-soft text-warning-text'
                              : 'bg-border text-text'
                          }`}
                        >
                          {msg.author_role}
                        </span>
                      </div>
                      <span className="text-[10px] text-secondary font-mono">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-main leading-relaxed whitespace-pre-wrap">
                      {msg.body}
                    </p>

                    {msg.attachment_path && (
                      <div className="pt-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-navy bg-surface px-3 py-1.5 rounded-lg border border-border shadow-sm">
                          <Paperclip className="w-3.5 h-3.5 text-accent-strong" />
                          <span>Attachment: {msg.attachment_path.split('/').pop()}</span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Reply Form (If dispute is open or under_review) */}
          {!isClosed ? (
            <form onSubmit={handleSendMessage} className="pt-4 border-t border-border space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-danger-soft border border-danger-border text-danger-text text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-danger-text" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-navy">
                    Add Response / Submit Evidence
                  </label>
                  <span className="text-[10px] text-secondary font-mono">
                    {messageBody.length} / 2000 chars (Max 20/hr)
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Provide clarification, bank transaction remarks, or additional verification details..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-base sm:text-xs text-main placeholder:text-secondary focus:outline-none focus:border-border focus:ring-1 focus:ring-brand-gold leading-relaxed"
                />
              </div>

              {/* Attachment upload toggle */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowUploader(!showUploader)}
                  className="text-xs text-secondary hover:text-navy transition-colors flex items-center gap-1.5 cursor-pointer py-1.5 min-h-[44px]"
                >
                  <Paperclip className="w-3.5 h-3.5 text-accent-strong" />
                  <span>
                    {showUploader ? 'Hide Attachment Uploader' : 'Attach Additional Evidence / Proof'}
                  </span>
                </button>

                {showUploader && (
                  <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-2">
                    <ImageUploader
                      bucket="payment-proofs"
                      preset="payment-screenshot"
                      folder={dispute.id}
                      value={attachmentPath}
                      onChange={(path) => setAttachmentPath(path)}
                      disabled={isPending}
                      helperText="Upload supporting bank screenshot or proof under this dispute folder."
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isPending || !messageBody.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-navy bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer min-h-[44px] w-full sm:w-auto"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Posting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Post Message</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="pt-4 border-t border-border text-center py-4">
              <span className="text-xs text-secondary italic">
                This dispute has been concluded and the discussion thread is closed to new messages.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Modal for viewing full proof screenshot */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-2xl w-full bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl space-y-4 p-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-sm font-bold text-navy">Payment Receipt Proof</h3>
              <button
                type="button"
                onClick={() => setSelectedProofUrl(null)}
                className="text-secondary hover:text-navy cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-surface-muted rounded-xl p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedProofUrl}
                alt="Payment Proof Receipt"
                className="max-h-[65vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
