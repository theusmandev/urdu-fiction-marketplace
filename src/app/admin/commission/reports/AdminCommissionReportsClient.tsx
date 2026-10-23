'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatKarachiDateTime, formatPKR2 } from '@/lib/commission/time';
import type { AdminCommissionReportItem } from '@/types/database';
import {
  Clock,
  Receipt,
  Search,
  Eye,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  X,
} from 'lucide-react';

interface AdminCommissionReportsClientProps {
  reports: AdminCommissionReportItem[];
  initialStatus: string;
}

export function AdminCommissionReportsClient({
  reports,
  initialStatus,
}: AdminCommissionReportsClientProps) {
  const [filter, setFilter] = useState(initialStatus || 'pending');
  const [search, setSearch] = useState('');

  // Proof modal
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

  const filteredReports = reports.filter((r) => {
    if (filter && r.status !== filter) return false;

    if (search) {
      const s = search.toLowerCase();
      const matchTid = r.transaction_reference.toLowerCase().includes(s);
      const matchInv = r.invoice_number.toLowerCase().includes(s);
      const matchWriter = r.writer_pen_name.toLowerCase().includes(s);
      return matchTid || matchInv || matchWriter;
    }

    return true;
  });

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
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Operations Queue
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Direct Bank Deposit Verification
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-white mt-1">
            Author Payment Reports Queue
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Claims submitted by authors stating commission was transferred. Bank deposit verification required.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/invoices"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-colors"
          >
            <Receipt className="w-4 h-4 mr-1.5 text-indigo-400" />
            All Invoices
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search TID, invoice number, or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'pending'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            Pending Claims
          </button>
          <button
            type="button"
            onClick={() => setFilter('confirmed')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'confirmed'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            Confirmed
          </button>
          <button
            type="button"
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === 'rejected'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            Rejected
          </button>
          <button
            type="button"
            onClick={() => setFilter('')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === ''
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            All Reports ({reports.length})
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h2 className="font-serif font-bold text-white text-sm">
              Payment Reports ({filteredReports.length})
            </h2>
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No payment reports found matching current filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredReports.map((r) => (
              <div
                key={r.id}
                className="p-4 hover:bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-white text-sm">
                      {formatPKR2(r.amount_pkr)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      TID: {r.transaction_reference}
                    </span>
                    <StatusBadge status={`report_${r.status}`} size="sm" />
                    {r.is_duplicate_tid && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Duplicate TID
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="font-semibold text-white">
                      {r.writer_pen_name}
                    </span>
                    {r.writer_username && (
                      <span className="text-slate-400 text-xs font-mono">
                        (@{r.writer_username})
                      </span>
                    )}
                    <span>•</span>
                    <span className="font-mono text-indigo-400 font-medium">
                      Invoice: {r.invoice_number}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Reported on: {formatKarachiDateTime(r.created_at)}
                    {r.writer_note && ` • Note: ${r.writer_note}`}
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-between md:justify-end">
                  <button
                    type="button"
                    onClick={() => handleOpenProof(r.screenshot_path)}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    View Receipt
                  </button>

                  <Link
                    href={`/admin/invoices/${r.invoice_id}`}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                  >
                    <span>Inspect Invoice</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proof Viewer Modal */}
      {(viewingProofUrl || isLoadingProof || proofError) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-serif font-bold text-white text-base">
                Payment Proof Receipt
              </h3>
              <button
                type="button"
                onClick={() => {
                  setViewingProofUrl(null);
                  setIsLoadingProof(false);
                  setProofError(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingProof && (
              <div className="py-12 text-center text-xs text-slate-400">
                Generating signed temporary access URL...
              </div>
            )}

            {proofError && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                {proofError}
              </div>
            )}

            {viewingProofUrl && (
              <div className="space-y-3">
                <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewingProofUrl}
                    alt="Payment receipt proof"
                    className="max-w-full max-h-[65vh] object-contain rounded"
                  />
                </div>
                <div className="flex justify-end">
                  <a
                    href={viewingProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
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
