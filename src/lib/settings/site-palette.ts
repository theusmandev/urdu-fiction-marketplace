import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/lib/supabase/public';
import {
  DEFAULT_SITE_PALETTE,
  isSitePalette,
  type SitePalette,
} from './palette';

/**
 * Direct DB fetcher for site palette.
 * Never throws, logs error details, and defaults to DEFAULT_SITE_PALETTE ('ivory_ink').
 * Does NOT read cookies or headers so calling routes stay static/ISR.
 */
export async function fetchSitePaletteFromDb(): Promise<SitePalette> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase.rpc('get_public_site_settings');

    if (error) {
      console.error('[getSitePalette] Database query error for get_public_site_settings:', {
        code: error.code,
        message: error.message,
      });
      return DEFAULT_SITE_PALETTE;
    }

    const rawPalette = (data as { palette?: unknown } | null)?.palette;
    if (isSitePalette(rawPalette)) {
      return rawPalette;
    }

    console.warn('[getSitePalette] Non-standard palette returned from DB, falling back to default:', rawPalette);
    return DEFAULT_SITE_PALETTE;
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    console.error('[getSitePalette] Unhandled exception resolving site palette:', {
      code: error?.code,
      message: error?.message,
    });
    return DEFAULT_SITE_PALETTE;
  }
}

/**
 * Cached server function resolving active site appearance palette.
 * Revalidates every 300 seconds as safety net, or immediately on demand
 * via revalidateTag('site-settings') when admin saves changes.
 */
export const getSitePalette: () => Promise<SitePalette> = unstable_cache(
  fetchSitePaletteFromDb,
  ['site-palette-setting'],
  {
    tags: ['site-settings'],
    revalidate: 300,
  }
);

