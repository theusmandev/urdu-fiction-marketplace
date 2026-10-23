import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { NovelListClient, type NovelCardItem } from './NovelListClient';

export default async function WriterNovelsPage() {
  const { user } = await requireWriter('/writer/novels');
  const supabase = await createServerClient();

  // 1. Fetch all authored novels
  const { data: novelsData } = await supabase
    .from('novels')
    .select(`
      id,
      writer_id,
      slug,
      title_urdu,
      title_english,
      synopsis_urdu,
      cover_url,
      price_pkr,
      status,
      moderation_reason,
      total_chapters,
      rights_declaration_accepted,
      created_at,
      updated_at
    `)
    .eq('writer_id', user.id)
    .order('created_at', { ascending: false });

  // 2. Fetch active payment methods count for this author
  const { count: activePaymentMethodsCount } = await supabase
    .from('writer_payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('writer_id', user.id)
    .eq('is_active', true);

  const activePayouts = activePaymentMethodsCount ?? 0;

  // 3. For each novel, fetch genres and published chapters count
  const novelIds = (novelsData || []).map((n) => n.id);

  const genresMap: Record<string, string[]> = {};
  const publishedChaptersMap: Record<string, number> = {};

  if (novelIds.length > 0) {
    // Fetch genres
    const { data: novelGenresData } = await supabase
      .from('novel_genres')
      .select('novel_id, genres(name_english, name_urdu)')
      .in('novel_id', novelIds);

    if (novelGenresData) {
      for (const ng of novelGenresData) {
        if (!genresMap[ng.novel_id]) {
          genresMap[ng.novel_id] = [];
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (ng as any).genres;
        if (g?.name_english) {
          genresMap[ng.novel_id].push(g.name_english);
        }
      }
    }

    // Fetch published chapters count per novel
    const { data: chaptersData } = await supabase
      .from('chapters')
      .select('novel_id, is_published')
      .in('novel_id', novelIds)
      .eq('is_published', true);

    if (chaptersData) {
      for (const ch of chaptersData) {
        publishedChaptersMap[ch.novel_id] = (publishedChaptersMap[ch.novel_id] || 0) + 1;
      }
    }
  }

  const items: NovelCardItem[] = (novelsData || []).map((n) => ({
    id: n.id,
    title_urdu: n.title_urdu,
    title_english: n.title_english,
    synopsis_urdu: n.synopsis_urdu,
    cover_url: n.cover_url,
    rights_declaration_accepted: n.rights_declaration_accepted,
    price_pkr: Number(n.price_pkr),
    status: n.status,
    moderation_reason: n.moderation_reason,
    slug: n.slug,
    total_chapters: n.total_chapters,
    created_at: n.created_at,
    updated_at: n.updated_at,
    genres_count: (genresMap[n.id] || []).length,
    genres_labels: genresMap[n.id] || [],
    published_chapters_count: publishedChaptersMap[n.id] || 0,
    active_payment_methods_count: activePayouts,
  }));

  return <NovelListClient initialNovels={items} />;
}
