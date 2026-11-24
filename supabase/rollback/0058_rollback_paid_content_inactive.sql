-- ==============================================================================
-- UNB Premium — Rollback for Migration 0058
-- Target Functions:
--   1. public.has_novel_entitlement(uuid)
--      Restores baseline from: supabase/migrations/0006_security_and_financial_hardening.sql#L98-L111 & L2298-L2299
--   2. public.get_my_library()
--      Restores baseline from: supabase/migrations/0016_reader_and_admin_orders.sql#L494-L549
--   3. public.get_chapter_for_reader(text, integer)
--      Restores baseline from: supabase/migrations/0052_harden_suspended_writer_and_novel_visibility.sql#L126-L324
--
-- INSTRUCTIONS:
--   Execute this script manually in the Supabase SQL Editor if migration 0058
--   needs to be rolled back.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. ROLLBACK has_novel_entitlement HELPER
-- Baseline: 0006_security_and_financial_hardening.sql#L98-L111
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_novel_entitlement(p_novel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE novel_id = p_novel_id
          AND reader_id = auth.uid()
          AND is_revoked = false
    );
$$;

COMMENT ON FUNCTION public.has_novel_entitlement(uuid) IS
'Security definer helper checking active reader purchase entitlement without RLS recursion.';

REVOKE EXECUTE ON FUNCTION public.has_novel_entitlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_novel_entitlement(uuid) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 2. ROLLBACK get_my_library RPC
-- Baseline: 0016_reader_and_admin_orders.sql#L494-L549
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_library()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_library jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'novel_id', n.id,
                'novel_slug', n.slug,
                'title_urdu', n.title_urdu,
                'title_english', n.title_english,
                'cover_url', n.cover_url,
                'writer_pen_name', coalesce(wp.pen_name_english, wp.pen_name_urdu, 'Urdu Author'),
                'writer_pen_name_urdu', wp.pen_name_urdu,
                'writer_pen_name_english', wp.pen_name_english,
                'writer_username', p_writer.username,
                'total_chapters', coalesce((
                    SELECT count(*)::int
                    FROM public.chapters c
                    WHERE c.novel_id = n.id AND c.is_published = true
                ), 0),
                'last_chapter_number', rp.last_chapter_number,
                'order_number', o.order_number,
                'granted_at', pe.granted_at,
                'is_temporarily_unavailable', (n.status != 'published')
            )
            ORDER BY pe.granted_at DESC
        ),
        '[]'::jsonb
    ) INTO v_library
    FROM public.purchase_entitlements pe
    JOIN public.novels n ON n.id = pe.novel_id
    JOIN public.writer_profiles wp ON wp.id = n.writer_id
    LEFT JOIN public.profiles p_writer ON p_writer.id = wp.id
    LEFT JOIN public.orders o ON o.id = pe.order_id
    LEFT JOIN public.reader_progress rp ON rp.reader_id = v_caller_id AND rp.novel_id = n.id
    WHERE pe.reader_id = v_caller_id
      AND pe.is_revoked = false;

    RETURN v_library;
END;
$$;

COMMENT ON FUNCTION public.get_my_library() IS
'Returns purchased library novels for the calling reader.';

REVOKE ALL ON FUNCTION public.get_my_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_library() TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. ROLLBACK get_chapter_for_reader RPC
-- Baseline: 0052_harden_suspended_writer_and_novel_visibility.sql#L126-L324
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chapter_for_reader(
    p_novel_slug text,
    p_chapter_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_is_admin boolean;
    v_novel record;
    v_chapter record;
    v_access_reason text;
    v_watermark_code text;
    v_watermark_enabled boolean := true;
    v_prev_number integer;
    v_next_number integer;
    v_total_published_chapters integer;
    v_reader_progress integer;
    v_has_entitlement boolean := false;
    v_order_number text;
    v_window_mins integer;
    v_max_reads integer;
    v_window_start timestamptz;
    v_already_read boolean := false;
    v_distinct_reads integer := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();

    -- Find novel by slug
    SELECT * INTO v_novel
    FROM public.novels
    WHERE slug = pg_catalog.btrim(p_novel_slug);

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Chapter not found';
    END IF;

    -- Find chapter
    SELECT * INTO v_chapter
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND chapter_number = p_chapter_number;

    IF v_chapter.id IS NULL THEN
        RAISE EXCEPTION 'Chapter not found';
    END IF;

    -- Evaluate authorization
    IF v_is_admin THEN
        v_access_reason := 'admin';
    ELSIF v_novel.writer_id = v_caller_id THEN
        v_access_reason := 'owner';
    ELSE
        -- Reader access rules
        IF NOT coalesce(v_chapter.is_published, false) THEN
            RAISE EXCEPTION 'Chapter not found';
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.purchase_entitlements
            WHERE reader_id = v_caller_id
              AND novel_id = v_novel.id
              AND is_revoked = false
        ) INTO v_has_entitlement;

        IF v_has_entitlement THEN
            v_access_reason := 'entitled';
        ELSIF coalesce(v_chapter.is_free_preview, false) AND v_novel.status::text = 'published' THEN
            -- Free preview strictly requires approved and active author
            IF EXISTS (
                SELECT 1
                FROM public.writer_profiles wp
                JOIN public.profiles p ON p.id = wp.id
                WHERE wp.id = v_novel.writer_id
                  AND wp.status = 'approved'
                  AND p.is_active = true
            ) THEN
                v_access_reason := 'free_preview';
            ELSE
                RAISE EXCEPTION 'Chapter not found';
            END IF;
        ELSE
            RAISE EXCEPTION 'Chapter not found';
        END IF;
    END IF;

    -- Watermark & Rate limiting sliding-window check for entitled readers
    IF v_access_reason = 'entitled' THEN
        SELECT o.order_number INTO v_order_number
        FROM public.purchase_entitlements pe
        JOIN public.orders o ON o.id = pe.order_id
        WHERE pe.reader_id = v_caller_id
          AND pe.novel_id = v_novel.id
          AND pe.is_revoked = false
        LIMIT 1;

        SELECT 
            coalesce(chapter_read_window_minutes, 60), 
            coalesce(max_chapter_reads_per_window, 10),
            coalesce(watermark_enabled, true)
        INTO v_window_mins, v_max_reads, v_watermark_enabled
        FROM public.platform_settings
        WHERE id = 1;

        IF v_watermark_enabled THEN
            v_watermark_code := coalesce(v_order_number, pg_catalog.substring(pg_catalog.replace(v_caller_id::text, '-', ''), 1, 8));
        ELSE
            v_watermark_code := NULL;
        END IF;

        v_window_start := pg_catalog.now() - (coalesce(v_window_mins, 60)::text || ' minutes')::interval;

        SELECT EXISTS (
            SELECT 1 FROM public.chapter_reads
            WHERE reader_id = v_caller_id
              AND chapter_id = v_chapter.id
              AND read_at >= v_window_start
        ) INTO v_already_read;

        IF NOT v_already_read THEN
            SELECT pg_catalog.count(DISTINCT chapter_id) INTO v_distinct_reads
            FROM public.chapter_reads
            WHERE reader_id = v_caller_id
              AND read_at >= v_window_start;

            IF v_distinct_reads >= coalesce(v_max_reads, 10) THEN
                RAISE EXCEPTION 'Reading rate limit exceeded: You have accessed % chapters in the last % minutes. Please wait before opening another chapter.',
                    v_max_reads, v_window_mins;
            END IF;

            INSERT INTO public.chapter_reads (
                reader_id,
                chapter_id,
                novel_id,
                read_at
            ) VALUES (
                v_caller_id,
                v_chapter.id,
                v_novel.id,
                pg_catalog.now()
            );
        END IF;
    END IF;

    -- Calculate navigation numbers
    SELECT pg_catalog.max(chapter_number) INTO v_prev_number
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true
      AND chapter_number < p_chapter_number;

    SELECT pg_catalog.min(chapter_number) INTO v_next_number
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true
      AND chapter_number > p_chapter_number;

    SELECT pg_catalog.count(*) INTO v_total_published_chapters
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true;

    SELECT last_chapter_number INTO v_reader_progress
    FROM public.reader_progress
    WHERE reader_id = v_caller_id
      AND novel_id = v_novel.id;

    RETURN pg_catalog.jsonb_build_object(
        'novel_id', v_novel.id,
        'novel_title', v_novel.title_urdu,
        'novel_title_urdu', v_novel.title_urdu,
        'novel_title_english', v_novel.title_english,
        'novel_slug', v_novel.slug,
        'total_chapters', v_total_published_chapters,
        'chapter_number', v_chapter.chapter_number,
        'chapter_title', v_chapter.title_urdu,
        'chapter_title_english', null::text,
        'content_urdu', v_chapter.content_urdu,
        'word_count', v_chapter.word_count,
        'previous_chapter_number', v_prev_number,
        'next_chapter_number', v_next_number,
        'access_reason', v_access_reason,
        'watermark_code', v_watermark_code,
        'watermark_enabled', v_watermark_enabled,
        'reader_progress', v_reader_progress
    );
END;
$$;

COMMENT ON FUNCTION public.get_chapter_for_reader(text, integer) IS
'Authoritatively serves chapter content with sliding window rate limiting and dynamic watermark (restored to baseline 0052).';

REVOKE ALL ON FUNCTION public.get_chapter_for_reader(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_for_reader(text, integer) TO authenticated;
