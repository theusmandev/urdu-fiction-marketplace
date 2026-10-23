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
            `Total uninvoiced commission for this period is ${formatPKR2(
              res.preview.total_commission_pkr
            )}. Invoices must have a positive commission total.`
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
        setAdjustmentSuccess('Manual commission adjustment recorded successfully in sales ledger.');
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
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/commission"
            className="inline-flex items-center text-xs font-semibold text-slate-400 hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Commission Overview
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-serif font-bold text-white">
              {writer.pen_name_english}
            </h1>
            <UrduText as="span" size="sm" className="text-slate-400 py-0">
              ({writer.pen_name_urdu})
            </UrduText>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Author ID: {writer.id} • Rate: {writer.custom_commission_rate ?? 20}%
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenInvoiceModal}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
          >
            <FilePlus className="w-4 h-4 mr-1.5" />
            Issue Commission Invoice
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdjustmentModalOpen(true);
              setAdjustmentError(null);
              setAdjustmentSuccess(null);
            }}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors"
          >
            <Sliders className="w-4 h-4 mr-1.5 text-amber-400" />
            Record Adjustment
          </button>
          <Link
            href={`/admin/writers/${writer.id}`}
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors"
          >
            <span>Edit Profile & Terms</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1.5 text-slate-400" />
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Outstanding Commission
          </span>
          <div className="text-2xl font-bold font-mono text-white">
            {formatPKR2(writer.current_unpaid_commission)}
          </div>
          <p className="text-[11px] text-slate-500">
            Unpaid liability to platform
          </p>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Threshold Limit
          </span>
          <div className="text-2xl font-bold font-mono text-indigo-400">
            {formatPKR2(writer.unpaid_commission_limit)}
          </div>
          <p className="text-[11px] text-slate-500">
            Pause threshold trigger
          </p>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Ordering Status
          </span>
          <div className="pt-1">
            {writer.is_orders_paused_for_commission ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <AlertTriangle className="w-3.5 h-3.5" />
                Reader Orders Paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Active & Good Standing
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Invoices List for this Writer */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-400" />
            <h2 className="font-serif font-bold text-sm text-white">
              Billing Invoices ({invoices.length})
            </h2>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No invoices have been issued for this author yet. Use &quot;Issue Commission Invoice&quot; to bill accrued sales.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="p-4 hover:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">
                      {inv.invoice_number}
                    </span>
                    <StatusBadge status={inv.status} size="sm" />
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Period: {formatKarachiDateTime(inv.period_start, false)} —{' '}
                    {formatKarachiDateTime(inv.period_end, false)}
                    {inv.due_date && ` • Due: ${formatKarachiDateTime(inv.due_date, false)}`}
                  </div>
                </div>

                <div className="flex items-center gap-6 justify-between sm:justify-end">
                  <div className="text-right">
                    <div className="font-mono font-bold text-white">
                      {formatPKR2(inv.total_commission_owed_pkr)}
                    </div>
                    <div className="text-[11px] font-mono text-emerald-400">
                      Settled: {formatPKR2(inv.amount_settled_pkr)}
                    </div>
                  </div>
                  <Link
                    href={`/admin/invoices/${inv.id}`}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold"
                  >
                    <span>Inspect</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Ledger Entries */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h2 className="font-serif font-bold text-sm text-white">
              Recent Sales Ledger Entries ({recentLedger.length})
            </h2>
          </div>
        </div>

        {recentLedger.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No sales ledger entries found for this author.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Date (PKT)</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Gross</th>
                  <th className="py-2.5 px-3 text-right">Commission</th>
                  <th className="py-2.5 px-3 text-right">Writer Net</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recentLedger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-900/50">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {formatKarachiDateTime(entry.created_at)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StatusBadge status={entry.entry_type} size="sm" />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                      {formatPKR2(entry.gross_amount_pkr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-rose-400">
                      {formatPKR2(entry.platform_commission_pkr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                      {formatPKR2(entry.writer_net_pkr)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-indigo-400" />
                <h3 className="font-serif font-bold text-lg text-white">
                  Generate Commission Invoice
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {invoiceModalSuccess ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs">
                  {invoiceModalSuccess}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {invoiceModalError && (
                  <div className="p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl">
                    {invoiceModalError}
                  </div>
                )}

                {/* Billing Period Presets */}
                <div className="space-y-2">
                  <label className="block text-slate-300 font-medium">Billing Period Presets</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMonthPreset('last_month')}
                      className={`px-3 py-1.5 rounded-lg font-medium ${
                        periodPreset === 'last_month'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      Last Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthPreset('this_month')}
                      className={`px-3 py-1.5 rounded-lg font-medium ${
                        periodPreset === 'this_month'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      This Month
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Period Start (PKT)</label>
                    <input
                      type="datetime-local"
                      value={periodStart.slice(0, 16)}
                      onChange={(e) => {
                        setPeriodPreset('custom');
                        setPeriodStart(e.target.value ? `${e.target.value}:00+05:00` : '');
                        setPreviewData(null);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Period End (PKT)</label>
                    <input
                      type="datetime-local"
                      value={periodEnd.slice(0, 16)}
                      onChange={(e) => {
                        setPeriodPreset('custom');
                        setPeriodEnd(e.target.value ? `${e.target.value}:59+05:00` : '');
                        setPreviewData(null);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isPreviewing || !periodStart || !periodEnd}
                    onClick={handlePreviewInvoice}
                    className="w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold disabled:opacity-50"
                  >
                    {isPreviewing ? 'Calculating Uninvoiced Lines...' : 'Preview Uninvoiced Transactions'}
                  </button>
                </div>

                {previewData && (
                  <div className="space-y-3 p-4 bg-slate-950 rounded-xl border border-slate-800 mt-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-semibold text-white">Preview Summary:</span>
                      <span className="font-mono text-indigo-400 font-bold">
                        {previewData.line_count} entry/entries
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-slate-300">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase">Gross Volume:</span>
                        <div className="font-mono font-medium text-white">
                          {formatPKR2(previewData.gross_volume_pkr)}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase">Total Commission:</span>
                        <div className="font-mono font-bold text-rose-400">
                          {formatPKR2(previewData.total_commission_pkr)}
                        </div>
                      </div>
                    </div>

                    {previewData.line_count === 0 && (
                      <p className="text-amber-400 italic text-[11px] pt-1">
                        No uninvoiced verified sales, refund adjustments, or manual corrections found for this period.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating || !previewData || previewData.total_commission_pkr <= 0}
                    onClick={handleGenerateInvoice}
                    className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                <h3 className="font-serif font-bold text-lg text-white">
                  Record Commission Adjustment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adjustmentSuccess ? (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl">
                  {adjustmentSuccess}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsAdjustmentModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRecordAdjustment} className="space-y-4 text-xs">
                {adjustmentError && (
                  <div className="p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl">
                    {adjustmentError}
                  </div>
                )}

                <p className="text-slate-400">
                  Inserts an auditable <code className="text-indigo-300">manual_correction</code> row into the append-only sales ledger. Positive amounts increase platform commission (and reduce writer net). Negative amounts credit the writer.
                </p>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Commission Adjustment Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 500 or -250"
                    value={adjustmentAmount}
                    onChange={(e) => setAdjustmentAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Use negative numbers to reduce author commission debt.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Mandatory Auditable Reason *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Explain the operational reason for this adjustment..."
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAdjustmentModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAdjustment}
                    className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
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
