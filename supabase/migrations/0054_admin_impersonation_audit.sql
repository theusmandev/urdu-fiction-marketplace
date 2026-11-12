-- ==============================================================================
-- UNB Premium — Migration 0054: Admin Impersonation Audit & Preparation
--
-- PURPOSE:
-- 1. Provides public.admin_prepare_impersonation_link RPC to securely authorize,
--    validate, and audit the generation of support impersonation magic links.
-- 2. Strictly enforces:
--    - Caller must be an active administrator (public.is_admin()).
--    - Mandatory support/debugging reason (length >= 5 characters).
--    - Target account cannot be an administrator (role != 'admin').
--    - Target account must have a valid email address.
--    - Immutable audit trail record written to public.audit_logs before any
--      magic link can be generated.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_prepare_impersonation_link(
    p_target_user_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_target record;
BEGIN
    -- 1. Verify caller is an authenticated admin
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required.';
    END IF;

    -- 2. Validate support reason
    IF p_reason IS NULL OR pg_catalog.length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'A valid support reason (at least 5 characters) is required.';
    END IF;

    -- 3. Fetch target user profile
    SELECT
        p.id,
        p.email,
        p.role,
        p.full_name,
        p.username,
        wp.status AS writer_status
    INTO v_target
    FROM public.profiles p
    LEFT JOIN public.writer_profiles wp ON wp.id = p.id
    WHERE p.id = p_target_user_id;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Target user not found.';
    END IF;

    IF v_target.role = 'admin' THEN
        RAISE EXCEPTION 'Cannot generate an impersonation link for an administrator account.';
    END IF;

    IF v_target.email IS NULL OR trim(v_target.email) = '' THEN
        RAISE EXCEPTION 'Target account does not have a valid email address.';
    END IF;

    -- 4. Record immutable audit log entry
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state
    ) VALUES (
        v_caller_id,
        'admin',
        'GENERATE_IMPERSONATION_LINK',
        'writer_profiles',
        p_target_user_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'reason', trim(p_reason),
            'target_email', v_target.email,
            'target_role', v_target.role,
            'writer_status', v_target.writer_status
        )
    );

    -- 5. Return target metadata for link generation
    RETURN pg_catalog.jsonb_build_object(
        'email', v_target.email,
        'role', v_target.role,
        'full_name', v_target.full_name,
        'username', v_target.username
    );
END;
$$;

COMMENT ON FUNCTION public.admin_prepare_impersonation_link(uuid, text) IS
'Authorizes and logs administrative generation of support impersonation magic links.';

REVOKE ALL ON FUNCTION public.admin_prepare_impersonation_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_prepare_impersonation_link(uuid, text) TO authenticated, service_role;

