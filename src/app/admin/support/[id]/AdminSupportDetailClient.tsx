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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <Link
            href="/admin/support"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Support Queue</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight">
              Ticket #{request.id.slice(0, 8)}: {request.subject}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                statusMeta.variant === 'warning'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : statusMeta.variant === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {statusMeta.label}
            </span>
            <span className="text-xs text-slate-400 font-urdu">{statusMeta.urduLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isClosed && (
            <button
              type="button"
              onClick={handleCloseTicket}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>Close Ticket</span>
            </button>
          )}
        </div>
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

      {/* Ticket Metadata Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex flex-wrap items-center gap-6 text-xs text-slate-300">
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-mono">User</span>
          <span className="font-semibold text-white">{request.user_name}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-mono">Category</span>
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-purple-300 border border-slate-700">
            {request.category}
          </span>
        </div>
        {request.order_number && (
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Order Reference</span>
            <Link
              href={`/admin/orders?search=${encodeURIComponent(request.order_number)}`}
              target="_blank"
              className="font-mono font-bold text-amber-400 hover:underline inline-flex items-center gap-1"
            >
              <span>#{request.order_number}</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </Link>
          </div>
        )}
        <div>
          <span className="text-slate-500 block text-[10px] uppercase font-mono">Created</span>
          <span className="font-mono text-slate-400 text-[11px]">
            {new Date(request.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Messages Thread */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-purple-400" />
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
                    ? 'bg-purple-950/20 border-purple-800/40'
                    : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${
                        isAdmin ? 'text-purple-300' : 'text-slate-200'
                      }`}
                    >
                      {msg.author_name}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-mono font-bold ${
                        isAdmin
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {msg.author_role}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{msg.body}</p>
              </div>
            );
          })}
        </div>

        {/* Reply Box */}
        {!isClosed ? (
          <form onSubmit={handlePostReply} className="space-y-3 pt-4 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-300">
              Admin Support Response
            </span>
            <div className="space-y-2">
              <textarea
                rows={4}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Type your response to the user..."
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs p-3 rounded-xl focus:outline-none focus:border-purple-500/50 resize-y"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPending || !replyBody.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-colors disabled:opacity-50"
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
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 text-center">
            This support ticket is closed.
          </div>
        )}
      </div>
    </div>
  );
}
