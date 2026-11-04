-- ==============================================================================
-- UNB Premium — Migration 0044: Fix Analytics & Retention Schema Column Names
-- Description: Forward-only hotfix migration that updates:
--              1. public.get_admin_dashboard_analytics:
--                 - Corrects writer_profiles.total_unpaid_commission to current_unpaid_commission
--                 - Corrects commission_payment_reports.proof_url to screenshot_path
--              2. public.get_expired_payment_proof_paths:
--                 - Corrects commission_payment_reports.proof_url to screenshot_path
--              3. public.mark_payment_proofs_pruned:
--                 - Corrects commission_payment_reports.proof_url to screenshot_path
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RETENTION STORAGE HELPERS (proof_url -> screenshot_path fix)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_expired_payment_proof_paths(p_days integer)
RETURNS TABLE(proof_path text, source_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.role() != 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted access.';
    END IF;

    IF p_days <= 0 THEN
        RETURN; -- Unlimited / Never delete
    END IF;

    -- 1. Order payment submissions where order is verified, rejected, or cancelled older than p_days
    RETURN QUERY
    SELECT ps.screenshot_url, 'order_payment'::text
    FROM public.payment_submissions ps
    JOIN public.orders o ON o.id = ps.order_id
    WHERE ps.screenshot_url IS NOT NULL
      AND ps.screenshot_url NOT LIKE '[PRUNED%'
      AND o.status IN ('verified', 'rejected', 'cancelled')
      AND coalesce(o.verified_at, o.updated_at, ps.submitted_at) < pg_catalog.now() - (p_days || ' days')::interval
    LIMIT 100;

    -- 2. Settled platform fee payment reports
    RETURN QUERY
    SELECT cpr.screenshot_path, 'fee_settlement'::text
    FROM public.commission_payment_reports cpr
    WHERE cpr.screenshot_path IS NOT NULL
      AND cpr.screenshot_path NOT LIKE '[PRUNED%'
      AND cpr.status IN ('confirmed', 'rejected')
      AND cpr.reviewed_at < pg_catalog.now() - (p_days || ' days')::interval
    LIMIT 100;

    -- 3. Settled reader tips older than p_days
    RETURN QUERY
    SELECT t.screenshot_path, 'tip_payment'::text
    FROM public.tips t
    WHERE t.screenshot_path IS NOT NULL
      AND t.screenshot_path NOT LIKE '[PRUNED%'
      AND t.status IN ('confirmed', 'not_received', 'cancelled')
      AND coalesce(t.confirmed_at, t.not_received_at, t.updated_at, t.created_at) < pg_catalog.now() - (p_days || ' days')::interval
    LIMIT 100;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_expired_payment_proof_paths(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expired_payment_proof_paths(integer) TO authenticated, service_role;

-- Marks database records as pruned so storage files are not repeatedly processed
CREATE OR REPLACE FUNCTION public.mark_payment_proofs_pruned(p_paths text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF auth.role() != 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted access.';
    END IF;

    IF p_paths IS NULL OR pg_catalog.cardinality(p_paths) = 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.payment_submissions
    SET screenshot_url = '[PRUNED_BY_RETENTION_POLICY]'
    WHERE screenshot_url = ANY(p_paths);

    UPDATE public.commission_payment_reports
    SET screenshot_path = '[PRUNED_BY_RETENTION_POLICY]'
    WHERE screenshot_path = ANY(p_paths);

    UPDATE public.tips
    SET screenshot_path = '[PRUNED_BY_RETENTION_POLICY]'
    WHERE screenshot_path = ANY(p_paths);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_payment_proofs_pruned(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payment_proofs_pruned(text[]) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. ADMIN DASHBOARD ANALYTICS ENGINE (Column corrections)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_analytics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_days integer;
    v_is_all_time boolean;
    v_start_time timestamptz;
    v_end_time timestamptz;
    v_prev_start_time timestamptz;
    v_prev_end_time timestamptz;

    -- Financial KPIs
    v_gmv_pkr numeric(12,2) := 0.00;
    v_prev_gmv_pkr numeric(12,2) := 0.00;
    v_verified_orders_count integer := 0;
    v_prev_verified_orders_count integer := 0;
    v_platform_fee_accrued_pkr numeric(12,2) := 0.00;
    v_platform_fee_settled_pkr numeric(12,2) := 0.00;
    v_unpaid_fee_exposure_pkr numeric(12,2) := 0.00;
    v_writer_net_earnings_pkr numeric(12,2) := 0.00;
    v_avg_order_value_pkr numeric(12,2) := 0.00;
    v_verified_tips_pkr numeric(12,2) := 0.00;
    v_verified_tips_count integer := 0;
    v_total_submitted_orders integer := 0;
    v_conversion_rate_pct numeric(5,2) := 0.00;

    -- Order Funnel
    v_funnel_verified integer := 0;
    v_funnel_pending_verification integer := 0;
    v_funnel_pending_payment integer := 0;
    v_funnel_rejected integer := 0;
    v_funnel_cancelled integer := 0;
    v_funnel_disputed integer := 0;
    v_funnel_refunded_adjusted integer := 0;
    v_funnel_total integer := 0;

    -- Decision Radar
    v_radar_stale_orders integer := 0;
    v_radar_open_disputes integer := 0;
    v_radar_pending_refunds integer := 0;
    v_radar_pending_writers integer := 0;
    v_radar_pending_novels integer := 0;
    v_radar_overdue_invoices integer := 0;
    v_radar_failed_emails integer := 0;

    -- Infrastructure & Quota Health
    v_db_size_bytes bigint := 0;
    v_count_orders bigint := 0;
    v_count_chapters bigint := 0;
    v_count_audit_logs bigint := 0;
    v_count_chapter_reads bigint := 0;
    v_count_email_outbox bigint := 0;
    v_count_notifications bigint := 0;
    v_count_active_proofs bigint := 0;
    v_count_pruned_proofs bigint := 0;

    -- Output JSON Aggregates
    v_daily_series jsonb := '[]'::jsonb;
    v_genre_breakdown jsonb := '[]'::jsonb;
    v_top_novels jsonb := '[]'::jsonb;
    v_top_writers jsonb := '[]'::jsonb;

    v_kpis jsonb;
    v_order_funnel jsonb;
    v_decision_radar jsonb;
    v_infrastructure jsonb;
    v_timeframe jsonb;
BEGIN
    -- 1. Enforce strict administrator authorization
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrator privileges required.';
    END IF;

    -- 2. Normalize days parameter and period boundaries
    IF p_days IS NULL OR p_days <= 0 THEN
        v_is_all_time := true;
        v_days := 3650;
        v_start_time := pg_catalog.now() - interval '3650 days';
        v_end_time := pg_catalog.now();
        v_prev_start_time := v_start_time;
        v_prev_end_time := v_start_time;
    ELSE
        v_is_all_time := false;
        v_days := p_days;
        IF v_days > 3650 THEN
            v_days := 3650;
        END IF;
        v_end_time := pg_catalog.now();
        v_start_time := v_end_time - (v_days || ' days')::interval;
        v_prev_end_time := v_start_time;
        v_prev_start_time := v_start_time - (v_days || ' days')::interval;
    END IF;

    -- 3. Financial KPIs: Current Window Gross Sales, Fees, and Counts
    SELECT
        coalesce(pg_catalog.sum(gross_amount_pkr), 0.00),
        coalesce(pg_catalog.count(*), 0),
        coalesce(pg_catalog.sum(platform_commission_pkr), 0.00),
        coalesce(pg_catalog.sum(writer_net_pkr), 0.00)
    INTO
        v_gmv_pkr,
        v_verified_orders_count,
        v_platform_fee_accrued_pkr,
        v_writer_net_earnings_pkr
    FROM public.sales_ledger
    WHERE entry_type = 'sale_verified'
      AND created_at >= v_start_time
      AND created_at < v_end_time;

    -- Period-over-period previous window comparison
    IF NOT v_is_all_time THEN
        SELECT
            coalesce(pg_catalog.sum(gross_amount_pkr), 0.00),
            coalesce(pg_catalog.count(*), 0)
        INTO
            v_prev_gmv_pkr,
            v_prev_verified_orders_count
        FROM public.sales_ledger
        WHERE entry_type = 'sale_verified'
          AND created_at >= v_prev_start_time
          AND created_at < v_prev_end_time;
    ELSE
        v_prev_gmv_pkr := v_gmv_pkr;
        v_prev_verified_orders_count := v_verified_orders_count;
    END IF;

    -- Average order value (PKR)
    IF v_verified_orders_count > 0 THEN
        v_avg_order_value_pkr := pg_catalog.round(v_gmv_pkr / v_verified_orders_count, 2);
    ELSE
        v_avg_order_value_pkr := 0.00;
    END IF;

    -- Settled platform fee during the period
    SELECT coalesce(pg_catalog.sum(amount_pkr), 0.00)
    INTO v_platform_fee_settled_pkr
    FROM public.commission_payments
    WHERE created_at >= v_start_time
      AND created_at < v_end_time;

    -- Current unpaid platform fee exposure across all writers
    SELECT coalesce(pg_catalog.sum(current_unpaid_commission), 0.00)
    INTO v_unpaid_fee_exposure_pkr
    FROM public.writer_profiles;

    -- Verified tips during the period
    SELECT
        coalesce(pg_catalog.sum(amount_pkr), 0.00),
        coalesce(pg_catalog.count(*), 0)
    INTO
        v_verified_tips_pkr,
        v_verified_tips_count
    FROM public.tips
    WHERE status = 'confirmed'
      AND coalesce(confirmed_at, updated_at, created_at) >= v_start_time
      AND coalesce(confirmed_at, updated_at, created_at) < v_end_time;

    -- Order checkout-to-verification conversion rate
    SELECT coalesce(pg_catalog.count(*), 0)
    INTO v_total_submitted_orders
    FROM public.orders
    WHERE status != 'pending_payment'
      AND created_at >= v_start_time
      AND created_at < v_end_time;

    IF v_total_submitted_orders > 0 THEN
        v_conversion_rate_pct := pg_catalog.round((v_verified_orders_count::numeric / v_total_submitted_orders::numeric) * 100.0, 2);
    ELSE
        v_conversion_rate_pct := 0.00;
    END IF;

    -- 4. Order Funnel Breakdown in Selected Period
    SELECT
        coalesce(pg_catalog.count(*) FILTER (WHERE status = 'verified'), 0),
        coalesce(pg_catalog.count(*) FILTER (WHERE status = 'payment_submitted'), 0),
        coalesce(pg_catalog.count(*) FILTER (WHERE status = 'pending_payment'), 0),
        coalesce(pg_catalog.count(*) FILTER (WHERE status = 'rejected'), 0),
        coalesce(pg_catalog.count(*) FILTER (WHERE status = 'cancelled'), 0),
        coalesce(pg_catalog.count(*) FILTER (WHERE status = 'disputed'), 0),
        coalesce(pg_catalog.count(*) FILTER (WHERE status = 'refunded_adjusted'), 0),
        coalesce(pg_catalog.count(*), 0)
    INTO
        v_funnel_verified,
        v_funnel_pending_verification,
        v_funnel_pending_payment,
        v_funnel_rejected,
        v_funnel_cancelled,
        v_funnel_disputed,
        v_funnel_refunded_adjusted,
        v_funnel_total
    FROM public.orders
    WHERE created_at >= v_start_time
      AND created_at < v_end_time;

    -- 5. Time-Series Data (Daily for <= 90 days, Weekly for <= 365, Monthly for > 365)
    IF v_days <= 90 THEN
        SELECT coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'date', pg_catalog.to_char(series.day, 'YYYY-MM-DD'),
                'gmv_pkr', coalesce(d.gmv, 0.00),
                'platform_fee_pkr', coalesce(d.platform_fee, 0.00),
                'orders_count', coalesce(d.orders_cnt, 0)
            ) ORDER BY series.day ASC
        ), '[]'::jsonb)
        INTO v_daily_series
        FROM pg_catalog.generate_series(
            pg_catalog.date_trunc('day', v_start_time),
            pg_catalog.date_trunc('day', v_end_time),
            '1 day'::interval
        ) AS series(day)
        LEFT JOIN (
            SELECT
                pg_catalog.date_trunc('day', l.created_at) AS day_bucket,
                pg_catalog.sum(l.gross_amount_pkr) AS gmv,
                pg_catalog.sum(l.platform_commission_pkr) AS platform_fee,
                pg_catalog.count(*) AS orders_cnt
            FROM public.sales_ledger l
            WHERE l.entry_type = 'sale_verified'
              AND l.created_at >= v_start_time
              AND l.created_at <= v_end_time
            GROUP BY day_bucket
        ) d ON d.day_bucket = series.day;
    ELSIF v_days <= 365 THEN
        SELECT coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'date', pg_catalog.to_char(series.week, 'YYYY-MM-DD'),
                'gmv_pkr', coalesce(d.gmv, 0.00),
                'platform_fee_pkr', coalesce(d.platform_fee, 0.00),
                'orders_count', coalesce(d.orders_cnt, 0)
            ) ORDER BY series.week ASC
        ), '[]'::jsonb)
        INTO v_daily_series
        FROM pg_catalog.generate_series(
            pg_catalog.date_trunc('week', v_start_time),
            pg_catalog.date_trunc('week', v_end_time),
            '1 week'::interval
        ) AS series(week)
        LEFT JOIN (
            SELECT
                pg_catalog.date_trunc('week', l.created_at) AS week_bucket,
                pg_catalog.sum(l.gross_amount_pkr) AS gmv,
                pg_catalog.sum(l.platform_commission_pkr) AS platform_fee,
                pg_catalog.count(*) AS orders_cnt
            FROM public.sales_ledger l
            WHERE l.entry_type = 'sale_verified'
              AND l.created_at >= v_start_time
              AND l.created_at <= v_end_time
            GROUP BY week_bucket
        ) d ON d.week_bucket = series.week;
    ELSE
        SELECT coalesce(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'date', pg_catalog.to_char(series.month, 'YYYY-MM-DD'),
                'gmv_pkr', coalesce(d.gmv, 0.00),
                'platform_fee_pkr', coalesce(d.platform_fee, 0.00),
                'orders_count', coalesce(d.orders_cnt, 0)
            ) ORDER BY series.month ASC
        ), '[]'::jsonb)
        INTO v_daily_series
        FROM pg_catalog.generate_series(
            pg_catalog.date_trunc('month', v_start_time),
            pg_catalog.date_trunc('month', v_end_time),
            '1 month'::interval
        ) AS series(month)
        LEFT JOIN (
            SELECT
                pg_catalog.date_trunc('month', l.created_at) AS month_bucket,
                pg_catalog.sum(l.gross_amount_pkr) AS gmv,
                pg_catalog.sum(l.platform_commission_pkr) AS platform_fee,
                pg_catalog.count(*) AS orders_cnt
            FROM public.sales_ledger l
            WHERE l.entry_type = 'sale_verified'
              AND l.created_at >= v_start_time
              AND l.created_at <= v_end_time
            GROUP BY month_bucket
        ) d ON d.month_bucket = series.month;
    END IF;

    -- 6. Genre Demand Breakdown
    SELECT coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'genre_id', g_row.id,
            'name_en', g_row.name_english,
            'name_ur', g_row.name_urdu,
            'slug', g_row.slug,
            'gmv_pkr', g_row.genre_gmv,
            'orders_count', g_row.orders_cnt,
            'novels_count', g_row.novels_cnt
        ) ORDER BY g_row.genre_gmv DESC
    ), '[]'::jsonb)
    INTO v_genre_breakdown
    FROM (
        SELECT
            g.id,
            g.name_english,
            g.name_urdu,
            g.slug,
            coalesce(pg_catalog.sum(l.gross_amount_pkr), 0.00) AS genre_gmv,
            pg_catalog.count(l.id) AS orders_cnt,
            pg_catalog.count(DISTINCT l.novel_id) AS novels_cnt
        FROM public.sales_ledger l
        JOIN public.novel_genres ng ON ng.novel_id = l.novel_id
        JOIN public.genres g ON g.id = ng.genre_id
        WHERE l.entry_type = 'sale_verified'
          AND l.created_at >= v_start_time
          AND l.created_at < v_end_time
        GROUP BY g.id, g.name_english, g.name_urdu, g.slug
        ORDER BY genre_gmv DESC
        LIMIT 10
    ) g_row;

    -- 7. Decision Radar Bottlenecks
    -- Stale verification orders (> 24 hours)
    SELECT coalesce(pg_catalog.count(*), 0)
    INTO v_radar_stale_orders
    FROM public.orders
    WHERE status = 'payment_submitted'
      AND coalesce(updated_at, created_at) < pg_catalog.now() - interval '24 hours';

    -- Open disputes
    SELECT coalesce(pg_catalog.count(*), 0)
    INTO v_radar_open_disputes
    FROM public.disputes
    WHERE status IN ('open', 'under_review');

    -- Pending refund requests
    SELECT coalesce(pg_catalog.count(*), 0)
    INTO v_radar_pending_refunds
    FROM public.refund_requests
    WHERE status = 'pending';

    -- Pending writer applications
    SELECT coalesce(pg_catalog.count(*), 0)
    INTO v_radar_pending_writers
    FROM public.writer_profiles
    WHERE status = 'pending_approval';

    -- Pending novel moderation
    SELECT coalesce(pg_catalog.count(*), 0)
    INTO v_radar_pending_novels
    FROM public.novels
    WHERE status = 'under_review';

    -- Overdue platform fee invoices
    SELECT coalesce(pg_catalog.count(*), 0)
    INTO v_radar_overdue_invoices
    FROM public.commission_invoices
    WHERE status IN ('invoiced', 'partially_paid')
      AND due_date IS NOT NULL
      AND due_date < pg_catalog.now();

    -- Failed emails in outbox
    SELECT coalesce(pg_catalog.count(*), 0)
    INTO v_radar_failed_emails
    FROM public.email_outbox
    WHERE status = 'failed';

    -- 8. Top Novels Leaderboard (Top 5 by gross revenue)
    SELECT coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'novel_id', n_row.id,
            'title_en', n_row.title_english,
            'title_ur', n_row.title_urdu,
            'slug', n_row.slug,
            'writer_name', n_row.pen_name_english,
            'writer_name_ur', n_row.pen_name_urdu,
            'copies_sold', n_row.copies,
            'gmv_pkr', n_row.novel_gmv
        ) ORDER BY n_row.novel_gmv DESC
    ), '[]'::jsonb)
    INTO v_top_novels
    FROM (
        SELECT
            n.id,
            n.title_english,
            n.title_urdu,
            n.slug,
            wp.pen_name_english,
            wp.pen_name_urdu,
            pg_catalog.count(l.id) AS copies,
            coalesce(pg_catalog.sum(l.gross_amount_pkr), 0.00) AS novel_gmv
        FROM public.sales_ledger l
        JOIN public.novels n ON n.id = l.novel_id
        JOIN public.writer_profiles wp ON wp.id = l.writer_id
        WHERE l.entry_type = 'sale_verified'
          AND l.created_at >= v_start_time
          AND l.created_at < v_end_time
        GROUP BY n.id, n.title_english, n.title_urdu, n.slug, wp.pen_name_english, wp.pen_name_urdu
        ORDER BY novel_gmv DESC
        LIMIT 5
    ) n_row;

    -- 9. Top Writers Leaderboard (Top 5 by gross revenue)
    SELECT coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'writer_id', w_row.id,
            'pen_name_en', w_row.pen_name_english,
            'pen_name_ur', w_row.pen_name_urdu,
            'published_novels_count', w_row.novels_count,
            'copies_sold', w_row.copies,
            'gmv_pkr', w_row.writer_gmv,
            'writer_net_pkr', w_row.net_pkr
        ) ORDER BY w_row.writer_gmv DESC
    ), '[]'::jsonb)
    INTO v_top_writers
    FROM (
        SELECT
            wp.id,
            wp.pen_name_english,
            wp.pen_name_urdu,
            (SELECT coalesce(pg_catalog.count(*), 0) FROM public.novels n WHERE n.writer_id = wp.id AND n.status = 'published') AS novels_count,
            pg_catalog.count(l.id) AS copies,
            coalesce(pg_catalog.sum(l.gross_amount_pkr), 0.00) AS writer_gmv,
            coalesce(pg_catalog.sum(l.writer_net_pkr), 0.00) AS net_pkr
        FROM public.sales_ledger l
        JOIN public.writer_profiles wp ON wp.id = l.writer_id
        WHERE l.entry_type = 'sale_verified'
          AND l.created_at >= v_start_time
          AND l.created_at < v_end_time
        GROUP BY wp.id, wp.pen_name_english, wp.pen_name_urdu
        ORDER BY writer_gmv DESC
        LIMIT 5
    ) w_row;

    -- 10. Infrastructure & Quota Health
    SELECT pg_database_size(current_database()) INTO v_db_size_bytes;

    SELECT coalesce(pg_catalog.count(*), 0) INTO v_count_orders FROM public.orders;
    SELECT coalesce(pg_catalog.count(*), 0) INTO v_count_chapters FROM public.chapters;
    SELECT coalesce(pg_catalog.count(*), 0) INTO v_count_audit_logs FROM public.audit_logs;
    SELECT coalesce(pg_catalog.count(*), 0) INTO v_count_chapter_reads FROM public.chapter_reads;
    SELECT coalesce(pg_catalog.count(*), 0) INTO v_count_email_outbox FROM public.email_outbox;
    SELECT coalesce(pg_catalog.count(*), 0) INTO v_count_notifications FROM public.notifications;

    -- Active vs pruned binary payment proofs
    SELECT
        (SELECT coalesce(pg_catalog.count(*), 0) FROM public.payment_submissions WHERE screenshot_url IS NOT NULL AND screenshot_url NOT LIKE '[PRUNED%') +
        (SELECT coalesce(pg_catalog.count(*), 0) FROM public.commission_payment_reports WHERE screenshot_path IS NOT NULL AND screenshot_path NOT LIKE '[PRUNED%') +
        (SELECT coalesce(pg_catalog.count(*), 0) FROM public.tips WHERE screenshot_path IS NOT NULL AND screenshot_path NOT LIKE '[PRUNED%'),
        (SELECT coalesce(pg_catalog.count(*), 0) FROM public.payment_submissions WHERE screenshot_url LIKE '[PRUNED%') +
        (SELECT coalesce(pg_catalog.count(*), 0) FROM public.commission_payment_reports WHERE screenshot_path LIKE '[PRUNED%') +
        (SELECT coalesce(pg_catalog.count(*), 0) FROM public.tips WHERE screenshot_path LIKE '[PRUNED%')
    INTO
        v_count_active_proofs,
        v_count_pruned_proofs;

    -- 11. Compile Structured JSON Responses
    v_timeframe := pg_catalog.jsonb_build_object(
        'days', p_days,
        'is_all_time', v_is_all_time,
        'start_date', v_start_time,
        'end_date', v_end_time,
        'prev_start_date', v_prev_start_time,
        'prev_end_date', v_prev_end_time
    );

    v_kpis := pg_catalog.jsonb_build_object(
        'gmv_pkr', v_gmv_pkr,
        'prev_gmv_pkr', v_prev_gmv_pkr,
        'verified_orders_count', v_verified_orders_count,
        'prev_verified_orders_count', v_prev_verified_orders_count,
        'platform_fee_accrued_pkr', v_platform_fee_accrued_pkr,
        'platform_fee_settled_pkr', v_platform_fee_settled_pkr,
        'unpaid_fee_exposure_pkr', v_unpaid_fee_exposure_pkr,
        'writer_net_earnings_pkr', v_writer_net_earnings_pkr,
        'avg_order_value_pkr', v_avg_order_value_pkr,
        'verified_tips_pkr', v_verified_tips_pkr,
        'verified_tips_count', v_verified_tips_count,
        'conversion_rate_pct', v_conversion_rate_pct
    );

    v_order_funnel := pg_catalog.jsonb_build_object(
        'verified', v_funnel_verified,
        'pending_verification', v_funnel_pending_verification,
        'pending_payment', v_funnel_pending_payment,
        'rejected', v_funnel_rejected,
        'cancelled', v_funnel_cancelled,
        'disputed', v_funnel_disputed,
        'refunded_adjusted', v_funnel_refunded_adjusted,
        'total_orders', v_funnel_total
    );

    v_decision_radar := pg_catalog.jsonb_build_object(
        'stale_pending_orders_24h', v_radar_stale_orders,
        'open_disputes_count', v_radar_open_disputes,
        'pending_refund_requests_count', v_radar_pending_refunds,
        'pending_writer_applications_count', v_radar_pending_writers,
        'pending_novel_moderation_count', v_radar_pending_novels,
        'overdue_invoices_count', v_radar_overdue_invoices,
        'failed_emails_count', v_radar_failed_emails
    );

    v_infrastructure := pg_catalog.jsonb_build_object(
        'db_size_bytes', v_db_size_bytes,
        'db_quota_limit_bytes', 524288000,
        'table_counts', pg_catalog.jsonb_build_object(
            'orders', v_count_orders,
            'chapters', v_count_chapters,
            'audit_logs', v_count_audit_logs,
            'chapter_reads', v_count_chapter_reads,
            'email_outbox', v_count_email_outbox,
            'notifications', v_count_notifications
        ),
        'active_payment_proofs_count', v_count_active_proofs,
        'pruned_payment_proofs_count', v_count_pruned_proofs
    );

    RETURN pg_catalog.jsonb_build_object(
        'timeframe', v_timeframe,
        'kpis', v_kpis,
        'order_funnel', v_order_funnel,
        'daily_series', v_daily_series,
        'genre_breakdown', v_genre_breakdown,
        'decision_radar', v_decision_radar,
        'top_novels', v_top_novels,
        'top_writers', v_top_writers,
        'infrastructure', v_infrastructure
    );
END;
$$;

-- Privileges: Restrict execution strictly to authenticated platform admins
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_analytics(integer) TO authenticated;
