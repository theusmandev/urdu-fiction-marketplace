/**
 * src/lib/settings/social.ts
 *
 * Public helper to fetch social links from platform_settings.
 * Uses getPublicSupabase() to avoid reading cookies/headers, keeping calling pages static/ISR.
 * Cached via unstable_cache with tag 'social-links' for instant on-demand revalidation.
 */

import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/lib/supabase/public';
import type { SocialLinks } from '@/types/database';

export const DEFAULT_SOCIAL_LINKS: SocialLinks = {
  facebook: 'https://www.facebook.com/people/Urdu-novel-Bank/100090906471153/',
  whatsapp: 'https://whatsapp.com/channel/0029VaurdEY0wajrnyeAl50Y',
  pinterest: 'https://www.pinterest.com/urdunovelbanks/',
  instagram: 'https://www.instagram.com/urdunovelbank/',
  youtube: 'https://youtube.com/@urdunovelbank',
  telegram: 'https://t.me/urdunovelbank',
};

async function fetchSocialLinksFromDb(): Promise<SocialLinks> {
  try {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from('platform_settings')
      .select('social_links')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('[getSocialLinks] Supabase query error:', {
        code: error.code,
        message: error.message,
      });
      return DEFAULT_SOCIAL_LINKS;
    }

    if (!data || !data.social_links) {
      return DEFAULT_SOCIAL_LINKS;
    }

    return data.social_links as SocialLinks;
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    console.error('[getSocialLinks] Unexpected error resolving social links:', {
      code: error?.code,
      message: error?.message,
    });
    return DEFAULT_SOCIAL_LINKS;
  }
}

export const getSocialLinks: () => Promise<SocialLinks> = unstable_cache(
  fetchSocialLinksFromDb,
  ['social-links-setting'],
  {
    tags: ['social-links'],
    revalidate: 300,
  }
);
