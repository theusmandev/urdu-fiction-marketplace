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
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href={caller_role === 'writer' ? '/writer/disputes' : '/disputes'}
            className="inline-flex items-center gap-2 text-xs font-semibold text-stone-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Disputes / واپسی</span>
          </Link>
        </div>

        {/* Dispute Header Card */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-amber-400">
                  Order #{order.order_number}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    statusMeta.variant === 'warning'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : statusMeta.variant === 'success'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : statusMeta.variant === 'destructive'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-stone-800 text-stone-300 border border-stone-700'
                  }`}
                >
                  {statusMeta.label}
                </span>
                <span className="text-xs text-stone-400 font-urdu">{statusMeta.urduLabel}</span>
              </div>
              <h1 className="text-lg font-bold text-white">{order.novel_title}</h1>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs text-stone-400 block">Total Order Amount</span>
              <span className="text-base font-bold font-mono text-amber-400">
                {formatPKR(order.amount_pkr)}
              </span>
            </div>
          </div>

          {/* Participant Metas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-stone-300 pt-1">
            <div className="bg-stone-950/60 p-3 rounded-xl border border-stone-800/80">
              <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">
                Reader / خریدار
              </span>
              <span className="font-semibold text-white mt-0.5 block">{order.reader_display_name}</span>
            </div>

            <div className="bg-stone-950/60 p-3 rounded-xl border border-stone-800/80">
              <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">
                Author / مصنف
              </span>
              <span className="font-semibold text-white mt-0.5 block">
                {order.writer_pen_name}{' '}
                {order.writer_pen_name_urdu && (
                  <span className="font-urdu text-stone-400 text-xs">({order.writer_pen_name_urdu})</span>
                )}
              </span>
            </div>

            <div className="bg-stone-950/60 p-3 rounded-xl border border-stone-800/80">
              <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">
                Disputed At
              </span>
              <span className="font-mono text-stone-300 mt-0.5 block">
                {new Date(dispute.created_at).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Dispute Reason Snapshot */}
          <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl text-xs space-y-1">
            <span className="text-amber-300 font-bold block">Dispute Statement:</span>
            <p className="text-stone-200 leading-relaxed">&quot;{dispute.reason}&quot;</p>
          </div>

          {/* Status Resolution Banner */}
          {dispute.resolution_note && (
            <div
              className={`p-4 rounded-xl text-xs space-y-1.5 border ${
                dispute.status === 'resolved_for_reader'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : dispute.status === 'resolved_for_writer'
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                  : 'bg-stone-950 border-stone-800 text-stone-300'
              }`}
            >
              <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[11px]">
                {dispute.status === 'resolved_for_reader' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-sky-400" />
                )}
                <span>Administrative Resolution Outcome</span>
              </div>
              <p className="leading-relaxed">{dispute.resolution_note}</p>
              {dispute.resolved_at && (
                <span className="text-[10px] text-stone-400 block pt-1">
                  Resolved on {new Date(dispute.resolved_at).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Payment Proofs Snapshot Section */}
        {submissions.length > 0 && (
          <div className="rounded-2xl bg-stone-900 border border-stone-800 p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Payment Deposit Evidence on Record
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {submissions.map((sub, idx) => (
                <div
                  key={sub.id}
                  className="bg-stone-950 p-3.5 rounded-xl border border-stone-800 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-stone-800/60 pb-2">
                    <span className="font-bold text-white">Submission #{idx + 1}</span>
                    <span className="font-mono text-stone-400 text-[11px]">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Claimed TID:</span>
                      <span className="font-mono font-bold text-amber-400">
                        {sub.transaction_reference_tid}
                      </span>
                    </div>
                    {sub.sender_account_name && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Sender Name:</span>
                        <span className="text-stone-300">{sub.sender_account_name}</span>
                      </div>
                    )}
                    {sub.reader_note && (
                      <div className="text-[11px] text-stone-400 italic pt-1">
                        &quot;{sub.reader_note}&quot;
                      </div>
                    )}
                  </div>

                  {sub.screenshot_url && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProofUrl(sub.screenshot_url)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-300 bg-stone-900 hover:bg-stone-800 border border-stone-700 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-400" />
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
        <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-stone-800 pb-4">
            <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Discussion &amp; Investigation Thread ({messages.length})</span>
            </h2>
            <span className="text-[11px] text-stone-500">
              Only participants &amp; admin can see this thread
            </span>
          </div>

          {/* Messages Listing */}
          <div className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-xs text-stone-400 italic text-center py-4">
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
                        ? 'bg-purple-950/30 border-purple-800/50'
                        : isWriter
                        ? 'bg-amber-950/20 border-amber-800/40'
                        : 'bg-stone-950 border-stone-800'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-stone-800/50 pb-2">
                      <div className="flex items-center gap-2">
                        {isAdmin ? (
                          <Shield className="w-4 h-4 text-purple-400" />
                        ) : (
                          <User className="w-4 h-4 text-stone-400" />
                        )}
                        <span className="font-bold text-xs text-white">{msg.author_name}</span>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isAdmin
                              ? 'bg-purple-500/20 text-purple-300'
                              : isWriter
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-stone-800 text-stone-400'
                          }`}
                        >
                          {msg.author_role}
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-500 font-mono">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-stone-200 leading-relaxed whitespace-pre-wrap">
                      {msg.body}
                    </p>

                    {msg.attachment_path && (
                      <div className="pt-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 bg-stone-900 px-3 py-1.5 rounded-lg border border-stone-800">
                          <Paperclip className="w-3.5 h-3.5" />
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
            <form onSubmit={handleSendMessage} className="pt-4 border-t border-stone-800 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-300">
                    Add Response / Submit Evidence
                  </label>
                  <span className="text-[10px] text-stone-500 font-mono">
                    {messageBody.length} / 2000 chars (Max 20/hr)
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Provide clarification, bank transaction remarks, or additional verification details..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>

              {/* Attachment upload toggle */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowUploader(!showUploader)}
                  className="text-xs text-stone-400 hover:text-amber-400 transition-colors flex items-center gap-1.5"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>
                    {showUploader ? 'Hide Attachment Uploader' : 'Attach Additional Evidence / Proof'}
                  </span>
                </button>

                {showUploader && (
                  <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-stone-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
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
            <div className="pt-4 border-t border-stone-800 text-center py-4">
              <span className="text-xs text-stone-400 italic">
                This dispute has been concluded and the discussion thread is closed to new messages.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Modal for viewing full proof screenshot */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-2xl w-full bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-2xl space-y-4 p-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <h3 className="text-sm font-bold text-white">Payment Receipt Proof</h3>
              <button
                type="button"
                onClick={() => setSelectedProofUrl(null)}
                className="text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-stone-950 rounded-xl p-2">
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
