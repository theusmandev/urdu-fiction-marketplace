import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getPublicNovelChapters } from '@/lib/supabase/public';
import { SecureReaderClient } from './SecureReaderClient';
import { type ChapterReaderPayload } from '@/types/database';
import { mapReaderError } from '@/lib/reader/schemas';
import { BookOpen, Clock, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ReaderPageProps {
  params: Promise<{ slug: string; number: string }>;
}

export async function generateMetadata({
  params,
}: ReaderPageProps): Promise<Metadata> {
  const { number } = await params;
  return {
    title: `Reader — Chapter ${number} | UNB Premium`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function SecureReaderPage({ params }: ReaderPageProps) {
  const { slug, number } = await params;
  const chapterNumber = parseInt(number, 10);

  if (isNaN(chapterNumber) || chapterNumber < 1) {
    redirect(`/novels/${slug}`);
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/read/${encodeURIComponent(slug)}/${chapterNumber}`);
  }

  // Fetch chapter text and authorization authoritatively via get_chapter_for_reader RPC
  const { data: chapterData, error: chapterError } = await supabase.rpc(
    'get_chapter_for_reader',
    {
      p_novel_slug: slug,
      p_chapter_number: chapterNumber,
    }
  );

  // Fetch published chapters for table-of-contents drawer
  const tableOfContents = await getPublicNovelChapters(slug);

  // Handle Errors
  if (chapterError || !chapterData) {
    const mapped = mapReaderError(chapterError?.message);

    // Rate-limit error display
    if (mapped.type === 'rate_limited') {
      return (
        <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-stone-900 border border-amber-500/30 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Reading Limit Reached</h2>
              <p className="text-xs text-stone-400 leading-relaxed">
                {mapped.message}
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/library"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-stone-950 hover:bg-amber-400 transition-colors"
              >
                Return to Library
              </Link>
              <Link
                href={`/novels/${slug}`}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold bg-stone-800 text-stone-300 hover:bg-stone-700 transition-colors"
              >
                Novel Details
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // Generic 'Chapter not found' / Unauthorized neutral display
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-stone-800 text-stone-400 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Chapter Unavailable</h2>
            <p className="text-xs text-stone-400 leading-relaxed">
              {mapped.message}
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              href={`/novels/${slug}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-stone-950 hover:bg-amber-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go to Novel</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const typedChapter = chapterData as unknown as ChapterReaderPayload;

  return (
    <SecureReaderClient
      chapter={typedChapter}
      readerId={user.id}
      tableOfContents={tableOfContents}
      novelSlug={slug}
    />
  );
}
