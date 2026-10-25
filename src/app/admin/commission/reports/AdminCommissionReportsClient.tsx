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
      <div className="bg-surface border border-border shadow-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/commission"
            className="inline-flex items-center text-xs font-semibold text-secondary hover:text-navy mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Commission Overview
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-accent-admin-light text-accent-admin border border-accent-admin-border">
              Operations Queue
            </span>
            <span className="text-xs text-secondary font-medium">
              Direct Bank Deposit Verification
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy mt-1">
            Author Payment Reports Queue
          </h1>
          <p className="text-xs text-secondary mt-0.5">
            Claims submitted by authors stating commission was transferred. Bank deposit verification required.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/invoices"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-xl bg-surface hover:bg-ivory text-main border border-border shadow-xs transition-colors"
          >
            <Receipt className="w-4 h-4 mr-1.5 text-accent-admin" />
            All Invoices
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-surface border border-border shadow-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search TID, invoice number, or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-surface text-main placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent-admin/40 focus:border-accent-admin"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              filter === 'pending'
                ? 'bg-amber-600 text-white'
                : 'bg-surface text-secondary hover:text-navy hover:bg-ivory border border-border'
            }`}
          >
            Pending Claims
          </button>
          <button
            type="button"
            onClick={() => setFilter('confirmed')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              filter === 'confirmed'
                ? 'bg-emerald-600 text-white'
                : 'bg-surface text-secondary hover:text-navy hover:bg-ivory border border-border'
            }`}
          >
            Confirmed
          </button>
          <button
            type="button"
            onClick={() => setFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              filter === 'rejected'
                ? 'bg-rose-600 text-white'
                : 'bg-surface text-secondary hover:text-navy hover:bg-ivory border border-border'
            }`}
          >
            Rejected
          </button>
          <button
            type="button"
            onClick={() => setFilter('')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              filter === ''
                ? 'bg-accent-admin text-white'
                : 'bg-surface text-secondary hover:text-navy hover:bg-ivory border border-border'
            }`}
          >
            All Reports ({reports.length})
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-surface border border-border shadow-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h2 className="font-serif font-bold text-navy text-sm">
              Payment Reports ({filteredReports.length})
            </h2>
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <div className="p-12 text-center text-secondary text-xs">
            No payment reports found matching current filter.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredReports.map((r) => (
              <div
                key={r.id}
                className="p-4 hover:bg-ivory/50 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-navy text-sm">
                      {formatPKR2(r.amount_pkr)}
                    </span>
                    <span className="font-mono text-[11px] text-secondary">
                      TID: {r.transaction_reference}
                    </span>
                    <StatusBadge status={`report_${r.status}`} size="sm" />
                    {r.is_duplicate_tid && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        Duplicate TID
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-main">
                    <span className="font-semibold text-main">
                      {r.writer_pen_name}
                    </span>
                    {r.writer_username && (
                      <span className="text-secondary text-xs font-mono">
                        (@{r.writer_username})
                      </span>
                    )}
                    <span className="text-secondary">•</span>
                    <span className="font-mono text-accent-admin font-medium">
                      Invoice: {r.invoice_number}
                    </span>
                  </div>

                  <div className="text-[11px] text-secondary">
                    Reported on: {formatKarachiDateTime(r.created_at)}
                    {r.writer_note && ` • Note: ${r.writer_note}`}
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-between md:justify-end">
                  <button
                    type="button"
                    onClick={() => handleOpenProof(r.screenshot_path)}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-surface hover:bg-ivory text-main border border-border text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5 text-accent-admin" />
                    View Receipt
                  </button>

                  <Link
                    href={`/admin/invoices/${r.invoice_id}`}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-lg bg-accent-admin hover:bg-accent-admin-dark text-white text-xs font-semibold shadow-xs transition-colors"
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
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-serif font-bold text-navy text-base">
                Payment Proof Receipt
              </h3>
              <button
                type="button"
                onClick={() => {
                  setViewingProofUrl(null);
                  setIsLoadingProof(false);
                  setProofError(null);
                }}
                className="text-secondary hover:text-navy cursor-pointer p-1 rounded-lg hover:bg-ivory"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingProof && (
              <div className="py-12 text-center text-xs text-secondary">
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
                <div className="relative max-h-[70vh] overflow-auto rounded-xl border border-border bg-ivory/40 flex items-center justify-center p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewingProofUrl}
                    alt="Payment receipt proof"
                    className="max-w-full max-h-[65vh] object-contain rounded-lg"
                  />
                </div>
                <div className="flex justify-end">
                  <a
                    href={viewingProofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent-admin hover:underline flex items-center gap-1 font-semibold"
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
