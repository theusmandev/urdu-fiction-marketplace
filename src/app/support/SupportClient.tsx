'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupportRequestAction } from '@/app/actions/support';
import { getSupportStatusMeta, mapDisputeErrorMessage } from '@/lib/disputes/status-meta';
import type { SupportRequestListItem } from '@/types/database';
import {
  HelpCircle,
  PlusCircle,
  Clock,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Send,
  Loader2,
  X,
  FileQuestion,
} from 'lucide-react';

interface SupportClientProps {
  initialRequests: SupportRequestListItem[];
}

export function SupportClient({ initialRequests }: SupportClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showNewModal, setShowNewModal] = useState(false);

  // Form states
  const [category, setCategory] = useState<'order' | 'payment' | 'account' | 'content' | 'other'>('order');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [orderId, setOrderId] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await createSupportRequestAction(
        category,
        subject,
        body,
        orderId.trim() || null
      );

      if (!res.success) {
        setErrorMsg(mapDisputeErrorMessage(res.error || 'Failed to submit request.'));
      } else {
        setShowNewModal(false);
        setSubject('');
        setBody('');
        setOrderId('');
        router.refresh();
      }
    });
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-sky-400" />
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Customer Support Desk
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-stone-400 mt-1">
              Have questions regarding orders, content, or your account? Submit a support request.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowNewModal(true);
              setErrorMsg(null);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-stone-950 bg-amber-500 hover:bg-amber-400 transition-colors shadow-md cursor-pointer shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Open New Support Request</span>
          </button>
        </div>

        {/* Requests List */}
        {initialRequests.length === 0 ? (
          <div className="rounded-2xl bg-stone-900/40 border border-stone-800 p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-stone-800 text-stone-400 flex items-center justify-center mx-auto">
              <FileQuestion className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">No active support requests</h3>
              <p className="text-xs text-stone-400 max-w-sm mx-auto">
                Need help with a payment, order issue, or author query? Open a ticket to contact our support team.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-stone-950 bg-amber-500 hover:bg-amber-400 transition-colors shadow-md cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Submit Your First Request</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {initialRequests.map((req) => {
              const statusMeta = getSupportStatusMeta(req.status);
              return (
                <Link
                  key={req.id}
                  href={`/support/${req.id}`}
                  className="block rounded-2xl bg-stone-900/60 hover:bg-stone-900 border border-stone-800 hover:border-stone-700 p-5 transition-all group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800/60 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700">
                        {req.category}
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

                    <div className="flex items-center gap-3 text-xs text-stone-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-stone-500" />
                        <span>{new Date(req.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-stone-500" />
                        <span>{req.messages_count} replies</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                        {req.subject}
                      </h3>
                      {req.order_number && (
                        <span className="text-[11px] font-mono text-stone-400 block">
                          Related to Order #{req.order_number}
                        </span>
                      )}
                    </div>

                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500 group-hover:translate-x-0.5 transition-transform">
                      <span>View Ticket</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: New Support Request Form */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-sky-400" />
                <span>Open a Support Request</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-300 block">
                  Category <span className="text-amber-400">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-stone-950 border border-stone-800 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="order">Order or Payment Issue</option>
                  <option value="payment">General Payment Questions</option>
                  <option value="account">Account Access &amp; Profile</option>
                  <option value="content">Novel Content / Reader Experience</option>
                  <option value="other">Other Inquiry</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-300 block">
                  Subject <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of your request (max 120 chars)"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-stone-950 border border-stone-800 text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-300">
                    Description <span className="text-amber-400">*</span>
                  </label>
                  <span className="text-[10px] text-stone-500 font-mono">
                    {body.length} / 2000 chars
                  </span>
                </div>
                <textarea
                  rows={4}
                  required
                  maxLength={2000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Explain your issue in detail. Please do NOT include bank account numbers or PINs."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-stone-950 border border-stone-800 text-white placeholder-stone-500 focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>

              <div className="text-[11px] text-stone-500">
                Rate Limit: Maximum 5 support requests allowed per user every 24 hours.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !subject.trim() || !body.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-stone-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
