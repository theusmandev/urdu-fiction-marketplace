import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/requireRole';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';
import { BookOpen, BookMarked, ArrowRight } from 'lucide-react';
import { UrduText } from '@/components/urdu/UrduText';


export default async function LibraryPage() {
  const { user } = await requireAuth('/library');
  const supabase = await createClient();

  const { data: entitlements } = await supabase
    .from('purchase_entitlements')
    .select(`
      id,
      granted_at,
      novel:novels (
        id,
        title_urdu,
        title_english,
        slug,
        cover_url,
        writer:writer_profiles (
          pen_name_urdu,
          pen_name_english
        )
      )
    `)
    .eq('reader_id', user.id)
    .eq('is_revoked', false)
    .order('granted_at', { ascending: false });

  const hasItems = entitlements && entitlements.length > 0;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <BookMarked className="h-7 w-7 text-amber-500" />
              <span>My Library</span>
            </h1>
            <p className="mt-1 text-sm text-stone-400">
              Access your fully unlocked Urdu novels and continued reading progress.
            </p>
          </div>
          <Link
            href="/novels"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600/90 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors shrink-0"
          >
            <span>Browse More Novels</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {!hasItems ? (
          <EmptyState
            title="Your Library is Empty"
            description="You have not purchased any novel entitlements yet. Once your direct author payment is verified, your purchased novels will appear here."
            actionLabel="Explore Urdu Novels"
            actionHref="/novels"
            icon={BookOpen}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {entitlements.map((item) => {
              const novel = Array.isArray(item.novel) ? item.novel[0] : item.novel;
              if (!novel) return null;
              const writer = Array.isArray(novel.writer) ? novel.writer[0] : novel.writer;

              return (
                <Link
                  key={item.id}
                  href={`/novels/${novel.slug || novel.id}`}
                  className="group flex flex-col rounded-xl border border-stone-800 bg-stone-900/60 overflow-hidden hover:border-amber-500/50 hover:shadow-xl transition-all"
                >
                  <div className="relative aspect-[2/3] w-full bg-stone-800 overflow-hidden">
                    {novel.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={novel.cover_url}
                        alt={novel.title_english || 'Novel cover'}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center p-4 text-center bg-stone-900 text-stone-500">
                        <BookOpen className="h-10 w-10 text-stone-600" />
                      </div>
                    )}
                    <span className="absolute top-2 right-2 rounded-full bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur-md">
                      UNLOCKED
                    </span>
                  </div>

                  <div className="p-3.5 flex flex-col flex-1 justify-between">
                    <div>
                      <UrduText
                        as="h3"
                        size="base"
                        className="text-white group-hover:text-amber-400 font-bold line-clamp-1 transition-colors"
                      >
                        {novel.title_urdu}
                      </UrduText>
                      <p className="text-xs text-stone-400 line-clamp-1 mt-0.5">
                        {novel.title_english}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-stone-800/80 flex items-center justify-between text-[11px] text-stone-400">
                      <span>{writer?.pen_name_english || 'Urdu Author'}</span>
                      <span className="text-amber-500 font-medium group-hover:underline">Read →</span>
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
