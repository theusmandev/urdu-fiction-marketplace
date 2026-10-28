import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { EmptyState } from '@/components/ui/empty-state';
import { UrduText } from '@/components/urdu/UrduText';
import { getTipStatusMeta } from '@/lib/tips/state';
import { Heart, ChevronRight, Home, Sparkles, AlertCircle } from 'lucide-react';
import type { TipStatus } from '@/types/database';

interface ReaderTipItem {
  id: string;
  tip_number: string;
  writer_id: string;
  writer_pen_name: string;
  writer_pen_name_urdu: string;
  novel_id: string | null;
  novel_title: string | null;
  amount_pkr: number;
  currency: string;
  status: TipStatus;
  payment_instructions_snapshot: unknown;
  transaction_reference_tid: string | null;
  screenshot_path: string | null;
  reader_message: string | null;
  is_anonymous: boolean;
  writer_reply: string | null;
  confirmed_at: string | null;
  not_received_at: string | null;
  created_at: string;
}

export const metadata = {
  title: 'My Thanks | UNB Premium',
  description: 'View your appreciation gifts sent directly to Urdu fiction authors.',
};

export default async function MyTipsPage() {
  await requireAuth('/tips');
  const supabase = await createClient();

  const tipsRes = await supabase.rpc('get_my_tips');
  const { data: tipsData, error: tipsError } = unwrapQuery<ReaderTipItem[]>(tipsRes, {
    context: 'MyTipsPage.fetchTips',
  });

  const tips: ReaderTipItem[] = Array.isArray(tipsData) ? tipsData : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-secondary">
        <Link href="/" className="hover:text-navy flex items-center gap-1 transition-colors">
          <Home className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-secondary/40 shrink-0" />
        <span className="text-navy font-semibold">My Thanks</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/80 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
              <Heart className="w-5 h-5 fill-amber-600/30" />
            </div>
            <h1 className="text-2xl font-bold font-serif text-main">My Thanks</h1>
            <UrduText as="span" size="sm" className="text-secondary py-0">
              میرے شکریے
            </UrduText>
          </div>
          <p className="text-xs text-secondary max-w-lg">
            Direct reader-to-author appreciation gifts. 100% of your tip goes to the author with no platform fee.
          </p>
        </div>

        <Link
          href="/novels"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border hover:bg-surface-elevated text-xs font-semibold transition-all self-start sm:self-auto min-h-[44px]"
        >
          <span>Explore Novels</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Error state if RPC failed */}
      {tipsError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-start gap-3 text-sm text-rose-800 dark:text-rose-300">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to load tips</p>
            <p className="text-xs mt-0.5 opacity-90">{tipsError.message}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!tipsError && tips.length === 0 && (
        <EmptyState
          icon={Heart}
          title="No thanks sent yet"
          titleUrdu="ابھی تک آپ نے کسی مصنف کو شکریہ نہیں بھیجا"
          description="When you read a story that touches your heart, you can say thanks to the author with a direct appreciation gift."
          actionLabel="Browse novels"
          actionHref="/novels"
        />
      )}

      {/* Tips List */}
      {!tipsError && tips.length > 0 && (
        <div className="space-y-4">
          {tips.map((tip) => {
            const statusMeta = getTipStatusMeta(tip.status);
            const dateStr = new Date(tip.created_at).toLocaleDateString('en-PK', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={tip.id}
                className="p-5 sm:p-6 rounded-2xl bg-surface border border-border/80 hover:border-amber-300/80 transition-all shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <Link
                        href={`/tips/${tip.tip_number}`}
                        className="font-mono text-xs font-bold text-main hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                      >
                        {tip.tip_number}
                      </Link>
                      <span
                        className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-main">
                      <span className="font-semibold">To {tip.writer_pen_name}</span>
                      {tip.writer_pen_name_urdu && (
                        <UrduText as="span" size="xs" className="text-secondary py-0">
                          {tip.writer_pen_name_urdu}
                        </UrduText>
                      )}
                      {tip.novel_title && (
                        <>
                          <span className="text-secondary">•</span>
                          <span className="text-xs text-secondary truncate max-w-xs">
                            {tip.novel_title}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:text-right">
                    <div>
                      <div className="text-base font-bold text-main">
                        PKR {Number(tip.amount_pkr).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-secondary">{dateStr}</div>
                    </div>

                    <Link
                      href={`/tips/${tip.tip_number}`}
                      className="p-2 rounded-xl text-secondary hover:text-main hover:bg-surface-elevated transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label={`View tip ${tip.tip_number}`}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Link>
                  </div>
                </div>

                {/* Author's Thank You Reply if confirmed */}
                {tip.status === 'confirmed' && tip.writer_reply && (
                  <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-xs text-main space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Author&apos;s thank-you message</span>
                    </div>
                    <UrduText as="p" size="sm" className="text-main leading-relaxed py-0">
                      {tip.writer_reply}
                    </UrduText>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
