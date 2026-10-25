import React from 'react';
import Link from 'next/link';
import { requireWriter } from '@/lib/auth/requireRole';
import { getMyDisputesAction } from '@/app/actions/disputes';
import { getDisputeStatusMeta } from '@/lib/disputes/status-meta';
import { formatPKR } from '@/lib/utils';
import {
  ShieldAlert,
  ArrowRight,
  Clock,
  MessageSquare,
  AlertCircle,
  FileText,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function WriterDisputesPage() {
  await requireWriter('/writer/disputes');
  const result = await getMyDisputesAction();
  const disputes = result.data || [];

  return (
    <div className="min-h-screen bg-ivory text-main py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-accent" />
              <h1 className="text-xl sm:text-2xl font-bold font-serif tracking-tight text-navy">
                Writer Studio — Order Disputes
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-secondary mt-1">
              Review and respond to disputes raised by readers regarding your novels.
            </p>
          </div>
          <Link
            href="/writer/orders"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-navy bg-white hover:bg-surface-muted border border-border shadow-sm transition-colors shrink-0"
          >
            <span>Back to Orders List</span>
          </Link>
        </div>

        {/* Guidance Notice */}
        <div className="rounded-2xl bg-amber-50/80 border border-amber-200 p-4 sm:p-5 flex items-start gap-3.5">
          <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-amber-900 leading-relaxed">
            <span className="font-bold text-amber-950 block">Author Resolution Protocol</span>
            <p>
              When a dispute is raised, please check your bank account or digital wallet app (JazzCash,
              EasyPaisa, Raast) against the reader&apos;s submitted Transaction ID. You can post comments, clarify
              deposit discrepancies, or attach bank statement receipts to the thread.
            </p>
          </div>
        </div>

        {/* Disputes Listing */}
        {disputes.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-border p-12 text-center space-y-4 shadow-card">
            <div className="w-12 h-12 rounded-full bg-surface-muted border border-border text-secondary flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold font-serif text-navy">No active disputes on your novels</h3>
              <p className="text-xs text-secondary max-w-sm mx-auto">
                All reader orders have been processed normally. Any newly raised disputes will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {disputes.map((dispute) => {
              const statusMeta = getDisputeStatusMeta(dispute.status);
              return (
                <Link
                  key={dispute.dispute_id}
                  href={`/writer/disputes/${dispute.dispute_id}`}
                  className="block rounded-2xl bg-surface hover:bg-surface-muted border border-border hover:border-slate-300 p-5 transition-all shadow-card group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-accent">
                        Order #{dispute.order_number}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          statusMeta.variant === 'warning'
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : statusMeta.variant === 'success'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            : statusMeta.variant === 'destructive'
                            ? 'bg-rose-100 text-rose-900 border border-rose-200'
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
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
                        <Clock className="w-3.5 h-3.5 text-secondary" />
                        <span>{new Date(dispute.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-secondary" />
                        <span>{dispute.messages_count} msgs</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-navy group-hover:text-accent transition-colors">
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
                      <div className="inline-flex items-center gap-1 text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                        <span>Inspect &amp; Respond</span>
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
