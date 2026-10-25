import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { UrduText } from '@/components/urdu/UrduText';
import { calculateLibraryProgress } from '@/lib/reader/schemas';
import type { LibraryItem } from '@/types/database';
import {
  BookMarked,
  BookOpen,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  await requireAuth('/library');
  const supabase = await createServerClient();

  // Call authoritative get_my_library() RPC
  const { data, error } = await supabase.rpc('get_my_library');
  const libraryItems = (data as unknown as LibraryItem[]) || [];

  return (
    <div className="min-h-screen bg-ivory text-main py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium uppercase tracking-wider">
                Permanent Reader Access
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-serif tracking-tight text-navy flex items-center gap-3">
              <BookMarked className="h-7 w-7 text-brand-gold" />
              <span>My Library / میری لائبریری</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-secondary">
              Your purchased Urdu novels with bookmark progress and uninterrupted reading access.
            </p>
          </div>

          <Link
            href="/novels"
            className="inline-flex items-center gap-2 rounded-xl bg-navy hover:bg-navy/90 px-4 py-2.5 text-xs font-bold text-white transition-colors shrink-0 shadow-sm"
          >
            <span>Explore Store</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>Unable to load your library: {error.message}. Please refresh the page.</span>
          </div>
        )}

        {/* Empty State */}
        {!error && libraryItems.length === 0 && (
          <EmptyState
            title="Your Library is Empty"
            description="You have not purchased any novel entitlements yet. Once an author verifies your direct payment, your unlocked novel will appear here."
            actionLabel="Discover Urdu Novels"
            actionHref="/novels"
            icon={BookOpen}
          />
        )}

        {/* Library Grid */}
        {!error && libraryItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {libraryItems.map((item) => {
              const progress = calculateLibraryProgress(item.last_chapter_number, item.total_chapters);
              const readChapterNumber = item.last_chapter_number && item.last_chapter_number > 0
                ? item.last_chapter_number
                : 1;

              return (
                <div
                  key={item.novel_id}
                  className="group flex flex-col rounded-xl sm:rounded-2xl border border-border bg-surface overflow-hidden hover:border-brand-gold/60 hover:shadow-card transition-all"
                >
                  {/* Cover Header */}
                  <div className="relative aspect-[3/4] max-h-40 sm:max-h-48 w-full bg-slate-100 overflow-hidden border-b border-border">
                    {item.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.cover_url}
                        alt={item.title_english || item.title_urdu}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center p-3 text-center bg-slate-100 text-slate-400">
                        <BookOpen className="h-8 w-8 text-slate-300" />
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                    {/* Status Badges */}
                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                      <span className="rounded-full bg-emerald-600/90 border border-emerald-400/40 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white backdrop-blur-md flex items-center gap-1 shadow-sm">
                        <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        <span>UNLOCKED</span>
                      </span>

                      {item.is_temporarily_unavailable && (
                        <span className="rounded-full bg-amber-600/90 border border-amber-400/40 px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold text-white backdrop-blur-md shadow-sm">
                          Unlisted
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body Details */}
                  <div className="p-2.5 sm:p-3.5 flex flex-col flex-1 justify-between space-y-2.5 sm:space-y-3">
                    <div className="space-y-1">
                      <UrduText
                        size="base"
                        className="text-navy group-hover:text-brand-gold transition-colors line-clamp-1 py-0 leading-[2.0] sm:leading-[2.1] font-bold text-sm sm:text-base"
                      >
                        {item.title_urdu}
                      </UrduText>
                      <h3 className="text-[11px] sm:text-xs font-semibold text-slate-700 line-clamp-1">
                        {item.title_english}
                      </h3>
                      <p className="text-[10px] sm:text-[11px] text-secondary truncate">
                        By <span className="text-slate-900 font-medium">{item.writer_pen_name}</span>
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1 pt-1 border-t border-border">
                      <div className="flex items-center justify-between text-[10px] sm:text-[11px]">
                        <span className="text-secondary font-medium truncate">{progress.label}</span>
                        <span className="text-slate-600 font-mono shrink-0 ml-1">{progress.percent}%</span>
                      </div>
                      <div className="w-full h-1 sm:h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-brand-gold rounded-full transition-all duration-300"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Order Reference & Date */}
                    <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-secondary pt-1 border-t border-border font-mono">
                      {item.order_number ? (
                        <Link
                          href={`/orders/${item.order_number}`}
                          className="text-brand-gold hover:text-brand-gold-hover hover:underline flex items-center gap-0.5 truncate max-w-[60%]"
                          title="View Order Receipt"
                        >
                          <span className="truncate">{item.order_number}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </Link>
                      ) : (
                        <span>Verified</span>
                      )}
                      <span className="shrink-0">{new Date(item.granted_at).toLocaleDateString()}</span>
                    </div>

                    {/* Unlisted Notice */}
                    {item.is_temporarily_unavailable && (
                      <p className="text-[9px] text-amber-800 bg-amber-50 p-1.5 rounded-lg border border-amber-200 leading-relaxed">
                        Lifetime access active.
                      </p>
                    )}

                    {/* Primary CTA */}
                    <div className="pt-1">
                      <Link
                        href={`/read/${item.novel_slug}/${readChapterNumber}`}
                        className="w-full py-1.5 sm:py-2 px-2.5 rounded-lg sm:rounded-xl bg-brand-gold hover:bg-brand-gold-hover text-navy font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      >
                        {item.last_chapter_number && item.last_chapter_number > 0 ? (
                          <>
                            <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                            <span className="truncate">Continue (Ch {item.last_chapter_number})</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                            <span>Start Reading</span>
                          </>
                        )}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
