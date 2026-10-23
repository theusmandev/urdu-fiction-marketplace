import React from 'react';
import { requireRole } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { GenreManagement, GenreItem } from '@/components/admin/GenreManagement';
import { Tag } from 'lucide-react';

export default async function AdminGenresPage() {
  await requireRole('admin', '/admin');
  const supabase = await createServerClient();

  const { data: rawGenres } = await supabase
    .from('genres')
    .select(`
      id,
      slug,
      name_english,
      name_urdu,
      display_order,
      is_active,
      novel_genres (
        count
      )
    `)
    .order('display_order', { ascending: true })
    .order('name_english', { ascending: true });

  interface GenreQueryRow {
    id: string;
    slug: string;
    name_english: string;
    name_urdu: string;
    display_order: number;
    is_active: boolean;
    novel_genres: { count?: number }[] | null;
  }

  const genreRows = (rawGenres || []) as unknown as GenreQueryRow[];

  const formattedGenres: GenreItem[] = genreRows.map((g) => ({
    id: g.id,
    slug: g.slug,
    name_english: g.name_english,
    name_urdu: g.name_urdu,
    display_order: g.display_order ?? 0,
    is_active: g.is_active ?? true,
    novel_count: Array.isArray(g.novel_genres)
      ? g.novel_genres.length > 0 && typeof g.novel_genres[0]?.count === 'number'
        ? g.novel_genres[0].count
        : g.novel_genres.length
      : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Tag className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-white">Genre Taxonomy Management</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Organize Urdu fiction categories, display ordering, localized names, and active marketplace visibility.
          </p>
        </div>
      </div>

      <GenreManagement initialGenres={formattedGenres} />
    </div>
  );
}
