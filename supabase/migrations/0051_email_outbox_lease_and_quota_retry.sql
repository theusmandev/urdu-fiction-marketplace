-- ==============================================================================
-- UNB Premium — Migration 0051: Email Outbox Lease Locking & Quota Retry Resilience
--
-- PURPOSE:
-- 1. Eliminates duplicate email dispatch race conditions between immediate
--    Server Action callers (dispatchPendingEmails(5)) and background cron workers.
--    Uses a lease column (claimed_at) with FOR UPDATE OF eo SKIP LOCKED.
-- 2. Adds retry_after column to protect against HTTP 429 rate limits and provider
--    daily quota caps without burning failure attempts or marking rows failed.
-- 3. Updates record_email_delivery_result to support rate-limited backoff and
--    permanent failure flags while maintaining full backwards compatibility.
-- 4. Updates retry_failed_emails to reset claimed_at and retry_after upon retry.
-- ==============================================================================

-- 1. Add lease locking and quota retry columns to public.email_outbox
ALTER TABLE public.email_outbox 
ADD COLUMN IF NOT EXISTS claimed_at timestamptz NULL;

ALTER TABLE public.email_outbox 
ADD COLUMN IF NOT EXISTS retry_after timestamptz NULL;

-- Partial index for fast, conflict-free queue claiming
CREATE INDEX IF NOT EXISTS idx_email_outbox_lease_claiming 
ON public.email_outbox (status, retry_after, claimed_at, created_at ASC) 
WHERE (status = 'pending');

-- -----------------------------------------------------------------------------
-- 2. Atomic Lease-Claiming RPC: claim_pending_emails_for_sending
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_pending_emails_for_sending(integer);

CREATE OR REPLACE FUNCTION public.claim_pending_emails_for_sending(
    p_batch_size integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    recipient_email text,
    template text,
    subject text,
    body_text text,
    attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    WITH eligible AS (
        SELECT eo.id
        FROM public.email_outbox eo
        WHERE eo.status = 'pending'
          AND eo.attempts < 5
          AND (eo.retry_after IS NULL OR eo.retry_after <= pg_catalog.now())
          AND (eo.claimed_at IS NULL OR eo.claimed_at < pg_catalog.now() - interval '10 minutes')
        ORDER BY eo.created_at ASC
        LIMIT greatest(1, least(coalesce(p_batch_size, 10), 50))
        FOR UPDATE OF eo SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.email_outbox u
        SET claimed_at = pg_catalog.now()
        FROM eligible e
        WHERE u.id = e.id
        RETURNING u.id, u.user_id, u.template, u.subject, u.body_text, u.attempts
    )
    SELECT 
        c.id,
        c.user_id,
        p.email::text AS recipient_email,
        c.template,
        c.subject,
        c.body_text,
        c.attempts
    FROM claimed c
    JOIN public.profiles p ON p.id = c.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pending_emails_for_sending(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_pending_emails_for_sending(integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Resilient Delivery Result Recording: record_email_delivery_result
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_email_delivery_result(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.record_email_delivery_result(uuid, boolean, text, boolean, timestamptz);
DROP FUNCTION IF EXISTS public.record_email_delivery_result(uuid, boolean, text, boolean, timestamptz, boolean);

CREATE OR REPLACE FUNCTION public.record_email_delivery_result(
    p_email_id uuid,
    p_success boolean,
    p_error text DEFAULT NULL,
    p_is_rate_limited boolean DEFAULT false,
    p_retry_after timestamptz DEFAULT NULL,
    p_is_permanent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_success THEN
        UPDATE public.email_outbox
        SET status = 'sent',
            sent_at = pg_catalog.now(),
            claimed_at = NULL,
            retry_after = NULL,
            last_error = NULL
        WHERE id = p_email_id;
    ELSIF p_is_permanent THEN
        -- Permanent failure (bad recipient email / 4xx validation): mark failed immediately
        UPDATE public.email_outbox
        SET attempts = greatest(attempts + 1, 5),
            claimed_at = NULL,
            retry_after = NULL,
            last_error = pg_catalog.substring(pg_catalog.btrim(p_error), 1, 500),
            status = 'failed'
        WHERE id = p_email_id;
    ELSIF p_is_rate_limited THEN
        -- Provider quota / HTTP 429 rate limit: reschedule retry without incrementing attempts, preserve pending status
        UPDATE public.email_outbox
        SET claimed_at = NULL,
            retry_after = coalesce(p_retry_after, pg_catalog.now() + interval '5 minutes'),
            last_error = pg_catalog.substring(pg_catalog.btrim(p_error), 1, 500)
        WHERE id = p_email_id;
    ELSE
        -- Temporary delivery failure (5xx or network timeout): increment attempt and backoff
        UPDATE public.email_outbox
        SET attempts = attempts + 1,
            claimed_at = NULL,
            retry_after = coalesce(p_retry_after, pg_catalog.now() + (interval '5 minutes' * (attempts + 1))),
            last_error = pg_catalog.substring(pg_catalog.btrim(p_error), 1, 500),
            status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END
        WHERE id = p_email_id;
    END IF;

    RETURN pg_catalog.jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_email_delivery_result(uuid, boolean, text, boolean, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_email_delivery_result(uuid, boolean, text, boolean, timestamptz, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Update retry_failed_emails to reset lease and quota timers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retry_failed_emails(
    p_max_retry integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_retried integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrators only.';
    END IF;

    WITH targeted AS (
        SELECT id
        FROM public.email_outbox
        WHERE status = 'failed'
        ORDER BY created_at DESC
        LIMIT greatest(1, least(coalesce(p_max_retry, 50), 200))
    )
    UPDATE public.email_outbox eo
    SET status = 'pending',
        attempts = 0,
        claimed_at = NULL,
        retry_after = NULL,
        last_error = NULL
    FROM targeted
    WHERE eo.id = targeted.id;

    GET DIAGNOSTICS v_retried = ROW_COUNT;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'retried_count', v_retried
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retry_failed_emails(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_failed_emails(integer) TO authenticated;

