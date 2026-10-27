import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { ChapterEditor } from '../ChapterEditor';
import type { NovelStatus } from '@/types/database';

interface NewChapterPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewChapterPage({ params }: NewChapterPageProps) {
  const { id } = await params;
  const { user } = await requireWriter(`/writer/novels/${id}/chapters/new`);
  const supabase = await createServerClient();

  // 1. Fetch novel
  const novelRes = await supabase
    .from('novels')
    .select('id, title_english, title_urdu, status, writer_id')
    .eq('id', id)
    .maybeSingle();

  const { data: novel, error: novelError } = unwrapSingleQuery<{
    id: string;
    title_english: string;
    title_urdu: string;
    status: NovelStatus;
    writer_id: string;
  }>(novelRes, {
    context: 'NewChapterPage.fetchNovel',
  });

  if (novelError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load novel</h3>
            <p className="text-xs text-red-400/80 mt-1">{novelError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!novel || novel.writer_id !== user.id) {
    notFound();
  }

  // 2. Fetch max chapter number to suggest next number
  const latestRes = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('novel_id', id)
    .order('chapter_number', { ascending: false })
    .limit(1);

  const { data: latestChapter } = unwrapQuery<Array<{ chapter_number: number }>>(latestRes, {
    context: 'NewChapterPage.fetchLatestChapter',
  });

  const nextChapterNumber = (latestChapter && latestChapter[0]?.chapter_number ? latestChapter[0].chapter_number + 1 : 1);

  return (
    <ChapterEditor
      novelId={novel.id}
      novelTitleEnglish={novel.title_english}
      novelTitleUrdu={novel.title_urdu}
      novelStatus={novel.status}
      suggestedChapterNumber={nextChapterNumber}
      userId={user.id}
    />
  );
}
