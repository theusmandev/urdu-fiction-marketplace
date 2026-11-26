-- ============================================================================
-- Migration: 0060_reader_urdu_font_setting.sql
-- Description: Admin-switchable reader Urdu typography setting (Gulzar default / Jameel Noori Nastaleeq)
-- Invariants:
--   1. Idempotent column and constraint creation on public.platform_settings.
--   2. Strict CHECK constraint enforcing ('gulzar', 'noori').
--   3. RPC set_reader_urdu_font(p_font, p_note): admin only, audits change.
--   4. RPC get_public_site_settings(): executable by anon and authenticated,
--      returns safe non-sensitive fields {palette, reader_urdu_font}.
--   5. Anon direct SELECT on platform_settings remains revoked.
--   6. Obey check:sql: zero forbidden pg_catalog.<construct> qualification.
-- ============================================================================

-- 1. Add reader font columns to platform_settings idempotently
ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS reader_urdu_font text NOT NULL DEFAULT 'gulzar',
    ADD COLUMN IF NOT EXISTS reader_urdu_font_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS reader_urdu_font_updated_by uuid REFERENCES public.profiles(id);

-- 2. Add CHECK constraint idempotently
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_platform_settings_reader_urdu_font'
          AND conrelid = 'public.platform_settings'::regclass
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_reader_urdu_font
            CHECK (reader_urdu_font IN ('gulzar', 'noori'));
    END IF;
END $$;

-- 3. Public RPC: get_public_site_settings()
-- Executable by anon & authenticated for layout/reader SSR/ISR resolution.
-- Preserves existing 'palette' return key while adding 'reader_urdu_font'.
CREATE OR REPLACE FUNCTION public.get_public_site_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_palette text;
    v_reader_font text;
BEGIN
    SELECT s.site_palette, s.reader_urdu_font
    INTO v_palette, v_reader_font
    FROM public.platform_settings s
    WHERE s.id = 1;

    IF v_palette IS NULL OR v_palette NOT IN ('ivory_ink', 'paper_teal', 'cream_maroon') THEN
        v_palette := 'ivory_ink';
    END IF;

    IF v_reader_font IS NULL OR v_reader_font NOT IN ('gulzar', 'noori') THEN
        v_reader_font := 'gulzar';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'palette', v_palette,
        'reader_urdu_font', v_reader_font
    );
END;
$$;

-- 4. Admin RPC: set_reader_urdu_font(p_font text, p_note text default null)
CREATE OR REPLACE FUNCTION public.set_reader_urdu_font(
    p_font text,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid := auth.uid();
    v_is_admin boolean;
    v_old_font text;
    v_updated_at timestamptz := pg_catalog.now();
    v_note text;
BEGIN
    -- 1. Admin authorization check
    SELECT public.is_admin() INTO v_is_admin;
    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Access denied: Administrator privileges required'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate font parameter
    IF p_font IS NULL OR p_font NOT IN ('gulzar', 'noori') THEN
        RAISE EXCEPTION 'Invalid reader Urdu font: %. Allowed values are gulzar, noori', p_font
            USING ERRCODE = '22023';
    END IF;

    -- Clean note
    IF p_note IS NOT NULL THEN
        v_note := pg_catalog.btrim(p_note);
        IF v_note = '' THEN
            v_note := NULL;
        END IF;
    END IF;

    -- 3. Retrieve current setting
    SELECT s.reader_urdu_font INTO v_old_font
    FROM public.platform_settings s
    WHERE s.id = 1;

    -- 4. Update platform_settings
    UPDATE public.platform_settings
    SET reader_urdu_font = p_font,
        reader_urdu_font_updated_at = v_updated_at,
        reader_urdu_font_updated_by = v_caller_id
    WHERE id = 1;

    -- 5. Audit log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'SET_READER_URDU_FONT',
        'platform_settings',
        '1',
        pg_catalog.jsonb_build_object('reader_urdu_font', v_old_font),
        pg_catalog.jsonb_build_object('reader_urdu_font', p_font, 'note', v_note),
        v_updated_at
    );

    RETURN pg_catalog.jsonb_build_object(
        'reader_urdu_font', p_font,
        'updated_at', v_updated_at
    );
END;
$$;

-- 5. Permissions lockdown and grants
REVOKE ALL ON FUNCTION public.get_public_site_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_settings() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.set_reader_urdu_font(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_reader_urdu_font(text, text) TO authenticated;
