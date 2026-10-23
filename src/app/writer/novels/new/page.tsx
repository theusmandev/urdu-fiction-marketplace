import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { NovelForm } from '../NovelForm';
import type { GenreRow } from '@/types/database';

export default async function NewNovelPage() {
  const { user, writerProfile } = await requireWriter('/writer/novels/new');
  const supabase = await createServerClient();

  // Fetch available genres
  const { data: genres } = await supabase
    .from('genres')
    .select('*')
    .order('display_order', { ascending: true });

  const availableGenres = (genres as GenreRow[]) || [];
  const commissionRate = writerProfile.custom_commission_rate ?? 20;

  return (
    <div className="py-2">
      <NovelForm
        userId={user.id}
        commissionRate={commissionRate}
        availableGenres={availableGenres}
      />
    </div>
  );
}
