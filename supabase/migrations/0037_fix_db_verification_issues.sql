-- ==============================================================================
-- UNB Premium — Migration 0037: Fix Database Verification Issues
-- Description:
--   1. Drop redundant/stale overloads of update_platform_settings so only the
--      single canonical 21-parameter signature exists (resolves Check ID 44).
--   2. Update get_checkout_options(uuid) to reference valid columns on
--      writer_payment_methods (account_number_or_iban, instructions_note) and
--      compute masked_account / account_number_tail dynamically without
--      referencing non-existent columns (resolves Check ID 156 / plpgsql_check).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: DROP REDUNDANT OVERLOADS OF update_platform_settings
-- ------------------------------------------------------------------------------

-- Drop all historical obsolete signatures of update_platform_settings:
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, numeric, text);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, integer, text);
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer);
-- 15-parameter overload from migration 0020:
DROP FUNCTION IF EXISTS public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer);

-- Ensure the single canonical 21-parameter signature is authoritative, secure, and granted
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
    p_tip_confirm_reminder_hours integer DEFAULT NULL
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

REVOKE ALL ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer, boolean, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer, boolean, integer, integer, integer, integer, integer) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 2: CANONICAL get_checkout_options(uuid) WITH VALID COLUMNS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_checkout_options(p_novel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
    v_writer record;
    v_methods jsonb;
    v_open_order_number text;
    v_pen_name text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to initiate checkout.';
    END IF;

    -- Fetch novel
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL OR v_novel.status::text != 'published' THEN
        RAISE EXCEPTION 'Novel not found or is currently not available for purchase.';
    END IF;

    -- Check if caller is author of this novel
    IF v_novel.writer_id = v_caller_id THEN
        RAISE EXCEPTION 'Authors cannot purchase their own novels.';
    END IF;

    -- Check if reader already owns active entitlement
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
        RAISE EXCEPTION 'Orders for this author are currently paused due to platform fee limits.';
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

    -- Collect active payment methods with strictly masked accounts.
    -- References real existing columns of public.writer_payment_methods:
    -- (id, method_type, bank_name, account_title, account_number_or_iban, instructions_note, created_at)
    SELECT coalesce(
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
                'account_number_tail', CASE
                    WHEN pg_catalog.length(wpm.account_number_or_iban) <= 4 THEN wpm.account_number_or_iban
                    ELSE pg_catalog.substr(wpm.account_number_or_iban, pg_catalog.length(wpm.account_number_or_iban) - 3)
                END,
                'instructions_note', wpm.instructions_note,
                'instructions', wpm.instructions_note
            )
            ORDER BY wpm.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_methods
    FROM public.writer_payment_methods wpm
    WHERE wpm.writer_id = v_novel.writer_id
      AND wpm.is_active = true;

    RETURN pg_catalog.jsonb_build_object(
        'novel', pg_catalog.jsonb_build_object(
            'id', v_novel.id,
            'title_english', v_novel.title_english,
            'title_urdu', v_novel.title_urdu,
            'slug', v_novel.slug,
            'price_pkr', v_novel.price_pkr,
            'cover_image_url', v_novel.cover_url,
            'cover_url', v_novel.cover_url,
            'writer_id', v_novel.writer_id,
            'writer_pen_name', v_pen_name
        ),
        'novel_id', v_novel.id,
        'title_english', v_novel.title_english,
        'title_urdu', v_novel.title_urdu,
        'price_pkr', v_novel.price_pkr,
        'cover_image_url', v_novel.cover_url,
        'cover_url', v_novel.cover_url,
        'writer_id', v_novel.writer_id,
        'writer_pen_name', v_pen_name,
        'has_open_order', (v_open_order_number IS NOT NULL),
        'open_order_number', v_open_order_number,
        'existing_order_number', v_open_order_number,
        'payment_methods', v_methods
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_options(uuid) TO authenticated;

