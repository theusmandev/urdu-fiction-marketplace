import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapSingleQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { ChapterEditor } from '../ChapterEditor';
import type { ChapterRow, NovelStatus } from '@/types/database';

interface EditChapterPageProps {
  params: Promise<{ id: string; chapterId: string }>;
}

export default async function EditChapterPage({ params }: EditChapterPageProps) {
  const { id, chapterId } = await params;
  const { user } = await requireWriter(`/writer/novels/${id}/chapters/${chapterId}`);
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
    context: 'EditChapterPage.fetchNovel',
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

  // 2. Fetch chapter
  const chapterRes = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .eq('novel_id', id)
    .maybeSingle();

  const { data: chapter, error: chapterError } = unwrapSingleQuery<ChapterRow>(chapterRes, {
    context: 'EditChapterPage.fetchChapter',
  });

  if (chapterError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load chapter</h3>
            <p className="text-xs text-red-400/80 mt-1">{chapterError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!chapter) {
    notFound();
  }

  return (
    <ChapterEditor
      novelId={novel.id}
      novelTitleEnglish={novel.title_english}
      novelTitleUrdu={novel.title_urdu}
      novelStatus={novel.status}
      chapterId={chapter.id}
      initialData={{
        chapter_number: chapter.chapter_number,
        title_urdu: chapter.title_urdu,
        content_urdu: chapter.content_urdu,
        is_free_preview: chapter.is_free_preview,
        is_published: chapter.is_published,
        updated_at: chapter.updated_at,
      }}
      suggestedChapterNumber={chapter.chapter_number}
      userId={user.id}
    />
  );
}
