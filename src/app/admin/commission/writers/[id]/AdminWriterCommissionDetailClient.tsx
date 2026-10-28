'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UrduText } from '@/components/urdu/UrduText';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatKarachiDateTime, formatPKR2, getKarachiMonthBounds } from '@/lib/commission/time';
import {
  previewCommissionInvoiceAction,
  generateCommissionInvoiceAction,
  recordCommissionAdjustmentAction,
} from '@/app/actions/admin-commission';
import type { CommissionInvoiceRow } from '@/types/database';
import {
  ArrowLeft,
  DollarSign,
  Receipt,
  FilePlus,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  X,
} from 'lucide-react';

interface AdminWriterCommissionDetailClientProps {
  writer: {
    id: string;
    pen_name_english: string;
    pen_name_urdu: string;
    custom_commission_rate: number | null;
    current_unpaid_commission: number;
    unpaid_commission_limit: number;
    is_orders_paused_for_commission: boolean;
  };
  invoices: CommissionInvoiceRow[];
  recentLedger: Array<{
    id: string;
    created_at: string;
    entry_type: string;
    gross_amount_pkr: number;
    platform_commission_pkr: number;
    writer_net_pkr: number;
    notes: string | null;
  }>;
}

export function AdminWriterCommissionDetailClient({
  writer,
  invoices,
  recentLedger,
}: AdminWriterCommissionDetailClientProps) {
  const router = useRouter();

  // Invoice Generation State
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<'this_month' | 'last_month' | 'custom'>('last_month');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewData, setPreviewData] = useState<{
    total_commission_pkr: number;
    gross_volume_pkr: number;
    line_count: number;
    lines: Array<{
      ledger_entry_id: string;
      order_id: string | null;
      gross_pkr: number;
      commission_pkr: number;
      entry_type: string;
      created_at: string;
    }>;
  } | null>(null);
  const [invoiceModalError, setInvoiceModalError] = useState<string | null>(null);
  const [invoiceModalSuccess, setInvoiceModalSuccess] = useState<string | null>(null);

  // Manual Adjustment State
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [adjustmentSuccess, setAdjustmentSuccess] = useState<string | null>(null);

  const setMonthPreset = (preset: 'this_month' | 'last_month') => {
    setPeriodPreset(preset);
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    if (preset === 'last_month') {
      if (m === 1) {
        y -= 1;
        m = 12;
      } else {
        m -= 1;
      }
    }
    const bounds = getKarachiMonthBounds(y, m);
    setPeriodStart(bounds.periodStartIso);
    setPeriodEnd(bounds.periodEndIso);
    setPreviewData(null);
  };

  const handleOpenInvoiceModal = () => {
    setIsInvoiceModalOpen(true);
    setInvoiceModalError(null);
    setInvoiceModalSuccess(null);
    setPreviewData(null);
    setMonthPreset('last_month');
  };

  const handlePreviewInvoice = async () => {
    if (!periodStart || !periodEnd) {
      setInvoiceModalError('Please select both period start and period end boundaries.');
      return;
    }

    setIsPreviewing(true);
    setInvoiceModalError(null);

    try {
      const res = await previewCommissionInvoiceAction(writer.id, periodStart, periodEnd);
      if (!res.success) {
        setInvoiceModalError(res.error || 'Failed to preview invoice.');
      } else {
        setPreviewData(res.preview);
        if (res.preview.total_commission_pkr <= 0) {
          setInvoiceModalError(
            `Total uninvoiced platform fee for this period is ${formatPKR2(
              res.preview.total_commission_pkr
            )}. Invoices must have a positive platform fee total.`
          );
        }
      }
    } catch (err: unknown) {
      setInvoiceModalError(err instanceof Error ? err.message : 'Unexpected preview error.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!previewData || previewData.total_commission_pkr <= 0) {
      setInvoiceModalError('Cannot issue an invoice with zero or negative total.');
      return;
    }

    setIsGenerating(true);
    setInvoiceModalError(null);

    try {
      const res = await generateCommissionInvoiceAction(writer.id, periodStart, periodEnd);
      if (!res.success) {
        setInvoiceModalError(res.error || 'Failed to generate invoice.');
      } else {
        setInvoiceModalSuccess(
          `Invoice ${res.invoice?.invoice_number} generated successfully with ${previewData.line_count} line items!`
        );
        router.refresh();
      }
    } catch (err: unknown) {
      setInvoiceModalError(err instanceof Error ? err.message : 'Unexpected generation error.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecordAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustmentError(null);
    setAdjustmentSuccess(null);

    const parsedAmount = parseFloat(adjustmentAmount);
    if (isNaN(parsedAmount) || parsedAmount === 0) {
      setAdjustmentError('Please enter a non-zero adjustment amount (positive or negative).');
      return;
    }

    if (!adjustmentReason || adjustmentReason.trim().length < 5) {
      setAdjustmentError('A mandatory explanatory reason of at least 5 characters is required.');
      return;
    }

    setIsSubmittingAdjustment(true);

    try {
      const res = await recordCommissionAdjustmentAction({
        writerId: writer.id,
        amountPkr: parsedAmount,
        reason: adjustmentReason.trim(),
      });

      if (!res.success) {
        setAdjustmentError(res.error || 'Failed to record adjustment.');
      } else {
        setAdjustmentSuccess('Manual platform fee adjustment recorded successfully in sales ledger.');
        setAdjustmentAmount('');
        setAdjustmentReason('');
        router.refresh();
      }
    } catch (err: unknown) {
      setAdjustmentError(err instanceof Error ? err.message : 'Unexpected adjustment error.');
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/commission"
            className="inline-flex items-center text-xs font-semibold text-muted hover:text-main mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Platform Fee Overview
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-serif font-bold text-main">
              {writer.pen_name_english}
            </h1>
            <UrduText as="span" size="sm" className="text-muted py-0">
              ({writer.pen_name_urdu})
            </UrduText>
          </div>
          <p className="text-xs text-muted mt-1">
            Author ID: <span className="font-mono">{writer.id}</span> • Rate: <span className="font-mono">{writer.custom_commission_rate ?? 20}%</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenInvoiceModal}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white shadow-sm transition-colors"
          >
            <FilePlus className="w-4 h-4 mr-1.5" />
            Issue Platform Fee Invoice
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdjustmentModalOpen(true);
              setAdjustmentError(null);
              setAdjustmentSuccess(null);
            }}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-surface hover:bg-surface-muted text-main border border-border shadow-sm transition-colors"
          >
            <Sliders className="w-4 h-4 mr-1.5 text-amber-600" />
            Record Adjustment
          </button>
          <Link
            href={`/admin/writers/${writer.id}`}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-surface hover:bg-surface-muted text-main border border-border shadow-sm transition-colors"
          >
            <span>Edit Profile & Terms</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1.5 text-muted" />
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5 shadow-card space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Outstanding Platform Fee
          </span>
          <div className="text-2xl font-bold font-mono text-main">
            {formatPKR2(writer.current_unpaid_commission)}
          </div>
          <p className="text-[11px] text-muted">
            Unpaid liability to platform
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-card space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Threshold Limit
          </span>
          <div className="text-2xl font-bold font-mono text-accent-admin">
            {formatPKR2(writer.unpaid_commission_limit)}
          </div>
          <p className="text-[11px] text-muted">
            Pause threshold trigger
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 shadow-card space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Ordering Status
          </span>
          <div className="pt-1">
            {writer.is_orders_paused_for_commission ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                Reader Orders Paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Active & Good Standing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Invoices List for this Writer */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-accent-admin" />
            <h2 className="font-serif font-bold text-sm text-main">
              Billing Invoices ({invoices.length})
            </h2>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center text-muted text-xs">
            No invoices have been issued for this author yet. Use &quot;Issue Platform Fee Invoice&quot; to bill accrued sales.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="p-4 hover:bg-surface-muted/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-main">
                      {inv.invoice_number}
                    </span>
                    <StatusBadge status={inv.status} size="sm" />
                  </div>
                  <div className="text-muted text-[11px]">
                    Period: {formatKarachiDateTime(inv.period_start, false)} —{' '}
                    {formatKarachiDateTime(inv.period_end, false)}
                    {inv.due_date && ` • Due: ${formatKarachiDateTime(inv.due_date, false)}`}
                  </div>
                </div>

                <div className="flex items-center gap-6 justify-between sm:justify-end">
                  <div className="text-right">
                    <div className="font-mono font-bold text-main">
                      {formatPKR2(inv.total_commission_owed_pkr)}
                    </div>
                    <div className="text-[11px] font-mono text-emerald-700 font-semibold">
                      Settled: {formatPKR2(inv.amount_settled_pkr)}
                    </div>
                  </div>
                  <Link
                    href={`/admin/invoices/${inv.id}`}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-muted text-main border border-border text-xs font-semibold transition-colors"
                  >
                    <span>Inspect</span>
                    <ChevronRight className="w-4 h-4 ml-1 text-muted" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Ledger Entries */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <h2 className="font-serif font-bold text-sm text-main">
              Recent Sales Ledger Entries ({recentLedger.length})
            </h2>
          </div>
        </div>

        {recentLedger.length === 0 ? (
          <div className="p-8 text-center text-muted text-xs">
            No sales ledger entries found for this author.
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-muted border-b border-border text-muted font-medium text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Date (PKT)</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Gross</th>
                  <th className="py-2.5 px-3 text-right">Platform Fee</th>
                  <th className="py-2.5 px-3 text-right">Writer Net</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentLedger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-surface-muted/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-muted whitespace-nowrap">
                      {formatKarachiDateTime(entry.created_at)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StatusBadge status={entry.entry_type} size="sm" />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-main whitespace-nowrap">
                      {formatPKR2(entry.gross_amount_pkr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-rose-700 whitespace-nowrap">
                      {formatPKR2(entry.platform_commission_pkr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                      {formatPKR2(entry.writer_net_pkr)}
                    </td>
                    <td className="py-2.5 px-3 text-muted max-w-xs truncate break-words" title={entry.notes || undefined}>
                      {entry.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Generation Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-accent-admin" />
                <h3 className="font-serif font-bold text-lg text-main">
                  Generate Platform Fee Invoice
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-muted hover:text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {invoiceModalSuccess ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs">
                  {invoiceModalSuccess}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {invoiceModalError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
                    {invoiceModalError}
                  </div>
                )}

                {/* Billing Period Presets */}
                <div className="space-y-2">
                  <label className="block text-main font-medium">Billing Period Presets</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMonthPreset('last_month')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        periodPreset === 'last_month'
                          ? 'bg-accent-admin text-white'
                          : 'bg-surface border border-border text-main hover:bg-surface-muted'
                      }`}
                    >
                      Last Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthPreset('this_month')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        periodPreset === 'this_month'
                          ? 'bg-accent-admin text-white'
                          : 'bg-surface border border-border text-main hover:bg-surface-muted'
                      }`}
                    >
                      This Month
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted mb-1 font-medium">Period Start (PKT)</label>
                    <input
                      type="datetime-local"
                      value={periodStart.slice(0, 16)}
                      onChange={(e) => {
                        setPeriodPreset('custom');
                        setPeriodStart(e.target.value ? `${e.target.value}:00+05:00` : '');
                        setPreviewData(null);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-main focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin"
                    />
                  </div>
                  <div>
                    <label className="block text-muted mb-1 font-medium">Period End (PKT)</label>
                    <input
                      type="datetime-local"
                      value={periodEnd.slice(0, 16)}
                      onChange={(e) => {
                        setPeriodPreset('custom');
                        setPeriodEnd(e.target.value ? `${e.target.value}:59+05:00` : '');
                        setPreviewData(null);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-main focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isPreviewing || !periodStart || !periodEnd}
                    onClick={handlePreviewInvoice}
                    className="w-full px-4 py-2 rounded-lg bg-surface hover:bg-surface-muted text-main border border-border font-semibold transition-colors disabled:opacity-50"
                  >
                    {isPreviewing ? 'Calculating Uninvoiced Lines...' : 'Preview Uninvoiced Transactions'}
                  </button>
                </div>

                {previewData && (
                  <div className="space-y-3 p-4 bg-surface-muted rounded-xl border border-border mt-4">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="font-semibold text-main">Preview Summary:</span>
                      <span className="font-mono text-accent-admin font-bold">
                        {previewData.line_count} entry/entries
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-muted uppercase font-semibold">Gross Volume:</span>
                        <div className="font-mono font-medium text-main">
                          {formatPKR2(previewData.gross_volume_pkr)}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted uppercase font-semibold">Total Platform Fee:</span>
                        <div className="font-mono font-bold text-rose-700">
                          {formatPKR2(previewData.total_commission_pkr)}
                        </div>
                      </div>
                    </div>

                    {previewData.line_count === 0 && (
                      <p className="text-amber-700 italic text-[11px] pt-1">
                        No uninvoiced verified sales, refund adjustments, or manual corrections found for this period.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-surface border border-border text-muted hover:text-main"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating || !previewData || previewData.total_commission_pkr <= 0}
                    onClick={handleGenerateInvoice}
                    className="px-5 py-2 rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    {isGenerating ? 'Generating...' : 'Confirm & Issue Invoice'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Adjustment Modal */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-600" />
                <h3 className="font-serif font-bold text-lg text-main">
                  Record Platform Fee Adjustment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="text-muted hover:text-main"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adjustmentSuccess ? (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl">
                  {adjustmentSuccess}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsAdjustmentModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRecordAdjustment} className="space-y-4 text-xs">
                {adjustmentError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
                    {adjustmentError}
                  </div>
                )}

                <p className="text-muted">
                  Inserts an auditable <code className="text-accent-admin font-mono">manual_correction</code> row into the sales ledger. Positive amounts increase platform fee liability. Negative amounts credit the writer.
                </p>

                <div>
                  <label className="block text-main font-medium mb-1">
                    Platform Fee Adjustment Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 500 or -250"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-main font-mono focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin"
                  />
                  <p className="text-[10px] text-muted mt-1">
                    Use negative numbers to reduce author platform fee debt.
                  </p>
                </div>

                <div>
                  <label className="block text-main font-medium mb-1">
                    Mandatory Auditable Reason *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Explain the operational reason for this adjustment..."
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-main focus:outline-none focus:ring-2 focus:ring-accent-admin focus:border-accent-admin"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsAdjustmentModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-surface border border-border text-muted hover:text-main"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAdjustment}
                    className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    {isSubmittingAdjustment ? 'Recording...' : 'Record Adjustment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
