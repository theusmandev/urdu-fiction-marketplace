import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { ChapterEditor } from '../ChapterEditor';

interface EditChapterPageProps {
  params: Promise<{ id: string; chapterId: string }>;
}

export default async function EditChapterPage({ params }: EditChapterPageProps) {
  const { id, chapterId } = await params;
  const { user } = await requireWriter(`/writer/novels/${id}/chapters/${chapterId}`);
  const supabase = await createServerClient();

  // 1. Fetch novel
  const { data: novel, error: novelError } = await supabase
    .from('novels')
    .select('id, title_english, title_urdu, status, writer_id')
    .eq('id', id)
    .single();

  if (novelError || !novel || novel.writer_id !== user.id) {
    notFound();
  }

  // 2. Fetch chapter
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .eq('novel_id', id)
    .single();

  if (chapterError || !chapter) {
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
      }}
      suggestedChapterNumber={chapter.chapter_number}
    />
  );
}
