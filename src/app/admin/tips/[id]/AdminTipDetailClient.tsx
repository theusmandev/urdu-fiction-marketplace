'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { getTipStatusMeta } from '@/lib/tips/state';
import type { TipStatus } from '@/types/database';

export interface AdminTipDetail {
  id: string;
  tip_number: string;
  reader: {
    id: string;
    full_name: string | null;
    username: string | null;
  };
  writer: {
    id: string;
    pen_name_urdu: string;
    pen_name_english: string;
  };
  novel: {
    id: string;
    title_urdu: string;
    title_english: string | null;
    slug: string;
  } | null;
  amount_pkr: number;
  currency: string;
  status: TipStatus;
  payment_instructions_snapshot: {
    method_type: string;
    account_title: string;
    account_number_or_iban: string;
    bank_name: string | null;
    instructions_note: string | null;
  };
  transaction_reference_tid: string | null;
  normalized_tid: string | null;
  is_duplicate_tid_flagged: boolean;
  review_flag: string | null;
  screenshot_path: string | null;
  sender_account_name: string | null;
  reader_message: string | null;
  message_status: string;
  is_anonymous: boolean;
  writer_reply: string | null;
  confirmed_at: string | null;
  not_received_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminTipDetailClientProps {
  initialTip: AdminTipDetail;
}

export function AdminTipDetailClient({ initialTip }: AdminTipDetailClientProps) {
  const router = useRouter();
  const [tip, setTip] = useState<AdminTipDetail>(initialTip);

  // Review action modal
  const [reviewAction, setReviewAction] = useState<'cleared' | 'needs_action'>('cleared');
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  // Remove message state
  const [removeReason, setRemoveReason] = useState('');
  const [isRemovingMessage, setIsRemovingMessage] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  // Proof signed URL
  const [proofLoading, setProofLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const statusMeta = getTipStatusMeta(tip.status);
  const snapshot = tip.payment_instructions_snapshot || {
    method_type: 'bank_transfer',
    account_title: '',
    account_number_or_iban: '',
    bank_name: null,
    instructions_note: null,
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleViewReceipt = async () => {
    if (!tip.screenshot_path) return;
    setProofLoading(true);
    try {
      const res = await fetch(`/api/proofs/signed-url?path=${encodeURIComponent(tip.screenshot_path)}`);
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        alert(data.error || 'Failed to load receipt.');
      }
    } catch (err) {
      console.error('Receipt loading error:', err);
      alert('Unable to load receipt.');
    } finally {
      setProofLoading(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewNotes.trim()) {
      alert('Please enter review notes for the audit trail.');
      return;
    }

    setIsReviewing(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_review_tip', {
        p_tip_id: tip.id,
        p_action: reviewAction,
        p_notes: reviewNotes.trim(),
      });

      if (error) {
        alert(error.message || 'Failed to record review.');
        setIsReviewing(false);
        return;
      }

      setReviewSuccess('Review status and note recorded in audit log.');
      setIsReviewing(false);
      router.refresh();
    } catch (err) {
      console.error('admin_review_tip error:', err);
      setIsReviewing(false);
    }
  };

  const handleRemoveMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!removeReason.trim()) {
      alert('Please enter a moderation reason.');
      return;
    }

    setIsRemovingMessage(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_remove_tip_message', {
        p_tip_id: tip.id,
        p_reason: removeReason.trim(),
      });

      if (error) {
        alert(error.message || 'Failed to remove message.');
        setIsRemovingMessage(false);
        return;
      }

      setTip((prev) => ({
        ...prev,
        message_status: 'removed_by_admin',
        reader_message: '[Message removed by platform moderation]',
      }));
      setShowRemoveDialog(false);
      setIsRemovingMessage(false);
      router.refresh();
    } catch (err) {
      console.error('admin_remove_tip_message error:', err);
      setIsRemovingMessage(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-secondary">
        <Link href="/admin" className="hover:text-navy">
          Admin
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <Link href="/admin/tips" className="hover:text-navy">
          Tips
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <span className="font-mono text-navy font-semibold">{tip.tip_number}</span>
      </nav>

      {/* Main Details Card */}
      <div className="bg-surface rounded-2xl border border-border shadow-xs p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-base font-bold text-navy">
                {tip.tip_number}
              </span>
              <span
                className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
              >
                {statusMeta.label}
              </span>
              {tip.review_flag && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  <AlertTriangle className="w-3 h-3 text-amber-700" />
                  <span>Flag: {tip.review_flag}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-secondary">
              Direct appreciation gift from reader to author.
            </p>
          </div>

          <div className="sm:text-right">
            <div className="text-2xl font-bold text-navy">
              PKR {Number(tip.amount_pkr).toLocaleString()}
            </div>
            <div className="text-[11px] text-secondary">0% platform fee</div>
          </div>
        </div>

        {/* Identity & Parties */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Reader */}
          <div className="p-4 rounded-xl bg-ivory/50 border border-border space-y-1.5">
            <span className="font-semibold text-secondary uppercase tracking-wider text-[10px]">
              Reader
            </span>
            <div className="font-bold text-sm text-main">
              {tip.reader.full_name || tip.reader.username || 'Reader'}
            </div>
            <div className="text-secondary font-mono text-[11px]">
              @{tip.reader.username || 'anonymous'} • ID: {tip.reader.id.slice(0, 8)}...
            </div>
            {tip.is_anonymous && (
              <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-medium">
                Sent anonymously to writer
              </span>
            )}
          </div>

          {/* Author */}
          <div className="p-4 rounded-xl bg-ivory/50 border border-border space-y-1.5">
            <span className="font-semibold text-secondary uppercase tracking-wider text-[10px]">
              Recipient Author
            </span>
            <div className="font-bold text-sm text-main">
              {tip.writer.pen_name_english} ({tip.writer.pen_name_urdu})
            </div>
            {tip.novel && (
              <div className="text-secondary">
                Novel: <span className="font-medium text-main">{tip.novel.title_urdu}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment & Transaction Reference */}
        <div className="p-4 rounded-xl bg-ivory/50 border border-border space-y-3 text-xs">
          <span className="font-semibold text-secondary uppercase tracking-wider text-[10px]">
            Transaction Evidence & Snapshot
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-secondary">Submitted TID:</span>
              <div className="flex items-center gap-2 font-mono font-bold text-main mt-0.5">
                <span>{tip.transaction_reference_tid || 'Not yet submitted'}</span>
                {tip.transaction_reference_tid && (
                  <button
                    type="button"
                    onClick={() => handleCopy(tip.transaction_reference_tid!, 'tid')}
                    className="p-1 hover:text-navy"
                  >
                    {copiedField === 'tid' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            <div>
              <span className="text-secondary">Sender Account Name:</span>
              <div className="font-medium text-main mt-0.5">
                {tip.sender_account_name || 'None provided'}
              </div>
            </div>

            <div>
              <span className="text-secondary">Receiving Account:</span>
              <div className="font-medium text-main mt-0.5">
                {snapshot.account_title} ({snapshot.method_type}) • {snapshot.account_number_or_iban}
              </div>
            </div>

            <div>
              <span className="text-secondary">Receipt Screenshot:</span>
              <div className="mt-0.5">
                {tip.screenshot_path ? (
                  <button
                    type="button"
                    onClick={handleViewReceipt}
                    disabled={proofLoading}
                    className="inline-flex items-center gap-1.5 text-xs text-navy font-semibold hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{proofLoading ? 'Loading receipt...' : 'View Signed Proof'}</span>
                  </button>
                ) : (
                  <span className="text-secondary italic">No screenshot uploaded</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Reader Message & Moderation */}
        {tip.reader_message && (
          <div className="p-4 rounded-xl bg-ivory/50 border border-border space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-secondary uppercase tracking-wider text-[10px]">
                Reader&apos;s Message ({tip.message_status})
              </span>
              {tip.message_status !== 'removed_by_admin' && (
                <button
                  type="button"
                  onClick={() => setShowRemoveDialog(true)}
                  className="text-[11px] text-rose-700 hover:text-rose-900 font-semibold flex items-center gap-1"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Remove message</span>
                </button>
              )}
            </div>
            <p className="text-main italic whitespace-pre-wrap leading-relaxed">
              &ldquo;{tip.reader_message}&rdquo;
            </p>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-2 text-xs">
          <span className="font-semibold text-secondary uppercase tracking-wider text-[10px]">
            Timeline
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-secondary">
            <div>
              <span className="block font-medium text-main">Created</span>
              <span>{new Date(tip.created_at).toLocaleString('en-PK')}</span>
            </div>
            {tip.confirmed_at && (
              <div>
                <span className="block font-medium text-main">Confirmed</span>
                <span>{new Date(tip.confirmed_at).toLocaleString('en-PK')}</span>
              </div>
            )}
            {tip.not_received_at && (
              <div>
                <span className="block font-medium text-rose-700">Marked Not Received</span>
                <span>{new Date(tip.not_received_at).toLocaleString('en-PK')}</span>
              </div>
            )}
            <div>
              <span className="block font-medium text-main">Last Updated</span>
              <span>{new Date(tip.updated_at).toLocaleString('en-PK')}</span>
            </div>
          </div>
        </div>

        {/* Audit / Review Action Box */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ShieldCheck className="w-4 h-4 text-accent-admin" />
            <span>Admin Review Action (Audit Logged)</span>
          </div>
          <p className="text-xs text-secondary">
            Flagged tips do not trigger automatic penalties. Record your inspection findings here for compliance records.
          </p>

          <form onSubmit={handleSubmitReview} className="space-y-3 text-xs">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reviewAction"
                  value="cleared"
                  checked={reviewAction === 'cleared'}
                  onChange={() => setReviewAction('cleared')}
                  className="text-navy"
                />
                <span className="font-medium text-main">OK / Cleared (No issue)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reviewAction"
                  value="needs_action"
                  checked={reviewAction === 'needs_action'}
                  onChange={() => setReviewAction('needs_action')}
                  className="text-navy"
                />
                <span className="font-medium text-rose-700">Needs Investigation / Note</span>
              </label>
            </div>

            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={2}
              placeholder="Enter audit explanation or note..."
              className="w-full p-2.5 rounded-xl border border-border bg-ivory/50 text-xs focus:outline-none focus:ring-2 focus:ring-accent-admin/40 resize-none"
              required
            />

            {reviewSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                {reviewSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={isReviewing}
              className="px-4 py-2 bg-navy text-accent font-semibold text-xs rounded-xl hover:bg-navy-light transition-colors"
            >
              {isReviewing ? 'Recording review...' : 'Record Audit Review'}
            </button>
          </form>
        </div>
      </div>

      {/* Remove Message Confirmation Dialog */}
      {showRemoveDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-semibold text-sm">
              <EyeOff className="w-4 h-4" />
              <span>Remove Offensive Message</span>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              This will hide the reader message permanently from both reader and author views. An audit log will be created.
            </p>

            <form onSubmit={handleRemoveMessage} className="space-y-3">
              <input
                type="text"
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                placeholder="Reason (e.g. offensive language, spam)"
                className="w-full p-2.5 rounded-xl border border-border bg-ivory/50 text-xs"
                required
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRemoveDialog(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRemovingMessage}
                  className="px-4 py-2 rounded-xl bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800"
                >
                  {isRemovingMessage ? 'Removing...' : 'Confirm Remove'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
