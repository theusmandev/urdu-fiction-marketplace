-- ==============================================================================
-- UNB Premium — Migration 0027: Admin Novel Moderation RLS Hardening
-- Description:
--   Explicitly guarantees dedicated SELECT Row Level Security policies for
--   platform administrators on novels and chapters, and re-asserts base table
--   SELECT privileges for authenticated users.
--
-- Security Invariants:
--   - public.is_admin() is used for authoritative administrative access.
--   - Writers can strictly only view their own drafts and pending novels.
--   - Public readers and anon can strictly only view published novels and
--     published chapters (or entitled/free preview chapters).
--   - No schema-qualified SQL syntax constructs (bare coalesce, trim, etc.).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: STANDALONE ADMIN SELECT POLICIES
-- ------------------------------------------------------------------------------

-- 1.1 novels: Dedicated Admin SELECT policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'novels' AND policyname = 'Admins view all novels'
    ) THEN
        CREATE POLICY "Admins view all novels"
            ON public.novels FOR SELECT
            USING (public.is_admin());
    END IF;
END $$;

-- 1.2 chapters: Dedicated Admin SELECT policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'chapters' AND policyname = 'Admins view all chapters'
    ) THEN
        CREATE POLICY "Admins view all chapters"
            ON public.chapters FOR SELECT
            USING (public.is_admin());
    END IF;
END $$;

-- 1.3 writer_profiles: Dedicated Admin SELECT policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'writer_profiles' AND policyname = 'Admins view all writer profiles'
    ) THEN
        CREATE POLICY "Admins view all writer profiles"
            ON public.writer_profiles FOR SELECT
            USING (public.is_admin());
    END IF;
END $$;

-- 1.4 novel_genres: Dedicated Admin SELECT policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'novel_genres' AND policyname = 'Admins view all novel genres'
    ) THEN
        CREATE POLICY "Admins view all novel genres"
            ON public.novel_genres FOR SELECT
            USING (public.is_admin());
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 2: TABLE SELECT GRANTS FOR AUTHENTICATED USERS
-- Re-assert explicit SELECT grants on the 6 moderation catalog tables
-- ------------------------------------------------------------------------------

GRANT SELECT ON public.novels TO authenticated;
GRANT SELECT ON public.chapters TO authenticated;
GRANT SELECT ON public.novel_genres TO authenticated;
GRANT SELECT ON public.genres TO authenticated;
GRANT SELECT ON public.writer_profiles TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- Public discovery views grants (safe access)
GRANT SELECT ON public.public_novels TO anon, authenticated;
GRANT SELECT ON public.public_writers TO anon, authenticated;
GRANT SELECT ON public.public_genres TO anon, authenticated;
GRANT SELECT ON public.public_free_preview_chapters TO anon, authenticated;

-- Confirmation: base tables remain strictly revoked from anon
REVOKE ALL ON TABLE public.novels FROM anon;
REVOKE ALL ON TABLE public.chapters FROM anon;
