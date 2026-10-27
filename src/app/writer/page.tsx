import React from 'react';
import Link from 'next/link';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { UrduText } from '@/components/urdu/UrduText';
import { StatusBadge } from '@/components/ui/status-badge';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import type { NovelStatus } from '@/types/database';
import {
  BookOpen,
  Receipt,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  CreditCard,
  Plus,
  Layers,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface RecentNovelSummary {
  id: string;
  slug: string;
  title_urdu: string;
  title_english: string;
  status: NovelStatus;
  cover_url: string | null;
  price_pkr: number;
  total_chapters: number;
}

export default async function WriterDashboardPage() {
  const { user, writerProfile } = await requireWriter('/writer');
  const supabase = await createServerClient();

  // Execute all dashboard queries in parallel including platform_settings
  const [
    novelCountRes,
    pendingOrdersRes,
    paymentMethodsRes,
    recentNovelsRes,
    settingsRes,
  ] = await Promise.all([
    supabase
      .from('novels')
      .select('id', { count: 'exact', head: true })
      .eq('writer_id', user.id),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('writer_id', user.id)
      .eq('status', 'payment_submitted'),
    supabase
      .from('writer_payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('writer_id', user.id)
      .eq('is_active', true),
    supabase
      .from('novels')
      .select('id, slug, title_urdu, title_english, status, cover_url, price_pkr, total_chapters')
      .eq('writer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('platform_settings')
      .select('default_unpaid_commission_limit')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const { count: novelCount, error: novelCountErr } = unwrapQuery(novelCountRes, {
    context: 'WriterDashboardPage.novelCount',
  });
  const { count: pendingVerificationCount, error: pendingOrdersErr } = unwrapQuery(pendingOrdersRes, {
    context: 'WriterDashboardPage.pendingOrders',
  });
  const { count: paymentMethodsCount, error: paymentMethodsErr } = unwrapQuery(paymentMethodsRes, {
    context: 'WriterDashboardPage.paymentMethods',
  });
  const { data: recentNovels, error: recentNovelsErr } = unwrapQuery<RecentNovelSummary[]>(recentNovelsRes, {
    context: 'WriterDashboardPage.recentNovels',
  });
  const { data: platformSettings, error: settingsErr } = unwrapSingleQuery<{
    default_unpaid_commission_limit: number;
  }>(settingsRes, {
    context: 'WriterDashboardPage.platformSettings',
  });

  const queryError = novelCountErr || pendingOrdersErr || paymentMethodsErr || recentNovelsErr || settingsErr;
  const novelsTotal = novelCount ?? 0;
  const pendingOrdersTotal = pendingVerificationCount ?? 0;
  const activePayoutsTotal = paymentMethodsCount ?? 0;
  const commissionRate = writerProfile.custom_commission_rate ?? 20;

  // Resolve effective unpaid commission limit:
  // If individual writer has a custom unpaid_commission_limit_pkr in writer_profiles, use it.
  // If null or undefined, fall back to global platform_settings.default_unpaid_commission_limit.
  const customLimit =
    writerProfile.unpaid_commission_limit_pkr !== undefined
      ? writerProfile.unpaid_commission_limit_pkr
      : null;

  const globalLimit = platformSettings?.default_unpaid_commission_limit ?? 5000;

  const effectiveLimit =
    customLimit !== null && customLimit !== undefined
      ? Number(customLimit)
      : Number(globalLimit);

  return (
    <div className="space-y-8">
      {queryError && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load dashboard data</h3>
            <p className="text-xs text-red-400/80 mt-1">{queryError.message}</p>
          </div>
        </div>
      )}
      {/* Header Banner */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Approved author
            </span>
            <span className="text-xs text-secondary">
              ID: {user.id.slice(0, 8)}...
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-navy mt-1">
            Welcome back, {writerProfile.pen_name_english}
          </h1>
          <UrduText as="p" size="base" className="text-accent py-0">
            آپ کے رائٹر ڈیش بورڈ میں خوش آمدید
          </UrduText>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/writer/novels/new"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-navy text-white hover:bg-navy-light shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Novel
          </Link>
          <Link
            href="/writer/orders"
            className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg border border-border bg-surface text-secondary hover:text-navy hover:bg-ivory shadow-sm"
          >
            <Receipt className="w-4 h-4 mr-1.5 text-accent" />
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
              Your accrued unpaid platform commission has exceeded PKR {effectiveLimit.toLocaleString()}.
              New reader purchases are paused until commission is remitted. Please contact platform administration to settle your balance.
            </p>
          </div>
        </div>
      )}

      {/* Real Statistics Grid (No Fake Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Authored Novels */}
        <Link
          href="/writer/novels"
          className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2 hover:border-slate-300 transition-colors block"
        >
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Authored Novels</span>
            <BookOpen className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold text-navy">{novelsTotal}</div>
          <p className="text-[11px] text-secondary">
            {novelsTotal === 0 ? 'No novels created yet' : `${novelsTotal} manuscript(s) registered`}
          </p>
        </Link>

        {/* Verification Queue */}
        <Link
          href="/writer/orders"
          className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2 hover:border-slate-300 transition-colors block"
        >
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Awaiting Verification</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-navy">{pendingOrdersTotal}</div>
          <p className="text-[11px] text-secondary">
            {pendingOrdersTotal === 0 ? 'Queue is clear' : `${pendingOrdersTotal} reader payment(s) to verify`}
          </p>
        </Link>

        {/* Payment Methods */}
        <Link
          href="/writer/payment-methods"
          className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2 hover:border-slate-300 transition-colors block"
        >
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Payouts</span>
            <CreditCard className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-navy">{activePayoutsTotal}</div>
          <p className="text-[11px] text-secondary">
            {activePayoutsTotal === 0 ? 'Add payout method' : `${activePayoutsTotal} active account(s)`}
          </p>
        </Link>

        {/* Outstanding Commission Balance */}
        <Link
          href="/writer/commission"
          className="bg-surface rounded-xl border border-border p-5 shadow-sm space-y-2 hover:border-slate-300 transition-colors block"
        >
          <div className="flex items-center justify-between text-secondary">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding Commission Balance</span>
            <ShieldCheck className="w-4 h-4 text-navy" />
          </div>
          <div className="text-2xl font-bold text-navy">
            PKR {Number(writerProfile.current_unpaid_commission || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-secondary">
            Limit: PKR {effectiveLimit.toLocaleString()} ({commissionRate}% rate)
          </p>
        </Link>
      </div>

      {/* Main Sections: Novels Preview & Verification Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Author Novels Card */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="font-serif font-bold text-base text-navy flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-accent" />
              Authored Novels
            </h2>
            <Link
              href="/writer/novels"
              className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
            >
              <span>View All ({novelsTotal})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {novelsTotal === 0 ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-ivory border border-border flex items-center justify-center mx-auto text-secondary">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-main">
                  No novels created yet
                </p>
                <p className="text-xs text-secondary max-w-sm mx-auto">
                  Create your first Urdu novel manuscript, add chapters, and submit for editorial publication.
                </p>
              </div>
              <Link
                href="/writer/novels/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light"
              >
                <Plus className="w-4 h-4" />
                <span>Create Novel</span>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(recentNovels || []).map((novel) => (
                <div
                  key={novel.id}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-14 rounded bg-ivory border border-border overflow-hidden shrink-0">
                      {novel.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={novel.cover_url}
                          alt={novel.title_english}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <BookOpen className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <UrduText as="div" size="base" className="text-navy truncate py-0" dir="rtl">
                        {novel.title_urdu}
                      </UrduText>
                      <div className="text-[11px] text-secondary truncate">
                        {novel.title_english}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-secondary">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          <span>{novel.total_chapters} ch.</span>
                        </span>
                        <span>&bull;</span>
                        <span>{novel.price_pkr === 0 ? 'Free' : `PKR ${novel.price_pkr}`}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={novel.status} size="sm" />
                    <Link
                      href={`/writer/novels/${novel.id}/chapters`}
                      className="px-2.5 py-1 rounded border border-border bg-ivory text-secondary hover:text-navy text-[11px] font-semibold"
                    >
                      Chapters
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Verification Queue Preview */}
        <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="font-serif font-bold text-base text-navy flex items-center gap-2">
              <Receipt className="w-4 h-4 text-accent" />
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
