import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { NovelForm } from '../NovelForm';
import type { GenreRow } from '@/types/database';

export default async function NewNovelPage() {
  const { user, writerProfile } = await requireWriter('/writer/novels/new');
  const supabase = await createServerClient();

  // Fetch available genres and platform settings
  const [{ data: genres }, { data: settings }] = await Promise.all([
    supabase
      .from('genres')
      .select('*')
      .order('display_order', { ascending: true }),
    supabase
      .from('platform_settings')
      .select('min_novel_price_pkr, max_novel_price_pkr')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  const availableGenres = (genres as GenreRow[]) || [];
  const commissionRate = writerProfile.custom_commission_rate ?? 20;
  const minPrice = settings?.min_novel_price_pkr ?? 50;
  const maxPrice = settings?.max_novel_price_pkr ? Number(settings.max_novel_price_pkr) : 5000;

  return (
    <div className="py-2">
      <NovelForm
        userId={user.id}
        commissionRate={commissionRate}
        availableGenres={availableGenres}
        minPrice={minPrice}
        maxPrice={maxPrice}
      />
    </div>
  );
}
