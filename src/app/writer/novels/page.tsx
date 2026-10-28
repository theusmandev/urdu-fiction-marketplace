import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { NovelListClient, type NovelCardItem } from './NovelListClient';
import type { NovelRow } from '@/types/database';

export default async function WriterNovelsPage() {
  const { user } = await requireWriter('/writer/novels');
  const supabase = await createServerClient();

  // 1. Fetch all authored novels
  const novelsRes = await supabase
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

type WriterNovelRow = Pick<
  NovelRow,
  | 'id'
  | 'writer_id'
  | 'slug'
  | 'title_urdu'
  | 'title_english'
  | 'synopsis_urdu'
  | 'cover_url'
  | 'price_pkr'
  | 'status'
  | 'moderation_reason'
  | 'total_chapters'
  | 'rights_declaration_accepted'
  | 'created_at'
  | 'updated_at'
>;

interface GenreEmbed {
  novel_id: string;
  genres: {
    name_english: string;
    name_urdu: string;
  } | {
    name_english: string;
    name_urdu: string;
  }[] | null;
}

interface ChapterCountRow {
  novel_id: string;
  is_published: boolean;
}

  const { data: novelsData, error: novelsError } = unwrapQuery<WriterNovelRow[]>(novelsRes, {
    context: 'WriterNovelsPage.fetchNovels',
  });

  if (novelsError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="p-4 rounded-xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load novels</h3>
            <p className="text-xs text-danger-text/80 mt-1">{novelsError.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Fetch active payment methods count for this author
  const activePayoutsRes = await supabase
    .from('writer_payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('writer_id', user.id)
    .eq('is_active', true);

  const { count: activePaymentMethodsCount } = unwrapQuery(activePayoutsRes, {
    context: 'WriterNovelsPage.activePayouts',
  });

  const activePayouts = activePaymentMethodsCount ?? 0;

  // 3. For each novel, fetch genres and published chapters count
  const novelIds = (novelsData || []).map((n) => n.id);

  const genresMap: Record<string, string[]> = {};
  const publishedChaptersMap: Record<string, number> = {};

  if (novelIds.length > 0) {
    // Fetch genres
    const genresRes = await supabase
      .from('novel_genres')
      .select('novel_id, genres!genre_id(name_english, name_urdu)')
      .in('novel_id', novelIds);
    const { data: novelGenresData } = unwrapQuery<GenreEmbed[]>(genresRes, {
      context: 'WriterNovelsPage.fetchNovelGenres',
    });

    if (novelGenresData) {
      for (const ng of novelGenresData) {
        if (!genresMap[ng.novel_id]) {
          genresMap[ng.novel_id] = [];
        }
        const g = Array.isArray(ng.genres) ? ng.genres[0] : ng.genres;
        if (g?.name_english) {
          genresMap[ng.novel_id].push(g.name_english);
        }
      }
    }

    // Fetch published chapters count per novel
    const chaptersRes = await supabase
      .from('chapters')
      .select('novel_id, is_published')
      .in('novel_id', novelIds)
      .eq('is_published', true);
    const { data: chaptersData } = unwrapQuery<ChapterCountRow[]>(chaptersRes, {
      context: 'WriterNovelsPage.fetchChapters',
    });

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
