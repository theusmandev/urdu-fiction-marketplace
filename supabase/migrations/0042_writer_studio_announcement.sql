-- ==============================================================================
-- UNB Premium — Migration 0042: Writer Studio Announcement Banner System
--
-- Description:
--   1. Expands platform_settings with bilingual writer announcement columns:
--      (enabled, variant, titles EN/UR, bodies EN/UR, link URL & label,
--       dismissible, updated_at).
--   2. Provides update_writer_announcement RPC with admin authorization, safe
--      URL validation, and audit logging.
--
-- Security & Hardening:
--   - Strict search_path = '' lockdown.
--   - Revoke execute from PUBLIC and anon; grant exclusively to authenticated and service_role.
--   - Zero qualified SQL syntax constructs (coalesce written unqualified).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: EXTEND PLATFORM_SETTINGS TABLE
-- ------------------------------------------------------------------------------

ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS writer_announcement_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS writer_announcement_variant text NOT NULL DEFAULT 'info',
    ADD COLUMN IF NOT EXISTS writer_announcement_title_en text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS writer_announcement_title_ur text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS writer_announcement_body_en text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS writer_announcement_body_ur text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS writer_announcement_link_url text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS writer_announcement_link_label text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS writer_announcement_dismissible boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS writer_announcement_updated_at timestamptz NOT NULL DEFAULT pg_catalog.now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_writer_announcement_variant'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_writer_announcement_variant
            CHECK (writer_announcement_variant IN ('info', 'feature', 'warning', 'success'));
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- SECTION 2: ADMINISTRATIVE RPC TO UPDATE WRITER ANNOUNCEMENT
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_writer_announcement(
    p_enabled boolean,
    p_variant text,
    p_title_en text,
    p_title_ur text,
    p_body_en text,
    p_body_ur text,
    p_link_url text,
    p_link_label text,
    p_dismissible boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_settings jsonb;
    v_new_settings jsonb;
    v_title_en text := pg_catalog.btrim(coalesce(p_title_en, ''));
    v_title_ur text := pg_catalog.btrim(coalesce(p_title_ur, ''));
    v_body_en text := pg_catalog.btrim(coalesce(p_body_en, ''));
    v_body_ur text := pg_catalog.btrim(coalesce(p_body_ur, ''));
    v_link_url text := pg_catalog.btrim(coalesce(p_link_url, ''));
    v_link_label text := pg_catalog.btrim(coalesce(p_link_label, ''));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can update writer announcements.';
    END IF;

    -- Variant validation
    IF p_variant NOT IN ('info', 'feature', 'warning', 'success') THEN
        RAISE EXCEPTION 'Invalid announcement variant. Must be info, feature, warning, or success.';
    END IF;

    -- Active announcement validation: at least one title or body must be present
    IF p_enabled AND v_title_en = '' AND v_title_ur = '' AND v_body_en = '' AND v_body_ur = '' THEN
        RAISE EXCEPTION 'Active announcements must have at least one non-empty title or body (English or Urdu).';
    END IF;

    -- Safe URL validation: must start with /, https://, or http:// (reject javascript:, data:, etc.)
    IF v_link_url <> '' THEN
        IF v_link_url ~* '^(javascript|data|vbscript):' THEN
            RAISE EXCEPTION 'Unsafe link URL protocol rejected.';
        END IF;
        IF NOT (v_link_url ~* '^(\/|https?:\/\/)') THEN
            RAISE EXCEPTION 'Link URL must be an internal path (starting with /) or a valid HTTP/HTTPS URL.';
        END IF;
    END IF;

    -- Capture previous state for audit log
    SELECT pg_catalog.jsonb_build_object(
        'writer_announcement_enabled', s.writer_announcement_enabled,
        'writer_announcement_variant', s.writer_announcement_variant,
        'writer_announcement_title_en', s.writer_announcement_title_en,
        'writer_announcement_title_ur', s.writer_announcement_title_ur,
        'writer_announcement_body_en', s.writer_announcement_body_en,
        'writer_announcement_body_ur', s.writer_announcement_body_ur,
        'writer_announcement_link_url', s.writer_announcement_link_url,
        'writer_announcement_link_label', s.writer_announcement_link_label,
        'writer_announcement_dismissible', s.writer_announcement_dismissible,
        'writer_announcement_updated_at', s.writer_announcement_updated_at
    ) INTO v_old_settings
    FROM public.platform_settings s
    WHERE id = 1;

    -- Update platform_settings
    UPDATE public.platform_settings
    SET writer_announcement_enabled = p_enabled,
        writer_announcement_variant = p_variant,
        writer_announcement_title_en = v_title_en,
        writer_announcement_title_ur = v_title_ur,
        writer_announcement_body_en = v_body_en,
        writer_announcement_body_ur = v_body_ur,
        writer_announcement_link_url = v_link_url,
        writer_announcement_link_label = v_link_label,
        writer_announcement_dismissible = p_dismissible,
        writer_announcement_updated_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = 1;

    SELECT pg_catalog.jsonb_build_object(
        'writer_announcement_enabled', s.writer_announcement_enabled,
        'writer_announcement_variant', s.writer_announcement_variant,
        'writer_announcement_title_en', s.writer_announcement_title_en,
        'writer_announcement_title_ur', s.writer_announcement_title_ur,
        'writer_announcement_body_en', s.writer_announcement_body_en,
        'writer_announcement_body_ur', s.writer_announcement_body_ur,
        'writer_announcement_link_url', s.writer_announcement_link_url,
        'writer_announcement_link_label', s.writer_announcement_link_label,
        'writer_announcement_dismissible', s.writer_announcement_dismissible,
        'writer_announcement_updated_at', s.writer_announcement_updated_at
    ) INTO v_new_settings
    FROM public.platform_settings s
    WHERE id = 1;

    -- Record in audit logs
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state
    ) VALUES (
        auth.uid(),
        'admin',
        'update_writer_announcement',
        'platform_settings',
        '1',
        v_old_settings,
        v_new_settings
    );

    RETURN v_new_settings;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_writer_announcement(boolean, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_writer_announcement(boolean, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;

