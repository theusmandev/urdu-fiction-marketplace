-- ==============================================================================
-- Migration 0016: Reader Library, Secure Web Reader, Chapter Read Abuse Controls & Admin Orders
-- Step 4.2: Protected Reading Access, Library RPCs, Admin Order Inspection & Verification
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: PLATFORM SETTINGS (Chapter Reading Abuse Controls)
-- ------------------------------------------------------------------------------

-- 1.1 Add sliding-window abuse control columns to public.platform_settings
ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS max_chapter_reads_per_window integer NOT NULL DEFAULT 20;

ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS chapter_read_window_minutes integer NOT NULL DEFAULT 10;

-- 1.2 Add check constraints ensuring values are within sane operational bounds
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_max_chapter_reads_per_window'
    ) THEN
        ALTER TABLE public.platform_settings
        ADD CONSTRAINT chk_platform_settings_max_chapter_reads_per_window
        CHECK (max_chapter_reads_per_window >= 1 AND max_chapter_reads_per_window <= 1000);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_chapter_read_window_minutes'
    ) THEN
        ALTER TABLE public.platform_settings
        ADD CONSTRAINT chk_platform_settings_chapter_read_window_minutes
        CHECK (chapter_read_window_minutes >= 1 AND chapter_read_window_minutes <= 1440);
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 2: TABLE chapter_reads (Sliding Window Tracking for Entitled Reads)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chapter_reads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    novel_id uuid NOT NULL REFERENCES public.novels(id) ON DELETE CASCADE,
    read_at timestamptz NOT NULL DEFAULT now()
);

-- Index for sliding-window rate limit lookup
CREATE INDEX IF NOT EXISTS idx_chapter_reads_reader_read_at
    ON public.chapter_reads (reader_id, read_at DESC);

-- Index for deduplicating repeated reads of the same chapter in window
CREATE INDEX IF NOT EXISTS idx_chapter_reads_reader_chapter_read_at
    ON public.chapter_reads (reader_id, chapter_id, read_at DESC);

-- Strict RLS: No direct client access allowed from anon or authenticated users
ALTER TABLE public.chapter_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chapter_reads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chapter_reads TO service_role;


-- ------------------------------------------------------------------------------
-- SECTION 3: RPC update_platform_settings (Overloaded to include new settings)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text);

CREATE OR REPLACE FUNCTION public.update_platform_settings(
    p_default_commission_rate numeric,
    p_default_unpaid_commission_limit numeric,
    p_dispute_window_days integer,
    p_min_novel_price_pkr integer,
    p_max_novel_price_pkr numeric,
    p_support_email text,
    p_max_orders_per_hour integer DEFAULT 5,
    p_max_chapter_reads_per_window integer DEFAULT 20,
    p_chapter_read_window_minutes integer DEFAULT 10
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

    IF p_max_orders_per_hour < 1 OR p_max_orders_per_hour > 100 THEN
        RAISE EXCEPTION 'Max orders per hour must be between 1 and 100. Provided: %', p_max_orders_per_hour;
    END IF;

    IF p_max_chapter_reads_per_window < 1 OR p_max_chapter_reads_per_window > 1000 THEN
        RAISE EXCEPTION 'Max chapter reads per window must be between 1 and 1000. Provided: %', p_max_chapter_reads_per_window;
    END IF;

    IF p_chapter_read_window_minutes < 1 OR p_chapter_read_window_minutes > 1440 THEN
        RAISE EXCEPTION 'Chapter read window minutes must be between 1 and 1440. Provided: %', p_chapter_read_window_minutes;
    END IF;

    SELECT * INTO v_old FROM public.platform_settings WHERE id = 1;

    UPDATE public.platform_settings
    SET default_commission_rate = p_default_commission_rate,
        default_unpaid_commission_limit = p_default_unpaid_commission_limit,
        dispute_window_days = p_dispute_window_days,
        min_novel_price_pkr = p_min_novel_price_pkr,
        max_novel_price_pkr = p_max_novel_price_pkr,
        support_email = trim(p_support_email),
        max_orders_per_hour = p_max_orders_per_hour,
        max_chapter_reads_per_window = p_max_chapter_reads_per_window,
        chapter_read_window_minutes = p_chapter_read_window_minutes,
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
            'support_email', v_old.support_email,
            'max_orders_per_hour', v_old.max_orders_per_hour,
            'max_chapter_reads_per_window', v_old.max_chapter_reads_per_window,
            'chapter_read_window_minutes', v_old.chapter_read_window_minutes
        ),
        pg_catalog.jsonb_build_object(
            'default_commission_rate', p_default_commission_rate,
            'default_unpaid_commission_limit', p_default_unpaid_commission_limit,
            'dispute_window_days', p_dispute_window_days,
            'min_novel_price_pkr', p_min_novel_price_pkr,
            'max_novel_price_pkr', p_max_novel_price_pkr,
            'support_email', p_support_email,
            'max_orders_per_hour', p_max_orders_per_hour,
            'max_chapter_reads_per_window', p_max_chapter_reads_per_window,
            'chapter_read_window_minutes', p_chapter_read_window_minutes
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 4: RPC get_chapter_for_reader(p_novel_slug text, p_chapter_number int)
-- ------------------------------------------------------------------------------
-- Authoritative server-gated chapter delivery.
-- Returns chapter text, navigation links, and dynamic watermark code only if authorized.
-- In EVERY unauthorized case, raises generic 'Chapter not found' to prevent information leakage.
-- Enforces sliding-window rate limit on 'entitled' reads.
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
        -- Reader access rules:
        -- Rule A: Chapter must be published (unpublished chapters strictly hidden from buyers)
        IF NOT coalesce(v_chapter.is_published, false) THEN
            RAISE EXCEPTION 'Chapter not found';
        END IF;

        -- Rule B: Check for active non-revoked purchase entitlement
        SELECT EXISTS (
            SELECT 1 FROM public.purchase_entitlements
            WHERE reader_id = v_caller_id
              AND novel_id = v_novel.id
              AND is_revoked = false
        ) INTO v_has_entitlement;

        IF v_has_entitlement THEN
            v_access_reason := 'entitled';
        ELSIF coalesce(v_chapter.is_free_preview, false) AND v_novel.status = 'published' THEN
            v_access_reason := 'free_preview';
        ELSE
            -- Access denied: Raise generic 'Chapter not found'
            RAISE EXCEPTION 'Chapter not found';
        END IF;
    END IF;

    -- If caller is 'entitled' (not owner, admin, or free preview), enforce sliding-window abuse limit
    IF v_access_reason = 'entitled' THEN
        -- Resolve watermark code (order_number from entitlement's order)
        SELECT o.order_number INTO v_order_number
        FROM public.purchase_entitlements pe
        JOIN public.orders o ON o.id = pe.order_id
        WHERE pe.reader_id = v_caller_id
          AND pe.novel_id = v_novel.id
          AND pe.is_revoked = false
        ORDER BY pe.granted_at DESC
        LIMIT 1;

        v_watermark_code := coalesce(v_order_number, 'ENTITLED');

        -- Read sliding-window parameters from platform_settings
        SELECT coalesce(max_chapter_reads_per_window, 20), coalesce(chapter_read_window_minutes, 10)
        INTO v_max_reads, v_window_mins
        FROM public.platform_settings
        WHERE id = 1;

        v_window_start := pg_catalog.now() - (v_window_mins || ' minutes')::interval;

        -- Check if this reader already opened this chapter in the current window
        SELECT EXISTS (
            SELECT 1 FROM public.chapter_reads
            WHERE reader_id = v_caller_id
              AND chapter_id = v_chapter.id
              AND read_at >= v_window_start
        ) INTO v_already_read;

        IF NOT v_already_read THEN
            -- Count distinct chapters opened by this reader in the window
            SELECT count(DISTINCT chapter_id) INTO v_distinct_reads
            FROM public.chapter_reads
            WHERE reader_id = v_caller_id
              AND read_at >= v_window_start;

            IF v_distinct_reads >= v_max_reads THEN
                RAISE EXCEPTION 'Too many chapters opened, please slow down';
            END IF;

            -- Record successful read in chapter_reads
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
    ELSE
        v_watermark_code := NULL;
    END IF;

    -- Calculate navigation numbers (published chapters only)
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

    -- Count total published chapters
    SELECT count(*) INTO v_total_published_chapters
    FROM public.chapters
    WHERE novel_id = v_novel.id
      AND is_published = true;

    -- Fetch reader's last saved progress for this novel
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
        'chapter_title_english', v_chapter.title_english,
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
-- SECTION 5: RPC upsert_reading_progress(p_novel_id uuid, p_chapter_number int)
-- ------------------------------------------------------------------------------
-- Saves reader's latest opened chapter. Authorized only if caller currently has access
-- (entitled, author, admin, or free preview).
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_reading_progress(
    p_novel_id uuid,
    p_chapter_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_has_access boolean := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_chapter_number < 1 THEN
        RAISE EXCEPTION 'Invalid chapter number: %', p_chapter_number;
    END IF;

    -- Check caller reading authorization on this novel
    IF public.is_admin() THEN
        v_has_access := true;
    ELSIF EXISTS (SELECT 1 FROM public.novels WHERE id = p_novel_id AND writer_id = v_caller_id) THEN
        v_has_access := true;
    ELSIF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND is_revoked = false
    ) THEN
        v_has_access := true;
    ELSIF EXISTS (
        SELECT 1 FROM public.chapters c
        JOIN public.novels n ON n.id = c.novel_id
        WHERE n.id = p_novel_id
          AND c.chapter_number = p_chapter_number
          AND c.is_free_preview = true
          AND c.is_published = true
          AND n.status = 'published'
    ) THEN
        v_has_access := true;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied: You do not have permission to track progress on this novel.';
    END IF;

    INSERT INTO public.reader_progress (
        reader_id,
        novel_id,
        last_chapter_number,
        updated_at
    ) VALUES (
        v_caller_id,
        p_novel_id,
        p_chapter_number,
        pg_catalog.now()
    )
    ON CONFLICT (reader_id, novel_id)
    DO UPDATE SET
        last_chapter_number = p_chapter_number,
        updated_at = pg_catalog.now();

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'novel_id', p_novel_id,
        'last_chapter_number', p_chapter_number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_reading_progress(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_reading_progress(uuid, integer) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 6: RPC get_my_library()
-- ------------------------------------------------------------------------------
-- Returns caller's active novel entitlements with reading progress, cover, pen name.
-- Even if a novel is subsequently suspended or unpublished, buyers maintain read access;
-- such novels are returned with is_temporarily_unavailable = true.
-- Never returns rows for other users.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_library()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_library jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'novel_id', n.id,
                'novel_slug', n.slug,
                'title_urdu', n.title_urdu,
                'title_english', n.title_english,
                'cover_url', n.cover_url,
                'writer_pen_name', coalesce(wp.pen_name_english, wp.pen_name_urdu, 'Urdu Author'),
                'writer_pen_name_urdu', wp.pen_name_urdu,
                'writer_pen_name_english', wp.pen_name_english,
                'writer_username', p_writer.username,
                'total_chapters', coalesce((
                    SELECT count(*)::int
                    FROM public.chapters c
                    WHERE c.novel_id = n.id AND c.is_published = true
                ), 0),
                'last_chapter_number', rp.last_chapter_number,
                'order_number', o.order_number,
                'granted_at', pe.granted_at,
                'is_temporarily_unavailable', (n.status != 'published')
            )
            ORDER BY pe.granted_at DESC
        ),
        '[]'::jsonb
    ) INTO v_library
    FROM public.purchase_entitlements pe
    JOIN public.novels n ON n.id = pe.novel_id
    JOIN public.writer_profiles wp ON wp.id = n.writer_id
    LEFT JOIN public.profiles p_writer ON p_writer.id = wp.id
    LEFT JOIN public.orders o ON o.id = pe.order_id
    LEFT JOIN public.reader_progress rp ON rp.reader_id = v_caller_id AND rp.novel_id = n.id
    WHERE pe.reader_id = v_caller_id
      AND pe.is_revoked = false;

    RETURN v_library;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_library() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_library() TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 7: ADMIN ORDER INSPECTION RPCS
-- ------------------------------------------------------------------------------

-- 7.1 admin_list_orders(p_status, p_search, p_only_stuck, p_limit, p_offset)
-- Admin-only inspection queue. Exposes reader display name and username ONLY (never email).
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
    v_clean_search := trim(coalesce(p_search, ''));

    -- Count matching rows
    SELECT count(*) INTO v_total_count
    FROM public.orders o
    JOIN public.novels n ON n.id = o.novel_id
    JOIN public.profiles p_reader ON p_reader.id = o.reader_id
    WHERE (p_status IS NULL OR p_status = '' OR o.status = p_status)
      AND (
          NOT p_only_stuck OR (
              o.status = 'payment_submitted' AND o.created_at < v_twenty_four_hours_ago
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
                'is_stuck', (o.status = 'payment_submitted' AND o.created_at < v_twenty_four_hours_ago),
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
                    WHERE ps.order_id = o.id AND ps.is_duplicate_tid = true
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
        WHERE (p_status IS NULL OR p_status = '' OR o_inner.status = p_status)
          AND (
              NOT p_only_stuck OR (
                  o_inner.status = 'payment_submitted' AND o_inner.created_at < v_twenty_four_hours_ago
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

    RETURN pg_catalog.jsonb_build_object(
        'orders', v_orders,
        'total_count', coalesce(v_total_count, 0),
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_orders(text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text, text, boolean, integer, integer) TO authenticated;


-- 7.2 admin_get_order(p_order_id uuid)
-- Returns comprehensive order audit data: order info, submissions, disputes, ledger, entitlement.
-- Reader emails are STRICTLY excluded (privacy protection).
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
    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', ps.id,
                'transaction_reference_tid', ps.transaction_reference_tid,
                'paid_amount_claimed_pkr', ps.paid_amount_claimed_pkr,
                'sender_account_name', ps.sender_account_name,
                'reader_note', ps.reader_note,
                'screenshot_path', ps.screenshot_path,
                'is_duplicate_tid', ps.is_duplicate_tid,
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
    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', sl.id,
                'entry_type', sl.entry_type,
                'gross_amount_pkr', sl.gross_amount_pkr,
                'platform_commission_pkr', sl.platform_commission_pkr,
                'writer_payout_pkr', sl.writer_payout_pkr,
                'is_reconciled', sl.is_reconciled,
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
        'revoked_at', pe.revoked_at,
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
            'cancelled_at', v_order.cancelled_at,
            'cancellation_reason', v_order.cancellation_reason,
            'is_stuck', (v_order.status = 'payment_submitted' AND v_order.created_at < v_twenty_four_hours_ago)
        ),
        'reader', pg_catalog.jsonb_build_object(
            'id', v_reader.id,
            'display_name', coalesce(v_reader.full_name, v_reader.username, 'Anonymous Reader'),
            'username', v_reader.username
        ),
        'writer', pg_catalog.jsonb_build_object(
            'id', v_writer.id,
            'pen_name', coalesce(v_writer.pen_name_english, v_writer.pen_name_urdu, 'Urdu Author'),
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
