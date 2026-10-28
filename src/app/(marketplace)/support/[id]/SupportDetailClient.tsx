'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addSupportMessageAction, closeSupportRequestAction } from '@/app/actions/support';
import { getSupportStatusMeta } from '@/lib/disputes/status-meta';
import type { SupportRequestDetailPayload } from '@/types/database';
import {
  ArrowLeft,
  Send,
  Clock,
  User,
  Shield,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface SupportDetailClientProps {
  payload: SupportRequestDetailPayload;
}

export function SupportDetailClient({ payload }: SupportDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { request, messages } = payload;
  const statusMeta = getSupportStatusMeta(request.status);

  const [replyBody, setReplyBody] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isClosed = request.status === 'closed';

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await addSupportMessageAction(request.id, replyBody);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to post reply.');
      } else {
        setReplyBody('');
        router.refresh();
      }
    });
  };

  const handleCloseTicket = async () => {
    if (!confirm('Are you sure you want to close this support ticket?')) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await closeSupportRequestAction(request.id);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to close ticket.');
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="min-h-screen bg-ivory text-main py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation */}
        <div>
          <Link
            href="/support"
            className="inline-flex items-center gap-2 text-xs font-semibold text-secondary hover:text-navy transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Support Desk</span>
          </Link>
        </div>

        {/* Ticket Header Card */}
        <div className="rounded-2xl bg-surface border border-border p-6 space-y-4 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-surface-muted text-text border border-border">
                  {request.category}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    statusMeta.variant === 'warning'
                      ? 'bg-warning-soft text-warning-text border border-warning-border'
                      : statusMeta.variant === 'success'
                      ? 'bg-success-soft text-success-text border border-success-border'
                      : 'bg-surface-muted text-text-muted border border-border'
                  }`}
                >
                  {statusMeta.label}
                </span>
              </div>
              <h1 className="text-lg font-bold font-serif text-navy">{request.subject}</h1>
              {request.order_number && (
                <span className="text-xs font-mono text-accent-strong block">
                  Related to Order #{request.order_number}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {!isClosed && (
                <button
                  type="button"
                  onClick={handleCloseTicket}
                  disabled={isPending}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy bg-surface hover:bg-surface-muted border border-border shadow-sm transition-colors cursor-pointer min-h-[44px] inline-flex items-center"
                >
                  Mark as Resolved / Close
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-secondary">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-text-muted" />
              <span>Created {new Date(request.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="rounded-2xl bg-surface border border-border p-6 space-y-6 shadow-card">
          <div className="border-b border-border pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-secondary">
              Support Thread ({messages.length} messages)
            </h2>
          </div>

          <div className="space-y-4">
            {messages.map((msg) => {
              const isAdmin = msg.author_role === 'admin';
              return (
                <div
                  key={msg.id}
                  className={`rounded-2xl p-4 space-y-2 border ${
                    isAdmin
                      ? 'bg-info-soft/70 border-info-border'
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
                      {isAdmin && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-info-soft text-info-text">
                          Support Team
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-secondary font-mono">
                      {new Date(msg.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-main leading-relaxed whitespace-pre-wrap">
                    {msg.body}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Reply Form */}
          {!isClosed ? (
            <form onSubmit={handleSendReply} className="pt-4 border-t border-border space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-danger-soft border border-danger-border text-danger-text text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-danger-text" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-navy">
                    Your Reply
                  </label>
                  <span className="text-[10px] text-secondary font-mono">
                    {replyBody.length} / 2000 chars
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type your reply here..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-base sm:text-xs text-main placeholder-secondary focus:outline-none focus:border-border focus:ring-1 focus:ring-brand-gold leading-relaxed"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPending || !replyBody.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-navy bg-accent hover:bg-accent-hover disabled:opacity-50 transition-all shadow-sm cursor-pointer min-h-[44px] w-full sm:w-auto"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Reply</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="pt-4 border-t border-border text-center py-4">
              <span className="text-xs text-secondary italic">
                This ticket has been marked as closed.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
