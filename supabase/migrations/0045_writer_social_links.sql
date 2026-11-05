-- Migration: 0045_writer_social_links.sql
-- Description: Adds dedicated social media link columns to writer_profiles (Facebook, Instagram, Pinterest, TikTok, LinkedIn)
--              and updates public.public_writers view to expose these populated links for approved authors.

-- 1. Add social media link columns to public.writer_profiles
ALTER TABLE public.writer_profiles
    ADD COLUMN IF NOT EXISTS social_facebook text,
    ADD COLUMN IF NOT EXISTS social_instagram text,
    ADD COLUMN IF NOT EXISTS social_pinterest text,
    ADD COLUMN IF NOT EXISTS social_tiktok text,
    ADD COLUMN IF NOT EXISTS social_linkedin text;

-- 2. Add or replace check constraint for valid http/https URLs and max length <= 300 chars
DO $$
BEGIN
    ALTER TABLE public.writer_profiles
        DROP CONSTRAINT IF EXISTS writer_profiles_social_links_check;

    ALTER TABLE public.writer_profiles
        ADD CONSTRAINT writer_profiles_social_links_check CHECK (
            (social_facebook IS NULL OR (length(social_facebook) <= 300 AND (social_facebook LIKE 'https://%' OR social_facebook LIKE 'http://%'))) AND
            (social_instagram IS NULL OR (length(social_instagram) <= 300 AND (social_instagram LIKE 'https://%' OR social_instagram LIKE 'http://%'))) AND
            (social_pinterest IS NULL OR (length(social_pinterest) <= 300 AND (social_pinterest LIKE 'https://%' OR social_pinterest LIKE 'http://%'))) AND
            (social_tiktok IS NULL OR (length(social_tiktok) <= 300 AND (social_tiktok LIKE 'https://%' OR social_tiktok LIKE 'http://%'))) AND
            (social_linkedin IS NULL OR (length(social_linkedin) <= 300 AND (social_linkedin LIKE 'https://%' OR social_linkedin LIKE 'http://%')))
        );
END $$;

-- 3. Update public.public_writers view to include social media fields
DROP VIEW IF EXISTS public.public_writers CASCADE;

CREATE VIEW public.public_writers
WITH (security_invoker = false) AS
SELECT
    p.id,
    p.username,
    wp.pen_name_urdu,
    wp.pen_name_english,
    wp.bio_urdu,
    wp.bio_english,
    p.avatar_url,
    (
        SELECT count(*)::int
        FROM public.novels n
        WHERE n.writer_id = p.id AND n.status = 'published'
    ) AS published_novels_count,
    wp.social_facebook,
    wp.social_instagram,
    wp.social_pinterest,
    wp.social_tiktok,
    wp.social_linkedin
FROM public.profiles p
JOIN public.writer_profiles wp ON wp.id = p.id
WHERE wp.status = 'approved'
  AND p.is_active = true
  AND (
      SELECT count(*)
      FROM public.novels n
      WHERE n.writer_id = p.id AND n.status = 'published'
  ) > 0;

COMMENT ON VIEW public.public_writers IS
'Public author directory exposing active, approved writers who have published at least one novel, including public social media links.';

-- 4. Grant SELECT on public.public_writers to anon, authenticated
GRANT SELECT ON public.public_writers TO anon, authenticated;

