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
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                Permanent Reader Access
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <BookMarked className="h-7 w-7 text-amber-500" />
              <span>My Library / میری لائبریری</span>
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-stone-400">
              Your purchased Urdu novels with bookmark progress and uninterrupted reading access.
            </p>
          </div>

          <Link
            href="/novels"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-bold text-stone-950 transition-colors shrink-0 shadow-lg shadow-amber-500/10"
          >
            <span>Explore Store</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {libraryItems.map((item) => {
              const progress = calculateLibraryProgress(item.last_chapter_number, item.total_chapters);
              const readChapterNumber = item.last_chapter_number && item.last_chapter_number > 0
                ? item.last_chapter_number
                : 1;

              return (
                <div
                  key={item.novel_id}
                  className="group flex flex-col rounded-2xl border border-stone-800 bg-stone-900/60 overflow-hidden hover:border-amber-500/40 hover:shadow-2xl transition-all"
                >
                  {/* Cover Header */}
                  <div className="relative aspect-[16/10] sm:aspect-[4/3] w-full bg-stone-900 overflow-hidden border-b border-stone-800">
                    {item.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.cover_url}
                        alt={item.title_english || item.title_urdu}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center p-4 text-center bg-stone-900 text-stone-600">
                        <BookOpen className="h-10 w-10 text-stone-700" />
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/30 to-transparent" />

                    {/* Status Badges */}
                    <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5">
                      <span className="rounded-full bg-emerald-950/90 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>UNLOCKED</span>
                      </span>

                      {item.is_temporarily_unavailable && (
                        <span className="rounded-full bg-amber-950/90 border border-amber-500/40 px-2 py-0.5 text-[9px] font-bold text-amber-300 backdrop-blur-md">
                          Temporarily Unlisted
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body Details */}
                  <div className="p-4 flex flex-col flex-1 justify-between space-y-4">
                    <div className="space-y-1.5">
                      <UrduText
                        size="base"
                        className="text-white group-hover:text-amber-400 transition-colors line-clamp-1 py-0 leading-tight font-bold"
                      >
                        {item.title_urdu}
                      </UrduText>
                      <h3 className="text-xs font-semibold text-stone-300 line-clamp-1">
                        {item.title_english}
                      </h3>
                      <p className="text-[11px] text-stone-400">
                        By <span className="text-amber-400/90 font-medium">{item.writer_pen_name}</span>
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 pt-1 border-t border-stone-800/80">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-stone-400 font-medium">{progress.label}</span>
                        <span className="text-stone-500 font-mono">{progress.percent}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-stone-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-300"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Order Reference & Date */}
                    <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-stone-800/60 font-mono">
                      {item.order_number ? (
                        <Link
                          href={`/orders/${item.order_number}`}
                          className="text-amber-400/80 hover:text-amber-300 hover:underline flex items-center gap-1"
                          title="View Order Receipt"
                        >
                          <span>{item.order_number}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      ) : (
                        <span>Verified Direct</span>
                      )}
                      <span>{new Date(item.granted_at).toLocaleDateString()}</span>
                    </div>

                    {/* Unlisted Notice */}
                    {item.is_temporarily_unavailable && (
                      <p className="text-[10px] text-amber-400/80 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 leading-relaxed">
                        This novel is unlisted from the store, but you retain full lifetime reading access.
                      </p>
                    )}

                    {/* Primary CTA */}
                    <div className="pt-2">
                      <Link
                        href={`/read/${item.novel_slug}/${readChapterNumber}`}
                        className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-md shadow-amber-500/10"
                      >
                        {item.last_chapter_number && item.last_chapter_number > 0 ? (
                          <>
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Continue Reading (Ch {item.last_chapter_number})</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
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
