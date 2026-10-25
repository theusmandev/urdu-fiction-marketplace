import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { GenreManagement, GenreItem } from '@/components/admin/GenreManagement';
import { Tag, ShieldAlert } from 'lucide-react';
import { unwrapQuery } from '@/lib/supabase/query';

export default async function AdminGenresPage() {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const [genresRes, novelGenresRes] = await Promise.all([
    supabase
      .from('genres')
      .select('id, slug, name_english, name_urdu, display_order, is_active')
      .order('display_order', { ascending: true })
      .order('name_english', { ascending: true }),
    supabase
      .from('novel_genres')
      .select('genre_id'),
  ]);

  const { data: rawGenres, error: genresError } = unwrapQuery(genresRes, 'AdminGenresPage.genres');
  const { data: rawNovelGenres, error: ngError } = unwrapQuery(novelGenresRes, 'AdminGenresPage.novelGenres');

  const queryError = genresError || ngError;

  const countMap = new Map<string, number>();
  if (rawNovelGenres) {
    for (const ng of rawNovelGenres) {
      if (ng.genre_id) {
        countMap.set(ng.genre_id, (countMap.get(ng.genre_id) || 0) + 1);
      }
    }
  }

  const formattedGenres: GenreItem[] = (rawGenres || []).map((g) => ({
    id: g.id,
    slug: g.slug,
    name_english: g.name_english,
    name_urdu: g.name_urdu,
    display_order: g.display_order ?? 0,
    is_active: g.is_active ?? true,
    novel_count: countMap.get(g.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-admin/10 border border-accent-admin/20 flex items-center justify-center text-accent-admin">
              <Tag className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-main">Genre Taxonomy Management</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Organize Urdu fiction categories, display ordering, localized names, and active marketplace visibility.
          </p>
        </div>
      </div>

      {/* Error State */}
      {queryError ? (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
            <span>Database Error Loading Genre Taxonomy</span>
          </div>
          <p className="text-xs text-rose-800/90 leading-relaxed">
            Unable to retrieve genres or associated counts from the database:
          </p>
          <div className="p-3 rounded-xl bg-surface border border-rose-200 text-xs font-mono text-rose-800">
            {queryError.message} {queryError.code ? `(Code: ${queryError.code})` : ''}
          </div>
          {queryError.hint && (
            <p className="text-[11px] text-muted italic">Hint: {queryError.hint}</p>
          )}
        </div>
      ) : (
        <GenreManagement initialGenres={formattedGenres} />
      )}
    </div>
  );
}
