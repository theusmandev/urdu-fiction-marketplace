-- ==============================================================================
-- UNB Premium — Migration 0059: Fix get_my_library Columns and Restore 0016 Canonical Shape
--
-- PURPOSE:
-- 1. Migration 0058 inadvertently referenced non-existent columns (n.cover_image_url,
--    pe.created_at, rp.last_read_at) and altered JSON return keys in get_my_library().
-- 2. This migration restores the canonical definition of public.get_my_library()
--    from migration 0016 (n.cover_url, pe.granted_at, rp.last_chapter_number,
--    exact 14 JSON keys, exact SECURITY DEFINER, SET search_path = '').
-- 3. Adds the profiles.is_active check at the top: if caller is deactivated or
--    lacks an active profile, immediately returns the empty library shape ('[]'::jsonb).
-- 4. Preserves exact permissions (REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated).
-- ==============================================================================

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

    -- Return empty library array if caller's profile is deactivated or missing
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND is_active = true
    ) THEN
        RETURN '[]'::jsonb;
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

REVOKE ALL ON FUNCTION public.get_my_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_library() TO authenticated;
