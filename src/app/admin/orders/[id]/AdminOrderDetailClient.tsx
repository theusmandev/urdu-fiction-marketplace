'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatPKR } from '@/lib/utils';
import type { AdminOrderDetailResponse } from '@/types/database';
import { adminForceVerifyOrderAction } from '@/app/actions/admin-orders';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Receipt,
  ShieldAlert,
  User,
  X,
  AlertTriangle,
} from 'lucide-react';

interface AdminOrderDetailClientProps {
  orderData: AdminOrderDetailResponse;
}

export function AdminOrderDetailClient({ orderData }: AdminOrderDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modal states
  const [showForceVerifyModal, setShowForceVerifyModal] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Screenshot Zoom Modal
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState<string | null>(null);

  // Copy helper
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const { order, reader, writer, novel, submissions, disputes, ledger, entitlement } = orderData;

  // View screenshot handler (fetches 60s signed URL)
  const handleViewScreenshot = async (path: string) => {
    setLoadingProof(path);
    try {
      const res = await fetch(`/api/proofs/signed-url?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok && data.url) {
        setZoomUrl(data.url);
      } else {
        alert(data.error || 'Failed to load screenshot signed URL.');
      }
    } catch {
      alert('Network error loading screenshot.');
    } finally {
      setLoadingProof(null);
    }
  };

  // Submit Force Verify
  const handleForceVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    if (!adminNote.trim() || adminNote.trim().length < 5) {
      setActionError('A clear administrative justification note of at least 5 characters is required.');
      return;
    }

    startTransition(async () => {
      const res = await adminForceVerifyOrderAction(order.id, adminNote.trim());
      if (!res.success) {
        setActionError(res.error || 'Force verification failed.');
      } else {
        setShowForceVerifyModal(false);
        router.refresh();
      }
    });
  };

  const isForceVerifiable = ['payment_submitted', 'rejected', 'disputed'].includes(order.status) && !entitlement;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Orders Queue</span>
        </Link>

        {isForceVerifiable && (
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setShowForceVerifyModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 transition-colors shadow-lg shadow-rose-600/20 cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Force Verify Order</span>
          </button>
        )}
      </div>

      {/* Main Order Card Banner */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-white">
                {order.order_number}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
                Status: {order.status.replace('_', ' ')}
              </span>
              {order.is_stuck && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                  Stuck &gt; 24h
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white mt-1">
              {order.novel_title_snapshot || novel.title_english || novel.title_urdu}
            </h1>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
              Total Order Amount
            </span>
            <span className="text-2xl font-bold text-amber-400 font-mono">
              {formatPKR(order.amount_pkr)}
            </span>
          </div>
        </div>

        {/* Parties Grid (Reader & Writer) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Reader (Privacy Protected: No Email) */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
              <User className="w-3.5 h-3.5 text-sky-400" />
              <span>Reader Account</span>
            </div>
            <p className="text-sm font-bold text-white">{reader.display_name}</p>
            {reader.username && (
              <p className="text-xs text-slate-400 font-mono">@{reader.username}</p>
            )}
            <p className="text-[10px] text-slate-500 italic">
              Email strictly omitted per multi-tenant privacy policies.
            </p>
          </div>

          {/* Writer */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Author Details</span>
            </div>
            <p className="text-sm font-bold text-white">{writer.pen_name}</p>
            <Link
              href={`/admin/writers/${writer.id}`}
              className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Inspect Author Profile</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Payment Instructions Snapshot */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-slate-400" />
          <span>Payment Instructions Snapshot</span>
        </h3>
        <p className="text-xs text-slate-400">
          Immutable snapshot of the writer&apos;s receiving account details presented to the reader at checkout.
        </p>

        <pre className="bg-slate-900 p-4 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto border border-slate-800">
          {JSON.stringify(order.payment_instructions_snapshot, null, 2)}
        </pre>
      </div>

      {/* Payment Submissions Section */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <span>Reader Payment Submissions ({submissions.length})</span>
        </h3>

        {submissions.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No payment proofs submitted yet for this order.</p>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3"
              >
                {/* Duplicate Warning */}
                {sub.is_duplicate_tid && (
                  <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>
                      <strong>Duplicate TID Warning:</strong> This transaction reference has been used on another order. Inspect deposit slip closely.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">TID Reference</span>
                    <div className="flex items-center gap-2 font-mono font-bold text-white">
                      <span>{sub.transaction_reference_tid}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(sub.transaction_reference_tid)}
                        className="text-slate-400 hover:text-white p-0.5"
                        title={copiedText === sub.transaction_reference_tid ? 'Copied!' : 'Copy TID'}
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {copiedText === sub.transaction_reference_tid && (
                        <span className="text-[10px] text-emerald-400 font-sans font-normal">Copied!</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Amount Claimed</span>
                    <span className="font-mono font-bold text-amber-400">
                      {formatPKR(sub.paid_amount_claimed_pkr)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Sender Account Name</span>
                    <span className="text-slate-200">{sub.sender_account_name || 'N/A'}</span>
                  </div>
                </div>

                {sub.reader_note && (
                  <div className="text-xs text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <strong className="text-slate-300">Reader Note:</strong> {sub.reader_note}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <span className="text-slate-500 font-mono">
                    Submitted: {new Date(sub.created_at).toLocaleString()}
                  </span>

                  <button
                    type="button"
                    disabled={loadingProof === sub.screenshot_path}
                    onClick={() => handleViewScreenshot(sub.screenshot_path)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {loadingProof === sub.screenshot_path ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Eye className="w-3 h-3 text-amber-400" />
                    )}
                    <span>Inspect Payment Receipt Screenshot</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disputes Section */}
      {disputes.length > 0 && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Associated Disputes ({disputes.length})</span>
          </h3>

          <div className="space-y-3">
            {disputes.map((d) => (
              <div key={d.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white capitalize">Status: {d.status}</span>
                  <span className="text-slate-500 font-mono text-[10px]">
                    Opened {new Date(d.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-slate-300"><strong>Reason:</strong> {d.reason}</p>
                {d.resolution_note && (
                  <p className="text-emerald-400"><strong>Resolution Note:</strong> {d.resolution_note}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Financial Ledger Entries */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-emerald-400" />
          <span>Financial Sales Ledger Entries ({ledger.length})</span>
        </h3>

        {ledger.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No ledger rows generated yet (created only upon verification).</p>
        ) : (
          <div className="space-y-2">
            {ledger.map((row) => (
              <div
                key={row.id}
                className="p-3 bg-slate-900 rounded-xl border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono"
              >
                <div>
                  <span className="text-slate-500 text-[10px] block">Entry Type</span>
                  <span className="font-bold text-white capitalize">{row.entry_type}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Gross Amount</span>
                  <span className="text-amber-400">{formatPKR(row.gross_amount_pkr)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Platform Comm.</span>
                  <span className="text-emerald-400">{formatPKR(row.platform_commission_pkr)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Writer Payout</span>
                  <span className="text-slate-200">{formatPKR(row.writer_payout_pkr)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchase Entitlement State */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-6 space-y-2 text-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Reader Purchase Entitlement</span>
        </h3>

        {entitlement ? (
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
            <p className="text-emerald-400 font-semibold">Active Entitlement Granted</p>
            <p className="text-slate-400 text-[11px] font-mono">
              Granted At: {new Date(entitlement.granted_at).toLocaleString()}
            </p>
            {entitlement.is_revoked && (
              <p className="text-rose-400 text-[11px]">
                Revoked: {entitlement.revoked_reason}
              </p>
            )}
          </div>
        ) : (
          <p className="text-slate-500 italic">No purchase entitlement exists for this order.</p>
        )}
      </div>

      {/* Force Verify Modal */}
      {showForceVerifyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span>Confirm Admin Force-Verification</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowForceVerifyModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 space-y-1">
                <p className="font-bold">Financial & Access Impact Warning:</p>
                <p className="text-[11px] leading-relaxed">
                  Force-verifying order <strong>{order.order_number}</strong> immediately grants the reader full access to the novel and creates an immutable <strong>sale_verified</strong> financial ledger row, establishing a platform commission debt for author <strong>{writer.pen_name}</strong>.
                </p>
              </div>

              {actionError && (
                <div className="p-3 rounded-lg bg-rose-500/20 text-rose-300 text-xs border border-rose-500/40">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleForceVerifySubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-white block">
                    Administrative Reason / Note <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="e.g. Verified bank deposit slip reference directly with bank records."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    This note will be permanently logged in the dispute resolution, payment submission, and audit ledger.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForceVerifyModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-rose-600/20"
                  >
                    {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirm Force Verification</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Zoom Modal */}
      {zoomUrl && (
        <div className="fixed inset-0 z-50 bg-stone-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Inspection: Reader Payment Screenshot Proof
              </h4>
              <button
                type="button"
                onClick={() => setZoomUrl(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl flex items-center justify-center bg-stone-950 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoomUrl} alt="Payment Proof Receipt" className="max-h-[70vh] w-auto object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
