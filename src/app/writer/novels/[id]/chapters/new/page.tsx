import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { ChapterEditor } from '../ChapterEditor';

interface NewChapterPageProps {
  params: Promise<{ id: string }>;
}

export default async function NewChapterPage({ params }: NewChapterPageProps) {
  const { id } = await params;
  const { user } = await requireWriter(`/writer/novels/${id}/chapters/new`);
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

  // 2. Fetch max chapter number to suggest next number
  const { data: latestChapter } = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('novel_id', id)
    .order('chapter_number', { ascending: false })
    .limit(1);

  const nextChapterNumber = (latestChapter && latestChapter[0]?.chapter_number ? latestChapter[0].chapter_number + 1 : 1);

  return (
    <ChapterEditor
      novelId={novel.id}
      novelTitleEnglish={novel.title_english}
      novelTitleUrdu={novel.title_urdu}
      novelStatus={novel.status}
      suggestedChapterNumber={nextChapterNumber}
    />
  );
}
