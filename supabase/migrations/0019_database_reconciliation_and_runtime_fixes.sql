-- ==============================================================================
-- UNB Premium — Migration 0019: Database Reconciliation & Runtime Fixes Patch
-- Description:
--   1. Guard DO block checking prerequisite enum values & schema objects.
--   2. Drop stale overloaded function signatures (update_platform_settings, approve_novel).
--   3. Corrected definitions for get_checkout_options, create_order, get_chapter_for_reader,
--      admin_list_orders, admin_get_order, get_public_novel_chapters, verify_order_payment,
--      reject_order_payment, get_writer_unpaid_commission, reconcile_writer_unpaid_commission.
--   4. Grants and privilege lockdowns on base tables and RPC procedures.
-- Idempotency: All DDL statements are guarded with IF EXISTS / DROP ... IF EXISTS.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: PREREQUISITE OBJECT GUARDS
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    -- 1.1 Verify enum values in public.commission_invoice_status
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'public.commission_invoice_status'::regtype
          AND enumlabel = 'partially_paid'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'public.commission_invoice_status'::regtype
          AND enumlabel = 'void'
    ) THEN
        RAISE EXCEPTION 'Prerequisite missing: migration 0017_a_commission_enum_values.sql must be applied in a separate transaction first (enum values partially_paid and void missing from commission_invoice_status).';
    END IF;

    -- 1.2 Verify tables from migration 0017
    IF to_regclass('public.commission_invoice_lines') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite missing: table public.commission_invoice_lines does not exist. Please ensure migration 0017_commission_and_statements.sql is applied.';
    END IF;

    IF to_regclass('public.commission_payment_reports') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite missing: table public.commission_payment_reports does not exist. Please ensure migration 0017_commission_and_statements.sql is applied.';
    END IF;

    -- 1.3 Verify tables from migration 0018
    IF to_regclass('public.refund_requests') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite missing: table public.refund_requests does not exist. Please ensure migration 0018_disputes_refunds_support.sql is applied.';
    END IF;

    IF to_regclass('public.dispute_messages') IS NULL THEN
        RAISE EXCEPTION 'Prerequisite missing: table public.dispute_messages does not exist. Please ensure migration 0018_disputes_refunds_support.sql is applied.';
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 2: CLEAN UP STALE FUNCTION OVERLOADS
-- ------------------------------------------------------------------------------

-- 2.1 Drop stale approve_novel(uuid) signature (leaving approve_novel(uuid, jsonb))
DROP FUNCTION IF EXISTS public.approve_novel(uuid);

-- 2.2 Drop stale update_platform_settings signatures from 0012, 0014, 0016, 0017
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, numeric, text);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer, integer, integer);


-- ------------------------------------------------------------------------------
-- SECTION 3: RECONCILED PUBLIC & READER RPC FUNCTIONS
-- ------------------------------------------------------------------------------

-- 3.1 get_public_novel_chapters: Fixed enum comparison & search path
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
SET search_path = public, pg_temp
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
    WHERE n.slug = trim(p_novel_slug)
      AND n.status::text = 'published'
      AND c.is_published = true
      AND p.is_active = true
      AND wp.status::text = 'approved'
    ORDER BY c.chapter_number ASC;
END;
$$;

COMMENT ON FUNCTION public.get_public_novel_chapters(text) IS
'Returns public table of contents metadata for a novel without exposing chapter content for paid chapters.';

REVOKE ALL ON FUNCTION public.get_public_novel_chapters(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_novel_chapters(text) TO anon, authenticated;


-- 3.2 get_checkout_options: Use v_novel.cover_url (mapped to cover_image_url JSON key)
CREATE OR REPLACE FUNCTION public.get_checkout_options(p_novel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    v_pen_name := coalesce(v_writer.pen_name_urdu, v_writer.pen_name_english, 'Author');

    -- Check if reader has an existing open order for this novel
    SELECT order_number INTO v_open_order_number
    FROM public.orders
    WHERE reader_id = v_caller_id
      AND novel_id = p_novel_id
      AND status::text IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Collect active payment methods with strictly masked accounts
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', wpm.id,
                'method_type', wpm.method_type,
                'bank_name', wpm.bank_name,
                'account_title', wpm.account_title,
                'masked_account', CASE
                    WHEN length(wpm.account_number_or_iban) <= 4 THEN '•••• ' || wpm.account_number_or_iban
                    ELSE '•••• ' || substr(wpm.account_number_or_iban, length(wpm.account_number_or_iban) - 3)
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

    RETURN jsonb_build_object(
        'novel', jsonb_build_object(
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


-- 3.3 create_order: Removed invalid payment_method column, reinstated CREATE_ORDER audit log
CREATE OR REPLACE FUNCTION public.create_order(
    p_novel_id uuid,
    p_payment_method_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
        coalesce(default_commission_rate, 20.00)
    INTO
        v_min_price,
        v_max_price,
        v_max_orders_per_hour,
        v_default_rate
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := coalesce(v_min_price, 50);
    v_max_price := coalesce(v_max_price, 5000.00);
    v_max_orders_per_hour := coalesce(v_max_orders_per_hour, 5);
    v_default_rate := coalesce(v_default_rate, 20.00);

    -- Abuse protection: Check order creation rate for this reader in the past hour
    SELECT count(*) INTO v_recent_order_count
    FROM public.orders
    WHERE reader_id = v_caller_id
      AND created_at >= (now() - interval '1 hour');

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
    v_instructions := jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Authoritative rate calculation
    v_applied_rate := coalesce(v_writer.custom_commission_rate, v_default_rate);

    -- Round commission and writer share
    v_commission_pkr := round((v_novel.price_pkr * v_applied_rate / 100.0), 2);
    v_writer_share_pkr := v_novel.price_pkr - v_commission_pkr;

    -- Generate unique human-readable order number
    v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));

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
        coalesce(v_novel.title_urdu, v_novel.title_english),
        v_novel.price_pkr,
        'PKR',
        v_method.id,
        v_instructions,
        v_applied_rate,
        v_commission_pkr,
        v_writer_share_pkr,
        'pending_payment',
        now(),
        now()
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
        jsonb_build_object(
            'order_number', v_order_number,
            'amount_pkr', v_novel.price_pkr,
            'novel_id', v_novel.id,
            'writer_id', v_novel.writer_id
        ),
        now()
    );

    RETURN jsonb_build_object(
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


-- 3.4 get_chapter_for_reader: Removed title_english field access
CREATE OR REPLACE FUNCTION public.get_chapter_for_reader(
    p_novel_slug text,
    p_chapter_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    WHERE slug = trim(p_novel_slug);

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

        v_watermark_code := coalesce(v_order_number, substring(replace(v_caller_id::text, '-', ''), 1, 8));

        SELECT coalesce(chapter_read_window_minutes, 60), coalesce(max_chapter_reads_per_window, 10)
        INTO v_window_mins, v_max_reads
        FROM public.platform_settings
        WHERE id = 1;

        v_window_start := now() - (coalesce(v_window_mins, 60) || ' minutes')::interval;

        SELECT EXISTS (
            SELECT 1 FROM public.chapter_reads
            WHERE reader_id = v_caller_id
              AND chapter_id = v_chapter.id
              AND read_at >= v_window_start
        ) INTO v_already_read;

        IF NOT v_already_read THEN
            SELECT count(DISTINCT chapter_id) INTO v_distinct_reads
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
                now()
            );
        END IF;
    END IF;

    -- Calculate navigation numbers
    SELECT max(chapter_number) INTO v_prev_number
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true
      AND chapter_number < p_chapter_number;

    SELECT min(chapter_number) INTO v_next_number
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true
      AND chapter_number > p_chapter_number;

    SELECT count(*) INTO v_total_published_chapters
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true;

    SELECT last_chapter_number INTO v_reader_progress
    FROM public.reader_progress
    WHERE reader_id = v_caller_id
      AND novel_id = v_novel.id;

    RETURN jsonb_build_object(
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


-- 3.5 admin_list_orders: Fixed order_status enum comparisons and duplicate flag column
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
SET search_path = public, pg_temp
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

    v_twenty_four_hours_ago := now() - interval '24 hours';
    v_clean_search := trim(coalesce(p_search, ''));

    -- Count matching rows
    SELECT count(*) INTO v_total_count
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
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
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
                'reader_display_name', coalesce(p_reader.full_name, p_reader.username, 'Anonymous Reader'),
                'reader_username', p_reader.username,
                'writer_id', o.writer_id,
                'writer_pen_name', coalesce(wp.pen_name_english, wp.pen_name_urdu, 'Urdu Author'),
                'novel_id', o.novel_id,
                'novel_title', coalesce(o.novel_title_snapshot, n.title_english, n.title_urdu),
                'novel_slug', n.slug,
                'payment_method_type', coalesce(o.payment_instructions_snapshot->>'method_type', 'Manual Transfer'),
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
        LIMIT greatest(p_limit, 1)
        OFFSET greatest(p_offset, 0)
    ) o
    JOIN public.novels n ON n.id = o.novel_id
    JOIN public.profiles p_reader ON p_reader.id = o.reader_id
    JOIN public.writer_profiles wp ON wp.id = o.writer_id;

    RETURN jsonb_build_object(
        'orders', v_orders,
        'total_count', coalesce(v_total_count, 0),
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_orders(text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text, text, boolean, integer, integer) TO authenticated;


-- 3.6 admin_get_order: Fixed duplicate flag, ledger fields, and non-existent columns
CREATE OR REPLACE FUNCTION public.admin_get_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    v_twenty_four_hours_ago := now() - interval '24 hours';

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = v_order.novel_id;
    SELECT * INTO v_reader FROM public.profiles WHERE id = v_order.reader_id;
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;

    -- Submissions
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
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
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
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
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
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
    SELECT jsonb_build_object(
        'id', pe.id,
        'granted_at', pe.granted_at,
        'is_revoked', pe.is_revoked,
        'revoked_at', null::timestamptz,
        'revoked_reason', pe.revoked_reason
    ) INTO v_entitlement
    FROM public.purchase_entitlements pe
    WHERE pe.order_id = p_order_id
    LIMIT 1;

    RETURN jsonb_build_object(
        'order', jsonb_build_object(
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
        'reader', jsonb_build_object(
            'id', v_reader.id,
            'display_name', coalesce(v_reader.full_name, v_reader.username, 'Anonymous Reader'),
            'username', v_reader.username
        ),
        'writer', jsonb_build_object(
            'id', v_writer.id,
            'pen_name', coalesce(v_writer.pen_name_english, v_writer.pen_name_urdu, 'Urdu Author'),
            'pen_name_english', v_writer.pen_name_english,
            'pen_name_urdu', v_writer.pen_name_urdu
        ),
        'novel', jsonb_build_object(
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


-- 3.7 get_writer_unpaid_commission: Restricted to owning writer or admin
CREATE OR REPLACE FUNCTION public.get_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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

    SELECT coalesce(sum(platform_commission_pkr), 0.00)
    INTO v_total_ledger_comm
    FROM public.sales_ledger
    WHERE writer_id = p_writer_id;

    SELECT coalesce(sum(amount_pkr), 0.00)
    INTO v_total_paid
    FROM public.commission_payments
    WHERE writer_id = p_writer_id;

    RETURN greatest(0.00, v_total_ledger_comm - v_total_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.get_writer_unpaid_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_writer_unpaid_commission(uuid) TO authenticated;


-- 3.8 reconcile_writer_unpaid_commission: Restricted to owning writer or admin
CREATE OR REPLACE FUNCTION public.reconcile_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
        updated_at = now()
    WHERE id = p_writer_id;

    SELECT max(confirmed_at) INTO v_last_settlement
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
                jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                now()
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
                jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                now()
            );
        END IF;
    END IF;

    RETURN v_actual_unpaid;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) TO authenticated;


-- 3.9 verify_order_payment: Strict status constraints and append-only ledger creation
CREATE OR REPLACE FUNCTION public.verify_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_writer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_submission record;
    v_writer record;
    v_settings record;
    v_rate numeric(5,2);
    v_commission_pkr numeric(10,2);
    v_writer_share_pkr numeric(10,2);
    v_entitlement_id uuid;
    v_ledger_id uuid;
    v_new_unpaid numeric(12,2);
    v_paused boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to verify payment.';
    END IF;

    -- Fetch order with row-lock
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the receiving author or platform administrator can verify receipt.';
    END IF;

    IF v_order.status::text != 'payment_submitted' THEN
        RAISE EXCEPTION 'Order cannot be verified in current status: %. Only orders in status payment_submitted can be verified.', v_order.status;
    END IF;

    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE id = p_submission_id AND order_id = p_order_id
    FOR UPDATE;

    IF v_submission.id IS NULL THEN
        RAISE EXCEPTION 'Payment submission not found for order: %', p_order_id;
    END IF;

    IF v_submission.reviewer_status != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be verified: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);
    v_commission_pkr := round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update Payment Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'verified',
        reviewer_note = trim(p_writer_note),
        reviewed_by = v_caller_id,
        reviewed_at = now()
    WHERE id = p_submission_id;

    -- 2. Update Order
    UPDATE public.orders
    SET status = 'verified',
        verified_at = now(),
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        updated_at = now()
    WHERE id = p_order_id;

    -- 3. Upsert Purchase Entitlement
    INSERT INTO public.purchase_entitlements (
        reader_id,
        novel_id,
        order_id,
        granted_at,
        is_revoked,
        revoked_reason
    ) VALUES (
        v_order.reader_id,
        v_order.novel_id,
        v_order.id,
        now(),
        false,
        NULL
    )
    ON CONFLICT (reader_id, novel_id) DO UPDATE SET
        order_id = EXCLUDED.order_id,
        is_revoked = false,
        revoked_reason = NULL,
        granted_at = now()
    RETURNING id INTO v_entitlement_id;

    -- 4. Record Immutable Entry in Sales Ledger
    INSERT INTO public.sales_ledger (
        order_id,
        writer_id,
        reader_id,
        novel_id,
        entry_type,
        gross_amount_pkr,
        commission_rate,
        platform_commission_pkr,
        writer_net_pkr,
        notes,
        created_at
    ) VALUES (
        v_order.id,
        v_order.writer_id,
        v_order.reader_id,
        v_order.novel_id,
        'sale_verified',
        v_order.amount_pkr,
        v_rate,
        v_commission_pkr,
        v_writer_share_pkr,
        coalesce(trim(p_writer_note), 'Direct reader payment confirmed by writer.'),
        now()
    )
    RETURNING id INTO v_ledger_id;

    -- 5. Reconcile commission balance
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 6. Notify Reader
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'ادائیگی کی تصدیق ہو گئی! (Payment Verified)',
        'مصنف نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ ناول آپ کی لائبریری میں دستیاب ہے۔',
        '/library',
        false,
        now()
    );

    -- 7. Audit Log
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
        'VERIFY_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        jsonb_build_object('status', v_order.status),
        jsonb_build_object(
            'status', 'verified',
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id,
        'current_unpaid_commission', v_new_unpaid,
        'is_orders_paused_for_commission', v_paused
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_order_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_order_payment(uuid, uuid, text) TO authenticated;


-- 3.10 reject_order_payment: Strict status constraints
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
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

    IF v_submission.reviewer_status != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be rejected: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    -- Update Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'rejected',
        reviewer_note = trim(p_rejection_reason),
        reviewed_by = v_caller_id,
        reviewed_at = now()
    WHERE id = p_submission_id;

    -- Update Order
    UPDATE public.orders
    SET status = 'rejected',
        rejected_reason = trim(p_rejection_reason),
        updated_at = now()
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
        'مصنف نے آپ کی بھیجی گئی رسید کو مسترد کیا ہے۔ وجہ: ' || trim(p_rejection_reason),
        '/orders/' || v_order.order_number,
        false,
        now()
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
        jsonb_build_object('status', v_order.status),
        jsonb_build_object('status', 'rejected', 'reason', trim(p_rejection_reason)),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(uuid, uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 4: PRIVILEGES, GRANTS & MUTATION LOCKDOWNS
-- ------------------------------------------------------------------------------

-- 4.1 Anon has NO write privileges on any table in schema public
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- 4.2 Financial tables strictly closed to direct client writes
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_submissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.commission_invoices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sales_ledger FROM authenticated, anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.purchase_entitlements FROM authenticated, anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon, PUBLIC;

-- 4.3 Notifications: Readers/writers only update read status
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (is_read, read_at) ON public.notifications TO authenticated;
