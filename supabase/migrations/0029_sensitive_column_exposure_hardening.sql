-- ==============================================================================
-- UNB Premium — Migration 0029: Sensitive Column Exposure Hardening & Safe Display RPCs
-- Description:
--   1. Tightens Row Level Security on public.profiles:
--      Drops the wide-open "Public view basic profiles" policy (USING true) which
--      allowed any authenticated or anonymous client to harvest emails, roles, and
--      activity statuses of all users.
--      Replaces with "profiles_select_owner_or_admin" restricting direct SELECT
--      to the account owner (id = auth.uid()) or platform administrators (is_admin()).
--   2. Tightens Row Level Security on public.writer_profiles:
--      Drops "Public view approved writer profiles" which allowed direct SELECT
--      access on sensitive financial columns (custom_commission_rate,
--      unpaid_commission_limit, current_unpaid_commission,
--      is_orders_paused_for_commission, agreement_accepted_at, approved_by, status).
--      Replaces with "writer_profiles_select_owner_or_admin" restricting direct
--      SELECT to the author (id = auth.uid()) or platform administrators (is_admin()).
--   3. Confirms writer_payment_methods isolation:
--      Ensures obsolete legacy checkout view policy is removed and only
--      owner/admin policy is enforced.
--   4. Provides public.get_reader_display_names(p_reader_ids uuid[]):
--      SECURITY DEFINER RPC returning strictly non-sensitive display fields
--      (id, full_name, username) exclusively to authenticated callers who are
--      admins, the user themselves, or authors who received an order from that reader.
--      Never exposes email, role, or is_active.
--   5. Provides public.get_writer_display_names(p_writer_ids uuid[]):
--      SECURITY DEFINER RPC returning strictly display pen names
--      (id, pen_name_urdu, pen_name_english, username) for approved authors or
--      ordered authors. Never exposes financial rates, limits, or balances.
--
-- Security Invariants:
--   - Direct client queries against profiles and writer_profiles return 0 rows
--     for any other user's records.
--   - Writers see only reader display names (never email addresses).
--   - Readers see only author pen names (never commission or banking terms).
--   - Conforms strictly to SQL syntax construct qualification rules (no pg_catalog
--     on coalesce, trim, nullif, etc.).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: TIGHTEN PROFILES ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public view basic profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_owner_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_owner_or_admin"
    ON public.profiles FOR SELECT
    USING (id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- SECTION 2: TIGHTEN WRITER PROFILES ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public view approved writer profiles" ON public.writer_profiles;
DROP POLICY IF EXISTS "writer_profiles_select_owner_or_admin" ON public.writer_profiles;

CREATE POLICY "writer_profiles_select_owner_or_admin"
    ON public.writer_profiles FOR SELECT
    USING (id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- SECTION 3: RE-CONFIRM WRITER PAYMENT METHODS RLS
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Readers view active payment methods of approved writers during checkout" ON public.writer_payment_methods;
DROP POLICY IF EXISTS "writer_payment_methods_select" ON public.writer_payment_methods;

CREATE POLICY "writer_payment_methods_select"
    ON public.writer_payment_methods FOR SELECT
    USING (writer_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- SECTION 4: SAFE READER DISPLAY RPC (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_reader_display_names(p_reader_ids uuid[])
RETURNS TABLE (
    id uuid,
    full_name text,
    username text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_is_admin boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN;
    END IF;

    v_is_admin := public.is_admin();

    RETURN QUERY
    SELECT
        p.id,
        p.full_name,
        p.username
    FROM public.profiles p
    WHERE p.id = ANY(p_reader_ids)
      AND (
          v_is_admin
          OR p.id = v_caller_id
          OR EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.reader_id = p.id
                AND o.writer_id = v_caller_id
          )
      );
END;
$$;

COMMENT ON FUNCTION public.get_reader_display_names(uuid[]) IS
'Safely returns display names (full_name, username) for specified readers. Accessible only by admins, self, or authors who received orders from the requested readers. Strictly excludes email, role, and is_active.';

REVOKE EXECUTE ON FUNCTION public.get_reader_display_names(uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reader_display_names(uuid[]) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 5: SAFE WRITER DISPLAY RPC (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_writer_display_names(p_writer_ids uuid[])
RETURNS TABLE (
    id uuid,
    pen_name_urdu text,
    pen_name_english text,
    username text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_is_admin boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN;
    END IF;

    v_is_admin := public.is_admin();

    RETURN QUERY
    SELECT
        wp.id,
        wp.pen_name_urdu,
        wp.pen_name_english,
        p.username
    FROM public.writer_profiles wp
    LEFT JOIN public.profiles p ON p.id = wp.id
    WHERE wp.id = ANY(p_writer_ids)
      AND (
          v_is_admin
          OR wp.id = v_caller_id
          OR wp.status = 'approved'
          OR EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.writer_id = wp.id
                AND o.reader_id = v_caller_id
          )
      );
END;
$$;

COMMENT ON FUNCTION public.get_writer_display_names(uuid[]) IS
'Safely returns public display pen names and username for specified authors. Never exposes commission rates, financial balances, or limits.';

REVOKE EXECUTE ON FUNCTION public.get_writer_display_names(uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_writer_display_names(uuid[]) TO authenticated;
