-- ==============================================================================
-- UNB Premium — Migration 0022: Protection Triggers & Search Path Lockdown
-- ==============================================================================
-- Description:
--   1. Replaces the "is this write trusted?" test across ALL protection triggers
--      (writer_profiles, profiles, novels, chapters deletion, notifications) with
--      a robust check:
--        v_is_trusted := (current_user NOT IN ('authenticated', 'anon', 'authenticator'))
--                        OR public.is_admin();
--      Trigger functions are configured as SECURITY INVOKER (with SET search_path = '')
--      so that writes originating inside SECURITY DEFINER RPCs (where current_user is
--      switched to postgres / function owner) or DBA sessions are correctly identified
--      as trusted, while direct unprivileged client mutations from 'authenticated'
--      or 'anon' roles continue to be strictly intercepted and rejected.
--   2. Rewrites the remaining 9 SECURITY DEFINER functions from migration 0019 that
--      used 'SET search_path = public, pg_temp' to use 'SET search_path = ''''',
--      with 100% schema-qualified identifiers, operators, and explicit typecasts:
--        - admin_get_order(uuid)
--        - admin_list_orders(text, text, boolean, integer, integer)
--        - create_order(uuid, uuid)
--        - get_chapter_for_reader(text, integer)
--        - get_checkout_options(uuid)
--        - get_public_novel_chapters(text)
--        - get_writer_unpaid_commission(uuid)
--        - reconcile_writer_unpaid_commission(uuid)
--        - reject_order_payment(uuid, uuid, text)
--   3. Revokes direct EXECUTE on all 5 trigger functions from PUBLIC, anon, authenticated
--      to preserve trigger privilege isolation.
-- ==============================================================================


-- ==============================================================================
-- SECTION 1: ROBUST PROTECTION TRIGGERS (SECURITY INVOKER)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1.1 Writer Profiles Protection Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_protect_writer_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_is_trusted boolean;
BEGIN
    v_is_trusted := (pg_catalog.current_user NOT IN ('authenticated', 'anon', 'authenticator'))
                    OR public.is_admin();

    IF NOT v_is_trusted THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'Unauthorized: Writer approval status can only be modified by administrators or via the formal reapplication process.';
        END IF;
        IF NEW.custom_commission_rate IS DISTINCT FROM OLD.custom_commission_rate THEN
            RAISE EXCEPTION 'Unauthorized: Writer custom commission rate is managed by administrators.';
        END IF;
        IF NEW.unpaid_commission_limit IS DISTINCT FROM OLD.unpaid_commission_limit THEN
            RAISE EXCEPTION 'Unauthorized: Unpaid commission limit is managed by administrators.';
        END IF;
        IF NEW.current_unpaid_commission IS DISTINCT FROM OLD.current_unpaid_commission THEN
            RAISE EXCEPTION 'Unauthorized: Unpaid commission balance is managed exclusively by ledger reconciliation.';
        END IF;
        IF NEW.is_orders_paused_for_commission IS DISTINCT FROM OLD.is_orders_paused_for_commission THEN
            RAISE EXCEPTION 'Unauthorized: Order pause state is automated based on accrued commission threshold.';
        END IF;
        IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
            RAISE EXCEPTION 'Unauthorized: Approver reference is managed by administrators.';
        END IF;
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Unauthorized: Writer profile identifier is immutable.';
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_writer_profile_columns ON public.writer_profiles;
CREATE TRIGGER trg_protect_writer_profile_columns
    BEFORE UPDATE ON public.writer_profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_protect_writer_profile_columns();


-- ------------------------------------------------------------------------------
-- 1.2 User Profiles Protection Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_is_trusted boolean;
BEGIN
    v_is_trusted := (pg_catalog.current_user NOT IN ('authenticated', 'anon', 'authenticator'))
                    OR public.is_admin();

    IF NOT v_is_trusted THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Privilege escalation rejected: Users cannot modify their own role.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'Unauthorized: Account active status can only be modified by administrators.';
        END IF;
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Unauthorized: User identifier is immutable.';
        END IF;
        IF NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'Unauthorized: Email is synchronized with authentication credentials.';
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_protect_profile_columns();


-- ------------------------------------------------------------------------------
-- 1.3 Novels Protection Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_protect_novel_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_is_trusted boolean;
    v_max_price numeric(10,2);
BEGIN
    v_is_trusted := (pg_catalog.current_user NOT IN ('authenticated', 'anon', 'authenticator'))
                    OR public.is_admin();

    IF NOT v_is_trusted THEN
        -- 1. Writer cannot transfer novel ownership
        IF NEW.writer_id IS DISTINCT FROM OLD.writer_id THEN
            RAISE EXCEPTION 'Unauthorized: Novel author identifier is immutable.';
        END IF;

        -- 2. Non-admin cannot change status directly (must use official RPCs)
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'Unauthorized: Novel status can only be modified via official editorial workflows.';
        END IF;

        -- 3. is_featured is strictly managed by admins
        IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
            RAISE EXCEPTION 'Unauthorized: Featured status can only be modified by platform administrators.';
        END IF;

        -- 4. published_at is strictly managed by editorial publishing procedures
        IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
            RAISE EXCEPTION 'Unauthorized: Published timestamp is managed by platform publication procedures.';
        END IF;

        -- 5. moderation_reason can only be modified by administrators or status workflows
        IF NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason THEN
            RAISE EXCEPTION 'Unauthorized: Moderation notes can only be modified by administrators.';
        END IF;

        -- 6. total_chapters is managed automatically by chapters trigger
        IF NEW.total_chapters IS DISTINCT FROM OLD.total_chapters THEN
            RAISE EXCEPTION 'Unauthorized: Total chapters count is managed automatically by system triggers.';
        END IF;

        -- 7. Slug cannot be modified once the novel has been published
        IF (OLD.status::text = 'published' OR OLD.published_at IS NOT NULL) AND NEW.slug IS DISTINCT FROM OLD.slug THEN
            RAISE EXCEPTION 'Unauthorized: Novel slug cannot be modified once published.';
        END IF;

        -- 8. Block editing novel metadata while under_review or suspended
        IF OLD.status::text IN ('under_review', 'suspended') THEN
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
        SELECT pg_catalog.coalesce(max_novel_price_pkr, 5000.00) INTO v_max_price
        FROM public.platform_settings
        WHERE id = 1;

        IF NEW.price_pkr < 0 OR NEW.price_pkr > v_max_price THEN
            RAISE EXCEPTION 'Novel price must be between 0 and % PKR.', v_max_price;
        END IF;

        -- 10. Audit log when price changes on a published novel
        IF OLD.status::text = 'published' AND NEW.price_pkr IS DISTINCT FROM OLD.price_pkr THEN
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
                pg_catalog.coalesce(auth.uid(), OLD.writer_id),
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
-- 1.4 Chapter Deletion Protection Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_protect_chapter_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_novel record;
    v_is_trusted boolean;
BEGIN
    v_is_trusted := (pg_catalog.current_user NOT IN ('authenticated', 'anon', 'authenticator'))
                    OR public.is_admin();

    IF NOT v_is_trusted THEN
        SELECT * INTO v_novel FROM public.novels WHERE id = OLD.novel_id;
        IF v_novel.id IS NOT NULL AND v_novel.status::text != 'draft' THEN
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
-- 1.5 Notification Columns Protection Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_protect_notification_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_is_trusted boolean;
BEGIN
    v_is_trusted := (pg_catalog.current_user NOT IN ('authenticated', 'anon', 'authenticator'))
                    OR public.is_admin();

    IF NOT v_is_trusted THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
           NEW.type IS DISTINCT FROM OLD.type OR
           NEW.title IS DISTINCT FROM OLD.title OR
           NEW.message IS DISTINCT FROM OLD.message OR
           NEW.body IS DISTINCT FROM OLD.body OR
           NEW.link IS DISTINCT FROM OLD.link OR
           NEW.entity_refs IS DISTINCT FROM OLD.entity_refs OR
           NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Unauthorized: Users can only update the read status of their own notifications.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_notification_columns ON public.notifications;
CREATE TRIGGER trg_protect_notification_columns
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.trg_protect_notification_columns();


-- Revoke EXECUTE on all 5 protection trigger functions from PUBLIC, anon, authenticated
REVOKE EXECUTE ON FUNCTION public.trg_protect_writer_profile_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_protect_profile_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_protect_novel_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_protect_chapter_deletion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_protect_notification_columns() FROM PUBLIC, anon, authenticated;



-- ==============================================================================
-- SECTION 2: 9 SECURITY DEFINER FUNCTIONS (SET search_path = '')
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 2.1 get_public_novel_chapters
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_novel_chapters(p_novel_slug text)
RETURNS TABLE (
    id uuid,
    chapter_number integer,
    title_urdu text,
    word_count integer,
    is_free_preview boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.chapter_number,
        c.title_urdu,
        c.word_count,
        c.is_free_preview
    FROM public.chapters c
    JOIN public.novels n ON n.id = c.novel_id
    JOIN public.profiles p ON p.id = n.writer_id
    JOIN public.writer_profiles wp ON wp.id = n.writer_id
    WHERE n.slug = pg_catalog.trim(p_novel_slug)
      AND n.status::text = 'published'
      AND c.is_published = true
      AND p.is_active = true
      AND wp.status::text = 'approved'
    ORDER BY c.chapter_number ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_novel_chapters(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_novel_chapters(text) TO anon, authenticated;


-- ------------------------------------------------------------------------------
-- 2.2 get_checkout_options
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_checkout_options(p_novel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
    v_writer record;
    v_pen_name text;
    v_methods jsonb;
    v_open_order_number text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to initiate checkout.';
    END IF;

    -- Fetch novel
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found.';
    END IF;

    IF v_novel.status::text != 'published' THEN
        RAISE EXCEPTION 'Novel is not available for purchase (status: %).', v_novel.status;
    END IF;

    -- Writer cannot purchase their own novel
    IF v_novel.writer_id = v_caller_id THEN
        RAISE EXCEPTION 'Authors cannot purchase their own novels.';
    END IF;

    -- Check if reader already owns an active entitlement
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND is_revoked = false
    ) THEN
        RAISE EXCEPTION 'You already hold an active purchase entitlement for this novel.';
    END IF;

    -- Fetch writer profile
    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_novel.writer_id;

    IF v_writer.id IS NULL OR v_writer.status::text != 'approved' THEN
        RAISE EXCEPTION 'This author is currently not eligible to receive orders.';
    END IF;

    IF v_writer.is_orders_paused_for_commission THEN
        RAISE EXCEPTION 'Orders for this author are currently paused due to platform commission limits.';
    END IF;

    v_pen_name := pg_catalog.coalesce(v_writer.pen_name_urdu, v_writer.pen_name_english, 'Author');

    -- Check if reader has an existing open order for this novel
    SELECT order_number INTO v_open_order_number
    FROM public.orders
    WHERE reader_id = v_caller_id
      AND novel_id = p_novel_id
      AND status::text IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Collect active payment methods with strictly masked accounts
    SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', wpm.id,
                'method_type', wpm.method_type,
                'bank_name', wpm.bank_name,
                'account_title', wpm.account_title,
                'masked_account', CASE
                    WHEN pg_catalog.length(wpm.account_number_or_iban) <= 4 THEN '•••• ' || wpm.account_number_or_iban
                    ELSE '•••• ' || pg_catalog.substr(wpm.account_number_or_iban, pg_catalog.length(wpm.account_number_or_iban) - 3)
                END,
                'instructions_note', wpm.instructions_note
            )
            ORDER BY wpm.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_methods
    FROM public.writer_payment_methods wpm
    WHERE wpm.writer_id = v_novel.writer_id
      AND wpm.is_active = true;

    IF v_methods = '[]'::jsonb THEN
        RAISE EXCEPTION 'This author does not have any active payment methods configured. Orders cannot be placed at this time.';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'novel', pg_catalog.jsonb_build_object(
            'id', v_novel.id,
            'title_english', v_novel.title_english,
            'title_urdu', v_novel.title_urdu,
            'slug', v_novel.slug,
            'price_pkr', v_novel.price_pkr,
            'cover_image_url', v_novel.cover_url,
            'writer_id', v_novel.writer_id,
            'writer_pen_name', v_pen_name
        ),
        'payment_methods', v_methods,
        'existing_order_number', v_open_order_number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_options(uuid) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2.3 create_order
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
    p_novel_id uuid,
    p_payment_method_id uuid
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
    v_method record;
    v_min_price integer;
    v_max_price numeric(10,2);
    v_max_orders_per_hour integer;
    v_recent_order_count integer;
    v_default_rate numeric(5,2);
    v_applied_rate numeric(5,2);
    v_commission_pkr numeric(10,2);
    v_writer_share_pkr numeric(10,2);
    v_order_number text;
    v_order_id uuid;
    v_instructions jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create an order.';
    END IF;

    -- Fetch platform settings
    SELECT
        pg_catalog.coalesce(min_novel_price_pkr, 50),
        pg_catalog.coalesce(max_novel_price_pkr, 5000.00),
        pg_catalog.coalesce(max_orders_per_hour, 5),
        pg_catalog.coalesce(default_commission_rate, 20.00)
    INTO
        v_min_price,
        v_max_price,
        v_max_orders_per_hour,
        v_default_rate
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := pg_catalog.coalesce(v_min_price, 50);
    v_max_price := pg_catalog.coalesce(v_max_price, 5000.00);
    v_max_orders_per_hour := pg_catalog.coalesce(v_max_orders_per_hour, 5);
    v_default_rate := pg_catalog.coalesce(v_default_rate, 20.00);

    -- Abuse protection: Check order creation rate for this reader in the past hour
    SELECT pg_catalog.count(*) INTO v_recent_order_count
    FROM public.orders
    WHERE reader_id = v_caller_id
      AND created_at >= (pg_catalog.now() - interval '1 hour');

    IF v_recent_order_count >= v_max_orders_per_hour THEN
        RAISE EXCEPTION 'Order rate limit exceeded. You can create at most % orders per hour. Please complete or cancel your existing orders before placing new ones.', v_max_orders_per_hour;
    END IF;

    -- Fetch novel
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.status::text != 'published' THEN
        RAISE EXCEPTION 'Novel is not available for purchase (status: %).', v_novel.status;
    END IF;

    -- Defensive price validation: whole rupees, > 0, within [min, max]
    IF v_novel.price_pkr <= 0 OR v_novel.price_pkr < v_min_price OR v_novel.price_pkr > v_max_price THEN
        RAISE EXCEPTION 'Novel price (PKR %) is invalid or outside allowable limits (PKR % to PKR %). Orders cannot be created.',
            v_novel.price_pkr, v_min_price, v_max_price;
    END IF;

    -- Self-purchase check: Writer cannot purchase their own novel
    IF v_novel.writer_id = v_caller_id THEN
        RAISE EXCEPTION 'Authors cannot purchase their own novels.';
    END IF;

    -- Fetch writer profile
    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_novel.writer_id;

    IF v_writer.id IS NULL OR v_writer.status::text != 'approved' THEN
        RAISE EXCEPTION 'Writer is currently not eligible to receive orders.';
    END IF;

    IF v_writer.is_orders_paused_for_commission THEN
        RAISE EXCEPTION 'Orders for this author are currently paused due to accrued commission limit.';
    END IF;

    -- Check if reader already owns an active entitlement
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND is_revoked = false
    ) THEN
        RAISE EXCEPTION 'You already hold an active purchase entitlement for this novel.';
    END IF;

    -- Check if reader already has an open, rejected, or disputed order for this novel
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND status::text IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed')
    ) THEN
        RAISE EXCEPTION 'An active, rejected, or disputed order for this novel already exists in your account. Please resolve your existing order before placing a new one.';
    END IF;

    -- Fetch and validate writer payment method
    SELECT * INTO v_method
    FROM public.writer_payment_methods
    WHERE id = p_payment_method_id
      AND writer_id = v_novel.writer_id
      AND is_active = true;

    IF v_method.id IS NULL THEN
        RAISE EXCEPTION 'Selected payment method is invalid or inactive.';
    END IF;

    -- Snapshot recipient instructions
    v_instructions := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Authoritative rate calculation
    v_applied_rate := pg_catalog.coalesce(v_writer.custom_commission_rate, v_default_rate);

    -- Round commission and writer share
    v_commission_pkr := pg_catalog.round((v_novel.price_pkr * v_applied_rate / 100.0), 2);
    v_writer_share_pkr := v_novel.price_pkr - v_commission_pkr;

    -- Generate unique human-readable order number
    v_order_number := 'ORD-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));

    -- Insert order (real schema columns only)
    INSERT INTO public.orders (
        order_number,
        reader_id,
        writer_id,
        novel_id,
        novel_title_snapshot,
        amount_pkr,
        currency,
        selected_payment_method_id,
        payment_instructions_snapshot,
        applied_commission_rate,
        calculated_commission_pkr,
        calculated_writer_share_pkr,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_order_number,
        v_caller_id,
        v_novel.writer_id,
        p_novel_id,
        pg_catalog.coalesce(v_novel.title_urdu, v_novel.title_english),
        v_novel.price_pkr,
        'PKR',
        v_method.id,
        v_instructions,
        v_applied_rate,
        v_commission_pkr,
        v_writer_share_pkr,
        'pending_payment',
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING id INTO v_order_id;

    -- Reinstated CREATE_ORDER audit log
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
        'reader',
        'CREATE_ORDER',
        'orders',
        v_order_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'order_number', v_order_number,
            'amount_pkr', v_novel.price_pkr,
            'novel_id', v_novel.id,
            'writer_id', v_novel.writer_id
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', 'pending_payment',
        'amount_pkr', v_novel.price_pkr,
        'instructions', v_instructions
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, uuid) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2.4 get_chapter_for_reader
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chapter_for_reader(
    p_novel_slug text,
    p_chapter_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_is_admin boolean;
    v_novel record;
    v_chapter record;
    v_access_reason text;
    v_watermark_code text;
    v_prev_number integer;
    v_next_number integer;
    v_total_published_chapters integer;
    v_reader_progress integer;
    v_has_entitlement boolean := false;
    v_order_number text;
    v_window_mins integer;
    v_max_reads integer;
    v_window_start timestamptz;
    v_already_read boolean := false;
    v_distinct_reads integer := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();

    -- Find novel by slug
    SELECT * INTO v_novel
    FROM public.novels
    WHERE slug = pg_catalog.trim(p_novel_slug);

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Chapter not found';
    END IF;

    -- Find chapter
    SELECT * INTO v_chapter
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND chapter_number = p_chapter_number;

    IF v_chapter.id IS NULL THEN
        RAISE EXCEPTION 'Chapter not found';
    END IF;

    -- Evaluate authorization
    IF v_is_admin THEN
        v_access_reason := 'admin';
    ELSIF v_novel.writer_id = v_caller_id THEN
        v_access_reason := 'owner';
    ELSE
        -- Reader access rules
        IF NOT pg_catalog.coalesce(v_chapter.is_published, false) THEN
            RAISE EXCEPTION 'Chapter not found';
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.purchase_entitlements
            WHERE reader_id = v_caller_id
              AND novel_id = v_novel.id
              AND is_revoked = false
        ) INTO v_has_entitlement;

        IF v_has_entitlement THEN
            v_access_reason := 'entitled';
        ELSIF pg_catalog.coalesce(v_chapter.is_free_preview, false) AND v_novel.status::text = 'published' THEN
            v_access_reason := 'free_preview';
        ELSE
            RAISE EXCEPTION 'Chapter not found';
        END IF;
    END IF;

    -- Rate limiting sliding-window check for entitled readers
    IF v_access_reason = 'entitled' THEN
        SELECT o.order_number INTO v_order_number
        FROM public.purchase_entitlements pe
        JOIN public.orders o ON o.id = pe.order_id
        WHERE pe.reader_id = v_caller_id
          AND pe.novel_id = v_novel.id
          AND pe.is_revoked = false
        LIMIT 1;

        v_watermark_code := pg_catalog.coalesce(v_order_number, pg_catalog.substring(pg_catalog.replace(v_caller_id::text, '-', ''), 1, 8));

        SELECT pg_catalog.coalesce(chapter_read_window_minutes, 60), pg_catalog.coalesce(max_chapter_reads_per_window, 10)
        INTO v_window_mins, v_max_reads
        FROM public.platform_settings
        WHERE id = 1;

        v_window_start := pg_catalog.now() - (pg_catalog.coalesce(v_window_mins, 60)::text || ' minutes')::interval;

        SELECT EXISTS (
            SELECT 1 FROM public.chapter_reads
            WHERE reader_id = v_caller_id
              AND chapter_id = v_chapter.id
              AND read_at >= v_window_start
        ) INTO v_already_read;

        IF NOT v_already_read THEN
            SELECT pg_catalog.count(DISTINCT chapter_id) INTO v_distinct_reads
            FROM public.chapter_reads
            WHERE reader_id = v_caller_id
              AND read_at >= v_window_start;

            IF v_distinct_reads >= pg_catalog.coalesce(v_max_reads, 10) THEN
                RAISE EXCEPTION 'Reading rate limit exceeded: You have accessed % chapters in the last % minutes. Please wait before opening another chapter.',
                    v_max_reads, v_window_mins;
            END IF;

            INSERT INTO public.chapter_reads (
                reader_id,
                chapter_id,
                novel_id,
                read_at
            ) VALUES (
                v_caller_id,
                v_chapter.id,
                v_novel.id,
                pg_catalog.now()
            );
        END IF;
    END IF;

    -- Calculate navigation numbers
    SELECT pg_catalog.max(chapter_number) INTO v_prev_number
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true
      AND chapter_number < p_chapter_number;

    SELECT pg_catalog.min(chapter_number) INTO v_next_number
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true
      AND chapter_number > p_chapter_number;

    SELECT pg_catalog.count(*) INTO v_total_published_chapters
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true;

    SELECT last_chapter_number INTO v_reader_progress
    FROM public.reader_progress
    WHERE reader_id = v_caller_id
      AND novel_id = v_novel.id;

    RETURN pg_catalog.jsonb_build_object(
        'novel_id', v_novel.id,
        'novel_title', v_novel.title_urdu,
        'novel_title_urdu', v_novel.title_urdu,
        'novel_title_english', v_novel.title_english,
        'novel_slug', v_novel.slug,
        'total_chapters', v_total_published_chapters,
        'chapter_number', v_chapter.chapter_number,
        'chapter_title', v_chapter.title_urdu,
        'chapter_title_english', null::text,
        'content_urdu', v_chapter.content_urdu,
        'word_count', v_chapter.word_count,
        'previous_chapter_number', v_prev_number,
        'next_chapter_number', v_next_number,
        'access_reason', v_access_reason,
        'watermark_code', v_watermark_code,
        'reader_progress', v_reader_progress
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_chapter_for_reader(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_for_reader(text, integer) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2.5 admin_list_orders
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_orders(
    p_status text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_only_stuck boolean DEFAULT false,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_search text;
    v_total_count integer;
    v_orders jsonb;
    v_twenty_four_hours_ago timestamptz;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can inspect orders.';
    END IF;

    v_twenty_four_hours_ago := pg_catalog.now() - interval '24 hours';
    v_clean_search := pg_catalog.trim(pg_catalog.coalesce(p_search, ''));

    -- Count matching rows
    SELECT pg_catalog.count(*) INTO v_total_count
    FROM public.orders o
    JOIN public.novels n ON n.id = o.novel_id
    JOIN public.profiles p_reader ON p_reader.id = o.reader_id
    WHERE (p_status IS NULL OR p_status = '' OR o.status::text = p_status)
      AND (
          NOT p_only_stuck OR (
              o.status::text = 'payment_submitted' AND o.created_at < v_twenty_four_hours_ago
          )
      )
      AND (
          v_clean_search = '' OR
          o.order_number ILIKE '%' || v_clean_search || '%' OR
          n.title_english ILIKE '%' || v_clean_search || '%' OR
          n.title_urdu ILIKE '%' || v_clean_search || '%' OR
          p_reader.username ILIKE '%' || v_clean_search || '%' OR
          p_reader.full_name ILIKE '%' || v_clean_search || '%'
      );

    -- Fetch paginated orders
    SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', o.id,
                'order_number', o.order_number,
                'status', o.status,
                'amount_pkr', o.amount_pkr,
                'currency', o.currency,
                'created_at', o.created_at,
                'updated_at', o.updated_at,
                'verified_at', o.verified_at,
                'is_stuck', (o.status::text = 'payment_submitted' AND o.created_at < v_twenty_four_hours_ago),
                'reader_id', o.reader_id,
                'reader_display_name', pg_catalog.coalesce(p_reader.full_name, p_reader.username, 'Anonymous Reader'),
                'reader_username', p_reader.username,
                'writer_id', o.writer_id,
                'writer_pen_name', pg_catalog.coalesce(wp.pen_name_english, wp.pen_name_urdu, 'Urdu Author'),
                'novel_id', o.novel_id,
                'novel_title', pg_catalog.coalesce(o.novel_title_snapshot, n.title_english, n.title_urdu),
                'novel_slug', n.slug,
                'payment_method_type', pg_catalog.coalesce(o.payment_instructions_snapshot->>'method_type', 'Manual Transfer'),
                'has_duplicate_submission', EXISTS (
                    SELECT 1 FROM public.payment_submissions ps
                    WHERE ps.order_id = o.id AND ps.is_duplicate_tid_flagged = true
                )
            )
            ORDER BY o.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_orders
    FROM (
        SELECT o_inner.*
        FROM public.orders o_inner
        JOIN public.novels n_inner ON n_inner.id = o_inner.novel_id
        JOIN public.profiles p_inner ON p_inner.id = o_inner.reader_id
        WHERE (p_status IS NULL OR p_status = '' OR o_inner.status::text = p_status)
          AND (
              NOT p_only_stuck OR (
                  o_inner.status::text = 'payment_submitted' AND o_inner.created_at < v_twenty_four_hours_ago
              )
          )
          AND (
              v_clean_search = '' OR
              o_inner.order_number ILIKE '%' || v_clean_search || '%' OR
              n_inner.title_english ILIKE '%' || v_clean_search || '%' OR
              n_inner.title_urdu ILIKE '%' || v_clean_search || '%' OR
              p_inner.username ILIKE '%' || v_clean_search || '%' OR
              p_inner.full_name ILIKE '%' || v_clean_search || '%'
          )
        ORDER BY o_inner.created_at DESC
        LIMIT pg_catalog.greatest(p_limit, 1)
        OFFSET pg_catalog.greatest(p_offset, 0)
    ) o
    JOIN public.novels n ON n.id = o.novel_id
    JOIN public.profiles p_reader ON p_reader.id = o.reader_id
    LEFT JOIN public.writer_profiles wp ON wp.id = o.writer_id;

    RETURN pg_catalog.jsonb_build_object(
        'orders', v_orders,
        'total_count', pg_catalog.coalesce(v_total_count, 0),
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_orders(text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text, text, boolean, integer, integer) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2.6 admin_get_order
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_order record;
    v_novel record;
    v_reader record;
    v_writer record;
    v_submissions jsonb;
    v_disputes jsonb;
    v_ledger jsonb;
    v_entitlement jsonb;
    v_twenty_four_hours_ago timestamptz;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can inspect orders.';
    END IF;

    v_twenty_four_hours_ago := pg_catalog.now() - interval '24 hours';

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = v_order.novel_id;
    SELECT * INTO v_reader FROM public.profiles WHERE id = v_order.reader_id;
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;

    -- Submissions
    SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', ps.id,
                'transaction_reference_tid', ps.transaction_reference_tid,
                'paid_amount_claimed_pkr', ps.paid_amount_claimed_pkr,
                'sender_account_name', ps.sender_account_name,
                'reader_note', ps.reader_note,
                'screenshot_path', ps.screenshot_path,
                'is_duplicate_tid', ps.is_duplicate_tid_flagged,
                'reviewer_status', ps.reviewer_status,
                'reviewer_note', ps.reviewer_note,
                'reviewed_by', ps.reviewed_by,
                'reviewed_at', ps.reviewed_at,
                'created_at', ps.created_at
            )
            ORDER BY ps.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_submissions
    FROM public.payment_submissions ps
    WHERE ps.order_id = p_order_id;

    -- Disputes
    SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', d.id,
                'reason', d.reason,
                'status', d.status,
                'resolution_note', d.resolution_note,
                'admin_resolution_notes', d.admin_resolution_notes,
                'created_at', d.created_at,
                'resolved_at', d.resolved_at
            )
            ORDER BY d.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_disputes
    FROM public.disputes d
    WHERE d.order_id = p_order_id;

    -- Ledger entries
    SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', sl.id,
                'entry_type', sl.entry_type,
                'gross_amount_pkr', sl.gross_amount_pkr,
                'platform_commission_pkr', sl.platform_commission_pkr,
                'writer_payout_pkr', sl.writer_net_pkr,
                'is_reconciled', (sl.commission_invoice_id IS NOT NULL),
                'created_at', sl.created_at
            )
            ORDER BY sl.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_ledger
    FROM public.sales_ledger sl
    WHERE sl.order_id = p_order_id;

    -- Entitlement state
    SELECT pg_catalog.jsonb_build_object(
        'id', pe.id,
        'granted_at', pe.granted_at,
        'is_revoked', pe.is_revoked,
        'revoked_at', null::timestamptz,
        'revoked_reason', pe.revoked_reason
    ) INTO v_entitlement
    FROM public.purchase_entitlements pe
    WHERE pe.order_id = p_order_id
    LIMIT 1;

    RETURN pg_catalog.jsonb_build_object(
        'order', pg_catalog.jsonb_build_object(
            'id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status,
            'amount_pkr', v_order.amount_pkr,
            'currency', v_order.currency,
            'applied_commission_rate', v_order.applied_commission_rate,
            'calculated_commission_pkr', v_order.calculated_commission_pkr,
            'calculated_writer_share_pkr', v_order.calculated_writer_share_pkr,
            'payment_instructions_snapshot', v_order.payment_instructions_snapshot,
            'novel_title_snapshot', v_order.novel_title_snapshot,
            'created_at', v_order.created_at,
            'updated_at', v_order.updated_at,
            'verified_at', v_order.verified_at,
            'cancelled_at', null::timestamptz,
            'cancellation_reason', null::text,
            'is_stuck', (v_order.status::text = 'payment_submitted' AND v_order.created_at < v_twenty_four_hours_ago)
        ),
        'reader', pg_catalog.jsonb_build_object(
            'id', v_reader.id,
            'display_name', pg_catalog.coalesce(v_reader.full_name, v_reader.username, 'Anonymous Reader'),
            'username', v_reader.username
        ),
        'writer', pg_catalog.jsonb_build_object(
            'id', v_writer.id,
            'pen_name', pg_catalog.coalesce(v_writer.pen_name_english, v_writer.pen_name_urdu, 'Urdu Author'),
            'pen_name_english', v_writer.pen_name_english,
            'pen_name_urdu', v_writer.pen_name_urdu
        ),
        'novel', pg_catalog.jsonb_build_object(
            'id', v_novel.id,
            'slug', v_novel.slug,
            'title_english', v_novel.title_english,
            'title_urdu', v_novel.title_urdu,
            'cover_url', v_novel.cover_url,
            'status', v_novel.status
        ),
        'submissions', v_submissions,
        'disputes', v_disputes,
        'ledger', v_ledger,
        'entitlement', v_entitlement
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_order(uuid) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2.7 get_writer_unpaid_commission
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_total_ledger_comm numeric(12,2);
    v_total_paid numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL THEN
        IF v_caller_id != p_writer_id AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access denied: You can only inspect your own commission balance.';
        END IF;
    END IF;

    SELECT pg_catalog.coalesce(pg_catalog.sum(platform_commission_pkr), 0.00)
    INTO v_total_ledger_comm
    FROM public.sales_ledger
    WHERE writer_id = p_writer_id;

    SELECT pg_catalog.coalesce(pg_catalog.sum(amount_pkr), 0.00)
    INTO v_total_paid
    FROM public.commission_payments
    WHERE writer_id = p_writer_id;

    RETURN pg_catalog.greatest(0.00, v_total_ledger_comm - v_total_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.get_writer_unpaid_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_writer_unpaid_commission(uuid) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2.8 reconcile_writer_unpaid_commission
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_actual_unpaid numeric(12,2);
    v_limit numeric(12,2);
    v_is_paused boolean;
    v_last_settlement timestamptz;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL THEN
        IF v_caller_id != p_writer_id AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access denied: You can only reconcile your own account.';
        END IF;
    END IF;

    v_actual_unpaid := public.get_writer_unpaid_commission(p_writer_id);

    SELECT unpaid_commission_limit INTO v_limit
    FROM public.writer_profiles
    WHERE id = p_writer_id;

    IF v_limit IS NULL OR v_limit <= 0 THEN
        v_limit := 5000.00;
    END IF;

    v_is_paused := (v_actual_unpaid >= v_limit);

    UPDATE public.writer_profiles
    SET current_unpaid_commission = v_actual_unpaid,
        is_orders_paused_for_commission = v_is_paused,
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    SELECT pg_catalog.max(confirmed_at) INTO v_last_settlement
    FROM public.commission_payments
    WHERE writer_id = p_writer_id;

    IF v_last_settlement IS NULL THEN
        v_last_settlement := '2000-01-01 00:00:00+00'::timestamptz;
    END IF;

    -- 80% Threshold Warning notification
    IF v_actual_unpaid >= (0.80 * v_limit) AND v_actual_unpaid < v_limit THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE user_id = p_writer_id
              AND type = 'commission_threshold_warning'
              AND created_at >= v_last_settlement
        ) THEN
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
                'commission_threshold_warning',
                'تنبيه کمیشن حد (80% Commission Threshold)',
                'آپ کا واجب الادا کمیشن (PKR ' || v_actual_unpaid || ') حد (' || v_limit || ') کے 80 فیصد تک پہنچ چکا ہے۔ براہِ کرم معطلی سے بچنے کے لیے ادائیگی کریں۔',
                'آپ کا واجب الادا کمیشن حد کے قریب پہنچ چکا ہے۔',
                '/writer/commission',
                pg_catalog.jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                pg_catalog.now()
            );
        END IF;
    END IF;

    -- 100% Threshold Exceeded notification
    IF v_actual_unpaid >= v_limit THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE user_id = p_writer_id
              AND type = 'commission_limit_exceeded'
              AND created_at >= v_last_settlement
        ) THEN
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
                'commission_limit_exceeded',
                'ناولوں کے آرڈرز عارضی طور پر موقوف (Orders Paused)',
                'آپ کا واجب الادا کمیشن (PKR ' || v_actual_unpaid || ') مقررہ حد (' || v_limit || ') سے تجاوز کر گیا ہے۔ نئے قارئین کے لیے آرڈرز موقوف کر دیے گئے ہیں۔',
                'کمیشن کلیئر ہوتے ہی آپ کے ناولز کے آرڈرز خودکار طریقے سے بحال ہو جائیں گے۔',
                '/writer/commission',
                pg_catalog.jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                pg_catalog.now()
            );
        END IF;
    END IF;

    RETURN v_actual_unpaid;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) TO authenticated;


-- ------------------------------------------------------------------------------
-- 2.9 reject_order_payment
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_submission record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_rejection_reason IS NULL OR pg_catalog.trim(p_rejection_reason) = '' THEN
        RAISE EXCEPTION 'A clear rejection reason is required.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    IF v_order.status::text != 'payment_submitted' THEN
        RAISE EXCEPTION 'Order cannot be rejected in current status: %. Only orders in status payment_submitted can be rejected.', v_order.status;
    END IF;

    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE id = p_submission_id AND order_id = p_order_id
    FOR UPDATE;

    IF v_submission.id IS NULL THEN
        RAISE EXCEPTION 'Payment submission not found for order: %', p_order_id;
    END IF;

    IF v_submission.reviewer_status::text != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be rejected: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    -- Update Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'rejected',
        reviewer_note = pg_catalog.trim(p_rejection_reason),
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_submission_id;

    -- Update Order
    UPDATE public.orders
    SET status = 'rejected',
        rejected_reason = pg_catalog.trim(p_rejection_reason),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- Notify Reader
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'ادائیگی تصدیق مسترد ہو گئی (Payment Verification Rejected)',
        'مصنف نے آپ کی بھیجی گئی رسید کو مسترد کیا ہے۔ وجہ: ' || pg_catalog.trim(p_rejection_reason),
        '/orders/' || v_order.order_number,
        false,
        pg_catalog.now()
    );

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
        CASE WHEN public.is_admin() THEN 'admin' ELSE 'writer' END,
        'REJECT_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object('status', 'rejected', 'reason', pg_catalog.trim(p_rejection_reason)),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(uuid, uuid, text) TO authenticated;
