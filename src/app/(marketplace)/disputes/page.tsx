import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { getMyDisputesAction } from '@/app/actions/disputes';
import { getDisputeStatusMeta } from '@/lib/disputes/status-meta';
import { formatPKR } from '@/lib/utils';
import {
  ShieldAlert,
  ArrowRight,
  Clock,
  MessageSquare,
  AlertCircle,
  HelpCircle,
  FileText,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ReaderDisputesPage() {
  await requireAuth('/disputes');
  const result = await getMyDisputesAction();
  const disputes = result.data || [];

  return (
    <div className="min-h-screen bg-ivory text-main py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-brand-gold" />
              <h1 className="text-xl sm:text-2xl font-bold font-serif tracking-tight text-navy">
                Disputes &amp; Resolutions
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-secondary mt-1">
              Track and participate in administrative dispute investigations.
            </p>
          </div>
          <Link
            href="/support"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy bg-surface hover:bg-surface-muted border border-border shadow-sm transition-colors shrink-0"
          >
            <HelpCircle className="w-4 h-4 text-sky-600" />
            <span>Need General Help? Support Desk</span>
          </Link>
        </div>

        {/* Dispute Policy Information Callout */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 sm:p-5 flex items-start gap-3.5">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-amber-900 leading-relaxed">
            <span className="font-bold text-amber-950 block">Direct Reader-to-Author Resolution Policy</span>
            <p className="text-amber-800">
              On UNB Premium, readers pay authors directly. Platform administrators verify evidence and
              adjudicate disputes objectively. Access is unlocked upon verified payment proof, or adjusted if an
              off-platform refund was provided by the author.
            </p>
          </div>
        </div>

        {/* Disputes Listing */}
        {disputes.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-border p-12 text-center space-y-4 shadow-card">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-navy">No active or past disputes</h3>
              <p className="text-xs text-secondary max-w-sm mx-auto">
                All your orders are processed smoothly. If you ever experience issues with a payment deposit, you can
                raise a dispute directly from the order page.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/orders"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-navy bg-brand-gold hover:bg-brand-gold-hover transition-colors shadow-sm"
              >
                <span>View My Orders</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {disputes.map((dispute) => {
              const statusMeta = getDisputeStatusMeta(dispute.status);
              return (
                <Link
                  key={dispute.dispute_id}
                  href={`/disputes/${dispute.dispute_id}`}
                  className="block rounded-2xl bg-surface hover:bg-surface-muted/50 border border-border hover:border-slate-300 p-5 transition-all group shadow-card"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-brand-gold">
                        Order #{dispute.order_number}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          statusMeta.variant === 'warning'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : statusMeta.variant === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : statusMeta.variant === 'destructive'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {statusMeta.label}
                      </span>
                      <span className="text-[11px] text-secondary font-urdu">
                        {statusMeta.urduLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-secondary">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(dispute.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        <span>{dispute.messages_count} msgs</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-navy group-hover:text-brand-gold transition-colors">
                        {dispute.novel_title}
                      </h3>
                      <p className="text-xs text-secondary line-clamp-1 italic">
                        &quot;{dispute.reason}&quot;
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0">
                      <span className="font-mono font-bold text-xs text-navy">
                        {formatPKR(dispute.amount_pkr)}
                      </span>
                      <div className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gold group-hover:translate-x-0.5 transition-transform">
                        <span>View Thread</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
