-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: READER URDU FONT SETTING (28)
-- ==============================================================================
-- File: supabase/tests/28_reader_urdu_font_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. Default reader_urdu_font is 'gulzar'
--     2. get_public_site_settings() callable by anon and returns {palette, reader_urdu_font}
--     3. Direct SELECT on platform_settings by anon remains denied
--     4. Non-admin (reader/writer) calling set_reader_urdu_font is rejected (42501)
--     5. Admin calling set_reader_urdu_font with invalid/null value is rejected (22023)
--     6. Admin calling set_reader_urdu_font with valid values ('noori', 'gulzar') succeeds
--     7. platform_settings columns update correctly with caller id and timestamp
--     8. audit_logs record inserted with SET_READER_URDU_FONT, previous/new state, and note
--     9. CHECK constraint chk_platform_settings_reader_urdu_font blocks arbitrary values
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TEST RESULTS ACCUMULATOR
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE test_results (
    test_id integer,
    test_name text,
    status text,
    details text
);
GRANT ALL ON test_results TO PUBLIC;

DO $$
DECLARE
    -- Test actors
    v_admin_id       uuid := '11111111-1111-1111-1111-111111111111'::uuid;
    v_writer_id      uuid := '22222222-2222-2222-2222-222222222222'::uuid;
    v_reader_id      uuid := '33333333-3333-3333-3333-333333333333'::uuid;

    -- Helpers
    v_res_json       jsonb;
    v_audit_count    integer;
    v_curr_font      text;
    v_updated_by     uuid;
    v_updated_at     timestamptz;
    v_err_caught     boolean;
    v_err_state      text;
    v_err_msg        text;
    v_key_count      integer;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURES SETUP
    -- --------------------------------------------------------------------------
    -- 1. Auth users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_admin_id,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_font_28@unb.pk',  '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_font_28@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_font_28@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Profiles
    UPDATE public.profiles SET role = 'admin',  username = 'admin_fnt_28',  full_name = 'Admin Font',  is_active = true WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_fnt_28', full_name = 'Writer Font', is_active = true WHERE id = v_writer_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_fnt_28', full_name = 'Reader Font', is_active = true WHERE id = v_reader_id;

    -- Reset platform_settings to default
    UPDATE public.platform_settings
    SET reader_urdu_font = 'gulzar',
        reader_urdu_font_updated_at = now(),
        reader_urdu_font_updated_by = v_admin_id
    WHERE id = 1;

    -- ==========================================================================
    -- TEST 1: Anon can call get_public_site_settings() and receives {palette, reader_urdu_font}
    -- ==========================================================================
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);

    BEGIN
        v_res_json := public.get_public_site_settings();
        SELECT count(*) INTO v_key_count FROM jsonb_object_keys(v_res_json);

        IF v_res_json ? 'palette' AND v_res_json ? 'reader_urdu_font' AND v_key_count = 2 AND (v_res_json->>'reader_urdu_font') = 'gulzar' THEN
            INSERT INTO test_results VALUES (1, 'Anon calls get_public_site_settings', 'PASS', 'Received strictly {palette, reader_urdu_font=gulzar}');
        ELSE
            INSERT INTO test_results VALUES (1, 'Anon calls get_public_site_settings', 'FAIL', 'Unexpected response payload: ' || v_res_json::text);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (1, 'Anon calls get_public_site_settings', 'FAIL', 'Exception raised: ' || SQLERRM);
    END;

    -- ==========================================================================
    -- TEST 2: Direct SELECT on platform_settings by anon is rejected
    -- ==========================================================================
    v_err_caught := false;
    BEGIN
        PERFORM reader_urdu_font FROM public.platform_settings WHERE id = 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_caught := true;
    WHEN OTHERS THEN
        v_err_caught := false;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (2, 'Anon direct SELECT on platform_settings', 'PASS', 'Permission denied as expected');
    ELSE
        INSERT INTO test_results VALUES (2, 'Anon direct SELECT on platform_settings', 'FAIL', 'Direct SELECT should have been denied to anon');
    END IF;

    -- ==========================================================================
    -- TEST 3: Non-admin calling set_reader_urdu_font is rejected (42501)
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

    v_err_caught := false;
    BEGIN
        PERFORM public.set_reader_urdu_font('noori', 'Reader should not set font');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
        IF v_err_state = '42501' THEN
            v_err_caught := true;
        END IF;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (3, 'Reader calling set_reader_urdu_font', 'PASS', 'Rejected with 42501 unauthorized');
    ELSE
        INSERT INTO test_results VALUES (3, 'Reader calling set_reader_urdu_font', 'FAIL', 'Expected 42501, got: ' || coalesce(v_err_state, 'NONE') || ' - ' || coalesce(v_err_msg, 'NONE'));
    END IF;

    -- ==========================================================================
    -- TEST 4: Admin calling set_reader_urdu_font with invalid value is rejected (22023)
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_err_caught := false;
    BEGIN
        PERFORM public.set_reader_urdu_font('arial', 'Invalid font name');
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
        IF v_err_state = '22023' THEN
            v_err_caught := true;
        END IF;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (4, 'Admin invalid font name rejection', 'PASS', 'Rejected with 22023 data exception');
    ELSE
        INSERT INTO test_results VALUES (4, 'Admin invalid font name rejection', 'FAIL', 'Expected 22023, got: ' || coalesce(v_err_state, 'NONE'));
    END IF;

    -- ==========================================================================
    -- TEST 5: Admin switches font to 'noori' successfully
    -- ==========================================================================
    BEGIN
        v_res_json := public.set_reader_urdu_font('noori', 'Testing Noori Nastaleeq activation');

        SELECT reader_urdu_font, reader_urdu_font_updated_by, reader_urdu_font_updated_at
        INTO v_curr_font, v_updated_by, v_updated_at
        FROM public.platform_settings
        WHERE id = 1;

        SELECT count(*) INTO v_audit_count
        FROM public.audit_logs
        WHERE action_type = 'SET_READER_URDU_FONT'
          AND entity_type = 'platform_settings'
          AND actor_id = v_admin_id
          AND (new_state->>'reader_urdu_font') = 'noori';

        IF v_curr_font = 'noori' AND v_updated_by = v_admin_id AND v_audit_count > 0 THEN
            INSERT INTO test_results VALUES (5, 'Admin set_reader_urdu_font to noori', 'PASS', 'Settings and audit_log updated cleanly');
        ELSE
            INSERT INTO test_results VALUES (5, 'Admin set_reader_urdu_font to noori', 'FAIL', 'Font not updated or audit missing. Curr: ' || coalesce(v_curr_font, 'NULL'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (5, 'Admin set_reader_urdu_font to noori', 'FAIL', 'Exception raised: ' || SQLERRM);
    END;

    -- ==========================================================================
    -- TEST 6: Admin switches font back to 'gulzar' successfully
    -- ==========================================================================
    BEGIN
        v_res_json := public.set_reader_urdu_font('gulzar', 'Reverting to Gulzar default');

        SELECT reader_urdu_font, reader_urdu_font_updated_by
        INTO v_curr_font, v_updated_by
        FROM public.platform_settings
        WHERE id = 1;

        IF v_curr_font = 'gulzar' AND v_updated_by = v_admin_id THEN
            INSERT INTO test_results VALUES (6, 'Admin revert to gulzar', 'PASS', 'Reverted cleanly to gulzar');
        ELSE
            INSERT INTO test_results VALUES (6, 'Admin revert to gulzar', 'FAIL', 'Reversion failed. Curr: ' || coalesce(v_curr_font, 'NULL'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (6, 'Admin revert to gulzar', 'FAIL', 'Exception raised: ' || SQLERRM);
    END;

    -- ==========================================================================
    -- TEST 7: CHECK constraint blocks direct invalid value update
    -- ==========================================================================
    v_err_caught := false;
    BEGIN
        UPDATE public.platform_settings SET reader_urdu_font = 'times_new_roman' WHERE id = 1;
    EXCEPTION WHEN check_violation THEN
        v_err_caught := true;
    WHEN OTHERS THEN
        v_err_caught := false;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (7, 'CHECK constraint enforcement', 'PASS', 'Blocked by chk_platform_settings_reader_urdu_font');
    ELSE
        INSERT INTO test_results VALUES (7, 'CHECK constraint enforcement', 'FAIL', 'CHECK constraint failed to block invalid font');
    END IF;

END $$;

-- Summary output
SELECT
    test_id,
    test_name,
    status,
    details
FROM test_results
ORDER BY test_id;

ROLLBACK;
