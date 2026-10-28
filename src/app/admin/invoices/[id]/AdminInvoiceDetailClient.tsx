'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatKarachiDateTime, formatPKR2 } from '@/lib/commission/time';
import {
  confirmCommissionSettlementAction,
  rejectCommissionReportAction,
  voidCommissionInvoiceAction,
} from '@/app/actions/admin-commission';
import type { CommissionInvoiceRow } from '@/types/database';
import {
  ArrowLeft,
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Ban,
  X,
  ExternalLink,
  Printer,
} from 'lucide-react';

interface InvoiceDetailPayload {
  invoice: CommissionInvoiceRow & {
    pen_name_english?: string;
    pen_name_urdu?: string;
  };
  lines: Array<{
    id: string;
    ledger_entry_id: string;
    commission_pkr: number;
    gross_amount_pkr: number;
    commission_rate: number;
    entry_type: string;
    order_number: string | null;
    novel_title: string;
    reader_display_name: string;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    amount_pkr: number;
    payment_date: string;
    notes: string | null;
  }>;
  reports: Array<{
    id: string;
    amount_pkr: number;
    transaction_reference: string;
    screenshot_path: string;
    writer_note: string | null;
    status: string;
    admin_note: string | null;
    reviewed_at: string | null;
    created_at: string;
    is_duplicate_tid?: boolean;
  }>;
}

interface AdminInvoiceDetailClientProps {
  invoiceDetail: InvoiceDetailPayload;
}

export function AdminInvoiceDetailClient({
  invoiceDetail,
}: AdminInvoiceDetailClientProps) {
  const router = useRouter();
  const { invoice, lines, payments, reports } = invoiceDetail;

  const isOverdue = Boolean(
    invoice.due_date &&
      new Date(invoice.due_date) < new Date() &&
      invoice.status !== 'settled' &&
      invoice.status !== 'void'
  );

  const remainingDue = Math.max(0, invoice.total_commission_owed_pkr - invoice.amount_settled_pkr);

  // Modals state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState(remainingDue.toString());
  const [confirmReportId, setConfirmReportId] = useState<string | null>(null);
  const [confirmAdminNote, setConfirmAdminNote] = useState('');
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReportId, setRejectReportId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isSubmittingVoid, setIsSubmittingVoid] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  // Proof viewer modal
  const [viewingProofUrl, setViewingProofUrl] = useState<string | null>(null);
  const [isLoadingProof, setIsLoadingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const handleOpenProof = async (screenshotPath: string) => {
    setViewingProofUrl(null);
    setProofError(null);
    setIsLoadingProof(true);

    try {
      const res = await fetch(`/api/proofs/signed-url?path=${encodeURIComponent(screenshotPath)}`);
      const data = await res.json();
      if (!res.ok || !data.url) {
        setProofError(data.error || 'Failed to load receipt image.');
      } else {
        setViewingProofUrl(data.url);
      }
    } catch (err: unknown) {
      setProofError(err instanceof Error ? err.message : 'Error fetching signed URL.');
    } finally {
      setIsLoadingProof(false);
    }
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmError(null);

    const parsedAmount = parseFloat(confirmAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setConfirmError('Please enter a valid amount received.');
      return;
    }

    if (parsedAmount > remainingDue + 0.01) {
      setConfirmError(
        `Amount cannot exceed remaining invoice balance of ${formatPKR2(remainingDue)}.`
      );
      return;
    }

    setIsSubmittingConfirm(true);

    try {
      const res = await confirmCommissionSettlementAction({
        invoiceId: invoice.id,
        amountPkr: parsedAmount,
        reportId: confirmReportId || undefined,
        adminNote: confirmAdminNote.trim() || undefined,
      });

      if (!res.success) {
        setConfirmError(res.error || 'Settlement confirmation failed.');
      } else {
        setIsConfirmModalOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setConfirmError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsSubmittingConfirm(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReportId) return;
    setRejectError(null);

    if (!rejectReason || rejectReason.trim().length < 5) {
      setRejectError('Please provide a mandatory explanation for rejecting this report.');
      return;
    }

    setIsSubmittingReject(true);

    try {
      const res = await rejectCommissionReportAction({
        reportId: rejectReportId,
        reason: rejectReason.trim(),
      });

      if (!res.success) {
        setRejectError(res.error || 'Report rejection failed.');
      } else {
        setIsRejectModalOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setRejectError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVoidError(null);

    if (!voidReason || voidReason.trim().length < 5) {
      setVoidError('Please provide a mandatory operational reason for voiding this invoice.');
      return;
    }

    setIsSubmittingVoid(true);

    try {
      const res = await voidCommissionInvoiceAction({
        invoiceId: invoice.id,
        reason: voidReason.trim(),
      });

      if (!res.success) {
        setVoidError(res.error || 'Failed to void invoice.');
      } else {
        setIsVoidModalOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setVoidError(err instanceof Error ? err.message : 'Unexpected error.');
    } finally {
      setIsSubmittingVoid(false);
    }
  };

  const isVoidable =
    invoice.status !== 'settled' &&
    invoice.status !== 'void' &&
    payments.length === 0;

  return (
    <div className="space-y-8 print:space-y-4 print:p-0">
      {/* Top Banner */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4 print:border-none print:shadow-none print:p-0">
        <div>
          <Link
            href="/admin/invoices"
            className="print:hidden inline-flex items-center text-xs font-semibold text-muted hover:text-main mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Invoices List
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-serif font-bold text-main font-mono">
              {invoice.invoice_number}
            </h1>
            <StatusBadge status={invoice.status} size="sm" />
            {isOverdue && (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                Overdue
              </span>
            )}
          </div>

          <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-3">
            <Link
              href={`/admin/commission/writers/${invoice.writer_id}`}
              className="text-accent-admin hover:underline flex items-center gap-1 font-medium"
            >
              <span>Author: {invoice.pen_name_english || invoice.writer_id.slice(0, 8)}</span>
              {invoice.pen_name_urdu && <span>({invoice.pen_name_urdu})</span>}
              <ExternalLink className="w-3 h-3 print:hidden" />
            </Link>
            <span>•</span>
            <span>Issued: {formatKarachiDateTime(invoice.created_at)}</span>
            {invoice.due_date && (
              <>
                <span>•</span>
                <span className="text-main font-mono">
                  Due: {formatKarachiDateTime(invoice.due_date, false)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-surface hover:bg-surface-muted text-main border border-border shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4 mr-1.5 text-muted" />
            Print Statement
          </button>

          {remainingDue > 0 && invoice.status !== 'void' && (
            <button
              type="button"
              onClick={() => {
                setConfirmReportId(null);
                setConfirmAmount(remainingDue.toString());
                setConfirmAdminNote('');
                setConfirmError(null);
                setIsConfirmModalOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Confirm Bank Settlement
            </button>
          )}

          {isVoidable && (
            <button
              type="button"
              onClick={() => {
                setVoidReason('');
                setVoidError(null);
                setIsVoidModalOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-surface hover:bg-rose-50 text-rose-700 border border-border shadow-sm transition-colors"
            >
              <Ban className="w-4 h-4 mr-1.5" />
              Void Invoice
            </button>
          )}
        </div>
      </div>

      {/* Void Notice if Voided */}
      {invoice.status === 'void' && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <Ban className="w-4 h-4 text-rose-600" />
            <span>Invoice Voided</span>
          </div>
          <p>
            This statement was voided on {formatKarachiDateTime(invoice.voided_at)}. Its ledger entries have been released back into the unbilled pool.
          </p>
          {invoice.void_reason && (
            <p className="italic text-muted">Reason: {invoice.void_reason}</p>
          )}
        </div>
      )}

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3">
        <div className="bg-surface border border-border rounded-xl p-5 shadow-card space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Total Statement Platform Fee
          </span>
          <div className="text-2xl font-bold font-mono text-main">
            {formatPKR2(invoice.total_commission_owed_pkr)}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-card space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Confirmed Settled
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-700">
            {formatPKR2(invoice.amount_settled_pkr)}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-card space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Remaining Unsettled
          </span>
          <div className={`text-2xl font-bold font-mono ${remainingDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {formatPKR2(remainingDue)}
          </div>
        </div>
      </div>

      {/* Submitted Payment Claims / Reports Queue */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden print:hidden">
        <div className="p-4 border-b border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h2 className="font-serif font-bold text-main text-sm">
              Author Payment Claims ({reports.length})
            </h2>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="p-6 text-center text-muted text-xs">
            No payment claims have been submitted by the author for this invoice.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {reports.map((r) => {
              const isPending = r.status === 'pending';
              return (
                <div key={r.id} className="p-4 hover:bg-surface-muted/50 transition-colors space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-main text-sm">
                        {formatPKR2(r.amount_pkr)}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        TID: {r.transaction_reference}
                      </span>
                      <StatusBadge status={`report_${r.status}`} size="sm" />
                      {r.is_duplicate_tid && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          Duplicate TID
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenProof(r.screenshot_path)}
                        className="inline-flex items-center px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-muted text-main border border-border text-[11px] font-medium shadow-sm transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1 text-muted" />
                        View Receipt
                      </button>

                      {isPending && invoice.status !== 'void' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmReportId(r.id);
                              setConfirmAmount(Math.min(remainingDue, r.amount_pkr).toString());
                              setConfirmAdminNote('');
                              setConfirmError(null);
                              setIsConfirmModalOpen(true);
                            }}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold shadow-sm transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Confirm Deposit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectReportId(r.id);
                              setRejectReason('');
                              setRejectError(null);
                              setIsRejectModalOpen(true);
                            }}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold shadow-sm transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Reject Claim
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-muted flex flex-wrap items-center gap-3">
                    <span>Submitted: {formatKarachiDateTime(r.created_at)}</span>
                    {r.reviewed_at && (
                      <span>Reviewed: {formatKarachiDateTime(r.reviewed_at)}</span>
                    )}
                  </div>

                  {r.writer_note && (
                    <div className="bg-surface-muted p-2.5 rounded-xl border border-border text-main">
                      <span className="text-[10px] text-muted uppercase block font-semibold">Writer Note:</span>
                      <span>{r.writer_note}</span>
                    </div>
                  )}

                  {r.status === 'rejected' && r.admin_note && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl space-y-0.5">
                      <span className="font-bold">Rejection Note:</span>
                      <p>{r.admin_note}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmed Settlement Payments */}
      {payments.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="p-4 border-b border-border text-xs">
            <h2 className="font-serif font-bold text-main text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Confirmed Bank Settlements ({payments.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {payments.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="font-mono text-emerald-700 font-bold">
                    {formatPKR2(p.amount_pkr)}
                  </div>
                  <div className="text-muted text-[11px]">
                    Settled on: {formatKarachiDateTime(p.payment_date)}
                    {p.notes && ` • Note: ${p.notes}`}
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                  DEPOSIT CONFIRMED
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Itemized Lines Breakdown Table */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-accent-admin" />
            <h2 className="font-serif font-bold text-main text-sm">
              Statement Line Items ({lines.length})
            </h2>
          </div>
        </div>

        <div className="w-full overflow-x-auto rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-muted border-b border-border text-muted font-medium text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Date (PKT)</th>
                <th className="py-2.5 px-3">Order #</th>
                <th className="py-2.5 px-3">Novel</th>
                <th className="py-2.5 px-3">Reader</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Gross</th>
                <th className="py-2.5 px-3 text-right">Rate</th>
                <th className="py-2.5 px-3 text-right">Platform Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l) => (
                <tr key={l.id} className="hover:bg-surface-muted/50 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-[11px] text-muted whitespace-nowrap">
                    {formatKarachiDateTime(l.created_at)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-main whitespace-nowrap">
                    {l.order_number || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-main font-medium max-w-[180px] truncate break-words" title={l.novel_title}>
                    {l.novel_title}
                  </td>
                  <td className="py-2.5 px-3 text-muted max-w-[150px] truncate break-words" title={l.reader_display_name}>
                    {l.reader_display_name}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-muted text-main border border-border">
                      {l.entry_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-main">
                    {formatPKR2(l.gross_amount_pkr)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-muted">
                    {l.commission_rate.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-main">
                    {formatPKR2(l.commission_pkr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Settlement Dialog */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-serif font-bold text-lg text-main">
                  Confirm Bank Deposit Settlement
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-muted hover:text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSubmit} className="space-y-4 text-xs">
              {confirmError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
                  {confirmError}
                </div>
              )}

              <p className="text-muted">
                Type the exact amount verified in the platform bank account. This creates an auditable payment settlement record and reduces the author&apos;s outstanding platform fee.
              </p>

              <div>
                <label className="block text-main font-medium mb-1">
                  Amount Actually Received (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={remainingDue}
                  required
                  value={confirmAmount}
                  onChange={(e) => setConfirmAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-main font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-muted mt-1">
                  Remaining statement due: {formatPKR2(remainingDue)}
                </p>
              </div>

              <div>
                <label className="block text-main font-medium mb-1">
                  Admin Settlement Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank statement ref #94827"
                  value={confirmAdminNote}
                  onChange={(e) => setConfirmAdminNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-main focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface border border-border text-muted hover:text-main transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingConfirm}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmittingConfirm ? 'Confirming...' : 'Confirm Deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Report Dialog */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                <h3 className="font-serif font-bold text-lg text-main">
                  Reject Payment Claim
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="text-muted hover:text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit} className="space-y-4 text-xs">
              {rejectError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
                  {rejectError}
                </div>
              )}

              <p className="text-muted">
                This will reject the author&apos;s payment claim and send a notification with your explanation. The invoice remains open.
              </p>

              <div>
                <label className="block text-main font-medium mb-1">
                  Mandatory Rejection Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Deposit TID does not match bank record or screenshot illegible..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-main focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsRejectModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface border border-border text-muted hover:text-main transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReject}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmittingReject ? 'Rejecting...' : 'Reject Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Invoice Dialog */}
      {isVoidModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-600" />
                <h3 className="font-serif font-bold text-lg text-main">
                  Void Commission Invoice
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsVoidModalOpen(false)}
                className="text-muted hover:text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVoidSubmit} className="space-y-4 text-xs">
              {voidError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
                  {voidError}
                </div>
              )}

              <p className="text-muted">
                Voiding marks this invoice as void and frees all its line items back into the uninvoiced ledger pool so they can be re-billed. This action is auditable and irreversible.
              </p>

              <div>
                <label className="block text-main font-medium mb-1">
                  Mandatory Void Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Incorrect date range selected by billing administrator..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-main focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsVoidModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface border border-border text-muted hover:text-main transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVoid}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmittingVoid ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Proof Viewer Modal */}
      {(viewingProofUrl || isLoadingProof || proofError) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-surface border border-border rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-serif font-bold text-main text-base">
                Payment Proof Receipt
              </h3>
              <button
                type="button"
                onClick={() => {
                  setViewingProofUrl(null);
                  setIsLoadingProof(false);
                  setProofError(null);
                }}
                className="text-muted hover:text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingProof && (
              <div className="py-12 text-center text-xs text-muted">
                Generating signed temporary access URL...
              </div>
            )}

            {proofError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
                {proofError}
              </div>
            )}

            {viewingProofUrl && (
              <div className="space-y-3">
                <div className="relative max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface-muted flex items-center justify-center p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewingProofUrl}
                    alt="Payment receipt proof"
                    className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-sm"
                  />
                </div>
                <div className="flex justify-end">
                  <a
                    href={viewingProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent-admin hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Open in new window</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
