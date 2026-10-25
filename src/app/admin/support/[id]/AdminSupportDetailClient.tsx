'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminReplySupportRequestAction } from '@/app/actions/admin-disputes';
import { closeSupportRequestAction } from '@/app/actions/support';
import { getSupportStatusMeta } from '@/lib/disputes/status-meta';
import type { SupportRequestDetailPayload } from '@/types/database';
import {
  ArrowLeft,
  LifeBuoy,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface AdminSupportDetailClientProps {
  payload: SupportRequestDetailPayload;
}

export function AdminSupportDetailClient({ payload }: AdminSupportDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { request, messages } = payload;
  const statusMeta = getSupportStatusMeta(request.status);

  const [replyBody, setReplyBody] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const isClosed = request.status === 'closed';

  const handlePostReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await adminReplySupportRequestAction(request.id, replyBody);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Failed to post reply.' });
      } else {
        setFeedback({ type: 'success', message: 'Reply sent to user.' });
        setReplyBody('');
        router.refresh();
      }
    });
  };

  const handleCloseTicket = () => {
    if (!confirm('Are you sure you want to mark this support ticket as closed?')) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await closeSupportRequestAction(request.id);
      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Failed to close ticket.' });
      } else {
        setFeedback({ type: 'success', message: 'Ticket marked as closed.' });
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Back button and Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <Link
            href="/admin/support"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-main transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Support Queue</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-main tracking-tight">
              Ticket #{request.id.slice(0, 8)}: {request.subject}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                statusMeta.variant === 'warning'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : statusMeta.variant === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-stone-100 text-stone-600 border-stone-200'
              }`}
            >
              {statusMeta.label}
            </span>
            <span className="text-xs text-brand-gold font-urdu">{statusMeta.urduLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isClosed && (
            <button
              type="button"
              onClick={handleCloseTicket}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-main bg-surface-muted hover:bg-surface border border-border transition-colors shadow-sm"
            >
              <XCircle className="w-3.5 h-3.5 text-muted" />
              <span>Close Ticket</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border border-rose-200 text-rose-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Ticket Metadata Bar */}
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-wrap items-center gap-6 text-xs text-main shadow-card">
        <div>
          <span className="text-muted block text-[10px] uppercase font-mono">User</span>
          <span className="font-semibold text-main">{request.user_name}</span>
        </div>
        <div>
          <span className="text-muted block text-[10px] uppercase font-mono">Category</span>
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-muted text-accent-admin border border-border">
            {request.category}
          </span>
        </div>
        {request.order_number && (
          <div>
            <span className="text-muted block text-[10px] uppercase font-mono">Order Reference</span>
            <Link
              href={`/admin/orders?search=${encodeURIComponent(request.order_number)}`}
              target="_blank"
              className="font-mono font-bold text-brand-gold hover:underline inline-flex items-center gap-1"
            >
              <span>#{request.order_number}</span>
              <ExternalLink className="w-3 h-3 text-muted" />
            </Link>
          </div>
        )}
        <div>
          <span className="text-muted block text-[10px] uppercase font-mono">Created</span>
          <span className="font-mono text-muted text-[11px]">
            {new Date(request.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="rounded-xl border border-border bg-surface p-6 space-y-6 shadow-card">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-sm font-bold text-main flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-accent-admin" />
            <span>Conversation Thread ({messages.length})</span>
          </h2>
        </div>

        <div className="space-y-4">
          {messages.map((msg) => {
            const isAdmin = msg.author_role === 'admin';
            return (
              <div
                key={msg.id}
                className={`p-4 rounded-xl text-xs space-y-2 border ${
                  isAdmin
                    ? 'bg-accent-admin/5 border-accent-admin/20'
                    : 'bg-surface-muted border-border'
                }`}
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${
                        isAdmin ? 'text-accent-admin' : 'text-main'
                      }`}
                    >
                      {msg.author_name}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-mono font-bold ${
                        isAdmin
                          ? 'bg-accent-admin/10 text-accent-admin border border-accent-admin/20'
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

                <p className="text-main leading-relaxed whitespace-pre-wrap">{msg.body}</p>
              </div>
            );
          })}
        </div>

        {/* Reply Box */}
        {!isClosed ? (
          <form onSubmit={handlePostReply} className="space-y-3 pt-4 border-t border-border">
            <span className="text-xs font-bold text-main">
              Admin Support Response
            </span>
            <div className="space-y-2">
              <textarea
                rows={4}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Type your response to the user..."
                className="w-full bg-surface-muted border border-border text-main text-xs p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-admin/20 focus:border-accent-admin resize-y placeholder-muted transition-colors"
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
                  <span>Send Reply to User</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="p-4 rounded-xl bg-surface-muted border border-border text-xs text-muted text-center">
            This support ticket is closed.
          </div>
        )}
      </div>
    </div>
  );
}
