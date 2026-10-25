-- ==============================================================================
-- UNB Premium — Migration 0026: Revoke Trigger Privileges & Default ACL Hardening
--
-- Description:
--   1. Specifically REVOKEs EXECUTE on public.trg_commission_invoices_updated_at()
--      (introduced in migration 0025) from PUBLIC, anon, and authenticated.
--   2. Makes function privilege revocation durable across future migrations:
--      - Queries pg_default_acl to report current default privilege entries
--        for schema public / function objects.
--      - Alters default privileges for role 'postgres' in schema public to revoke
--        EXECUTE on future functions from PUBLIC, anon, and authenticated.
--      - Safely attempts the same ALTER DEFAULT PRIVILEGES for 'supabase_admin'
--        and the current session role if distinct, with graceful exception handling.
--   3. Re-applies dynamic EXECUTE revocation on every trigger function in schema public
--      (pg_proc.prorettype = 'trigger'::regtype AND pg_proc.prokind = 'f')
--      guaranteeing that any trigger function created later in this or subsequent
--      executions is locked down against unauthorized execution by anon/authenticated.
--
-- Idempotency: All statements are idempotent; revoking a privilege not held is a no-op.
-- Applied migrations (0001-0025) must never be edited; all changes go in this file.
-- ==============================================================================


-- ==============================================================================
-- SECTION 1: SPECIFIC REVOKE ON trg_commission_invoices_updated_at
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'trg_commission_invoices_updated_at'
    ) THEN
        REVOKE EXECUTE ON FUNCTION public.trg_commission_invoices_updated_at() FROM PUBLIC, anon, authenticated;
        RAISE NOTICE 'Revoked EXECUTE on public.trg_commission_invoices_updated_at() from PUBLIC, anon, authenticated.';
    END IF;
END;
$$;


-- ==============================================================================
-- SECTION 2: REPORT CURRENT pg_default_acl ENTRIES FOR FUNCTIONS
-- ==============================================================================
DO $$
DECLARE
    r record;
    v_found boolean := false;
BEGIN
    RAISE NOTICE '--- pg_default_acl Report (Functions) ---';
    FOR r IN
        SELECT
            coalesce(nullif(a.defaclnamespace, 0)::regnamespace::text, 'GLOBAL') AS schema_name,
            r_owner.rolname AS owner_role,
            a.defaclobjtype,
            a.defaclacl
        FROM pg_default_acl a
        JOIN pg_roles r_owner ON r_owner.oid = a.defaclrole
        WHERE a.defaclobjtype = 'f'
        ORDER BY owner_role, schema_name
    LOOP
        v_found := true;
        RAISE NOTICE 'Schema: %, Owner Role: %, Object Type: %, ACL: %',
            r.schema_name, r.owner_role, r.defaclobjtype, r.defaclacl;
    END LOOP;

    IF NOT v_found THEN
        RAISE NOTICE 'No explicit function entries found in pg_default_acl.';
    END IF;
END;
$$;


-- ==============================================================================
-- SECTION 3: ALTER DEFAULT PRIVILEGES FOR ROLE postgres
-- ==============================================================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;


-- ==============================================================================
-- SECTION 4: ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin (IF PERMITTED)
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        BEGIN
            EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated';
            RAISE NOTICE 'Successfully revoked default EXECUTE on functions for role supabase_admin.';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not alter default privileges for role supabase_admin (non-fatal, current role lacks privilege): % (SQLSTATE %)', SQLERRM, SQLSTATE;
        END;
    END IF;
END;
$$;


-- ==============================================================================
-- SECTION 5: ALTER DEFAULT PRIVILEGES FOR CURRENT SESSION ROLE (IF DISTINCT)
-- ==============================================================================
DO $$
DECLARE
    v_session_role text;
BEGIN
    SELECT current_user INTO v_session_role;
    IF v_session_role IS NOT NULL AND v_session_role NOT IN ('postgres', 'supabase_admin') THEN
        BEGIN
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated', v_session_role);
            RAISE NOTICE 'Successfully revoked default EXECUTE on functions for session role %.', v_session_role;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not alter default privileges for session role %: %', v_session_role, SQLERRM;
        END;
    END IF;
END;
$$;


-- ==============================================================================
-- SECTION 6: DYNAMIC TRIGGER FUNCTION PRIVILEGE LOCKDOWN LOOP
-- ==============================================================================
-- Re-applies REVOKE EXECUTE on every trigger function in schema public.
-- Trigger functions in PostgreSQL are invoked internally by trigger machinery
-- and should never be callable directly by unprivileged clients.
DO $$
DECLARE
    r record;
    v_sql text;
    v_revoked_count integer := 0;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS proc_sig, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prorettype = 'trigger'::regtype
          AND p.prokind = 'f'
    LOOP
        BEGIN
            v_sql := format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.proc_sig);
            EXECUTE v_sql;
            v_revoked_count := v_revoked_count + 1;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
    RAISE NOTICE 'Dynamic trigger privilege lockdown completed: % trigger function(s) processed.', v_revoked_count;
END;
$$;
