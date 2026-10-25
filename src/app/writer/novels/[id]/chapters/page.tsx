import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { ChapterListManager } from './ChapterListManager';
import type { ChapterRow, NovelRow } from '@/types/database';

interface ChaptersPageProps {
  params: Promise<{ id: string }>;
}

export default async function NovelChaptersPage({ params }: ChaptersPageProps) {
  const { id } = await params;
  const { user } = await requireWriter(`/writer/novels/${id}/chapters`);
  const supabase = await createServerClient();

  // 1. Fetch novel
  const novelRes = await supabase
    .from('novels')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const { data: novel, error: novelError } = unwrapSingleQuery<NovelRow>(novelRes, {
    context: 'NovelChaptersPage.fetchNovel',
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

  // 2. Fetch genres count
  const genresRes = await supabase
    .from('novel_genres')
    .select('genre_id', { count: 'exact', head: true })
    .eq('novel_id', id);
  const { count: genresCount } = unwrapQuery(genresRes, {
    context: 'NovelChaptersPage.genresCount',
  });

  // 3. Fetch active payment methods count
  const paymentsRes = await supabase
    .from('writer_payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('writer_id', user.id)
    .eq('is_active', true);
  const { count: paymentMethodsCount } = unwrapQuery(paymentsRes, {
    context: 'NovelChaptersPage.paymentMethodsCount',
  });

  // 4. Fetch chapters
  const chaptersRes = await supabase
    .from('chapters')
    .select('*')
    .eq('novel_id', id)
    .order('chapter_number', { ascending: true });
  const { data: chaptersData } = unwrapQuery<ChapterRow[]>(chaptersRes, {
    context: 'NovelChaptersPage.fetchChapters',
  });

  const chapters: ChapterRow[] = chaptersData || [];
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
