import React from 'react';
import { requireWriter } from '@/lib/auth/requireRole';
import { createServerClient } from '@/lib/supabase/server';
import { unwrapQuery, unwrapSingleQuery } from '@/lib/supabase/query';
import { AlertCircle } from 'lucide-react';
import { NovelForm } from '../NovelForm';
import type { GenreRow, PlatformSettingsRow } from '@/types/database';

export default async function NewNovelPage() {
  const { user, writerProfile } = await requireWriter('/writer/novels/new');
  const supabase = await createServerClient();

  // Fetch available genres and platform settings
  const [genresRes, settingsRes] = await Promise.all([
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

  const { data: genres, error: genresError } = unwrapQuery<GenreRow[]>(genresRes, {
    context: 'NewNovelPage.fetchGenres',
  });
  const { data: settings, error: settingsError } = unwrapSingleQuery<Pick<PlatformSettingsRow, 'min_novel_price_pkr' | 'max_novel_price_pkr'>>(settingsRes, {
    context: 'NewNovelPage.fetchSettings',
  });

  const queryError = genresError || settingsError;
  const availableGenres = genres || [];
  const commissionRate = writerProfile.custom_commission_rate ?? 20;
  const minPrice = settings?.min_novel_price_pkr ?? 50;
  const maxPrice = settings?.max_novel_price_pkr ? Number(settings.max_novel_price_pkr) : 5000;

  return (
    <div className="py-2">
      {queryError && (
        <div className="mb-4 p-4 rounded-xl border border-danger-border bg-danger-soft text-danger-text flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Failed to load novel form configuration</h3>
            <p className="text-xs text-danger-text/80 mt-1">{queryError.message}</p>
          </div>
        </div>
      )}
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
