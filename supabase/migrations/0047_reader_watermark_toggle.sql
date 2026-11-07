-- Migration: 0047_reader_watermark_toggle.sql
-- Description: Anti-Piracy Watermark Global Admin Toggle & Reader Isolation
--
-- 1. Adds watermark_enabled column to public.platform_settings (defaults to true).
-- 2. Updates public.get_chapter_for_reader() to respect platform_settings.watermark_enabled.
--    When watermark_enabled is false, returns watermark_code as NULL.
-- 3. Creates public.set_watermark_enabled(boolean) RPC for instant admin toggle with audit logging.
-- 4. Updates public.update_platform_settings() RPC to accept p_watermark_enabled.

-- ------------------------------------------------------------------------------
-- 1. SCHEMA MIGRATION: platform_settings.watermark_enabled
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'platform_settings'
          AND column_name = 'watermark_enabled'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD COLUMN watermark_enabled boolean NOT NULL DEFAULT true;
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 2. RPC: get_chapter_for_reader(text, integer) WITH WATERMARK TOGGLE CHECK
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
            v_access_reason := 'free_preview';
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


-- ------------------------------------------------------------------------------
-- 3. RPC: set_watermark_enabled(boolean) FOR INSTANT ADMIN TOGGLE
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_watermark_enabled(
    p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid := auth.uid();
    v_is_admin boolean;
    v_old_settings jsonb;
    v_new_settings jsonb;
BEGIN
    SELECT public.is_admin() INTO v_is_admin;
    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Access denied: Administrator privileges required'
            USING ERRCODE = '42501';
    END IF;

    IF p_enabled IS NULL THEN
        RAISE EXCEPTION 'watermark_enabled cannot be null';
    END IF;

    SELECT pg_catalog.to_jsonb(s) INTO v_old_settings
    FROM public.platform_settings s
    WHERE s.id = 1;

    UPDATE public.platform_settings
    SET watermark_enabled = p_enabled,
        updated_at = pg_catalog.now()
    WHERE id = 1;

    SELECT pg_catalog.to_jsonb(s) INTO v_new_settings
    FROM public.platform_settings s
    WHERE id = 1;

    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, previous_state, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'update_platform_settings.watermark_enabled', 'platform_settings', '1',
        v_old_settings, v_new_settings, pg_catalog.now()
    );

    RETURN v_new_settings;
END;
$$;

REVOKE ALL ON FUNCTION public.set_watermark_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_watermark_enabled(boolean) TO authenticated;


-- ------------------------------------------------------------------------------
-- 4. RPC: update_platform_settings WITH p_watermark_enabled
-- ------------------------------------------------------------------------------

-- Drop the prior 21-parameter signature from migration 0037
DROP FUNCTION IF EXISTS public.update_platform_settings(
    numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer, boolean, integer, integer, integer, integer, integer
);

CREATE OR REPLACE FUNCTION public.update_platform_settings(
    p_default_commission_rate numeric DEFAULT NULL,
    p_default_unpaid_commission_limit numeric DEFAULT NULL,
    p_min_novel_price_pkr integer DEFAULT NULL,
    p_max_novel_price_pkr numeric DEFAULT NULL,
    p_dispute_window_days integer DEFAULT NULL,
    p_max_orders_per_hour integer DEFAULT NULL,
    p_max_chapter_reads_per_window integer DEFAULT NULL,
    p_chapter_read_window_minutes integer DEFAULT NULL,
    p_invoice_due_days integer DEFAULT NULL,
    p_overdue_grace_days integer DEFAULT NULL,
    p_min_dispute_wait_hours integer DEFAULT NULL,
    p_verification_reminder_hours integer DEFAULT NULL,
    p_support_email text DEFAULT NULL,
    p_unpaid_commission_threshold_pkr numeric DEFAULT NULL,
    p_payment_verification_window_hours integer DEFAULT NULL,
    p_tips_enabled boolean DEFAULT NULL,
    p_tip_min_pkr integer DEFAULT NULL,
    p_tip_max_pkr integer DEFAULT NULL,
    p_max_tips_per_hour integer DEFAULT NULL,
    p_tip_daily_cap_pkr_per_reader integer DEFAULT NULL,
    p_tip_confirm_reminder_hours integer DEFAULT NULL,
    p_watermark_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_old_settings jsonb;
    v_new_settings jsonb;
    v_effective_unpaid_limit numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can update platform settings.';
    END IF;

    v_effective_unpaid_limit := coalesce(p_default_unpaid_commission_limit, p_unpaid_commission_threshold_pkr);

    SELECT pg_catalog.to_jsonb(s) INTO v_old_settings
    FROM public.platform_settings s
    WHERE id = 1;

    -- Validations
    IF p_default_commission_rate IS NOT NULL AND (p_default_commission_rate < 0 OR p_default_commission_rate > 100) THEN
        RAISE EXCEPTION 'Platform fee rate must be between 0 and 100.';
    END IF;
    IF v_effective_unpaid_limit IS NOT NULL AND v_effective_unpaid_limit < 0 THEN
        RAISE EXCEPTION 'Default unpaid platform fee limit must be non-negative.';
    END IF;
    IF p_min_novel_price_pkr IS NOT NULL AND (p_min_novel_price_pkr < 50 OR p_min_novel_price_pkr > 5000) THEN
        RAISE EXCEPTION 'Minimum novel price must be between 50 and 5000 PKR.';
    END IF;
    IF p_max_novel_price_pkr IS NOT NULL AND (p_max_novel_price_pkr < 50 OR p_max_novel_price_pkr > 5000) THEN
        RAISE EXCEPTION 'Maximum novel price must be between 50 and 5000 PKR.';
    END IF;
    IF p_dispute_window_days IS NOT NULL AND (p_dispute_window_days < 1 OR p_dispute_window_days > 90) THEN
        RAISE EXCEPTION 'Dispute window days must be between 1 and 90.';
    END IF;
    IF p_max_orders_per_hour IS NOT NULL AND (p_max_orders_per_hour < 1 OR p_max_orders_per_hour > 100) THEN
        RAISE EXCEPTION 'Max orders per hour must be between 1 and 100.';
    END IF;
    IF p_max_chapter_reads_per_window IS NOT NULL AND (p_max_chapter_reads_per_window < 1 OR p_max_chapter_reads_per_window > 1000) THEN
        RAISE EXCEPTION 'Max chapter reads per window must be between 1 and 1000.';
    END IF;
    IF p_chapter_read_window_minutes IS NOT NULL AND (p_chapter_read_window_minutes < 1 OR p_chapter_read_window_minutes > 1440) THEN
        RAISE EXCEPTION 'Chapter read window minutes must be between 1 and 1440.';
    END IF;
    IF p_invoice_due_days IS NOT NULL AND (p_invoice_due_days < 1 OR p_invoice_due_days > 90) THEN
        RAISE EXCEPTION 'Invoice due days must be between 1 and 90.';
    END IF;
    IF p_overdue_grace_days IS NOT NULL AND (p_overdue_grace_days < 0 OR p_overdue_grace_days > 60) THEN
        RAISE EXCEPTION 'Overdue grace days must be between 0 and 60.';
    END IF;
    IF p_min_dispute_wait_hours IS NOT NULL AND (p_min_dispute_wait_hours < 0 OR p_min_dispute_wait_hours > 168) THEN
        RAISE EXCEPTION 'Min dispute wait hours must be between 0 and 168.';
    END IF;
    IF p_verification_reminder_hours IS NOT NULL AND (p_verification_reminder_hours < 1 OR p_verification_reminder_hours > 168) THEN
        RAISE EXCEPTION 'Verification reminder hours must be between 1 and 168.';
    END IF;

    -- Tip controls validation
    IF p_tip_min_pkr IS NOT NULL AND (p_tip_min_pkr < 1 OR p_tip_min_pkr > 5000) THEN
        RAISE EXCEPTION 'Minimum tip amount must be between 1 and 5,000 PKR.';
    END IF;
    IF p_tip_max_pkr IS NOT NULL AND (p_tip_max_pkr < 1 OR p_tip_max_pkr > 50000) THEN
        RAISE EXCEPTION 'Maximum tip amount must be between 1 and 50,000 PKR.';
    END IF;
    IF p_max_tips_per_hour IS NOT NULL AND (p_max_tips_per_hour < 1 OR p_max_tips_per_hour > 100) THEN
        RAISE EXCEPTION 'Max tips per hour must be between 1 and 100.';
    END IF;
    IF p_tip_daily_cap_pkr_per_reader IS NOT NULL AND p_tip_daily_cap_pkr_per_reader < 100 THEN
        RAISE EXCEPTION 'Daily tip cap must be at least 100 PKR.';
    END IF;
    IF p_tip_confirm_reminder_hours IS NOT NULL AND (p_tip_confirm_reminder_hours < 1 OR p_tip_confirm_reminder_hours > 168) THEN
        RAISE EXCEPTION 'Tip confirmation reminder hours must be between 1 and 168.';
    END IF;

    UPDATE public.platform_settings
    SET default_commission_rate = coalesce(p_default_commission_rate, default_commission_rate),
        default_unpaid_commission_limit = coalesce(v_effective_unpaid_limit, default_unpaid_commission_limit),
        min_novel_price_pkr = coalesce(p_min_novel_price_pkr, min_novel_price_pkr),
        max_novel_price_pkr = coalesce(p_max_novel_price_pkr, max_novel_price_pkr),
        dispute_window_days = coalesce(p_dispute_window_days, dispute_window_days),
        max_orders_per_hour = coalesce(p_max_orders_per_hour, max_orders_per_hour),
        max_chapter_reads_per_window = coalesce(p_max_chapter_reads_per_window, max_chapter_reads_per_window),
        chapter_read_window_minutes = coalesce(p_chapter_read_window_minutes, chapter_read_window_minutes),
        invoice_due_days = coalesce(p_invoice_due_days, invoice_due_days),
        overdue_grace_days = coalesce(p_overdue_grace_days, overdue_grace_days),
        min_dispute_wait_hours = coalesce(p_min_dispute_wait_hours, min_dispute_wait_hours),
        verification_reminder_hours = coalesce(p_verification_reminder_hours, verification_reminder_hours),
        support_email = coalesce(nullif(pg_catalog.btrim(p_support_email), ''), support_email),
        tips_enabled = coalesce(p_tips_enabled, tips_enabled),
        tip_min_pkr = coalesce(p_tip_min_pkr, tip_min_pkr),
        tip_max_pkr = coalesce(p_tip_max_pkr, tip_max_pkr),
        max_tips_per_hour = coalesce(p_max_tips_per_hour, max_tips_per_hour),
        tip_daily_cap_pkr_per_reader = coalesce(p_tip_daily_cap_pkr_per_reader, tip_daily_cap_pkr_per_reader),
        tip_confirm_reminder_hours = coalesce(p_tip_confirm_reminder_hours, tip_confirm_reminder_hours),
        watermark_enabled = coalesce(p_watermark_enabled, watermark_enabled),
        updated_at = pg_catalog.now()
    WHERE id = 1;

    SELECT pg_catalog.to_jsonb(s) INTO v_new_settings
    FROM public.platform_settings s
    WHERE id = 1;

    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, previous_state, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'update_platform_settings', 'platform_settings', '1',
        v_old_settings, v_new_settings, pg_catalog.now()
    );

    RETURN v_new_settings;
END;
$$;

REVOKE ALL ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer, boolean, integer, integer, integer, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer, boolean, integer, integer, integer, integer, integer, boolean) TO authenticated;

