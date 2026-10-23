-- ==============================================================================
-- UNB Premium — Migration 0012: Admin Controls & Moderation Hardening
-- Description:
--   Comprehensive admin controls and governance RPCs:
--     1. suspend_novel / unsuspend_novel (published novels, notifies author, blocks new orders)
--     2. set_novel_featured (admin toggles featured status)
--     3. Genres administration: is_active column, create_genre, update_genre, reorder_genres, delete_genre (blocked if in use)
--     4. update_platform_settings: validates ranges (commission rate 0-100, unpaid limit >= 0, dispute window 1-365, max price > 0, support email)
--     5. set_writer_commission_terms: custom rate, unpaid limit, mandatory reason, triggers reconcile_writer_unpaid_commission
--     6. admin_update_user_role_status: mandatory reason, self-demotion / self-deactivation protection, last-admin protection,
--        blocks demoting approved writer with published novels to reader
--     7. Admin RLS policy enhancements for novel_genres
--
-- Security:
--   All functions SECURITY DEFINER, SET search_path = '', restricted to public.is_admin(),
--   audit logged to public.audit_logs with previous and new states, REVOKE from PUBLIC/anon.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: GENRE TAXONOMY ENHANCEMENTS
-- ------------------------------------------------------------------------------

ALTER TABLE public.genres ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_genres_is_active ON public.genres(is_active);

-- Admin policy for novel_genres
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'novel_genres' AND policyname = 'Admins manage all novel_genres'
    ) THEN
        CREATE POLICY "Admins manage all novel_genres"
            ON public.novel_genres FOR ALL
            USING (public.is_admin());
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 2: NOVEL SUSPENSION & FEATURED STATUS RPCS
-- ------------------------------------------------------------------------------

-- 2.1 suspend_novel: Suspend a published novel with mandatory reason
CREATE OR REPLACE FUNCTION public.suspend_novel(
    p_novel_id uuid,
    p_reason text
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can suspend novels.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to suspend a novel.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.status != 'published' THEN
        RAISE EXCEPTION 'Only published novels can be suspended. Current status: %', v_novel.status;
    END IF;

    -- Set internal session flag to permit novel status change
    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);

    UPDATE public.novels
    SET status = 'suspended',
        moderation_reason = trim(p_reason),
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    -- Notify writer
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_novel.writer_id,
        'novel_suspended',
        'ناول معطل کر دیا گیا (Novel Suspended)',
        'آپ کا ناول "' || v_novel.title_urdu || '" انتظامیہ کی طرف سے معطل کر دیا گیا ہے۔ وجہ: ' || trim(p_reason),
        trim(p_reason),
        '/writer/novels',
        pg_catalog.jsonb_build_object('novel_id', p_novel_id, 'reason', trim(p_reason)),
        false,
        pg_catalog.now()
    );

    -- Append to immutable audit log
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
        'SUSPEND_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', v_novel.status, 'moderation_reason', v_novel.moderation_reason),
        pg_catalog.jsonb_build_object('status', 'suspended', 'reason', trim(p_reason)),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id,
        'status', 'suspended'
    );
END;
$$;

-- 2.2 unsuspend_novel: Return a suspended novel to published status
CREATE OR REPLACE FUNCTION public.unsuspend_novel(
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can unsuspend novels.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.status != 'suspended' THEN
        RAISE EXCEPTION 'Only suspended novels can be unsuspended. Current status: %', v_novel.status;
    END IF;

    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);

    UPDATE public.novels
    SET status = 'published',
        moderation_reason = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    -- Notify writer
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_novel.writer_id,
        'novel_unsuspended',
        'ناول بحال کر دیا گیا (Novel Unsuspended)',
        'آپ کا ناول "' || v_novel.title_urdu || '" بحال کر دیا گیا ہے اور دوبارہ مارکیٹ پلیس پر دستیاب ہے۔',
        'آپ کا ناول بحال کر دیا گیا ہے۔',
        '/novels/' || v_novel.slug,
        pg_catalog.jsonb_build_object('novel_id', p_novel_id),
        false,
        pg_catalog.now()
    );

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
        'UNSUSPEND_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', 'suspended', 'moderation_reason', v_novel.moderation_reason),
        pg_catalog.jsonb_build_object('status', 'published'),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id,
        'status', 'published'
    );
END;
$$;

-- 2.3 set_novel_featured: Toggle is_featured
CREATE OR REPLACE FUNCTION public.set_novel_featured(
    p_novel_id uuid,
    p_featured boolean
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can feature novels.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    UPDATE public.novels
    SET is_featured = p_featured,
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
        'admin',
        'SET_NOVEL_FEATURED',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('is_featured', v_novel.is_featured),
        pg_catalog.jsonb_build_object('is_featured', p_featured),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id,
        'is_featured', p_featured
    );
END;
$$;

-- 2.4 approve_novel with informational moderation checklist stored in audit_logs
DROP FUNCTION IF EXISTS public.approve_novel(uuid);
CREATE OR REPLACE FUNCTION public.approve_novel(
    p_novel_id uuid,
    p_checklist jsonb DEFAULT NULL
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can approve novels.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);

    UPDATE public.novels
    SET status = 'published',
        published_at = coalesce(published_at, pg_catalog.now()),
        moderation_reason = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_novel.writer_id,
        'novel_published',
        'ناول شائع ہو گیا! (Novel Published)',
        'آپ کا ناول "' || v_novel.title_urdu || '" اب مارکیٹ پلیس پر لائیو اور خریداری کے لیے دستیاب ہے۔',
        'آپ کا ناول "' || v_novel.title_urdu || '" اب مارکیٹ پلیس پر لائیو اور خریداری کے لیے دستیاب ہے۔',
        '/novels/' || v_novel.slug,
        pg_catalog.jsonb_build_object('novel_id', p_novel_id),
        false,
        pg_catalog.now()
    );

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
        'APPROVE_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', v_novel.status),
        pg_catalog.jsonb_build_object(
            'status', 'published',
            'moderation_checklist', p_checklist
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'novel_id', p_novel_id, 'status', 'published');
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 3: GENRES MANAGEMENT RPCS
-- ------------------------------------------------------------------------------

-- 3.1 create_genre
CREATE OR REPLACE FUNCTION public.create_genre(
    p_slug text,
    p_name_english text,
    p_name_urdu text,
    p_display_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_clean_slug text;
    v_genre_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can manage genres.';
    END IF;

    IF p_name_english IS NULL OR trim(p_name_english) = '' THEN
        RAISE EXCEPTION 'English genre name is required.';
    END IF;
    IF p_name_urdu IS NULL OR trim(p_name_urdu) = '' THEN
        RAISE EXCEPTION 'Urdu genre name is required.';
    END IF;

    v_clean_slug := pg_catalog.lower(trim(COALESCE(p_slug, '')));
    IF v_clean_slug = '' THEN
        v_clean_slug := pg_catalog.lower(pg_catalog.regexp_replace(trim(p_name_english), '[^a-zA-Z0-9]+', '-', 'g'));
        v_clean_slug := trim(both '-' from v_clean_slug);
    END IF;

    IF EXISTS (SELECT 1 FROM public.genres WHERE slug = v_clean_slug) THEN
        RAISE EXCEPTION 'Genre slug "%" already exists.', v_clean_slug;
    END IF;

    INSERT INTO public.genres (
        slug,
        name_english,
        name_urdu,
        display_order,
        is_active,
        created_at
    ) VALUES (
        v_clean_slug,
        trim(p_name_english),
        trim(p_name_urdu),
        COALESCE(p_display_order, 0),
        true,
        pg_catalog.now()
    ) RETURNING id INTO v_genre_id;

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
        'CREATE_GENRE',
        'genres',
        v_genre_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'slug', v_clean_slug,
            'name_english', p_name_english,
            'name_urdu', p_name_urdu,
            'display_order', p_display_order
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'genre_id', v_genre_id,
        'slug', v_clean_slug
    );
END;
$$;

-- 3.2 update_genre
CREATE OR REPLACE FUNCTION public.update_genre(
    p_genre_id uuid,
    p_name_english text,
    p_name_urdu text,
    p_slug text,
    p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_clean_slug text;
    v_old record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can manage genres.';
    END IF;

    SELECT * INTO v_old FROM public.genres WHERE id = p_genre_id;
    IF v_old.id IS NULL THEN
        RAISE EXCEPTION 'Genre not found: %', p_genre_id;
    END IF;

    IF p_name_english IS NULL OR trim(p_name_english) = '' THEN
        RAISE EXCEPTION 'English genre name is required.';
    END IF;
    IF p_name_urdu IS NULL OR trim(p_name_urdu) = '' THEN
        RAISE EXCEPTION 'Urdu genre name is required.';
    END IF;

    v_clean_slug := pg_catalog.lower(trim(COALESCE(p_slug, v_old.slug)));
    IF v_clean_slug != v_old.slug AND EXISTS (SELECT 1 FROM public.genres WHERE slug = v_clean_slug AND id != p_genre_id) THEN
        RAISE EXCEPTION 'Genre slug "%" is already taken.', v_clean_slug;
    END IF;

    UPDATE public.genres
    SET name_english = trim(p_name_english),
        name_urdu = trim(p_name_urdu),
        slug = v_clean_slug,
        is_active = COALESCE(p_is_active, v_old.is_active)
    WHERE id = p_genre_id;

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
        'UPDATE_GENRE',
        'genres',
        p_genre_id::text,
        pg_catalog.jsonb_build_object(
            'name_english', v_old.name_english,
            'name_urdu', v_old.name_urdu,
            'slug', v_old.slug,
            'is_active', v_old.is_active
        ),
        pg_catalog.jsonb_build_object(
            'name_english', p_name_english,
            'name_urdu', p_name_urdu,
            'slug', v_clean_slug,
            'is_active', p_is_active
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'genre_id', p_genre_id
    );
END;
$$;

-- 3.3 reorder_genres
CREATE OR REPLACE FUNCTION public.reorder_genres(
    p_genre_orders jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_item jsonb;
    v_id uuid;
    v_order integer;
    v_updated integer := 0;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can reorder genres.';
    END IF;

    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_genre_orders)
    LOOP
        v_id := (v_item->>'id')::uuid;
        v_order := (v_item->>'display_order')::integer;
        IF v_id IS NOT NULL AND v_order IS NOT NULL THEN
            UPDATE public.genres SET display_order = v_order WHERE id = v_id;
            v_updated := v_updated + 1;
        END IF;
    END LOOP;

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
        'REORDER_GENRES',
        'genres',
        'batch',
        NULL,
        pg_catalog.jsonb_build_object('orders', p_genre_orders, 'updated_count', v_updated),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'updated_count', v_updated
    );
END;
$$;

-- 3.4 delete_genre (blocked if referenced in novel_genres)
CREATE OR REPLACE FUNCTION public.delete_genre(
    p_genre_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_genre record;
    v_usage_count integer;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can delete genres.';
    END IF;

    SELECT * INTO v_genre FROM public.genres WHERE id = p_genre_id;
    IF v_genre.id IS NULL THEN
        RAISE EXCEPTION 'Genre not found: %', p_genre_id;
    END IF;

    -- Block if assigned to any novel
    SELECT count(*) INTO v_usage_count FROM public.novel_genres WHERE genre_id = p_genre_id;
    IF v_usage_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete genre "%": It is currently assigned to % novel(s). Deactivate the genre instead.', v_genre.name_english, v_usage_count;
    END IF;

    DELETE FROM public.genres WHERE id = p_genre_id;

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
        'DELETE_GENRE',
        'genres',
        p_genre_id::text,
        pg_catalog.jsonb_build_object('name_english', v_genre.name_english, 'slug', v_genre.slug),
        NULL,
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'deleted_id', p_genre_id
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 4: PLATFORM SETTINGS MANAGEMENT RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_platform_settings(
    p_default_commission_rate numeric,
    p_default_unpaid_commission_limit numeric,
    p_dispute_window_days integer,
    p_max_novel_price_pkr numeric,
    p_support_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_old record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can update platform settings.';
    END IF;

    IF p_default_commission_rate < 0 OR p_default_commission_rate > 100 THEN
        RAISE EXCEPTION 'Commission rate must be between 0%% and 100%%. Provided: %', p_default_commission_rate;
    END IF;

    IF p_default_unpaid_commission_limit < 0 THEN
        RAISE EXCEPTION 'Default unpaid commission limit cannot be negative. Provided: %', p_default_unpaid_commission_limit;
    END IF;

    IF p_dispute_window_days < 1 OR p_dispute_window_days > 365 THEN
        RAISE EXCEPTION 'Dispute window must be between 1 and 365 days. Provided: %', p_dispute_window_days;
    END IF;

    IF p_max_novel_price_pkr <= 0 THEN
        RAISE EXCEPTION 'Maximum novel price must be greater than 0 PKR. Provided: %', p_max_novel_price_pkr;
    END IF;

    IF p_support_email IS NULL OR trim(p_support_email) = '' OR p_support_email NOT LIKE '%@%.%' THEN
        RAISE EXCEPTION 'A valid support email address is required.';
    END IF;

    SELECT * INTO v_old FROM public.platform_settings WHERE id = 1;

    -- NOTE: Commission rate changes affect FUTURE sales and order verifications only.
    -- Existing orders and sales_ledger rows maintain immutable calculated snapshots.
    UPDATE public.platform_settings
    SET default_commission_rate = p_default_commission_rate,
        default_unpaid_commission_limit = p_default_unpaid_commission_limit,
        dispute_window_days = p_dispute_window_days,
        max_novel_price_pkr = p_max_novel_price_pkr,
        support_email = trim(p_support_email),
        updated_at = pg_catalog.now()
    WHERE id = 1;

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
        'UPDATE_PLATFORM_SETTINGS',
        'platform_settings',
        '1',
        pg_catalog.jsonb_build_object(
            'default_commission_rate', v_old.default_commission_rate,
            'default_unpaid_commission_limit', v_old.default_unpaid_commission_limit,
            'dispute_window_days', v_old.dispute_window_days,
            'max_novel_price_pkr', v_old.max_novel_price_pkr,
            'support_email', v_old.support_email
        ),
        pg_catalog.jsonb_build_object(
            'default_commission_rate', p_default_commission_rate,
            'default_unpaid_commission_limit', p_default_unpaid_commission_limit,
            'dispute_window_days', p_dispute_window_days,
            'max_novel_price_pkr', p_max_novel_price_pkr,
            'support_email', p_support_email
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'default_commission_rate', p_default_commission_rate,
        'default_unpaid_commission_limit', p_default_unpaid_commission_limit,
        'dispute_window_days', p_dispute_window_days,
        'max_novel_price_pkr', p_max_novel_price_pkr,
        'support_email', p_support_email
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 5: WRITER COMMISSION TERMS RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_writer_commission_terms(
    p_writer_id uuid,
    p_custom_rate numeric,
    p_unpaid_limit numeric,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_old record;
    v_new_limit numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can modify writer commission terms.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to modify writer commission terms.';
    END IF;

    IF p_custom_rate IS NOT NULL AND (p_custom_rate < 0 OR p_custom_rate > 100) THEN
        RAISE EXCEPTION 'Custom commission rate must be between 0%% and 100%%. Provided: %', p_custom_rate;
    END IF;

    IF p_unpaid_limit IS NOT NULL AND p_unpaid_limit < 0 THEN
        RAISE EXCEPTION 'Unpaid commission limit cannot be negative. Provided: %', p_unpaid_limit;
    END IF;

    SELECT * INTO v_old FROM public.writer_profiles WHERE id = p_writer_id;
    IF v_old.id IS NULL THEN
        RAISE EXCEPTION 'Writer profile not found: %', p_writer_id;
    END IF;

    v_new_limit := COALESCE(p_unpaid_limit, v_old.unpaid_commission_limit);

    -- Past ledger rows are NEVER modified. New rate applies to future orders.
    UPDATE public.writer_profiles
    SET custom_commission_rate = p_custom_rate,
        unpaid_commission_limit = v_new_limit,
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    -- Reconcile balance and pause status against the new limit
    PERFORM public.reconcile_writer_unpaid_commission(p_writer_id);

    -- Notify writer
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        p_writer_id,
        'commission_terms_updated',
        'کمیشن شرائط اپ ڈیٹ (Commission Terms Updated)',
        'آپ کے اکاؤنٹ کے کمیشن اور حد کی شرائط اپ ڈیٹ کر دی گئی ہیں۔ وجہ: ' || trim(p_reason),
        trim(p_reason),
        '/writer/finances',
        pg_catalog.jsonb_build_object(
            'writer_id', p_writer_id,
            'custom_commission_rate', p_custom_rate,
            'unpaid_commission_limit', v_new_limit,
            'reason', trim(p_reason)
        ),
        false,
        pg_catalog.now()
    );

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
        'SET_WRITER_COMMISSION_TERMS',
        'writer_profiles',
        p_writer_id::text,
        pg_catalog.jsonb_build_object(
            'custom_commission_rate', v_old.custom_commission_rate,
            'unpaid_commission_limit', v_old.unpaid_commission_limit
        ),
        pg_catalog.jsonb_build_object(
            'custom_commission_rate', p_custom_rate,
            'unpaid_commission_limit', v_new_limit,
            'reason', trim(p_reason)
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'writer_id', p_writer_id,
        'custom_commission_rate', p_custom_rate,
        'unpaid_commission_limit', v_new_limit
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 6: USER ROLE & ACTIVE STATUS RPC (HARDENED)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_user_role_status(
    p_user_id uuid,
    p_role public.user_role,
    p_is_active boolean,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_target record;
    v_active_admin_count integer;
    v_published_novels_count integer;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can change user roles and account statuses.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to update user role or status.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id;
    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'User profile not found: %', p_user_id;
    END IF;

    -- 1. Self-protection: Admin cannot demote themselves
    IF p_user_id = v_caller_id AND p_role != 'admin' THEN
        RAISE EXCEPTION 'Self-demotion prohibited: Administrators cannot demote their own account.';
    END IF;

    -- 2. Self-protection: Admin cannot deactivate themselves
    IF p_user_id = v_caller_id AND p_is_active = false THEN
        RAISE EXCEPTION 'Self-deactivation prohibited: Administrators cannot deactivate their own account.';
    END IF;

    -- 3. Last remaining active admin protection
    IF v_target.role = 'admin' AND (p_role != 'admin' OR p_is_active = false) THEN
        SELECT count(*) INTO v_active_admin_count
        FROM public.profiles
        WHERE role = 'admin' AND is_active = true AND id != p_user_id;

        IF v_active_admin_count = 0 THEN
            RAISE EXCEPTION 'Action rejected: The platform must maintain at least one active administrator.';
        END IF;
    END IF;

    -- 4. Approved writer with published novels cannot be demoted to reader without suspending novels first
    IF p_role = 'reader' AND v_target.role = 'writer' THEN
        SELECT count(*) INTO v_published_novels_count
        FROM public.novels
        WHERE writer_id = p_user_id AND status = 'published';

        IF v_published_novels_count > 0 THEN
            RAISE EXCEPTION 'Cannot demote writer to reader while they have % published novel(s). Suspend the writer and their published novels first.', v_published_novels_count;
        END IF;
    END IF;

    UPDATE public.profiles
    SET role = p_role,
        is_active = p_is_active,
        updated_at = pg_catalog.now()
    WHERE id = p_user_id;

    -- Notify target user
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        p_user_id,
        'role_status_updated',
        'اکاؤنٹ کی حیثیت اپ ڈیٹ (Account Status Updated)',
        'آپ کے اکاؤنٹ کا کردار یا حیثیت اپ ڈیٹ کر دی گئی ہے۔ کردار: ' || p_role::text || '، فعال: ' || CASE WHEN p_is_active THEN 'ہاں' ELSE 'نہیں' END,
        trim(p_reason),
        '/account',
        pg_catalog.jsonb_build_object('role', p_role, 'is_active', p_is_active, 'reason', trim(p_reason)),
        false,
        pg_catalog.now()
    );

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
        'UPDATE_USER_ROLE_STATUS',
        'profiles',
        p_user_id::text,
        pg_catalog.jsonb_build_object('role', v_target.role, 'is_active', v_target.is_active),
        pg_catalog.jsonb_build_object('role', p_role, 'is_active', p_is_active, 'reason', trim(p_reason)),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', p_role,
        'is_active', p_is_active
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 7: ACCESS PRIVILEGES & SECURITY GRANTS
-- ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.suspend_novel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_novel(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.unsuspend_novel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unsuspend_novel(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_novel_featured(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_novel_featured(uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.create_genre(text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_genre(text, text, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.update_genre(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_genre(uuid, text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.reorder_genres(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_genres(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_genre(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_genre(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_writer_commission_terms(uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_writer_commission_terms(uuid, numeric, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_user_role_status(uuid, public.user_role, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role_status(uuid, public.user_role, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_novel(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_novel(uuid, jsonb) TO authenticated;
