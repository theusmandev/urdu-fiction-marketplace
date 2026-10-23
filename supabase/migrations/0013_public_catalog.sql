-- ==============================================================================
-- UNB Premium — Migration 0013: Public Catalog, Discovery & Safe Views
-- Description:
--   Exposes strictly controlled, read-only public access paths for anonymous and
--   authenticated readers while strictly safeguarding private, financial, and
--   moderation data:
--     1. Extension pg_trgm and performance indexes for catalog search & sorting.
--     2. VIEW public.public_novels: Exposes strictly published novels and active
--        writers with whitelisted public fields and aggregated genres.
--     3. VIEW public.public_writers: Exposes approved active writers with at least
--        one published novel.
--     4. VIEW public.public_genres: Exposes active genres with published novel counts.
--     5. VIEW public.public_free_preview_chapters: Exposes ONLY published chapters
--        marked as free previews of published novels.
--     6. FUNCTION public.get_public_novel_chapters: Returns safe chapter table of
--        contents (numbers, titles, word counts, preview flag) without paid content.
--     7. FUNCTION public.search_public_novels: Case-insensitive, wildcard-escaped,
--        filtered search with pagination and total count.
--     8. Permissions: Grants SELECT on views and EXECUTE on RPCs to anon and authenticated.
--        Confirms base tables remain strictly inaccessible to anon.
--
-- Security:
--   - No sensitive fields (moderation_reason, commission rates, emails, balances, TIDs).
--   - Non-published novels (drafts, under_review, rejected, suspended) are 100% hidden.
--   - No schema-qualified syntax constructs (bare trim, coalesce, least, greatest).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: EXTENSIONS & PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_novels_status_published 
    ON public.novels (status) 
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_novels_published_at_desc 
    ON public.novels (published_at DESC) 
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_novels_price_pkr 
    ON public.novels (price_pkr) 
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_novels_is_featured 
    ON public.novels (is_featured, published_at DESC) 
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_novels_slug 
    ON public.novels (slug);

CREATE INDEX IF NOT EXISTS idx_novels_title_english_trgm 
    ON public.novels USING gin (title_english gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_novels_title_urdu_trgm 
    ON public.novels USING gin (title_urdu gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_novels_synopsis_urdu_trgm 
    ON public.novels USING gin (synopsis_urdu gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_writer_profiles_pen_name_en_trgm 
    ON public.writer_profiles USING gin (pen_name_english gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_writer_profiles_pen_name_ur_trgm 
    ON public.writer_profiles USING gin (pen_name_urdu gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_chapters_free_preview_published 
    ON public.chapters (novel_id, chapter_number) 
    WHERE is_free_preview = true AND is_published = true;


-- ------------------------------------------------------------------------------
-- SECTION 2: VIEW public.public_novels
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_novels
WITH (security_invoker = false) AS
SELECT
    n.id,
    n.slug,
    n.title_urdu,
    n.title_english,
    n.synopsis_urdu,
    n.description_urdu,
    n.cover_url,
    n.price_pkr,
    'PKR'::text AS currency,
    n.language,
    n.total_chapters,
    n.is_featured,
    n.published_at,
    n.writer_id,
    p.username AS writer_username,
    wp.pen_name_urdu AS writer_pen_name_urdu,
    wp.pen_name_english AS writer_pen_name_english,
    p.avatar_url AS writer_avatar_url,
    coalesce(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', g.id,
                    'slug', g.slug,
                    'name_urdu', g.name_urdu,
                    'name_english', g.name_english,
                    'display_order', g.display_order
                ) ORDER BY g.display_order ASC
            )
            FROM public.novel_genres ng
            JOIN public.genres g ON g.id = ng.genre_id
            WHERE ng.novel_id = n.id AND g.is_active = true
        ),
        '[]'::jsonb
    ) AS genres
FROM public.novels n
JOIN public.profiles p ON p.id = n.writer_id
JOIN public.writer_profiles wp ON wp.id = n.writer_id
WHERE n.status = 'published'
  AND p.is_active = true
  AND wp.status = 'approved';

COMMENT ON VIEW public.public_novels IS 
'Publicly safe catalog view exposing strictly published novels by approved, active authors. Never exposes moderation, financial, or personal contact fields.';


-- ------------------------------------------------------------------------------
-- SECTION 3: VIEW public.public_writers
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_writers
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
    ) AS published_novels_count
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
'Public author directory exposing active, approved writers who have published at least one novel.';


-- ------------------------------------------------------------------------------
-- SECTION 4: VIEW public.public_genres
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_genres
WITH (security_invoker = false) AS
SELECT
    g.id,
    g.slug,
    g.name_english,
    g.name_urdu,
    g.display_order,
    (
        SELECT count(DISTINCT ng.novel_id)::int
        FROM public.novel_genres ng
        JOIN public.novels n ON n.id = ng.novel_id
        WHERE ng.genre_id = g.id AND n.status = 'published'
    ) AS published_novels_count
FROM public.genres g
WHERE g.is_active = true;

COMMENT ON VIEW public.public_genres IS
'Active literary genres taxonomy with real-time published novel count.';


-- ------------------------------------------------------------------------------
-- SECTION 5: VIEW public.public_free_preview_chapters
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_free_preview_chapters
WITH (security_invoker = false) AS
SELECT
    c.id,
    c.novel_id,
    n.slug AS novel_slug,
    c.chapter_number,
    c.title_urdu,
    c.content_urdu,
    c.word_count,
    c.created_at,
    c.updated_at
FROM public.chapters c
JOIN public.novels n ON n.id = c.novel_id
JOIN public.profiles p ON p.id = n.writer_id
JOIN public.writer_profiles wp ON wp.id = n.writer_id
WHERE c.is_free_preview = true
  AND c.is_published = true
  AND n.status = 'published'
  AND p.is_active = true
  AND wp.status = 'approved';

COMMENT ON VIEW public.public_free_preview_chapters IS
'Full content of published free preview chapters for published novels. Paid and unpublished chapters are strictly excluded.';


-- ------------------------------------------------------------------------------
-- SECTION 6: RPC get_public_novel_chapters
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_novel_chapters(p_novel_slug text)
RETURNS TABLE (
    id uuid,
    chapter_number int,
    title_urdu text,
    word_count int,
    is_free_preview boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        c.id,
        c.chapter_number,
        c.title_urdu,
        c.word_count,
        c.is_free_preview
    FROM public.chapters c
    JOIN public.novels n ON n.id = c.novel_id
    JOIN public.profiles p ON p.id = n.writer_id
    JOIN public.writer_profiles wp ON wp.id = n.writer_id
    WHERE n.slug = p_novel_slug
      AND n.status = 'published'
      AND c.is_published = true
      AND p.is_active = true
      AND wp.status = 'approved'
    ORDER BY c.chapter_number ASC;
$$;

COMMENT ON FUNCTION public.get_public_novel_chapters(text) IS
'Returns public table of contents metadata for a novel without exposing chapter content for paid chapters.';


-- ------------------------------------------------------------------------------
-- SECTION 7: RPC search_public_novels
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_public_novels(
    p_query text DEFAULT NULL,
    p_genre_slug text DEFAULT NULL,
    p_sort text DEFAULT 'featured',
    p_limit int DEFAULT 20,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    slug text,
    title_urdu text,
    title_english text,
    synopsis_urdu text,
    description_urdu text,
    cover_url text,
    price_pkr numeric,
    currency text,
    language text,
    total_chapters int,
    is_featured boolean,
    published_at timestamptz,
    writer_id uuid,
    writer_username text,
    writer_pen_name_urdu text,
    writer_pen_name_english text,
    writer_avatar_url text,
    genres jsonb,
    total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_q text;
    v_like text;
    v_genre_slug text;
    v_limit int;
    v_offset int;
BEGIN
    v_q := trim(coalesce(p_query, ''));
    IF v_q <> '' THEN
        -- Escape \, %, and _ for safe ILIKE wildcard matching
        v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    ELSE
        v_like := NULL;
    END IF;

    v_genre_slug := trim(coalesce(p_genre_slug, ''));
    v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
    v_offset := greatest(coalesce(p_offset, 0), 0);

    RETURN QUERY
    WITH filtered AS (
        SELECT pn.*
        FROM public.public_novels pn
        WHERE (
            v_like IS NULL
            OR pn.title_urdu ILIKE v_like
            OR pn.title_english ILIKE v_like
            OR pn.synopsis_urdu ILIKE v_like
            OR pn.writer_pen_name_urdu ILIKE v_like
            OR pn.writer_pen_name_english ILIKE v_like
        )
        AND (
            v_genre_slug = ''
            OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(pn.genres) elem
                WHERE elem->>'slug' = v_genre_slug
            )
        )
    ),
    total AS (
        SELECT count(*)::bigint AS cnt FROM filtered
    )
    SELECT
        f.id,
        f.slug,
        f.title_urdu,
        f.title_english,
        f.synopsis_urdu,
        f.description_urdu,
        f.cover_url,
        f.price_pkr,
        f.currency,
        f.language,
        f.total_chapters,
        f.is_featured,
        f.published_at,
        f.writer_id,
        f.writer_username,
        f.writer_pen_name_urdu,
        f.writer_pen_name_english,
        f.writer_avatar_url,
        f.genres,
        t.cnt AS total_count
    FROM filtered f
    CROSS JOIN total t
    ORDER BY
        CASE WHEN p_sort = 'price_asc' THEN f.price_pkr END ASC,
        CASE WHEN p_sort = 'price_desc' THEN f.price_pkr END DESC,
        CASE WHEN p_sort = 'newest' THEN f.published_at END DESC,
        -- Default or featured: featured first, then newest
        CASE WHEN coalesce(p_sort, 'featured') = 'featured' AND f.is_featured THEN 0 ELSE 1 END ASC,
        f.published_at DESC
    LIMIT v_limit
    OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION public.search_public_novels(text, text, text, int, int) IS
'Case-insensitive, injection-safe search over published novels with genre filtering, sorting, and pagination.';


-- ------------------------------------------------------------------------------
-- SECTION 8: PERMISSIONS & SECURITY BOUNDARIES
-- ------------------------------------------------------------------------------

-- Views grants
GRANT SELECT ON public.public_novels TO anon, authenticated;
GRANT SELECT ON public.public_writers TO anon, authenticated;
GRANT SELECT ON public.public_genres TO anon, authenticated;
GRANT SELECT ON public.public_free_preview_chapters TO anon, authenticated;

-- RPC grants
GRANT EXECUTE ON FUNCTION public.get_public_novel_chapters(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_novels(text, text, text, int, int) TO anon, authenticated;

-- Explicitly confirm anon cannot directly access base tables
REVOKE ALL ON TABLE public.novels FROM anon;
REVOKE ALL ON TABLE public.chapters FROM anon;
REVOKE ALL ON TABLE public.sales_ledger FROM anon;
REVOKE ALL ON TABLE public.writer_payment_methods FROM anon;
REVOKE ALL ON TABLE public.orders FROM anon;
REVOKE ALL ON TABLE public.audit_logs FROM anon;
