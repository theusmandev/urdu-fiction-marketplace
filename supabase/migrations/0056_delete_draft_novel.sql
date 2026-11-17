-- ==============================================================================
-- UNB Premium — Migration 0056: Delete Draft Novel RPC & Duplicate Creation Guard
--
-- PURPOSE:
-- 1. Create public.delete_draft_novel(p_novel_id uuid) RPC allowing authors (or admins)
--    to safely and permanently delete draft novels.
--    - Enforces status = 'draft' (non-draft novels can NEVER be deleted).
--    - Enforces zero orders, zero purchase entitlements, and zero sales ledger records.
--    - Cascades to chapters, chapter_drafts, reader_progress, novel_genres.
--    - Writes an immutable audit log entry in public.audit_logs.
-- 2. Update public.create_novel(...) to prevent duplicate novel creation:
--    - Checks if the calling author already has an existing novel with the same
--      normalized English title (case-insensitive trimmed) or Urdu title (trimmed).
--    - Rejects creation with a clear exception instructing the author to add chapters
--      to their existing novel rather than creating a duplicate entry.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC: public.delete_draft_novel
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_draft_novel(
    p_novel_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
    v_is_admin boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();

    -- Fetch novel with row-level lock
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id
    FOR UPDATE;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found.';
    END IF;

    -- Verify caller authorization: must be the author or an administrator
    IF v_novel.writer_id != v_caller_id AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: You can only delete your own draft novels.';
    END IF;

    -- Enforce status invariant: strictly 'draft'
    IF v_novel.status != 'draft' THEN
        RAISE EXCEPTION 'Only draft novels can be deleted. Novels in status "%" cannot be deleted.', v_novel.status;
    END IF;

    -- Enforce zero financial / order history invariants
    IF EXISTS (SELECT 1 FROM public.orders WHERE novel_id = p_novel_id) THEN
        RAISE EXCEPTION 'Cannot delete novel: Existing orders are associated with this novel.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.purchase_entitlements WHERE novel_id = p_novel_id) THEN
        RAISE EXCEPTION 'Cannot delete novel: Active reader entitlements are associated with this novel.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.sales_ledger WHERE novel_id = p_novel_id) THEN
        RAISE EXCEPTION 'Cannot delete novel: Financial ledger records are associated with this novel.';
    END IF;

    -- Delete the novel (foreign keys cascade to novel_genres, chapters, chapter_drafts, reader_progress)
    DELETE FROM public.novels
    WHERE id = p_novel_id;

    -- Record immutable audit log
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
        CASE WHEN v_is_admin THEN 'admin' ELSE 'writer' END,
        'DELETE_DRAFT_NOVEL',
        'novel',
        p_novel_id::text,
        pg_catalog.jsonb_build_object(
            'title_english', v_novel.title_english,
            'title_urdu', v_novel.title_urdu,
            'slug', v_novel.slug,
            'writer_id', v_novel.writer_id,
            'total_chapters', v_novel.total_chapters,
            'deleted_by', v_caller_id
        ),
        NULL,
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'deleted', true,
        'novel_id', p_novel_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_draft_novel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_draft_novel(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. UPDATE RPC: public.create_novel (with Duplicate Title Guard)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_novel(
    p_title_urdu text,
    p_title_english text,
    p_synopsis_urdu text,
    p_description_urdu text DEFAULT NULL,
    p_cover_url text DEFAULT NULL,
    p_cover_public_id text DEFAULT NULL,
    p_price_pkr numeric DEFAULT 50,
    p_language text DEFAULT 'ur',
    p_rights_declaration_accepted boolean DEFAULT false,
    p_genre_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_writer record;
    v_novel_id uuid;
    v_slug text;
    v_min_price integer;
    v_max_price numeric(10,2);
    v_existing_novel record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_caller_id;

    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RAISE EXCEPTION 'Only approved writers can create new novels.';
    END IF;

    IF p_rights_declaration_accepted IS NOT TRUE THEN
        RAISE EXCEPTION 'Rights declaration must be accepted.';
    END IF;

    IF p_title_urdu IS NULL OR trim(p_title_urdu) = '' THEN
        RAISE EXCEPTION 'Urdu title is required.';
    END IF;

    IF p_title_english IS NULL OR trim(p_title_english) = '' THEN
        RAISE EXCEPTION 'English title is required.';
    END IF;

    IF p_synopsis_urdu IS NULL OR trim(p_synopsis_urdu) = '' THEN
        RAISE EXCEPTION 'Urdu synopsis is required.';
    END IF;

    -- Author-level duplicate title guard
    SELECT id, title_english, title_urdu INTO v_existing_novel
    FROM public.novels
    WHERE writer_id = v_caller_id
      AND (
        pg_catalog.lower(trim(title_english)) = pg_catalog.lower(trim(p_title_english))
        OR trim(title_urdu) = trim(p_title_urdu)
      )
    LIMIT 1;

    IF v_existing_novel.id IS NOT NULL THEN
        RAISE EXCEPTION 'DUPLICATE_NOVEL_TITLE: You already have a novel titled "%". Please open your existing novel to add or manage chapters instead of creating a duplicate novel.', v_existing_novel.title_english;
    END IF;

    SELECT coalesce(min_novel_price_pkr, 50), coalesce(max_novel_price_pkr, 5000.00)
    INTO v_min_price, v_max_price
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := coalesce(v_min_price, 50);
    v_max_price := coalesce(v_max_price, 5000.00);

    IF p_price_pkr IS NULL OR p_price_pkr != pg_catalog.round(p_price_pkr, 0) THEN
        RAISE EXCEPTION 'Novel price must be a whole rupee amount without paise. Provided: %', p_price_pkr;
    END IF;

    IF p_price_pkr < v_min_price OR p_price_pkr > v_max_price THEN
        RAISE EXCEPTION 'Price must be between % and % PKR.', v_min_price, v_max_price;
    END IF;

    v_novel_id := pg_catalog.gen_random_uuid();
    v_slug := public.generate_unique_novel_slug(p_title_english, v_novel_id);

    INSERT INTO public.novels (
        id,
        writer_id,
        slug,
        title_urdu,
        title_english,
        synopsis_urdu,
        description_urdu,
        cover_url,
        cover_public_id,
        price_pkr,
        language,
        status,
        total_chapters,
        is_featured,
        rights_declaration_accepted,
        created_at,
        updated_at
    ) VALUES (
        v_novel_id,
        v_caller_id,
        v_slug,
        trim(p_title_urdu),
        trim(p_title_english),
        trim(p_synopsis_urdu),
        trim(p_description_urdu),
        trim(p_cover_url),
        trim(p_cover_public_id),
        p_price_pkr,
        coalesce(trim(p_language), 'ur'),
        'draft',
        0,
        false,
        true,
        pg_catalog.now(),
        pg_catalog.now()
    );

    IF p_genre_ids IS NOT NULL AND array_length(p_genre_ids, 1) > 0 THEN
        INSERT INTO public.novel_genres (novel_id, genre_id)
        SELECT DISTINCT v_novel_id, g.id
        FROM public.genres g
        WHERE g.id = ANY(p_genre_ids)
        ON CONFLICT DO NOTHING;
    END IF;

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
        'writer',
        'CREATE_NOVEL',
        'novels',
        v_novel_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'title_english', trim(p_title_english),
            'title_urdu', trim(p_title_urdu),
            'slug', v_slug,
            'price_pkr', p_price_pkr
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', v_novel_id,
        'slug', v_slug
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_novel(text, text, text, text, text, text, numeric, text, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_novel(text, text, text, text, text, text, numeric, text, boolean, uuid[]) TO authenticated, service_role;
