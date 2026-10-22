import React from 'react';
import Link from 'next/link';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import {
  BookOpen,
  Receipt,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';


export default async function WriterDashboardPage() {
  const { user, writerProfile } = await requireWriter('/writer');
  const supabase = await createServerClient();

  // Fetch real novel count from Supabase
  const { count: novelCount } = await supabase
    .from('novels')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', user.id);

  // Fetch real count of orders awaiting writer verification
  const { count: pendingVerificationCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('writer_id', user.id)
    .eq('status', 'payment_submitted');

  const novelsTotal = novelCount ?? 0;
  const pendingOrdersTotal = pendingVerificationCount ?? 0;
  const commissionRate = writerProfile.custom_commission_rate ?? 20;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Verified Author
            </span>
            <span className="text-xs text-secondary">
              ID: {user.id.slice(0, 8)}...
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy mt-1">
            Welcome back, {writerProfile.pen_name_english}
          </h1>
          <UrduText as="p" size="base" className="text-accent py-0">
            خوش آمدید، {writerProfile.pen_name_urdu}
          </UrduText>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/writer/orders"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-navy text-white hover:bg-navy-light shadow-sm"
          >
            <Receipt className="w-4 h-4 mr-1.5" />
            Verification Queue ({pendingOrdersTotal})
          </Link>
        </div>
      </div>

      {/* Commission Status Alert if threshold reached */}
      {writerProfile.is_orders_paused_for_commission && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-sm">
              Reader Orders Temporarily Paused (Commission Limit Exceeded)
            </div>
            <p>
              Your accrued unpaid platform commission has exceeded PKR {writerProfile.unpaid_commission_limit.toLocaleString()}.
              New reader purchases are paused until commission is remitted. Please contact platform administration to settle your balance.
            </p>
          </div>
        </div>
      )}

      {/* Real Statistics Grid (No Fake Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Published Novels */}
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Authored Novels</span>
            <BookOpen className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold text-navy">{novelsTotal}</div>
          <p className="text-[11px] text-secondary">
            {novelsTotal === 0 ? 'No novels created yet' : `${novelsTotal} novel(s) registered`}
          </p>
        </div>

        {/* Verification Queue */}
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Awaiting Verification</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-navy">{pendingOrdersTotal}</div>
          <p className="text-[11px] text-secondary">
            {pendingOrdersTotal === 0 ? 'Queue is clear' : `${pendingOrdersTotal} reader payment(s) to verify`}
          </p>
        </div>

        {/* Platform Commission Rate */}
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Commission Rate</span>
            <DollarSign className="w-4 h-4 text-navy" />
          </div>
          <div className="text-2xl font-bold text-navy">{commissionRate}%</div>
          <p className="text-[11px] text-secondary">
            You retain {100 - commissionRate}% of reader payments
          </p>
        </div>

        {/* Accrued Commission */}
        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Accrued Commission</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-navy">
            PKR {Number(writerProfile.current_unpaid_commission || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-secondary">
            Limit: PKR {Number(writerProfile.unpaid_commission_limit || 5000).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Clean Empty States & Overview Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Author Novels Card */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="font-serif font-bold text-base text-navy">
              Published Novels
            </h2>
            <span className="text-xs text-secondary font-medium">
              {novelsTotal} Total
            </span>
          </div>

          {novelsTotal === 0 ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-main">
                  No novels published yet
                </p>
                <p className="text-xs text-secondary max-w-sm mx-auto">
                  Novel manuscript submission, chapter drafting, and cover art uploads will unlock in Step 1.4.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-secondary">
              Novels listing will display here.
            </p>
          )}
        </div>

        {/* Verification Queue Preview */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="font-serif font-bold text-base text-navy">
              Pending Reader Verifications
            </h2>
            <Link
              href="/writer/orders"
              className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {pendingOrdersTotal === 0 ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-ivory border border-border flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-main">
                  All reader payments are up to date
                </p>
                <p className="text-xs text-secondary max-w-sm mx-auto">
                  When a reader pays via JazzCash, EasyPaisa, or Bank Transfer and submits their TID, it will appear here for one-click verification.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-secondary">
                You have {pendingOrdersTotal} order(s) awaiting your bank account verification.
              </p>
              <Link
                href="/writer/orders"
                className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
              >
                Go to Verification Queue &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
