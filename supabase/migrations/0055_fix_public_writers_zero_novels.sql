-- ==============================================================================
-- UNB Premium — Migration 0055: Fix Public Writers View for Authors With Zero Published Novels
--
-- PURPOSE:
-- 1. Updates public.public_writers view to remove the exclusionary filter
--    AND (SELECT count(*) FROM public.novels ... published) > 0.
-- 2. Allows newly approved, active authors (wp.status = 'approved' AND p.is_active = true)
--    with 0 published novels to have an accessible public profile at /writers/[username]
--    with published_novels_count = 0.
-- 3. Retains WITH (security_invoker = false) to execute with definer privileges,
--    safely exposing only public author metadata while bypassing base-table RLS.
-- 4. Preserves status hardening: suspended writers (wp.status = 'suspended') and
--    inactive accounts (p.is_active = false) remain 100% hidden.
-- 5. Re-applies SELECT grants for anon, authenticated, and service_role.
-- ==============================================================================

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
  AND p.is_active = true;

COMMENT ON VIEW public.public_writers IS
'Public author directory exposing active, approved writers with published novel counts (>= 0) and social links.';

-- Re-grant SELECT permissions
REVOKE ALL ON public.public_writers FROM PUBLIC;
GRANT SELECT ON public.public_writers TO anon, authenticated, service_role;

