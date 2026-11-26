import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/lib/supabase/public';
import {
  type ReaderUrduFont,
  DEFAULT_READER_URDU_FONT,
  parseReaderUrduFont,
  getRuntimeNooriFontUrl,
  resolveEffectiveReaderFont,
} from './reader-font-constants';

export * from './reader-font-constants';

/**
 * Direct DB fetcher for reader font setting.
 * Never throws, logs error details, and defaults safely to DEFAULT_READER_URDU_FONT ('gulzar').
 * Does NOT read cookies or headers so calling routes stay static/ISR.
 */
export async function fetchReaderUrduFontFromDb(): Promise<ReaderUrduFont> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase.rpc('get_public_site_settings');

    if (error) {
      console.error('[getSiteReaderFont] Database query error for get_public_site_settings:', {
        code: error.code,
        message: error.message,
      });
      return DEFAULT_READER_URDU_FONT;
    }

    const rawFont = (data as { reader_urdu_font?: unknown } | null)?.reader_urdu_font;
    return parseReaderUrduFont(rawFont);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    console.error('[getSiteReaderFont] Unhandled exception resolving reader font:', {
      code: error?.code,
      message: error?.message,
    });
    return DEFAULT_READER_URDU_FONT;
  }
}

/**
 * Cached server function resolving the active reader Urdu font setting.
 * Revalidates every 300 seconds as safety net, or immediately on demand
 * via revalidateTag('site-settings') when admin saves changes.
 */
export const getSiteReaderFont: () => Promise<ReaderUrduFont> = unstable_cache(
  fetchReaderUrduFontFromDb,
  ['site-reader-font-setting'],
  {
    tags: ['site-settings'],
    revalidate: 300,
  }
);

/**
 * High-level server helper returning the full resolved font configuration.
 */
export async function getReaderFontConfiguration(): Promise<{
  dbSetting: ReaderUrduFont;
  effectiveFont: ReaderUrduFont;
  fontUrl: string | null;
  isConfigured: boolean;
}> {
  const [dbSetting, runtimeUrl] = await Promise.all([
    getSiteReaderFont(),
    Promise.resolve(getRuntimeNooriFontUrl()),
  ]);

  const { effectiveFont, fontUrl } = resolveEffectiveReaderFont(dbSetting, runtimeUrl);

  return {
    dbSetting,
    effectiveFont,
    fontUrl,
    isConfigured: runtimeUrl !== null,
  };
}
