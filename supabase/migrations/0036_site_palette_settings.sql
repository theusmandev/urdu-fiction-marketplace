-- ============================================================================
-- Migration: 0036_site_palette_settings.sql
-- Description: Admin-controlled site appearance palette settings (3 curated presets)
-- Presets: ivory_ink (Palette A), paper_teal (Palette B), cream_maroon (Palette C)
-- Invariants:
--   1. Idempotent column and constraint creation on platform_settings.
--   2. Strict CHECK constraint enforcing ('ivory_ink', 'paper_teal', 'cream_maroon').
--   3. RPC set_site_palette(p_palette, p_note): admin only, audits change.
--   4. RPC get_public_site_settings(): executable by anon and authenticated,
--      returns ONLY {palette}, fallback to 'ivory_ink' on missing row.
--   5. Anon direct SELECT on platform_settings revoked (settings read via RPCs).
-- ============================================================================

-- 1. Add palette columns to platform_settings idempotently
ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS site_palette text NOT NULL DEFAULT 'ivory_ink',
    ADD COLUMN IF NOT EXISTS site_palette_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS site_palette_updated_by uuid REFERENCES public.profiles(id);

-- 2. Add CHECK constraint idempotently
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_platform_settings_site_palette'
          AND conrelid = 'public.platform_settings'::regclass
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_site_palette
            CHECK (site_palette IN ('ivory_ink', 'paper_teal', 'cream_maroon'));
    END IF;
END $$;

-- 3. Lock down direct SELECT on platform_settings from anon
REVOKE SELECT ON public.platform_settings FROM anon;

DROP POLICY IF EXISTS "Public read platform settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Authenticated read platform settings" ON public.platform_settings;

CREATE POLICY "Authenticated read platform settings"
    ON public.platform_settings FOR SELECT
    TO authenticated
    USING (true);

-- 4. Public RPC: get_public_site_settings()
-- Executable by anon & authenticated for root layout SSR/ISR palette resolution.
CREATE OR REPLACE FUNCTION public.get_public_site_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_palette text;
BEGIN
    SELECT s.site_palette INTO v_palette
    FROM public.platform_settings s
    WHERE s.id = 1;

    IF v_palette IS NULL OR v_palette NOT IN ('ivory_ink', 'paper_teal', 'cream_maroon') THEN
        v_palette := 'ivory_ink';
    END IF;

    RETURN pg_catalog.jsonb_build_object('palette', v_palette);
END;
$$;

-- 5. Admin RPC: set_site_palette(p_palette text, p_note text default null)
CREATE OR REPLACE FUNCTION public.set_site_palette(
    p_palette text,
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
    v_old_palette text;
    v_updated_at timestamptz := pg_catalog.now();
    v_note text;
BEGIN
    -- 1. Admin authorization check
    SELECT public.is_admin() INTO v_is_admin;
    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Access denied: Administrator privileges required'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate palette parameter
    IF p_palette IS NULL OR p_palette NOT IN ('ivory_ink', 'paper_teal', 'cream_maroon') THEN
        RAISE EXCEPTION 'Invalid site palette: %. Allowed values are ivory_ink, paper_teal, cream_maroon', p_palette
            USING ERRCODE = '22023';
    END IF;

    -- Clean note
    IF p_note IS NOT NULL THEN
        v_note := pg_catalog.btrim(p_note);
        IF v_note = '' THEN
            v_note := NULL;
        END IF;
    END IF;

    -- 3. Retrieve current palette
    SELECT s.site_palette INTO v_old_palette
    FROM public.platform_settings s
    WHERE s.id = 1;

    -- 4. Update platform_settings
    UPDATE public.platform_settings
    SET site_palette = p_palette,
        site_palette_updated_at = v_updated_at,
        site_palette_updated_by = v_caller_id
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
        'SET_SITE_PALETTE',
        'platform_settings',
        '1',
        pg_catalog.jsonb_build_object('palette', v_old_palette),
        pg_catalog.jsonb_build_object('palette', p_palette, 'note', v_note),
        v_updated_at
    );

    RETURN pg_catalog.jsonb_build_object(
        'palette', p_palette,
        'updated_at', v_updated_at
    );
END;
$$;

-- 6. Permissions lockdown and grants
REVOKE ALL ON FUNCTION public.get_public_site_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_settings() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.set_site_palette(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_site_palette(text, text) TO authenticated;

