import React from 'react';
import { notFound } from 'next/navigation';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { NovelForm } from '../../NovelForm';
import type { GenreRow } from '@/types/database';

interface EditNovelPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditNovelPage({ params }: EditNovelPageProps) {
  const { id } = await params;
  const { user, writerProfile } = await requireWriter(`/writer/novels/${id}/edit`);
  const supabase = await createServerClient();

  // 1. Fetch novel data
  const { data: novel, error: novelError } = await supabase
    .from('novels')
    .select('*')
    .eq('id', id)
    .single();

  if (novelError || !novel || novel.writer_id !== user.id) {
    notFound();
  }

  // 2. Fetch available genres
  const { data: genres } = await supabase
    .from('genres')
    .select('*')
    .order('display_order', { ascending: true });

  // 3. Fetch linked genres for this novel
  const { data: linkedGenres } = await supabase
    .from('novel_genres')
    .select('genre_id')
    .eq('novel_id', id);

  const linkedGenreIds = (linkedGenres || []).map((g) => g.genre_id);
  const availableGenres = (genres as GenreRow[]) || [];
  const commissionRate = writerProfile.custom_commission_rate ?? 20;

  return (
    <div className="py-2">
      <NovelForm
        userId={user.id}
        commissionRate={commissionRate}
        availableGenres={availableGenres}
        initialData={{
          id: novel.id,
          title_urdu: novel.title_urdu,
          title_english: novel.title_english,
          synopsis_urdu: novel.synopsis_urdu,
          description_urdu: novel.description_urdu,
          cover_url: novel.cover_url,
          cover_public_id: novel.cover_public_id,
          price_pkr: Number(novel.price_pkr),
          language: novel.language,
          rights_declaration_accepted: novel.rights_declaration_accepted,
          genre_ids: linkedGenreIds,
          status: novel.status,
        }}
      />
    </div>
  );
}
