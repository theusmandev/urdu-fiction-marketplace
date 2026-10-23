import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { ChapterListManager } from './ChapterListManager';
import type { ChapterRow } from '@/types/database';

interface ChaptersPageProps {
  params: Promise<{ id: string }>;
}

export default async function NovelChaptersPage({ params }: ChaptersPageProps) {
  const { id } = await params;
  const { user } = await requireWriter(`/writer/novels/${id}/chapters`);
  const supabase = await createServerClient();

  // 1. Fetch novel
  const { data: novel, error: novelError } = await supabase
    .from('novels')
    .select('*')
    .eq('id', id)
    .single();

  if (novelError || !novel || novel.writer_id !== user.id) {
    notFound();
  }

  // 2. Fetch genres count
  const { count: genresCount } = await supabase
    .from('novel_genres')
    .select('genre_id', { count: 'exact', head: true })
    .eq('novel_id', id);

  // 3. Fetch active payment methods count
  const { count: paymentMethodsCount } = await supabase
    .from('writer_payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('writer_id', user.id)
    .eq('is_active', true);

  // 4. Fetch chapters
  const { data: chaptersData } = await supabase
    .from('chapters')
    .select('*')
    .eq('novel_id', id)
    .order('chapter_number', { ascending: true });

  const chapters: ChapterRow[] = (chaptersData as ChapterRow[]) || [];
  const publishedCount = chapters.filter((c) => c.is_published).length;

  const novelChecklist = {
    id: novel.id,
    title_urdu: novel.title_urdu,
    title_english: novel.title_english,
    synopsis_urdu: novel.synopsis_urdu,
    cover_url: novel.cover_url,
    rights_declaration_accepted: novel.rights_declaration_accepted,
    price_pkr: Number(novel.price_pkr),
    genres_count: genresCount ?? 0,
    published_chapters_count: publishedCount,
    active_payment_methods_count: paymentMethodsCount ?? 0,
    status: novel.status,
  };

  return (
    <div className="py-2">
      <ChapterListManager
        novel={novelChecklist}
        initialChapters={chapters}
      />
    </div>
  );
}
