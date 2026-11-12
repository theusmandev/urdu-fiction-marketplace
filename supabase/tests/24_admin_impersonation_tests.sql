-- ==============================================================================
-- UNB Premium — Test Suite 24: Admin Impersonation Preparation & Audit
-- Verifies:
--   1. Non-admin callers cannot prepare or generate impersonation links.
--   2. Enforces mandatory reason length >= 5 characters.
--   3. Strictly prevents generating an impersonation link for an administrator.
--   4. Valid admin call inserts into public.audit_logs and returns target metadata.
-- ==============================================================================

DO $$
DECLARE
    v_admin_id       uuid := '11111111-2424-2424-2424-111111111111'::uuid;
    v_other_admin_id uuid := '11111111-2424-2424-2424-222222222222'::uuid;
    v_writer_id      uuid := '22222222-2424-2424-2424-222222222222'::uuid;
    v_reader_id      uuid := '33333333-2424-2424-2424-333333333333'::uuid;

    v_count          integer;
    v_err_caught     boolean;
    v_res            jsonb;
BEGIN
    RAISE NOTICE '=== Running Test Suite 24: Admin Impersonation Preparation & Audit ===';

    -- -------------------------------------------------------------------------
    -- 0. FIXTURE SETUP
    -- -------------------------------------------------------------------------
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_test24@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_other_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other_admin24@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_writer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_test24@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_test24@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, role, username, display_name, email, is_active)
    VALUES
        (v_admin_id, 'admin', 'admin_test24', 'Platform Admin 24', 'admin_test24@unb.pk', true),
        (v_other_admin_id, 'admin', 'other_admin24', 'Secondary Admin 24', 'other_admin24@unb.pk', true),
        (v_writer_id, 'writer', 'writer_test24', 'Urdu Author 24', 'writer_test24@unb.pk', true),
        (v_reader_id, 'reader', 'reader_test24', 'Active Reader 24', 'reader_test24@unb.pk', true)
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        is_active = true,
        email = EXCLUDED.email;

    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES (
        v_writer_id, 'مصنف ٹیسٹ', 'Test Writer', 'اردو مصنف', 'approved', NULL, 5000, 0, false
    ) ON CONFLICT (id) DO UPDATE SET
        status = 'approved';

    -- -------------------------------------------------------------------------
    -- TEST 1: Non-Admin Callers Must Be Blocked
    -- -------------------------------------------------------------------------
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    v_err_caught := false;
    BEGIN
        PERFORM public.admin_prepare_impersonation_link(v_writer_id, 'Valid justification reason');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Test 1 Failed: Non-admin caller must be rejected by admin_prepare_impersonation_link';

    -- -------------------------------------------------------------------------
    -- TEST 2: Enforce Mandatory Reason Length (>= 5 chars)
    -- -------------------------------------------------------------------------
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    v_err_caught := false;
    BEGIN
        PERFORM public.admin_prepare_impersonation_link(v_writer_id, 'abc');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Test 2 Failed: Short reason (< 5 chars) must be rejected';

    -- -------------------------------------------------------------------------
    -- TEST 3: Block Impersonation of Administrator Accounts
    -- -------------------------------------------------------------------------
    v_err_caught := false;
    BEGIN
        PERFORM public.admin_prepare_impersonation_link(v_other_admin_id, 'Valid support investigation reason');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Test 3 Failed: Impersonating an administrator must be strictly prohibited';

    -- -------------------------------------------------------------------------
    -- TEST 4: Authorized Writer Impersonation Preparation & Audit Logging
    -- -------------------------------------------------------------------------
    v_res := public.admin_prepare_impersonation_link(v_writer_id, 'Investigating chapter publication support request');

    ASSERT (v_res->>'email') = 'writer_test24@unb.pk', 'Test 4a Failed: Expected correct target writer email';
    ASSERT (v_res->>'role') = 'writer', 'Test 4b Failed: Expected correct target writer role';

    -- Verify audit log was recorded in public.audit_logs
    SELECT count(*) INTO v_count
    FROM public.audit_logs
    WHERE action_type = 'GENERATE_IMPERSONATION_LINK'
      AND entity_id = v_writer_id::text
      AND actor_id = v_admin_id;

    ASSERT v_count >= 1, 'Test 4c Failed: Audit log entry must be recorded in public.audit_logs';

    -- -------------------------------------------------------------------------
    -- CLEANUP
    -- -------------------------------------------------------------------------
    PERFORM pg_catalog.set_config('role', 'postgres', true);
    DELETE FROM public.audit_logs WHERE entity_id IN (v_writer_id::text, v_reader_id::text);
    DELETE FROM public.writer_profiles WHERE id = v_writer_id;
    DELETE FROM public.profiles WHERE id IN (v_admin_id, v_other_admin_id, v_writer_id, v_reader_id);
    DELETE FROM auth.users WHERE id IN (v_admin_id, v_other_admin_id, v_writer_id, v_reader_id);

    RAISE NOTICE '=== Test Suite 24 PASSED: All 4 test sections verified successfully ===';
END $$;

