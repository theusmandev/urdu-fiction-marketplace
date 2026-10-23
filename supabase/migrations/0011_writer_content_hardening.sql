-- ==============================================================================
-- UNB Premium — Migration 0011: Writer Content & Manuscript Hardening
-- Description:
--   1. novels: BEFORE UPDATE trigger protecting status, is_featured, published_at,
--      moderation_reason, writer_id, total_chapters, and post-publication slug.
--      Enforces price ceiling from platform_settings (max_novel_price_pkr) and writes
--      audit log on published novel price changes. Blocks editing under_review / suspended.
--   2. submit_novel_for_review: Atomic RPC enforcing complete novel requirements
--      (title, synopsis, cover art, rights declaration, genre, at least 1 published chapter,
--      and active payment method if price > 0). Notifies admins.
--   3. withdraw_novel_submission & unpublish_own_novel: Atomic RPCs allowing author
--      to return submission to draft; unpublish blocks if open reader orders exist.
--   4. create_novel & update_novel: Atomic RPCs with unique URL-safe slug generation,
--      rights declaration enforcement, and atomic genre link syncing.
--   5. chapters: Word count calculation trigger, total_chapters sync trigger,
--      and hard-delete protection blocking chapter deletion once novel is out of draft.
--   6. reorder_chapters: Safe collision-free chapter reordering RPC.
--   7. RLS verification & permission revocation for anon/public.
-- Idempotency: All DDL statements are guarded with IF EXISTS / IF NOT EXISTS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: PLATFORM SETTINGS EXTENSION (PRICE CEILING)
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'platform_settings' 
          AND column_name = 'max_novel_price_pkr'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD COLUMN max_novel_price_pkr numeric(10,2) NOT NULL DEFAULT 5000.00
            CHECK (max_novel_price_pkr >= 0);
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 2: SLUG GENERATOR HELPER FUNCTION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_unique_novel_slug(
    p_title_english text,
    p_novel_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_base text;
    v_candidate text;
BEGIN
    -- Transliterate English title: lowercase and replace non-alphanumeric with hyphens
    v_base := lower(regexp_replace(trim(COALESCE(p_title_english, '')), '[^a-zA-Z0-9]+', '-', 'g'));
    v_base := trim(both '-' from v_base);

    -- Fall back to short unique ID for Urdu-only or empty titles
    IF v_base IS NULL OR length(v_base) < 2 THEN
        v_base := 'novel-' || substring(replace(p_novel_id::text, '-', ''), 1, 8);
    END IF;

    -- Truncate to reasonable length
    IF length(v_base) > 80 THEN
        v_base := substring(v_base, 1, 80);
        v_base := trim(both '-' from v_base);
    END IF;

    -- Ensure uniqueness across existing novels
    v_candidate := v_base;
    WHILE EXISTS (SELECT 1 FROM public.novels WHERE slug = v_candidate AND id != p_novel_id) LOOP
        v_candidate := v_base || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 4);
    END LOOP;

    RETURN v_candidate;
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 3: NOVEL PROTECTION TRIGGER
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_protect_novel_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_db_admin boolean;
    v_max_price numeric(10,2);
BEGIN
    v_is_db_admin := (auth.uid() IS NULL AND pg_catalog.current_setting('role', true) NOT IN ('authenticated', 'anon'));

    IF NOT v_is_db_admin AND NOT public.is_admin() THEN
        -- 1. Writer cannot transfer novel ownership
        IF NEW.writer_id IS DISTINCT FROM OLD.writer_id THEN
            RAISE EXCEPTION 'Unauthorized: Novel author identifier is immutable.';
        END IF;

        -- 2. Non-admin cannot change status directly (must use official RPCs)
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF pg_catalog.current_setting('app.novel_status_change', true) != '1' THEN
                RAISE EXCEPTION 'Unauthorized: Novel status can only be modified via official editorial workflows.';
            END IF;
        END IF;

        -- 3. is_featured is strictly managed by admins
        IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
            RAISE EXCEPTION 'Unauthorized: Featured status can only be modified by platform administrators.';
        END IF;

        -- 4. published_at is strictly managed by editorial publishing procedures
        IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
            IF pg_catalog.current_setting('app.novel_status_change', true) != '1' THEN
                RAISE EXCEPTION 'Unauthorized: Published timestamp is managed by platform publication procedures.';
            END IF;
        END IF;

        -- 5. moderation_reason can only be modified by administrators or status workflows
        IF NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason THEN
            IF pg_catalog.current_setting('app.novel_status_change', true) != '1' THEN
                RAISE EXCEPTION 'Unauthorized: Moderation notes can only be modified by administrators.';
            END IF;
        END IF;

        -- 6. total_chapters is managed automatically by chapters trigger
        IF NEW.total_chapters IS DISTINCT FROM OLD.total_chapters THEN
            IF pg_catalog.current_setting('app.internal_total_chapters_sync', true) != '1' THEN
                RAISE EXCEPTION 'Unauthorized: Total chapters count is managed automatically by system triggers.';
            END IF;
        END IF;

        -- 7. Slug cannot be modified once the novel has been published
        IF (OLD.status = 'published' OR OLD.published_at IS NOT NULL) AND NEW.slug IS DISTINCT FROM OLD.slug THEN
            RAISE EXCEPTION 'Unauthorized: Novel slug cannot be modified once published.';
        END IF;

        -- 8. Block editing novel metadata while under_review or suspended
        IF OLD.status IN ('under_review', 'suspended') THEN
            IF (
                NEW.title_urdu IS DISTINCT FROM OLD.title_urdu OR
                NEW.title_english IS DISTINCT FROM OLD.title_english OR
                NEW.synopsis_urdu IS DISTINCT FROM OLD.synopsis_urdu OR
                NEW.description_urdu IS DISTINCT FROM OLD.description_urdu OR
                NEW.cover_url IS DISTINCT FROM OLD.cover_url OR
                NEW.cover_public_id IS DISTINCT FROM OLD.cover_public_id OR
                NEW.price_pkr IS DISTINCT FROM OLD.price_pkr OR
                NEW.language IS DISTINCT FROM OLD.language
            ) THEN
                RAISE EXCEPTION 'Novel content cannot be edited while in status: %.', OLD.status;
            END IF;
        END IF;

        -- 9. Enforce price range [0, max_novel_price_pkr]
        SELECT COALESCE(max_novel_price_pkr, 5000.00) INTO v_max_price
        FROM public.platform_settings
        WHERE id = 1;

        IF NEW.price_pkr < 0 OR NEW.price_pkr > v_max_price THEN
            RAISE EXCEPTION 'Novel price must be between 0 and % PKR.', v_max_price;
        END IF;

        -- 10. Audit log when price changes on a published novel
        IF OLD.status = 'published' AND NEW.price_pkr IS DISTINCT FROM OLD.price_pkr THEN
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
                COALESCE(auth.uid(), OLD.writer_id),
                'writer',
                'UPDATE_NOVEL_PRICE',
                'novels',
                OLD.id::text,
                pg_catalog.jsonb_build_object('price_pkr', OLD.price_pkr),
                pg_catalog.jsonb_build_object('price_pkr', NEW.price_pkr),
                pg_catalog.now()
            );
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_novel_columns ON public.novels;
CREATE TRIGGER trg_protect_novel_columns
    BEFORE UPDATE ON public.novels
    FOR EACH ROW EXECUTE FUNCTION public.trg_protect_novel_columns();


-- ------------------------------------------------------------------------------
-- SECTION 4: CHAPTER AUTOMATION & PROTECTION TRIGGERS
-- ------------------------------------------------------------------------------

-- 4.1 Word count calculator trigger (BEFORE INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION public.trg_chapters_calculate_word_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.content_urdu IS NULL OR trim(NEW.content_urdu) = '' THEN
        NEW.word_count := 0;
    ELSE
        NEW.word_count := COALESCE(array_length(regexp_split_to_array(trim(NEW.content_urdu), '\s+'), 1), 0);
    END IF;
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chapters_calculate_word_count ON public.chapters;
CREATE TRIGGER trg_chapters_calculate_word_count
    BEFORE INSERT OR UPDATE ON public.chapters
    FOR EACH ROW EXECUTE FUNCTION public.trg_chapters_calculate_word_count();

-- 4.2 Total chapters sync trigger (AFTER INSERT OR UPDATE OR DELETE)
CREATE OR REPLACE FUNCTION public.trg_chapters_sync_total_chapters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_novel_id uuid;
BEGIN
    v_target_novel_id := COALESCE(NEW.novel_id, OLD.novel_id);

    -- Set transaction-local flag so novel trigger permits total_chapters update
    PERFORM pg_catalog.set_config('app.internal_total_chapters_sync', '1', true);

    UPDATE public.novels
    SET total_chapters = (
        SELECT count(*)::integer
        FROM public.chapters
        WHERE novel_id = v_target_novel_id
    ),
    updated_at = pg_catalog.now()
    WHERE id = v_target_novel_id;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_chapters_sync_total_chapters ON public.chapters;
CREATE TRIGGER trg_chapters_sync_total_chapters
    AFTER INSERT OR UPDATE OF is_published, novel_id OR DELETE ON public.chapters
    FOR EACH ROW EXECUTE FUNCTION public.trg_chapters_sync_total_chapters();

-- 4.3 Chapter deletion protection trigger
CREATE OR REPLACE FUNCTION public.trg_protect_chapter_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_novel record;
    v_is_db_admin boolean;
BEGIN
    v_is_db_admin := (auth.uid() IS NULL AND pg_catalog.current_setting('role', true) NOT IN ('authenticated', 'anon'));

    IF NOT v_is_db_admin AND NOT public.is_admin() THEN
        SELECT * INTO v_novel FROM public.novels WHERE id = OLD.novel_id;
        IF v_novel.id IS NOT NULL AND v_novel.status != 'draft' THEN
            RAISE EXCEPTION 'Chapters cannot be hard-deleted once a novel is submitted or published. Please unpublish the chapter (is_published = false) instead.';
        END IF;
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_chapter_deletion ON public.chapters;
CREATE TRIGGER trg_protect_chapter_deletion
    BEFORE DELETE ON public.chapters
    FOR EACH ROW EXECUTE FUNCTION public.trg_protect_chapter_deletion();


-- ------------------------------------------------------------------------------
-- SECTION 5: ATOMIC RPCs FOR NOVEL LIFECYCLE
-- ------------------------------------------------------------------------------

-- 5.1 submit_novel_for_review
CREATE OR REPLACE FUNCTION public.submit_novel_for_review(
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
    v_writer record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit novel for review.';
    END IF;

    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id
    FOR UPDATE;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the novel author can submit this novel for review.';
    END IF;

    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_novel.writer_id;

    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RAISE EXCEPTION 'Only approved writers can submit novels for editorial review.';
    END IF;

    IF v_novel.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'Novel can only be submitted for review from draft or rejected status (current status: %).', v_novel.status;
    END IF;

    -- Strict submission requirements checks
    IF v_novel.title_urdu IS NULL OR trim(v_novel.title_urdu) = '' THEN
        RAISE EXCEPTION 'Urdu title is required before submitting for review.';
    END IF;

    IF v_novel.title_english IS NULL OR trim(v_novel.title_english) = '' THEN
        RAISE EXCEPTION 'English title is required before submitting for review.';
    END IF;

    IF v_novel.synopsis_urdu IS NULL OR trim(v_novel.synopsis_urdu) = '' THEN
        RAISE EXCEPTION 'Urdu synopsis is required before submitting for review.';
    END IF;

    IF v_novel.cover_url IS NULL OR trim(v_novel.cover_url) = '' THEN
        RAISE EXCEPTION 'Cover art image is required before submitting for review.';
    END IF;

    IF v_novel.rights_declaration_accepted IS NOT TRUE THEN
        RAISE EXCEPTION 'Author copyright & distribution rights declaration must be accepted before submission.';
    END IF;

    -- Must have at least 1 genre linked
    IF NOT EXISTS (SELECT 1 FROM public.novel_genres WHERE novel_id = p_novel_id) THEN
        RAISE EXCEPTION 'Novel must be associated with at least one genre before submission.';
    END IF;

    -- Must have at least 1 published chapter
    IF NOT EXISTS (SELECT 1 FROM public.chapters WHERE novel_id = p_novel_id AND is_published = true) THEN
        RAISE EXCEPTION 'Novel must have at least one published chapter before submission.';
    END IF;

    -- If price > 0, author must have at least 1 active payment method
    IF v_novel.price_pkr > 0 THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.writer_payment_methods
            WHERE writer_id = v_novel.writer_id AND is_active = true
        ) THEN
            RAISE EXCEPTION 'At least one active payout method (JazzCash, EasyPaisa, Raast, or Bank IBAN) is required for paid novels.';
        END IF;
    END IF;

    -- Set transaction-local flag so novel trigger permits status update
    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);

    UPDATE public.novels
    SET status = 'under_review',
        moderation_reason = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    -- Audit Log
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
        'SUBMIT_NOVEL_FOR_REVIEW',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', v_novel.status),
        pg_catalog.jsonb_build_object('status', 'under_review'),
        pg_catalog.now()
    );

    -- Notify Platform Administrators
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    )
    SELECT
        p.id,
        'نیا ناول جائزے کے لیے موصول ہوا (Novel Submitted for Review)',
        'ناول "' || v_novel.title_urdu || '" مصنف کی جانب سے ادارتی جائزے کے لیے جمع کرا دیا گیا ہے۔',
        '/admin/novels/' || p_novel_id,
        false,
        pg_catalog.now()
    FROM public.profiles p
    WHERE p.role = 'admin' AND p.is_active = true;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id,
        'status', 'under_review'
    );
END;
$$;

-- 5.2 withdraw_novel_submission
CREATE OR REPLACE FUNCTION public.withdraw_novel_submission(
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
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id
    FOR UPDATE;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    IF v_novel.status != 'under_review' THEN
        RAISE EXCEPTION 'Only novels under review can be withdrawn (current status: %).', v_novel.status;
    END IF;

    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);

    UPDATE public.novels
    SET status = 'draft',
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

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
        'WITHDRAW_NOVEL_SUBMISSION',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', 'under_review'),
        pg_catalog.jsonb_build_object('status', 'draft'),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id,
        'status', 'draft'
    );
END;
$$;

-- 5.3 unpublish_own_novel
CREATE OR REPLACE FUNCTION public.unpublish_own_novel(
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
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id
    FOR UPDATE;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    IF v_novel.status != 'published' THEN
        RAISE EXCEPTION 'Only published novels can be unpublished (current status: %).', v_novel.status;
    END IF;

    -- Block unpublishing if there are active unsettled orders
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE novel_id = p_novel_id
          AND status IN ('pending_payment', 'payment_submitted', 'disputed')
    ) THEN
        RAISE EXCEPTION 'Cannot unpublish novel while open reader orders exist. Please resolve pending orders before unpublishing.';
    END IF;

    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);

    -- Unpublish returns to draft; existing entitlements remain untouched
    UPDATE public.novels
    SET status = 'draft',
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

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
        'UNPUBLISH_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', 'published'),
        pg_catalog.jsonb_build_object('status', 'draft'),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id,
        'status', 'draft'
    );
END;
$$;

-- 5.4 create_novel
CREATE OR REPLACE FUNCTION public.create_novel(
    p_title_urdu text,
    p_title_english text,
    p_synopsis_urdu text,
    p_description_urdu text DEFAULT NULL,
    p_cover_url text DEFAULT NULL,
    p_cover_public_id text DEFAULT NULL,
    p_price_pkr numeric DEFAULT 0,
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
    v_max_price numeric(10,2);
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

    SELECT COALESCE(max_novel_price_pkr, 5000.00) INTO v_max_price
    FROM public.platform_settings
    WHERE id = 1;

    IF p_price_pkr < 0 OR p_price_pkr > v_max_price THEN
        RAISE EXCEPTION 'Price must be between 0 and % PKR.', v_max_price;
    END IF;

    v_novel_id := gen_random_uuid();
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
        COALESCE(p_price_pkr, 0),
        COALESCE(trim(p_language), 'ur'),
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

-- 5.5 update_novel
CREATE OR REPLACE FUNCTION public.update_novel(
    p_novel_id uuid,
    p_title_urdu text,
    p_title_english text,
    p_synopsis_urdu text,
    p_description_urdu text DEFAULT NULL,
    p_cover_url text DEFAULT NULL,
    p_cover_public_id text DEFAULT NULL,
    p_price_pkr numeric DEFAULT 0,
    p_language text DEFAULT 'ur',
    p_genre_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
    v_max_price numeric(10,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id
    FOR UPDATE;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    IF v_novel.status NOT IN ('draft', 'rejected', 'published') THEN
        RAISE EXCEPTION 'Novel cannot be edited while in status: %.', v_novel.status;
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

    SELECT COALESCE(max_novel_price_pkr, 5000.00) INTO v_max_price
    FROM public.platform_settings
    WHERE id = 1;

    IF p_price_pkr < 0 OR p_price_pkr > v_max_price THEN
        RAISE EXCEPTION 'Price must be between 0 and % PKR.', v_max_price;
    END IF;

    UPDATE public.novels
    SET title_urdu = trim(p_title_urdu),
        title_english = trim(p_title_english),
        synopsis_urdu = trim(p_synopsis_urdu),
        description_urdu = trim(p_description_urdu),
        cover_url = trim(p_cover_url),
        cover_public_id = trim(p_cover_public_id),
        price_pkr = COALESCE(p_price_pkr, 0),
        language = COALESCE(trim(p_language), 'ur'),
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    -- Replace genre associations atomically
    DELETE FROM public.novel_genres WHERE novel_id = p_novel_id;
    IF p_genre_ids IS NOT NULL AND array_length(p_genre_ids, 1) > 0 THEN
        INSERT INTO public.novel_genres (novel_id, genre_id)
        SELECT DISTINCT p_novel_id, g.id
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
        'UPDATE_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object(
            'title_english', v_novel.title_english,
            'title_urdu', v_novel.title_urdu,
            'price_pkr', v_novel.price_pkr
        ),
        pg_catalog.jsonb_build_object(
            'title_english', trim(p_title_english),
            'title_urdu', trim(p_title_urdu),
            'price_pkr', p_price_pkr
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id
    );
END;
$$;

-- 5.6 reorder_chapters
CREATE OR REPLACE FUNCTION public.reorder_chapters(
    p_novel_id uuid,
    p_chapter_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
    v_idx integer;
    v_chap_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    IF v_novel.status IN ('under_review', 'suspended') THEN
        RAISE EXCEPTION 'Chapters cannot be reordered while novel is in status: %.', v_novel.status;
    END IF;

    -- Step 1: Temporarily negate chapter numbers to clear positive numbers from unique constraint
    UPDATE public.chapters
    SET chapter_number = -chapter_number
    WHERE novel_id = p_novel_id;

    -- Step 2: Assign new 1-indexed sequential numbers according to p_chapter_ids
    v_idx := 1;
    FOREACH v_chap_id IN ARRAY p_chapter_ids LOOP
        UPDATE public.chapters
        SET chapter_number = v_idx,
            updated_at = pg_catalog.now()
        WHERE id = v_chap_id AND novel_id = p_novel_id;
        v_idx := v_idx + 1;
    END LOOP;

    -- Step 3: If any chapters in the novel were NOT included in the array, restore them sequentially
    FOR v_chap_id IN 
        SELECT id FROM public.chapters 
        WHERE novel_id = p_novel_id AND chapter_number < 0 
        ORDER BY abs(chapter_number) ASC
    LOOP
        UPDATE public.chapters
        SET chapter_number = v_idx,
            updated_at = pg_catalog.now()
        WHERE id = v_chap_id;
        v_idx := v_idx + 1;
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 6: RLS POLICY RE-VERIFICATION & GAP HARDENING
-- ------------------------------------------------------------------------------

-- Ensure readers/anon CANNOT read draft, under_review, rejected, or suspended novels
DROP POLICY IF EXISTS "Public view published novels" ON public.novels;
CREATE POLICY "Public view published novels"
    ON public.novels FOR SELECT
    USING (
        status = 'published'
        OR writer_id = auth.uid()
        OR public.is_admin()
    );

-- Ensure readers/anon CANNOT view unpublished chapters or chapters of non-published novels
DROP POLICY IF EXISTS "Read chapters if free preview or entitled or owner or admin" ON public.chapters;
CREATE POLICY "Read chapters if free preview or entitled or owner or admin"
    ON public.chapters FOR SELECT
    USING (
        -- Case 1: Free preview chapter of a published novel
        (
            is_free_preview = true AND
            is_published = true AND
            EXISTS (
                SELECT 1 FROM public.novels n
                WHERE n.id = chapters.novel_id AND n.status = 'published'
            )
        )
        OR
        -- Case 2: Reader holds verified, non-revoked purchase entitlement on published novel
        (
            is_published = true AND
            public.has_novel_entitlement(chapters.novel_id)
        )
        OR
        -- Case 3: Author of the novel (can view own draft chapters)
        EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = chapters.novel_id AND n.writer_id = auth.uid()
        )
        OR
        -- Case 4: Platform administrator
        public.is_admin()
    );

-- ------------------------------------------------------------------------------
-- SECTION 7: PERMISSIONS REVOCATION & GRANTS
-- ------------------------------------------------------------------------------

-- Revoke default public/anon execution on new RPCs
REVOKE EXECUTE ON FUNCTION public.generate_unique_novel_slug(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_novel_for_review(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_novel_submission(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unpublish_own_novel(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_novel(text, text, text, text, text, text, numeric, text, boolean, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_novel(uuid, text, text, text, text, text, text, numeric, text, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reorder_chapters(uuid, uuid[]) FROM PUBLIC, anon;

-- Grant EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_unique_novel_slug(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_novel_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_novel_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_own_novel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_novel(text, text, text, text, text, text, numeric, text, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_novel(uuid, text, text, text, text, text, text, numeric, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_chapters(uuid, uuid[]) TO authenticated;
