'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { ImageUploader } from '@/components/ui/image-uploader';
import { reportCommissionPaymentAction } from '@/app/actions/commission';
import { formatKarachiDateTime, formatPKR2 } from '@/lib/commission/time';
import type {
  WriterInvoiceDetail,
  PlatformPaymentMethodRow,
} from '@/types/database';
import {
  Receipt,
  ArrowLeft,
  Printer,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  CreditCard,
  Building,
  Smartphone,
} from 'lucide-react';

interface InvoiceDetailClientProps {
  invoiceDetail: WriterInvoiceDetail;
  paymentInstructions: PlatformPaymentMethodRow[];
}

export function InvoiceDetailClient({
  invoiceDetail,
  paymentInstructions,
}: InvoiceDetailClientProps) {
  const router = useRouter();
  const { lines, payments, reports, ...invoice } = invoiceDetail;

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const remainingDue = Math.max(0, invoice.total_commission_owed_pkr - invoice.amount_settled_pkr);
  const [amountPkr, setAmountPkr] = useState<string>(remainingDue.toString());
  const [tid, setTid] = useState('');
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [writerNote, setWriterNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReportPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const parsedAmount = parseFloat(amountPkr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Please enter a valid payment amount greater than PKR 0.00');
      return;
    }

    if (!tid || tid.trim().length < 6 || tid.trim().length > 40) {
      setFormError('Transaction Reference (TID) must be between 6 and 40 characters.');
      return;
    }

    if (!screenshotPath) {
      setFormError('Payment receipt screenshot is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await reportCommissionPaymentAction({
        invoiceId: invoice.id,
        amountPkr: parsedAmount,
        tid: tid.trim(),
        screenshotPath,
        writerNote: writerNote.trim() || undefined,
      });

      if (!res.success) {
        setFormError(res.error || 'Failed to submit payment claim.');
      } else {
        setFormSuccess(
          res.isDuplicateTid
            ? 'Payment reported successfully. Notice: This TID was previously reported and will be flagged for administrator inspection.'
            : 'Payment claim reported successfully! An administrator will review your receipt and verify bank deposit.'
        );
        setTid('');
        setScreenshotPath(null);
        setWriterNote('');
        router.refresh();
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canReportPayment =
    invoice.status === 'invoiced' ||
    invoice.status === 'partially_paid' ||
    invoice.status === 'payment_reported';

  return (
    <div className="space-y-8">
      {/* Top Action Bar (Hidden during print) */}
      <div className="print:hidden bg-surface rounded-2xl border border-border p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/writer/commission"
          className="inline-flex items-center text-xs font-semibold text-secondary hover:text-navy transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to All Invoices
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg border border-border bg-ivory text-navy hover:bg-slate-100 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4 mr-1.5 text-accent" />
            Print Statement
          </button>
        </div>
      </div>

      {/* Printable Statement View Container */}
      <div className="bg-surface rounded-2xl border border-border p-6 sm:p-8 shadow-sm space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Statement Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-border pb-6 gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-bold tracking-tight text-navy">
                UNB Premium
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-navy text-white">
                PLATFORM FEE STATEMENT
              </span>
            </div>
            <p className="text-xs text-secondary">
              Urdu Novels Bazaar • Platform Remittance Service
            </p>
            <p className="text-[11px] text-secondary">
              Karachi, Pakistan • All calculations in PKR (Asia/Karachi PKT)
            </p>
          </div>

          <div className="sm:text-right space-y-1">
            <div className="text-xs text-secondary font-mono">Invoice Number</div>
            <div className="font-mono text-xl font-bold text-navy">
              {invoice.invoice_number}
            </div>
            <div className="flex sm:justify-end gap-2 pt-1 print:hidden">
              <StatusBadge status={invoice.status} size="sm" />
              {invoice.is_overdue && invoice.status !== 'settled' && invoice.status !== 'void' && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                  Overdue
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Invoice Metadata Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-ivory p-4 rounded-xl border border-border">
          <div>
            <div className="text-secondary text-[11px] uppercase">Billing Period</div>
            <div className="font-semibold text-navy mt-0.5">
              {formatKarachiDateTime(invoice.period_start, false)} — {formatKarachiDateTime(invoice.period_end, false)}
            </div>
          </div>
          <div>
            <div className="text-secondary text-[11px] uppercase">Due Date</div>
            <div className="font-semibold text-navy mt-0.5">
              {invoice.due_date ? formatKarachiDateTime(invoice.due_date, false) : 'Upon Receipt'}
            </div>
          </div>
          <div>
            <div className="text-secondary text-[11px] uppercase">Issued Date</div>
            <div className="font-semibold text-navy mt-0.5 font-mono">
              {formatKarachiDateTime(invoice.created_at)}
            </div>
          </div>
        </div>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface p-4 rounded-xl border border-border space-y-1 text-center sm:text-left">
            <span className="text-[10px] uppercase font-semibold text-secondary">
              Total Invoiced Platform Fee
            </span>
            <div className="text-xl font-bold font-mono text-navy">
              {formatPKR2(invoice.total_commission_owed_pkr)}
            </div>
          </div>

          <div className="bg-surface p-4 rounded-xl border border-border space-y-1 text-center sm:text-left">
            <span className="text-[10px] uppercase font-semibold text-secondary">
              Confirmed Settled
            </span>
            <div className="text-xl font-bold font-mono text-emerald-700">
              {formatPKR2(invoice.amount_settled_pkr)}
            </div>
          </div>

          <div className="bg-surface p-4 rounded-xl border border-border space-y-1 text-center sm:text-left">
            <span className="text-[10px] uppercase font-semibold text-secondary">
              Remaining Amount Due
            </span>
            <div className={`text-xl font-bold font-mono ${remainingDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {formatPKR2(remainingDue)}
            </div>
          </div>
        </div>

        {/* Itemized Lines Breakdown Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-bold text-sm text-navy flex items-center gap-2">
              <Receipt className="w-4 h-4 text-accent" />
              Itemized Statement Lines ({lines.length})
            </h3>
            <span className="text-[11px] text-secondary">
              All ledger entries billed in this invoice
            </span>
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-ivory border-b border-border text-secondary font-semibold uppercase tracking-wider text-[10px]">
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
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-mono text-[11px] text-secondary whitespace-nowrap">
                      {formatKarachiDateTime(line.created_at)}
                    </td>
                    <td className="py-2 px-3 font-mono font-medium text-navy">
                      {line.order_number || '—'}
                    </td>
                    <td className="py-2 px-3 text-main font-medium line-clamp-1">
                      {line.novel_title}
                    </td>
                    <td className="py-2 px-3 text-secondary">
                      {line.reader_display_name}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-slate-100 text-slate-700">
                        {line.entry_type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-navy">
                      {formatPKR2(line.gross_amount_pkr)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-secondary">
                      {line.commission_rate.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-navy">
                      {formatPKR2(line.commission_pkr)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-ivory font-semibold text-navy border-t border-border">
                <tr>
                  <td colSpan={7} className="py-2.5 px-3 text-right uppercase text-[10px] tracking-wider">
                    Total Statement Platform Fee:
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-sm text-navy">
                    {formatPKR2(invoice.total_commission_owed_pkr)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Confirmed Settlement Payments */}
        {payments.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-serif font-bold text-sm text-navy flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Confirmed Platform Settlement Receipts ({payments.length})
            </h3>
            <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
              {payments.map((p) => (
                <div key={p.id} className="p-3 bg-emerald-50/40 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="font-medium text-emerald-900 flex items-center gap-2">
                      <span>Confirmed Deposit Receipt</span>
                      <span className="font-mono text-[11px] text-emerald-700">
                        {formatKarachiDateTime(p.confirmed_at)}
                      </span>
                    </div>
                    {p.notes && (
                      <p className="text-[11px] text-secondary">Note: {p.notes}</p>
                    )}
                  </div>
                  <div className="font-mono font-bold text-emerald-800 text-sm">
                    {formatPKR2(p.amount_pkr)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Platform Payment Instructions (Hidden during print) */}
      {canReportPayment && (
        <div className="print:hidden bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif font-bold text-base text-navy flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-accent" />
                Official Platform Payment Accounts
              </h2>
              <p className="text-xs text-secondary mt-0.5">
                Remit your platform fee to any of the verified platform accounts below using mobile banking or wallets.
              </p>
            </div>
            <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Verified Accounts
            </span>
          </div>

          {paymentInstructions.length === 0 ? (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
              No platform payment accounts are currently configured. Please contact platform administration for settlement details.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paymentInstructions.map((m) => {
                const isBank = m.method_type === 'bank_transfer';
                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl border border-border bg-ivory space-y-3 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isBank ? (
                          <Building className="w-4 h-4 text-navy" />
                        ) : (
                          <Smartphone className="w-4 h-4 text-accent" />
                        )}
                        <span className="text-xs font-bold text-navy uppercase">
                          {m.bank_name || m.method_type.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                        {m.method_type.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="text-[10px] text-secondary uppercase">Account Title:</span>
                        <div className="font-semibold text-navy">{m.account_title}</div>
                      </div>

                      <div>
                        <span className="text-[10px] text-secondary uppercase">
                          {isBank ? 'IBAN / Account Number:' : 'Mobile Wallet Number:'}
                        </span>
                        <div className="flex items-center justify-between bg-white p-2 rounded border border-border font-mono font-medium text-navy">
                          <span>{m.account_number_or_iban}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(m.account_number_or_iban, m.id)}
                            className="text-secondary hover:text-navy p-1 transition-colors"
                            title="Copy Account Number"
                          >
                            {copiedId === m.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {m.instructions_note && (
                        <p className="text-[11px] text-secondary italic">
                          Note: {m.instructions_note}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* "I Paid the Platform" Reporting Form (Hidden during print) */}
      {canReportPayment && remainingDue > 0 && (
        <div className="print:hidden bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-6">
          <div>
            <h2 className="font-serif font-bold text-base text-navy flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-accent" />
              Report Payment to Platform Administration
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Submit your bank transaction reference and deposit receipt.
            </p>
          </div>

          {/* Legal / Process Alert */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>Independent Verification Rule</span>
            </div>
            <p>
              Reporting your payment registers a claim. The platform fee is ONLY marked settled and deducted
              from your outstanding balance after an administrator verifies the receipt against our bank statement.
            </p>
          </div>

          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{formSuccess}</span>
            </div>
          )}

          <form onSubmit={handleReportPayment} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-navy mb-1">
                  Amount Transferred (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={amountPkr}
                  onChange={(e) => setAmountPkr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-navy font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="text-[10px] text-secondary mt-1">
                  Remaining statement due: {formatPKR2(remainingDue)}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-navy mb-1">
                  Transaction Reference (TID / Ref #) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 023948572910"
                  value={tid}
                  onChange={(e) => setTid(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-navy font-mono uppercase focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="text-[10px] text-secondary mt-1">
                  Enter exactly as printed on your banking receipt (6-40 characters)
                </p>
              </div>
            </div>

            {/* Proof Upload */}
            <div>
              <label className="block text-[11px] font-medium text-navy mb-1.5">
                Bank / Wallet Transfer Receipt Screenshot *
              </label>
              <ImageUploader
                bucket="payment-proofs"
                preset="payment-screenshot"
                folder={invoice.id}
                value={screenshotPath}
                onChange={(path) => setScreenshotPath(path)}
                helperText="Upload clear receipt showing transaction TID, timestamp, and amount transferred"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-navy mb-1">
                Optional Writer Note
              </label>
              <textarea
                rows={2}
                placeholder="Optional notes or details regarding your transfer..."
                value={writerNote}
                onChange={(e) => setWriterNote(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-navy text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !screenshotPath || !tid}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Submitting Claim...' : 'Submit Payment Claim'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Submitted Payment Claims History (Hidden during print) */}
      <div className="print:hidden bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <h2 className="font-serif font-bold text-base text-navy flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" />
          Submitted Payment Claims ({reports.length})
        </h2>

        {reports.length === 0 ? (
          <p className="text-xs text-secondary italic">
            No payment claims submitted yet for this invoice.
          </p>
        ) : (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {reports.map((r) => {
              const statusBadgeKey = `report_${r.status}`;
              return (
                <div key={r.id} className="p-4 space-y-2 text-xs hover:bg-slate-50/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-navy">
                        {formatPKR2(r.amount_pkr)}
                      </span>
                      <span className="text-secondary font-mono text-[11px]">
                        TID: {r.transaction_reference}
                      </span>
                    </div>
                    <StatusBadge status={statusBadgeKey} size="sm" />
                  </div>

                  <div className="text-[11px] text-secondary flex flex-wrap items-center gap-3">
                    <span>Submitted: {formatKarachiDateTime(r.created_at)}</span>
                    {r.reviewed_at && (
                      <span>Reviewed: {formatKarachiDateTime(r.reviewed_at)}</span>
                    )}
                  </div>

                  {r.writer_note && (
                    <p className="text-[11px] text-secondary bg-ivory p-2 rounded border border-border">
                      Author Note: {r.writer_note}
                    </p>
                  )}

                  {/* Rejection Note if Rejected */}
                  {r.status === 'rejected' && r.admin_note && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Rejection Reason:</span>
                      </div>
                      <p className="text-[11px]">{r.admin_note}</p>
                    </div>
                  )}

                  {/* Confirmation note if confirmed */}
                  {r.status === 'confirmed' && (
                    <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Deposit verified and credited by administration.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
