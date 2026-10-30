-- ==============================================================================
-- UNB Premium — Migration 0038: Database-Backed API Rate Limiter
-- Description:
--   Replaces in-memory process maps with an atomic, database-backed sliding-window
--   rate limiter table and RPC for Edge / Cloudflare Workers compatibility.
-- Security & Hardening:
--   - Strict search_path = '' lockdown.
--   - RLS enabled; all direct table privileges REVOKED from anon and authenticated (RPC-only).
--   - REVOKE EXECUTE FROM PUBLIC, anon. GRANT TO authenticated, service_role.
--   - Zero qualified SQL syntax constructs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: TABLE AND RLS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
    identifier text PRIMARY KEY,
    window_start timestamptz NOT NULL DEFAULT pg_catalog.now(),
    call_count integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_api_rate_limits_identifier_len CHECK (char_length(identifier) >= 1 AND char_length(identifier) <= 128),
    CONSTRAINT chk_api_rate_limits_count_positive CHECK (call_count >= 1)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_rate_limits FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 2: ATOMIC RPC FUNCTIONS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_identifier text,
    p_max_requests integer DEFAULT 10,
    p_window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_id text;
    v_window_start timestamptz;
    v_count integer;
    v_now timestamptz := pg_catalog.now();
    v_window_interval interval;
    v_reset_at timestamptz;
    v_allowed boolean;
    v_remaining integer;
BEGIN
    v_clean_id := btrim(p_identifier);
    IF v_clean_id IS NULL OR char_length(v_clean_id) = 0 THEN
        RAISE EXCEPTION 'Identifier cannot be empty';
    END IF;

    IF p_max_requests < 1 OR p_max_requests > 1000 THEN
        RAISE EXCEPTION 'p_max_requests must be between 1 and 1000';
    END IF;

    IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
        RAISE EXCEPTION 'p_window_seconds must be between 1 and 86400';
    END IF;

    v_window_interval := (p_window_seconds || ' seconds')::interval;

    -- Upsert / lock record
    SELECT window_start, call_count
    INTO v_window_start, v_count
    FROM public.api_rate_limits
    WHERE identifier = v_clean_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- First request in window
        INSERT INTO public.api_rate_limits (identifier, window_start, call_count)
        VALUES (v_clean_id, v_now, 1);

        v_allowed := true;
        v_remaining := p_max_requests - 1;
        v_reset_at := v_now + v_window_interval;
    ELSIF v_now > (v_window_start + v_window_interval) THEN
        -- Window has expired: reset window
        UPDATE public.api_rate_limits
        SET window_start = v_now,
            call_count = 1
        WHERE identifier = v_clean_id;

        v_allowed := true;
        v_remaining := p_max_requests - 1;
        v_reset_at := v_now + v_window_interval;
    ELSIF v_count >= p_max_requests THEN
        -- Limit exceeded
        v_allowed := false;
        v_remaining := 0;
        v_reset_at := v_window_start + v_window_interval;
    ELSE
        -- Increment count
        UPDATE public.api_rate_limits
        SET call_count = call_count + 1
        WHERE identifier = v_clean_id;

        v_allowed := true;
        v_remaining := p_max_requests - (v_count + 1);
        v_reset_at := v_window_start + v_window_interval;
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'remaining', v_remaining,
        'reset_at', v_reset_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reset_rate_limit(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.api_rate_limits WHERE identifier = btrim(p_identifier);
    RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_rate_limit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_rate_limit(text) TO authenticated, service_role;

