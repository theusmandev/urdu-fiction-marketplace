-- ==============================================================================
-- UNB Premium — Migration 0052: Harden Suspended Writer & Novel Visibility
--
-- PURPOSE:
-- 1. Eliminates public catalog leaks where novels and preview chapters of suspended
--    or inactive writers were readable by anonymous/unauthenticated visitors.
-- 2. Hardens public.novels SELECT RLS policy so non-owners/public can only view
--    novels if status = 'published' AND author is approved in writer_profiles AND
--    active in profiles, OR if the reader holds an active purchase entitlement.
-- 3. Hardens public.chapters SELECT RLS policy so free preview chapters require the
--    author to be approved and active, while preserving full reading access for
--    entitled buyers.
-- 4. Fixes public.public_genres view so novel_count excludes novels of suspended
--    or inactive authors.
-- 5. Hardens get_chapter_for_reader RPC free preview branch to reject access if
--    the novel's writer is suspended or inactive, while preserving unconditional
--    access for entitled buyers.
-- 6. Hardens create_order and create_tip RPCs to reject new orders/tips if author
--    is suspended or inactive.
-- 7. Hardens admin_update_user_role_status to pause writer orders when deactivated.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. HARDEN RLS ON public.novels
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public view published novels" ON public.novels;

CREATE POLICY "Public view published novels"
    ON public.novels FOR SELECT
    USING (
        (
            status = 'published' AND EXISTS (
                SELECT 1
                FROM public.writer_profiles wp
                JOIN public.profiles p ON p.id = wp.id
                WHERE wp.id = novels.writer_id
                  AND wp.status = 'approved'
                  AND p.is_active = true
            )
        )
        OR writer_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
            SELECT 1
            FROM public.purchase_entitlements pe
            WHERE pe.novel_id = novels.id
              AND pe.reader_id = auth.uid()
              AND pe.is_revoked = false
        )
    );

-- -----------------------------------------------------------------------------
-- 2. HARDEN RLS ON public.chapters
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public view free preview chapters" ON public.chapters;
DROP POLICY IF EXISTS "Read chapters if free preview or entitled or owner or admin" ON public.chapters;

CREATE POLICY "Read chapters if free preview or entitled or owner or admin"
    ON public.chapters FOR SELECT
    USING (
        -- Case 1: Free preview chapter of a published novel by an approved, active author
        (
            is_free_preview = true AND
            is_published = true AND
            EXISTS (
                SELECT 1
                FROM public.novels n
                JOIN public.writer_profiles wp ON wp.id = n.writer_id
                JOIN public.profiles p ON p.id = wp.id
                WHERE n.id = chapters.novel_id
                  AND n.status = 'published'
                  AND wp.status = 'approved'
                  AND p.is_active = true
            )
        )
        OR
        -- Case 2: Reader holds verified, non-revoked purchase entitlement (regardless of novel/author suspension)
        (
            is_published = true AND
            public.has_novel_entitlement(chapters.novel_id)
        )
        OR
        -- Case 3: Author of the novel (can view own draft and published chapters)
        EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = chapters.novel_id AND n.writer_id = auth.uid()
        )
        OR
        -- Case 4: Platform administrator
        public.is_admin()
    );

-- -----------------------------------------------------------------------------
-- 3. FIX public.public_genres VIEW
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_genres
WITH (security_invoker = false) AS
SELECT
    g.id,
    g.slug,
    g.name_english,
    g.name_urdu,
    g.display_order,
    (
        SELECT count(DISTINCT ng.novel_id)::int
        FROM public.novel_genres ng
        JOIN public.novels n ON n.id = ng.novel_id
        JOIN public.writer_profiles wp ON wp.id = n.writer_id
        JOIN public.profiles p ON p.id = wp.id
        WHERE ng.genre_id = g.id
          AND n.status = 'published'
          AND wp.status = 'approved'
          AND p.is_active = true
    ) AS published_novels_count
FROM public.genres g
WHERE g.is_active = true;

COMMENT ON VIEW public.public_genres IS
'Active literary genres taxonomy with real-time published novel count of active, approved authors.';

GRANT SELECT ON public.public_genres TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. HARDEN get_chapter_for_reader RPC
-- -----------------------------------------------------------------------------
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
    v_watermark_enabled boolean := true;
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
    WHERE slug = pg_catalog.btrim(p_novel_slug);

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
        IF NOT coalesce(v_chapter.is_published, false) THEN
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
        ELSIF coalesce(v_chapter.is_free_preview, false) AND v_novel.status::text = 'published' THEN
            -- Free preview strictly requires approved and active author
            IF EXISTS (
                SELECT 1
                FROM public.writer_profiles wp
                JOIN public.profiles p ON p.id = wp.id
                WHERE wp.id = v_novel.writer_id
                  AND wp.status = 'approved'
                  AND p.is_active = true
            ) THEN
                v_access_reason := 'free_preview';
            ELSE
                RAISE EXCEPTION 'Chapter not found';
            END IF;
        ELSE
            RAISE EXCEPTION 'Chapter not found';
        END IF;
    END IF;

    -- Watermark & Rate limiting sliding-window check for entitled readers
    IF v_access_reason = 'entitled' THEN
        SELECT o.order_number INTO v_order_number
        FROM public.purchase_entitlements pe
        JOIN public.orders o ON o.id = pe.order_id
        WHERE pe.reader_id = v_caller_id
          AND pe.novel_id = v_novel.id
          AND pe.is_revoked = false
        LIMIT 1;

        SELECT 
            coalesce(chapter_read_window_minutes, 60), 
            coalesce(max_chapter_reads_per_window, 10),
            coalesce(watermark_enabled, true)
        INTO v_window_mins, v_max_reads, v_watermark_enabled
        FROM public.platform_settings
        WHERE id = 1;

        IF v_watermark_enabled THEN
            v_watermark_code := coalesce(v_order_number, pg_catalog.substring(pg_catalog.replace(v_caller_id::text, '-', ''), 1, 8));
        ELSE
            v_watermark_code := NULL;
        END IF;

        v_window_start := pg_catalog.now() - (coalesce(v_window_mins, 60)::text || ' minutes')::interval;

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

            IF v_distinct_reads >= coalesce(v_max_reads, 10) THEN
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
        'watermark_enabled', v_watermark_enabled,
        'reader_progress', v_reader_progress
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_chapter_for_reader(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_for_reader(text, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. HARDEN create_order RPC
-- -----------------------------------------------------------------------------
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
        coalesce(min_novel_price_pkr, 50),
        coalesce(max_novel_price_pkr, 5000.00),
        coalesce(max_orders_per_hour, 5),
        coalesce(default_commission_rate, 30.00)
    INTO
        v_min_price,
        v_max_price,
        v_max_orders_per_hour,
        v_default_rate
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price           := coalesce(v_min_price, 50);
    v_max_price           := coalesce(v_max_price, 5000.00);
    v_max_orders_per_hour := coalesce(v_max_orders_per_hour, 5);
    v_default_rate        := coalesce(v_default_rate, 30.00);

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

    -- Require active base profile
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_novel.writer_id AND p.is_active = true
    ) THEN
        RAISE EXCEPTION 'Writer is currently not eligible to receive orders.';
    END IF;

    IF v_writer.is_orders_paused_for_commission THEN
        RAISE EXCEPTION 'Orders for this author are currently paused due to accrued platform fee limit.';
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

    -- Authoritative rate calculation: writer custom rate override, or platform default
    v_applied_rate := coalesce(v_writer.custom_commission_rate, v_default_rate);

    -- Round platform fee and writer share
    v_commission_pkr   := pg_catalog.round((v_novel.price_pkr * v_applied_rate / 100.0), 2);
    v_writer_share_pkr := v_novel.price_pkr - v_commission_pkr;

    -- Generate unique human-readable order number
    v_order_number := 'ORD-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));

    -- Insert order
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
        coalesce(v_novel.title_urdu, v_novel.title_english),
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

-- -----------------------------------------------------------------------------
-- 6. HARDEN create_tip RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_tip(
    p_writer_id uuid,
    p_amount_pkr numeric,
    p_payment_method_id uuid,
    p_novel_id uuid DEFAULT NULL,
    p_chapter_id uuid DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_is_anonymous boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reader_id        uuid;
    v_platform         record;
    v_writer           record;
    v_tip_settings     record;
    v_method           record;
    v_tip_number       text;
    v_min              numeric(10,2);
    v_max              numeric(10,2);
    v_hourly_count     integer;
    v_daily_sum        numeric(10,2);
    v_open_count       integer;
    v_open_slot        integer := NULL;
    v_cleaned_msg      text := NULL;
    v_snapshot         jsonb;
    v_tip              record;
    v_i                integer;
BEGIN
    v_reader_id := auth.uid();
    IF v_reader_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to send a tip.';
    END IF;

    -- Self-tip blocked
    IF v_reader_id = p_writer_id THEN
        RAISE EXCEPTION 'Authors cannot tip themselves.';
    END IF;

    -- Platform settings & kill switch
    SELECT * INTO v_platform FROM public.platform_settings WHERE id = 1;
    IF v_platform.id IS NULL OR coalesce(v_platform.tips_enabled, true) = false THEN
        RAISE EXCEPTION 'Tips are currently disabled on the platform.';
    END IF;

    -- Writer check
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = p_writer_id;
    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RAISE EXCEPTION 'Author is not eligible to receive tips.';
    END IF;

    -- Require active base profile
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_writer_id AND p.is_active = true
    ) THEN
        RAISE EXCEPTION 'Author is not eligible to receive tips.';
    END IF;

    -- Writer tip settings check (defaults to true if row not created yet)
    SELECT * INTO v_tip_settings FROM public.writer_tip_settings WHERE writer_id = p_writer_id;
    IF coalesce(v_tip_settings.enabled, true) = false THEN
        RAISE EXCEPTION 'Author has not enabled tips.';
    END IF;

    -- Amount validations
    v_min := coalesce(v_tip_settings.min_amount, v_platform.tip_min_pkr, 20)::numeric(10,2);
    v_max := coalesce(v_tip_settings.max_amount, v_platform.tip_max_pkr, 5000)::numeric(10,2);

    IF p_amount_pkr IS NULL OR p_amount_pkr < v_min THEN
        RAISE EXCEPTION 'Tip amount must be at least PKR %s.', v_min;
    END IF;

    IF p_amount_pkr > v_max THEN
        RAISE EXCEPTION 'Tip amount cannot exceed PKR %s.', v_max;
    END IF;

    -- Optional novel validity check if tip attached to a novel
    IF p_novel_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = p_novel_id AND n.status = 'published' AND n.writer_id = p_writer_id
        ) THEN
            RAISE EXCEPTION 'Novel is not available.';
        END IF;
    END IF;

    -- Hourly rate limit per reader
    SELECT pg_catalog.count(*) INTO v_hourly_count
    FROM public.tips
    WHERE reader_id = v_reader_id
      AND created_at >= pg_catalog.now() - interval '1 hour';

    IF v_hourly_count >= coalesce(v_platform.max_tips_per_hour, 5) THEN
        RAISE EXCEPTION 'Hourly tip limit reached. Please wait before sending another tip.';
    END IF;

    -- Daily cap per reader
    SELECT coalesce(pg_catalog.sum(amount_pkr), 0) INTO v_daily_sum
    FROM public.tips
    WHERE reader_id = v_reader_id
      AND status IN ('pending_payment', 'payment_submitted', 'confirmed')
      AND created_at >= pg_catalog.now() - interval '24 hours';

    IF (v_daily_sum + p_amount_pkr) > coalesce(v_platform.tip_daily_cap_pkr_per_reader, 10000) THEN
        RAISE EXCEPTION 'Daily tipping cap of PKR %s exceeded for this reader.', v_platform.tip_daily_cap_pkr_per_reader;
    END IF;

    -- Open tip limit: At most 3 open tips between this reader and this writer
    SELECT pg_catalog.count(*) INTO v_open_count
    FROM public.tips
    WHERE reader_id = v_reader_id
      AND writer_id = p_writer_id
      AND status IN ('pending_payment', 'payment_submitted');

    IF v_open_count >= 3 THEN
        RAISE EXCEPTION 'You already have 3 open tips awaiting payment or confirmation for this author. Please complete or cancel existing tips before creating a new one.';
    END IF;

    -- Find lowest available open_slot (1, 2, or 3)
    FOR v_i IN 1..3 LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.tips
            WHERE reader_id = v_reader_id
              AND writer_id = p_writer_id
              AND status IN ('pending_payment', 'payment_submitted')
              AND open_slot = v_i
        ) THEN
            v_open_slot := v_i;
            EXIT;
        END IF;
    END LOOP;

    -- Validate payment method
    SELECT * INTO v_method
    FROM public.writer_payment_methods
    WHERE id = p_payment_method_id
      AND writer_id = p_writer_id
      AND is_active = true;

    IF v_method.id IS NULL THEN
        RAISE EXCEPTION 'Selected payment method is invalid or inactive.';
    END IF;

    -- Clean message
    IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
        IF pg_catalog.length(trim(p_message)) > 280 THEN
            RAISE EXCEPTION 'Tip message cannot exceed 280 characters.';
        END IF;
        v_cleaned_msg := trim(p_message);
    END IF;

    -- Build payment instructions snapshot
    v_snapshot := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Generate human-readable tip number
    v_tip_number := 'TIP-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' ||
                    pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));

    -- Insert tip
    INSERT INTO public.tips (
        tip_number,
        reader_id,
        writer_id,
        novel_id,
        chapter_id,
        amount_pkr,
        payment_method_id,
        payment_instructions_snapshot,
        message,
        is_anonymous,
        status,
        open_slot,
        created_at,
        updated_at
    ) VALUES (
        v_tip_number,
        v_reader_id,
        p_writer_id,
        p_novel_id,
        p_chapter_id,
        p_amount_pkr,
        v_method.id,
        v_snapshot,
        v_cleaned_msg,
        p_is_anonymous,
        'pending_payment',
        v_open_slot,
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING * INTO v_tip;

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
        v_reader_id,
        'reader',
        'CREATE_TIP',
        'tips',
        v_tip.id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'tip_number', v_tip_number,
            'writer_id', p_writer_id,
            'amount_pkr', p_amount_pkr
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'tip_id', v_tip.id,
        'tip_number', v_tip.tip_number,
        'status', v_tip.status,
        'amount_pkr', v_tip.amount_pkr,
        'instructions', v_snapshot,
        'open_slot', v_open_slot
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tip(uuid, numeric, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tip(uuid, numeric, uuid, uuid, uuid, text, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. HARDEN admin_update_user_role_status RPC
-- -----------------------------------------------------------------------------
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
    v_now timestamptz;
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

    v_now := pg_catalog.now();

    UPDATE public.profiles
    SET role = p_role,
        is_active = p_is_active,
        updated_at = v_now
    WHERE id = p_user_id;

    -- If deactivated and has a writer profile, pause orders
    IF p_is_active = false AND EXISTS (SELECT 1 FROM public.writer_profiles WHERE id = p_user_id) THEN
        UPDATE public.writer_profiles
        SET is_orders_paused_for_commission = true,
            updated_at = v_now
        WHERE id = p_user_id;
    END IF;

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
        v_now
    );

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
        'admin',
        'UPDATE_USER_ROLE_STATUS',
        'profiles',
        p_user_id::text,
        pg_catalog.jsonb_build_object('role', v_target.role, 'is_active', v_target.is_active),
        pg_catalog.jsonb_build_object('role', p_role, 'is_active', p_is_active, 'reason', trim(p_reason)),
        v_now
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', p_role,
        'is_active', p_is_active
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_role_status(uuid, public.user_role, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role_status(uuid, public.user_role, boolean, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. HARDEN suspend_writer RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suspend_writer(
    p_writer_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_now timestamptz;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can suspend writers.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to suspend a writer.';
    END IF;

    v_now := pg_catalog.now();

    UPDATE public.writer_profiles
    SET status = 'suspended',
        is_orders_paused_for_commission = true,
        updated_at = v_now
    WHERE id = p_writer_id;

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
        'writer_suspended',
        'اکاؤنٹ معطل کر دیا گیا (Writer Account Suspended)',
        'پلیٹ فارم قواعد کی خلاف ورزی کی بنا پر آپ کا مصنف اکاؤنٹ معطل کر دیا گیا ہے۔ وجہ: ' || trim(p_reason),
        trim(p_reason),
        '/contact',
        pg_catalog.jsonb_build_object('writer_id', p_writer_id, 'reason', trim(p_reason)),
        false,
        v_now
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
        'SUSPEND_WRITER',
        'writer_profiles',
        p_writer_id::text,
        NULL,
        pg_catalog.jsonb_build_object('status', 'suspended', 'reason', trim(p_reason)),
        v_now
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'writer_id', p_writer_id, 'status', 'suspended');
END;
$$;

REVOKE ALL ON FUNCTION public.suspend_writer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_writer(uuid, text) TO authenticated;

