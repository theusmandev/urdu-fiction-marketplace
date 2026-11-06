-- Migration: 0046_fix_writer_profiles_rls_update.sql
-- Description: Fixes "permission denied for table writer_profiles" error when writers save their profile settings.
--              In migration 0024, column-level UPDATE privileges were locked down for authenticated users.
--              This migration grants UPDATE on the 5 social media link columns added in migration 0045,
--              and refreshes the RLS UPDATE policy on public.writer_profiles.

-- 1. Ensure authenticated users have SELECT access on writer_profiles
GRANT SELECT ON public.writer_profiles TO authenticated;

-- 2. Grant column-level UPDATE permissions on all permitted author profile fields (including social links)
GRANT UPDATE (
    pen_name_urdu,
    pen_name_english,
    bio_urdu,
    bio_english,
    agreement_accepted_at,
    social_facebook,
    social_instagram,
    social_pinterest,
    social_tiktok,
    social_linkedin,
    updated_at
) ON public.writer_profiles TO authenticated;

-- Explicitly ensure unauthenticated (anon) users cannot update writer profiles
REVOKE UPDATE ON public.writer_profiles FROM anon;

-- 3. Drop and recreate the RLS UPDATE policy on public.writer_profiles
DROP POLICY IF EXISTS "Writers update own profile metadata" ON public.writer_profiles;
DROP POLICY IF EXISTS "Writers update own profile safe fields" ON public.writer_profiles;
DROP POLICY IF EXISTS "Writers can update their own profile fields" ON public.writer_profiles;

CREATE POLICY "Writers update own profile safe fields"
    ON public.writer_profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (id = auth.uid() OR public.is_admin());
