-- ==============================================================================
-- UNB Premium — Migration 0041: Dynamic Data & Storage Retention System
--
-- Description:
--   1. Expands platform_settings to store administrative retention duration days
--      for 8 data categories (audit logs, chapter reads, chapter revisions,
--      email outbox, notifications, rate limits, chapter drafts, payment proofs).
--   2. Provides update_retention_settings RPC with administrative authorization
--      and audit logging.
--   3. Provides dynamic run_retention_cleanup() RPC that queries active retention
--      windows from platform_settings before executing deletions.
--   4. Supports sentinel value (-1 or 0) for unlimited / never delete.
--   5. Provides storage proof cleanup helper functions to purge expired binary
--      receipts while preserving PostgreSQL TID and financial ledger metadata.
--
-- Security & Hardening:
--   - Strict search_path = '' lockdown on all routines.
--   - Revoke execute from PUBLIC and anon; grant exclusively to authenticated and service_role.
--   - Zero qualified SQL syntax constructs (coalesce, nullif written unqualified).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: EXPAND PLATFORM_SETTINGS TABLE
-- ------------------------------------------------------------------------------

ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS retention_audit_logs_days integer NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS retention_chapter_reads_days integer NOT NULL DEFAULT 7,
    ADD COLUMN IF NOT EXISTS retention_chapter_revisions_days integer NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS retention_email_outbox_days integer NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS retention_notifications_days integer NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS retention_rate_limits_days integer NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS retention_chapter_drafts_days integer NOT NULL DEFAULT 90,
    ADD COLUMN IF NOT EXISTS retention_payment_proofs_days integer NOT NULL DEFAULT 90,
    ADD COLUMN IF NOT EXISTS last_retention_cleanup_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS last_retention_cleanup_summary jsonb NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_retention_audit_logs_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_retention_audit_logs_days
            CHECK (retention_audit_logs_days >= -1 AND retention_audit_logs_days <= 3650);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_retention_chapter_reads_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_retention_chapter_reads_days
            CHECK (retention_chapter_reads_days >= -1 AND retention_chapter_reads_days <= 3650);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_retention_chapter_revisions_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_retention_chapter_revisions_days
            CHECK (retention_chapter_revisions_days >= -1 AND retention_chapter_revisions_days <= 3650);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_retention_email_outbox_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_retention_email_outbox_days
            CHECK (retention_email_outbox_days >= -1 AND retention_email_outbox_days <= 3650);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_retention_notifications_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_retention_notifications_days
            CHECK (retention_notifications_days >= -1 AND retention_notifications_days <= 3650);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_retention_rate_limits_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_retention_rate_limits_days
            CHECK (retention_rate_limits_days >= -1 AND retention_rate_limits_days <= 3650);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_retention_chapter_drafts_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_retention_chapter_drafts_days
            CHECK (retention_chapter_drafts_days >= -1 AND retention_chapter_drafts_days <= 3650);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_retention_payment_proofs_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_retention_payment_proofs_days
            CHECK (retention_payment_proofs_days >= -1 AND retention_payment_proofs_days <= 3650);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- SECTION 2: ADMINISTRATIVE RPC TO UPDATE RETENTION SETTINGS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_retention_settings(
    p_audit_logs_days integer,
    p_chapter_reads_days integer,
    p_chapter_revisions_days integer,
    p_email_outbox_days integer,
    p_notifications_days integer,
    p_rate_limits_days integer,
    p_chapter_drafts_days integer,
    p_payment_proofs_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_settings jsonb;
    v_new_settings jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can update retention settings.';
    END IF;

    -- Validate bounds (-1 or 0 means unlimited; positive up to 3650 days)
    IF p_audit_logs_days < -1 OR p_audit_logs_days > 3650 THEN
        RAISE EXCEPTION 'Audit logs retention days must be between -1 and 3650.';
    END IF;
    IF p_chapter_reads_days < -1 OR p_chapter_reads_days > 3650 THEN
        RAISE EXCEPTION 'Chapter reads retention days must be between -1 and 3650.';
    END IF;
    IF p_chapter_revisions_days < -1 OR p_chapter_revisions_days > 3650 THEN
        RAISE EXCEPTION 'Chapter revisions retention days must be between -1 and 3650.';
    END IF;
    IF p_email_outbox_days < -1 OR p_email_outbox_days > 3650 THEN
        RAISE EXCEPTION 'Email outbox retention days must be between -1 and 3650.';
    END IF;
    IF p_notifications_days < -1 OR p_notifications_days > 3650 THEN
        RAISE EXCEPTION 'Notifications retention days must be between -1 and 3650.';
    END IF;
    IF p_rate_limits_days < -1 OR p_rate_limits_days > 3650 THEN
        RAISE EXCEPTION 'Rate limits retention days must be between -1 and 3650.';
    END IF;
    IF p_chapter_drafts_days < -1 OR p_chapter_drafts_days > 3650 THEN
        RAISE EXCEPTION 'Chapter drafts retention days must be between -1 and 3650.';
    END IF;
    IF p_payment_proofs_days < -1 OR p_payment_proofs_days > 3650 THEN
        RAISE EXCEPTION 'Payment proofs retention days must be between -1 and 3650.';
    END IF;

    SELECT pg_catalog.jsonb_build_object(
        'retention_audit_logs_days', s.retention_audit_logs_days,
        'retention_chapter_reads_days', s.retention_chapter_reads_days,
        'retention_chapter_revisions_days', s.retention_chapter_revisions_days,
        'retention_email_outbox_days', s.retention_email_outbox_days,
        'retention_notifications_days', s.retention_notifications_days,
        'retention_rate_limits_days', s.retention_rate_limits_days,
        'retention_chapter_drafts_days', s.retention_chapter_drafts_days,
        'retention_payment_proofs_days', s.retention_payment_proofs_days
    ) INTO v_old_settings
    FROM public.platform_settings s
    WHERE id = 1;

    UPDATE public.platform_settings
    SET retention_audit_logs_days = p_audit_logs_days,
        retention_chapter_reads_days = p_chapter_reads_days,
        retention_chapter_revisions_days = p_chapter_revisions_days,
        retention_email_outbox_days = p_email_outbox_days,
        retention_notifications_days = p_notifications_days,
        retention_rate_limits_days = p_rate_limits_days,
        retention_chapter_drafts_days = p_chapter_drafts_days,
        retention_payment_proofs_days = p_payment_proofs_days,
        updated_at = pg_catalog.now()
    WHERE id = 1;

    SELECT pg_catalog.jsonb_build_object(
        'retention_audit_logs_days', s.retention_audit_logs_days,
        'retention_chapter_reads_days', s.retention_chapter_reads_days,
        'retention_chapter_revisions_days', s.retention_chapter_revisions_days,
        'retention_email_outbox_days', s.retention_email_outbox_days,
        'retention_notifications_days', s.retention_notifications_days,
        'retention_rate_limits_days', s.retention_rate_limits_days,
        'retention_chapter_drafts_days', s.retention_chapter_drafts_days,
        'retention_payment_proofs_days', s.retention_payment_proofs_days
    ) INTO v_new_settings
    FROM public.platform_settings s
    WHERE id = 1;

    -- Record in audit logs
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state
    ) VALUES (
        auth.uid(),
        'admin',
        'update_retention_settings',
        'platform_settings',
        '1',
        v_old_settings,
        v_new_settings
    );

    RETURN v_new_settings;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_retention_settings(integer, integer, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_retention_settings(integer, integer, integer, integer, integer, integer, integer, integer) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- SECTION 3: DYNAMIC RETENTION CLEANUP RUNNER
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_retention_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_audit_logs_days integer;
    v_chapter_reads_days integer;
    v_chapter_revisions_days integer;
    v_email_outbox_days integer;
    v_notifications_days integer;
    v_rate_limits_days integer;
    v_chapter_drafts_days integer;
    v_payment_proofs_days integer;

    v_cnt_reads integer := 0;
    v_cnt_api_limits integer := 0;
    v_cnt_draft_limits integer := 0;
    v_cnt_rate_limits integer := 0;
    v_cnt_audit integer := 0;
    v_cnt_email_sent integer := 0;
    v_cnt_email_failed integer := 0;
    v_cnt_email integer := 0;
    v_cnt_notif_read integer := 0;
    v_cnt_notif_unread integer := 0;
    v_cnt_notifications integer := 0;
    v_cnt_revisions integer := 0;
    v_cnt_drafts integer := 0;

    v_summary jsonb;
BEGIN
    -- Authorization: Admin or server service_role
    IF auth.role() != 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators or scheduled jobs can execute retention cleanup.';
    END IF;

    -- Fetch active retention configuration
    SELECT
        s.retention_audit_logs_days,
        s.retention_chapter_reads_days,
        s.retention_chapter_revisions_days,
        s.retention_email_outbox_days,
        s.retention_notifications_days,
        s.retention_rate_limits_days,
        s.retention_chapter_drafts_days,
        s.retention_payment_proofs_days
    INTO
        v_audit_logs_days,
        v_chapter_reads_days,
        v_chapter_revisions_days,
        v_email_outbox_days,
        v_notifications_days,
        v_rate_limits_days,
        v_chapter_drafts_days,
        v_payment_proofs_days
    FROM public.platform_settings s
    WHERE s.id = 1;

    v_audit_logs_days := coalesce(v_audit_logs_days, 30);
    v_chapter_reads_days := coalesce(v_chapter_reads_days, 7);
    v_chapter_revisions_days := coalesce(v_chapter_revisions_days, 30);
    v_email_outbox_days := coalesce(v_email_outbox_days, 30);
    v_notifications_days := coalesce(v_notifications_days, 30);
    v_rate_limits_days := coalesce(v_rate_limits_days, 2);
    v_chapter_drafts_days := coalesce(v_chapter_drafts_days, 90);
    v_payment_proofs_days := coalesce(v_payment_proofs_days, 90);

    -- 1. chapter_reads: Sliding-window rate limit telemetry (> 0 means active cleanup; <= 0 means unlimited)
    IF v_chapter_reads_days > 0 THEN
        DELETE FROM public.chapter_reads
        WHERE read_at < pg_catalog.now() - (v_chapter_reads_days || ' days')::interval;
        GET DIAGNOSTICS v_cnt_reads = ROW_COUNT;
    END IF;

    -- 2. api_rate_limits & chapter_draft_rate_limits
    IF v_rate_limits_days > 0 THEN
        DELETE FROM public.api_rate_limits
        WHERE window_start < pg_catalog.now() - (v_rate_limits_days || ' days')::interval;
        GET DIAGNOSTICS v_cnt_api_limits = ROW_COUNT;

        DELETE FROM public.chapter_draft_rate_limits
        WHERE window_start < pg_catalog.now() - (v_rate_limits_days || ' days')::interval;
        GET DIAGNOSTICS v_cnt_draft_limits = ROW_COUNT;

        v_cnt_rate_limits := v_cnt_api_limits + v_cnt_draft_limits;
    END IF;

    -- 3. audit_logs: System activity log
    IF v_audit_logs_days > 0 THEN
        DELETE FROM public.audit_logs
        WHERE created_at < pg_catalog.now() - (v_audit_logs_days || ' days')::interval;
        GET DIAGNOSTICS v_cnt_audit = ROW_COUNT;
    END IF;

    -- 4. email_outbox: Sent / skipped past N days, failed past 2N days
    IF v_email_outbox_days > 0 THEN
        DELETE FROM public.email_outbox
        WHERE status IN ('sent', 'skipped')
          AND created_at < pg_catalog.now() - (v_email_outbox_days || ' days')::interval;
        GET DIAGNOSTICS v_cnt_email_sent = ROW_COUNT;

        DELETE FROM public.email_outbox
        WHERE status = 'failed'
          AND created_at < pg_catalog.now() - ((v_email_outbox_days * 2) || ' days')::interval;
        GET DIAGNOSTICS v_cnt_email_failed = ROW_COUNT;

        v_cnt_email := v_cnt_email_sent + v_cnt_email_failed;
    END IF;

    -- 5. notifications: Read past N days, unread past 3N days
    IF v_notifications_days > 0 THEN
        DELETE FROM public.notifications
        WHERE is_read = true
          AND created_at < pg_catalog.now() - (v_notifications_days || ' days')::interval;
        GET DIAGNOSTICS v_cnt_notif_read = ROW_COUNT;

        DELETE FROM public.notifications
        WHERE is_read = false
          AND created_at < pg_catalog.now() - ((v_notifications_days * 3) || ' days')::interval;
        GET DIAGNOSTICS v_cnt_notif_unread = ROW_COUNT;

        v_cnt_notifications := v_cnt_notif_read + v_cnt_notif_unread;
    END IF;

    -- 6. chapter_revisions: Historical prior snapshots
    IF v_chapter_revisions_days > 0 THEN
        DELETE FROM public.chapter_revisions
        WHERE created_at < pg_catalog.now() - (v_chapter_revisions_days || ' days')::interval;
        GET DIAGNOSTICS v_cnt_revisions = ROW_COUNT;
    END IF;

    -- 7. chapter_drafts: Stale work-in-progress drafts
    IF v_chapter_drafts_days > 0 THEN
        DELETE FROM public.chapter_drafts
        WHERE updated_at < pg_catalog.now() - (v_chapter_drafts_days || ' days')::interval;
        GET DIAGNOSTICS v_cnt_drafts = ROW_COUNT;
    END IF;

    v_summary := pg_catalog.jsonb_build_object(
        'success', true,
        'cleaned_at', pg_catalog.now(),
        'chapter_reads_deleted', v_cnt_reads,
        'rate_limits_deleted', v_cnt_rate_limits,
        'audit_logs_deleted', v_cnt_audit,
        'email_outbox_deleted', v_cnt_email,
        'notifications_deleted', v_cnt_notifications,
        'chapter_revisions_deleted', v_cnt_revisions,
        'chapter_drafts_deleted', v_cnt_drafts,
        'total_rows_deleted', (v_cnt_reads + v_cnt_rate_limits + v_cnt_audit + v_cnt_email + v_cnt_notifications + v_cnt_revisions + v_cnt_drafts)
    );

    UPDATE public.platform_settings
    SET last_retention_cleanup_at = pg_catalog.now(),
        last_retention_cleanup_summary = v_summary
    WHERE id = 1;

    RETURN v_summary;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_retention_cleanup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_retention_cleanup() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- SECTION 4: STORAGE PROOF RETENTION HELPERS
-- ------------------------------------------------------------------------------

-- Returns paths of expired binary payment proofs whose underlying financial
-- records are already verified, rejected, or cancelled older than p_days.
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
    SELECT cpr.proof_url, 'fee_settlement'::text
    FROM public.commission_payment_reports cpr
    WHERE cpr.proof_url IS NOT NULL
      AND cpr.proof_url NOT LIKE '[PRUNED%'
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
    SET proof_url = '[PRUNED_BY_RETENTION_POLICY]'
    WHERE proof_url = ANY(p_paths);

    UPDATE public.tips
    SET screenshot_path = '[PRUNED_BY_RETENTION_POLICY]'
    WHERE screenshot_path = ANY(p_paths);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_payment_proofs_pruned(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payment_proofs_pruned(text[]) TO authenticated, service_role;
