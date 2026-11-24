-- ==============================================================================
-- UNB Premium — Rollback for Migration 0057
-- Target Function: public.handle_new_user()
-- Restores baseline definition from: supabase/migrations/0006_security_and_financial_hardening.sql#L190-L235
--
-- INSTRUCTIONS:
--   Execute this script manually in the Supabase SQL Editor if migration 0057
--   needs to be rolled back.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_full_name text;
    v_username text;
BEGIN
    -- Strict security hardening: All signups default unconditionally to 'reader'
    -- Never read role from raw_user_meta_data to prevent self-declared admin or writer privilege escalation.
    v_full_name := NEW.raw_user_meta_data->>'full_name';
    v_username := coalesce(
        NEW.raw_user_meta_data->>'username',
        pg_catalog.split_part(NEW.email, '@', 1) || '_' || substring(pg_catalog.replace(NEW.id::text, '-', ''), 1, 4)
    );

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        username,
        avatar_url,
        role,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        v_full_name,
        v_username,
        NEW.raw_user_meta_data->>'avatar_url',
        'reader'::public.user_role,
        true,
        pg_catalog.now(),
        pg_catalog.now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = pg_catalog.now();

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
'Provisions public.profiles record on auth.users insert with default reader role (restored to baseline 0006).';

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
