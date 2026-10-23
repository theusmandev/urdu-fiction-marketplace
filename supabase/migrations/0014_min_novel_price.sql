-- ==============================================================================
-- UNB PREMIUM — MIGRATION 0014: MINIMUM NOVEL PRICE ENFORCEMENT (NO FREE NOVELS)
-- ==============================================================================
-- Business Rules:
-- 1. There are NO free novels on the marketplace. Every novel must cost at least PKR 50
--    (configurable by administrators in platform_settings).
-- 2. Prices are strictly whole rupees without paise (scale = 0).
-- 3. The minimum and maximum price constraints are enforced at the database level
--    via a BEFORE INSERT OR UPDATE trigger on public.novels that applies to everyone
--    (including administrators).
-- 4. create_novel, update_novel, submit_novel_for_review, and create_order all
--    enforce these boundaries defensively.
-- 5. Existing orders and past financial records remain append-only and immutable.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: PLATFORM SETTINGS (min_novel_price_pkr)
-- ------------------------------------------------------------------------------

-- 1.1 Add min_novel_price_pkr to platform_settings (default 50 PKR)
ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS min_novel_price_pkr integer NOT NULL DEFAULT 50;

-- 1.2 Add check constraint ensuring min_novel_price_pkr >= 1 AND min <= max
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_min_price'
    ) THEN
        ALTER TABLE public.platform_settings
        ADD CONSTRAINT chk_platform_settings_min_price
        CHECK (min_novel_price_pkr >= 1 AND min_novel_price_pkr <= max_novel_price_pkr);
    END IF;
END $$;

-- 1.3 Update update_platform_settings RPC to validate and record min_novel_price_pkr
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, numeric, text);

CREATE OR REPLACE FUNCTION public.update_platform_settings(
    p_default_commission_rate numeric,
    p_default_unpaid_commission_limit numeric,
    p_dispute_window_days integer,
    p_min_novel_price_pkr integer,
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

    IF p_min_novel_price_pkr < 1 THEN
        RAISE EXCEPTION 'Minimum novel price must be at least 1 PKR. Provided: %', p_min_novel_price_pkr;
    END IF;

    IF p_max_novel_price_pkr <= 0 THEN
        RAISE EXCEPTION 'Maximum novel price must be greater than 0 PKR. Provided: %', p_max_novel_price_pkr;
    END IF;

    IF p_min_novel_price_pkr > p_max_novel_price_pkr THEN
        RAISE EXCEPTION 'Minimum novel price (%) cannot exceed maximum novel price (%).', p_min_novel_price_pkr, p_max_novel_price_pkr;
    END IF;

    IF p_support_email IS NULL OR trim(p_support_email) = '' OR p_support_email NOT LIKE '%@%.%' THEN
        RAISE EXCEPTION 'A valid support email address is required.';
    END IF;

    SELECT * INTO v_old FROM public.platform_settings WHERE id = 1;

    -- NOTE: Commission rate and price setting updates affect FUTURE sales and novel price changes only.
    -- Existing orders and sales_ledger rows maintain immutable calculated snapshots.
    UPDATE public.platform_settings
    SET default_commission_rate = p_default_commission_rate,
        default_unpaid_commission_limit = p_default_unpaid_commission_limit,
        dispute_window_days = p_dispute_window_days,
        min_novel_price_pkr = p_min_novel_price_pkr,
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
            'min_novel_price_pkr', v_old.min_novel_price_pkr,
            'max_novel_price_pkr', v_old.max_novel_price_pkr,
            'support_email', v_old.support_email
        ),
        pg_catalog.jsonb_build_object(
            'default_commission_rate', p_default_commission_rate,
            'default_unpaid_commission_limit', p_default_unpaid_commission_limit,
            'dispute_window_days', p_dispute_window_days,
            'min_novel_price_pkr', p_min_novel_price_pkr,
            'max_novel_price_pkr', p_max_novel_price_pkr,
            'support_email', p_support_email
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_settings(numeric, numeric, integer, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, integer, numeric, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 2: NOVEL PRICE VALIDATION TRIGGER (APPLIES TO ALL ROLES INCLUDING ADMIN)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_novels_validate_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_min_price integer;
    v_max_price numeric(10,2);
BEGIN
    SELECT coalesce(min_novel_price_pkr, 50), coalesce(max_novel_price_pkr, 5000.00)
    INTO v_min_price, v_max_price
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := coalesce(v_min_price, 50);
    v_max_price := coalesce(v_max_price, 5000.00);

    -- 1. Enforce whole rupee amounts (no fractional paise allowed)
    IF NEW.price_pkr IS NULL OR NEW.price_pkr != round(NEW.price_pkr, 0) THEN
        RAISE EXCEPTION 'Novel price must be a whole rupee amount without paise (fractions). Provided: %', NEW.price_pkr;
    END IF;

    -- 2. Enforce minimum price limit
    IF NEW.price_pkr < v_min_price THEN
        RAISE EXCEPTION 'Novel price (PKR %) cannot be below the platform minimum of PKR %.', NEW.price_pkr, v_min_price;
    END IF;

    -- 3. Enforce maximum price limit
    IF NEW.price_pkr > v_max_price THEN
        RAISE EXCEPTION 'Novel price (PKR %) cannot exceed the platform maximum of PKR %.', NEW.price_pkr, v_max_price;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_novels_validate_price ON public.novels;
CREATE TRIGGER trg_novels_validate_price
    BEFORE INSERT OR UPDATE OF price_pkr ON public.novels
    FOR EACH ROW EXECUTE FUNCTION public.trg_novels_validate_price();


-- ------------------------------------------------------------------------------
-- SECTION 3: NOVEL LIFECYCLE RPCs PRICE HARDENING
-- ------------------------------------------------------------------------------

-- 3.1 create_novel with minimum price validation
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

    SELECT coalesce(min_novel_price_pkr, 50), coalesce(max_novel_price_pkr, 5000.00)
    INTO v_min_price, v_max_price
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := coalesce(v_min_price, 50);
    v_max_price := coalesce(v_max_price, 5000.00);

    IF p_price_pkr IS NULL OR p_price_pkr != round(p_price_pkr, 0) THEN
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

-- 3.2 update_novel with minimum price validation
CREATE OR REPLACE FUNCTION public.update_novel(
    p_novel_id uuid,
    p_title_urdu text,
    p_title_english text,
    p_synopsis_urdu text,
    p_description_urdu text DEFAULT NULL,
    p_cover_url text DEFAULT NULL,
    p_cover_public_id text DEFAULT NULL,
    p_price_pkr numeric DEFAULT 50,
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
    v_min_price integer;
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

    SELECT coalesce(min_novel_price_pkr, 50), coalesce(max_novel_price_pkr, 5000.00)
    INTO v_min_price, v_max_price
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := coalesce(v_min_price, 50);
    v_max_price := coalesce(v_max_price, 5000.00);

    IF p_price_pkr IS NULL OR p_price_pkr != round(p_price_pkr, 0) THEN
        RAISE EXCEPTION 'Novel price must be a whole rupee amount without paise. Provided: %', p_price_pkr;
    END IF;

    IF p_price_pkr < v_min_price OR p_price_pkr > v_max_price THEN
        RAISE EXCEPTION 'Price must be between % and % PKR.', v_min_price, v_max_price;
    END IF;

    UPDATE public.novels
    SET title_urdu = trim(p_title_urdu),
        title_english = trim(p_title_english),
        synopsis_urdu = trim(p_synopsis_urdu),
        description_urdu = trim(p_description_urdu),
        cover_url = trim(p_cover_url),
        cover_public_id = trim(p_cover_public_id),
        price_pkr = p_price_pkr,
        language = coalesce(trim(p_language), 'ur'),
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

-- 3.3 submit_novel_for_review with below-minimum rejection
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
    v_min_price integer;
    v_max_price numeric(10,2);
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

    -- Minimum novel price enforcement (NO free novels)
    SELECT coalesce(min_novel_price_pkr, 50), coalesce(max_novel_price_pkr, 5000.00)
    INTO v_min_price, v_max_price
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := coalesce(v_min_price, 50);
    v_max_price := coalesce(v_max_price, 5000.00);

    IF v_novel.price_pkr IS NULL OR v_novel.price_pkr < v_min_price THEN
        RAISE EXCEPTION 'Novel price (PKR %) is below the platform minimum of PKR %. Please update your novel price to at least PKR % before submitting for review.',
            coalesce(v_novel.price_pkr, 0), v_min_price, v_min_price;
    END IF;

    IF v_novel.price_pkr > v_max_price OR v_novel.price_pkr != round(v_novel.price_pkr, 0) THEN
        RAISE EXCEPTION 'Novel price (PKR %) is invalid. Please update your novel price to a whole rupee amount up to PKR % before submitting for review.',
            v_novel.price_pkr, v_max_price;
    END IF;

    -- Must have at least 1 genre linked
    IF NOT EXISTS (SELECT 1 FROM public.novel_genres WHERE novel_id = p_novel_id) THEN
        RAISE EXCEPTION 'Novel must be associated with at least one genre before submission.';
    END IF;

    -- Must have at least 1 published chapter
    IF NOT EXISTS (SELECT 1 FROM public.chapters WHERE novel_id = p_novel_id AND is_published = true) THEN
        RAISE EXCEPTION 'Novel must have at least one published chapter before submission.';
    END IF;

    -- All marketplace novels are paid, so author MUST have at least 1 active payment method
    IF NOT EXISTS (
        SELECT 1 FROM public.writer_payment_methods
        WHERE writer_id = v_novel.writer_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'At least one active payout method (JazzCash, EasyPaisa, Raast, or Bank IBAN) is required to receive novel payments.';
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
        pg_catalog.jsonb_build_object('status', v_novel.status, 'price_pkr', v_novel.price_pkr),
        pg_catalog.jsonb_build_object('status', 'under_review', 'price_pkr', v_novel.price_pkr),
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


-- ------------------------------------------------------------------------------
-- SECTION 4: CREATE ORDER DEFENSIVE PRICE CHECK
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

    -- Fetch novel
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.status != 'published' THEN
        RAISE EXCEPTION 'Novel is not available for purchase (status: %).', v_novel.status;
    END IF;

    -- Defensive check: novel price must be > 0 and within platform_settings range
    SELECT coalesce(min_novel_price_pkr, 50), coalesce(max_novel_price_pkr, 5000.00)
    INTO v_min_price, v_max_price
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := coalesce(v_min_price, 50);
    v_max_price := coalesce(v_max_price, 5000.00);

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

    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
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
          AND status IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed')
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

    -- Snapshot payment instructions
    v_instructions := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Fetch default commission rate from platform_settings
    SELECT default_commission_rate INTO v_default_rate
    FROM public.platform_settings
    WHERE id = 1;

    v_default_rate := coalesce(v_default_rate, 20.00);

    -- Authoritative rate calculation
    v_applied_rate := coalesce(v_writer.custom_commission_rate, v_default_rate);

    -- Round commission and writer share
    v_commission_pkr := pg_catalog.round((v_novel.price_pkr * v_applied_rate / 100.0), 2);
    v_writer_share_pkr := v_novel.price_pkr - v_commission_pkr;

    -- Generate unique human-readable order number
    v_order_number := 'ORD-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || pg_catalog.upper(substr(pg_catalog.gen_random_uuid()::text, 1, 8));

    -- Insert order
    INSERT INTO public.orders (
        order_number,
        reader_id,
        writer_id,
        novel_id,
        amount_pkr,
        payment_method,
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
        v_novel.price_pkr,
        v_method.method_type,
        v_instructions,
        v_applied_rate,
        v_commission_pkr,
        v_writer_share_pkr,
        'pending_payment',
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING id INTO v_order_id;

    -- Audit log
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
            'status', 'pending_payment'
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'amount_pkr', v_novel.price_pkr,
        'status', 'pending_payment'
    );
END;
$$;
