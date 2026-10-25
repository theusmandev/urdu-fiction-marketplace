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
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation */}
        <div>
          <Link
            href="/support"
            className="inline-flex items-center gap-2 text-xs font-semibold text-stone-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Support Desk</span>
          </Link>
        </div>

        {/* Ticket Header Card */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700">
                  {request.category}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    statusMeta.variant === 'warning'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : statusMeta.variant === 'success'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-stone-800 text-stone-400 border border-stone-700'
                  }`}
                >
                  {statusMeta.label}
                </span>
              </div>
              <h1 className="text-lg font-bold text-white">{request.subject}</h1>
              {request.order_number && (
                <span className="text-xs font-mono text-amber-400 block">
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
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white bg-stone-950 hover:bg-stone-800 border border-stone-800 transition-colors cursor-pointer"
                >
                  Mark as Resolved / Close
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-stone-400">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-500" />
              <span>Created {new Date(request.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="rounded-2xl bg-stone-900 border border-stone-800 p-6 space-y-6">
          <div className="border-b border-stone-800 pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400">
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
                      ? 'bg-sky-950/20 border-sky-800/40'
                      : 'bg-stone-950 border-stone-800'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-stone-800/50 pb-2">
                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        <Shield className="w-4 h-4 text-sky-400" />
                      ) : (
                        <User className="w-4 h-4 text-stone-400" />
                      )}
                      <span className="font-bold text-xs text-white">{msg.author_name}</span>
                      {isAdmin && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300">
                          Support Team
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-stone-500 font-mono">
                      {new Date(msg.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-stone-200 leading-relaxed whitespace-pre-wrap">
                    {msg.body}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Reply Form */}
          {!isClosed ? (
            <form onSubmit={handleSendReply} className="pt-4 border-t border-stone-800 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-300">
                    Your Reply
                  </label>
                  <span className="text-[10px] text-stone-500 font-mono">
                    {replyBody.length} / 2000 chars
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type your reply here..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPending || !replyBody.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-stone-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 transition-all shadow-md cursor-pointer"
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
            <div className="pt-4 border-t border-stone-800 text-center py-4">
              <span className="text-xs text-stone-500 italic">
                This ticket has been marked as closed.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
