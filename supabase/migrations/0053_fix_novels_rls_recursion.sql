-- ==============================================================================
-- UNB Premium — Migration 0053: Break Novels & Purchase Entitlements RLS Infinite Recursion
--
-- PURPOSE:
-- 1. Eliminates PostgreSQL Error 42P17 (infinite_recursion) caused by a circular
--    dependency between public.novels SELECT policy and public.purchase_entitlements
--    SELECT policy.
-- 2. Provisions three dedicated SECURITY DEFINER helper functions that execute with
--    elevated system privileges to inspect cross-table relationships without
--    triggering recursive RLS policy re-evaluations:
--      - public.is_writer_active_and_approved(p_writer_id uuid)
--      - public.is_novel_author(p_novel_id uuid)
--      - public.is_free_preview_accessible(p_novel_id uuid)
-- 3. Hardens public.novels SELECT RLS policy so non-owners/public can only view
--    novels if status = 'published' AND author is approved in writer_profiles AND
--    active in profiles, OR if the reader holds an active purchase entitlement
--    (evaluated cleanly via public.has_novel_entitlement), OR if caller is author/admin.
-- 4. Hardens public.purchase_entitlements SELECT RLS policy using public.is_novel_author
--    to prevent recursing back into public.novels RLS.
-- 5. Hardens public.chapters SELECT RLS policy using public.is_free_preview_accessible,
--    public.has_novel_entitlement, and public.is_novel_author to ensure zero raw
--    cross-table RLS expansions.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER HELPER: is_writer_active_and_approved
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_writer_active_and_approved(p_writer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (
    SELECT 1
    FROM public.writer_profiles wp
    JOIN public.profiles p ON p.id = wp.id
    WHERE wp.id = p_writer_id
      AND wp.status = 'approved'
      AND p.is_active = true
);
$$;

COMMENT ON FUNCTION public.is_writer_active_and_approved(uuid) IS
'Security definer helper checking if an author profile is approved and user profile is active without RLS recursion.';

REVOKE ALL ON FUNCTION public.is_writer_active_and_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_writer_active_and_approved(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. SECURITY DEFINER HELPER: is_novel_author
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_novel_author(p_novel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (
    SELECT 1
    FROM public.novels
    WHERE id = p_novel_id
      AND writer_id = auth.uid()
);
$$;

COMMENT ON FUNCTION public.is_novel_author(uuid) IS
'Security definer helper checking if the calling user is the author of a novel without RLS recursion.';

REVOKE ALL ON FUNCTION public.is_novel_author(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_novel_author(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. SECURITY DEFINER HELPER: is_free_preview_accessible
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_free_preview_accessible(p_novel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
SELECT EXISTS (
    SELECT 1
    FROM public.novels n
    JOIN public.writer_profiles wp ON wp.id = n.writer_id
    JOIN public.profiles p ON p.id = wp.id
    WHERE n.id = p_novel_id
      AND n.status = 'published'
      AND wp.status = 'approved'
      AND p.is_active = true
);
$$;

COMMENT ON FUNCTION public.is_free_preview_accessible(uuid) IS
'Security definer helper checking if a novel is published by an approved, active author for preview access without RLS recursion.';

REVOKE ALL ON FUNCTION public.is_free_preview_accessible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_free_preview_accessible(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RECREATE RLS ON public.novels
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public view published novels" ON public.novels;

CREATE POLICY "Public view published novels"
    ON public.novels
    FOR SELECT
    TO authenticated, anon
    USING (
        -- 1. Authors always view all own novels (draft, review, published, suspended)
        writer_id = auth.uid()
        -- 2. Platform administrators view all novels
        OR public.is_admin()
        -- 3. Entitled buyers view purchased novels (bypasses RLS recursion via SECURITY DEFINER)
        OR public.has_novel_entitlement(id)
        -- 4. Public catalog visitors view published novels of approved, active authors
        OR (
            status = 'published'
            AND public.is_writer_active_and_approved(writer_id)
        )
    );

-- -----------------------------------------------------------------------------
-- 5. RECREATE RLS ON public.purchase_entitlements
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "View purchase entitlements" ON public.purchase_entitlements;

CREATE POLICY "View purchase entitlements"
    ON public.purchase_entitlements
    FOR SELECT
    TO authenticated, anon
    USING (
        -- 1. Buyer views own entitlements
        reader_id = auth.uid()
        -- 2. Author views entitlements for own novels (bypasses RLS recursion via SECURITY DEFINER)
        OR public.is_novel_author(novel_id)
        -- 3. Platform administrators view all entitlements
        OR public.is_admin()
    );

-- -----------------------------------------------------------------------------
-- 6. RECREATE RLS ON public.chapters
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read chapters if free preview or entitled or owner or admin" ON public.chapters;
DROP POLICY IF EXISTS "Public view free preview chapters" ON public.chapters;

CREATE POLICY "Read chapters if free preview or entitled or owner or admin"
    ON public.chapters
    FOR SELECT
    TO authenticated, anon
    USING (
        -- Case 1: Free preview chapter of a published novel by an approved, active author
        (
            is_free_preview = true
            AND is_published = true
            AND public.is_free_preview_accessible(novel_id)
        )
        OR
        -- Case 2: Reader holds verified, non-revoked purchase entitlement (regardless of novel/author suspension)
        (
            is_published = true
            AND public.has_novel_entitlement(novel_id)
        )
        OR
        -- Case 3: Author of the novel (can view own draft and published chapters)
        public.is_novel_author(novel_id)
        OR
        -- Case 4: Platform administrator
        public.is_admin()
    );

