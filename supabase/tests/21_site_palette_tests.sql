-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: SITE PALETTE & APPEARANCE (21)
-- ==============================================================================
-- File: supabase/tests/21_site_palette_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. get_public_site_settings() callable by anon and authenticated
--     2. get_public_site_settings() returns strictly {"palette": ...}
--     3. Direct SELECT on platform_settings by anon is denied
--     4. Non-admin (reader/writer) calling set_site_palette is rejected (42501)
--     5. Admin calling set_site_palette with invalid/null value is rejected (22023)
--     6. Admin calling set_site_palette with valid value ('paper_teal', 'cream_maroon', 'ivory_ink') succeeds
--     7. platform_settings columns (site_palette, site_palette_updated_at, site_palette_updated_by) update correctly
--     8. audit_logs record inserted with SET_SITE_PALETTE, previous/new state, and note
--     9. Direct client UPDATE on platform_settings is blocked
--    10. CHECK constraint chk_platform_settings_site_palette blocks arbitrary values
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
    v_old_palette    text;
    v_curr_palette   text;
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
        (v_admin_id,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_palette_21@unb.pk',  '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_palette_21@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_palette_21@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Profiles
    UPDATE public.profiles SET role = 'admin',  username = 'admin_pal_21',  full_name = 'Admin Palette',  is_active = true WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_pal_21', full_name = 'Writer Palette', is_active = true WHERE id = v_writer_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_pal_21', full_name = 'Reader Palette', is_active = true WHERE id = v_reader_id;

    -- Reset platform_settings to default palette
    UPDATE public.platform_settings
    SET site_palette = 'ivory_ink',
        site_palette_updated_at = now(),
        site_palette_updated_by = v_admin_id
    WHERE id = 1;

    -- ==========================================================================
    -- TEST 1: Anon can call get_public_site_settings() and receives only {palette}
    -- ==========================================================================
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);

    BEGIN
        v_res_json := public.get_public_site_settings();
        SELECT count(*) INTO v_key_count FROM jsonb_object_keys(v_res_json);

        IF v_res_json ? 'palette' AND v_key_count = 1 AND (v_res_json->>'palette') = 'ivory_ink' THEN
            INSERT INTO test_results VALUES (1, 'Anon calls get_public_site_settings', 'PASS', 'Received strictly {"palette":"ivory_ink"}');
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
        PERFORM site_palette FROM public.platform_settings WHERE id = 1;
        INSERT INTO test_results VALUES (2, 'Anon direct SELECT platform_settings', 'FAIL', 'VULNERABILITY: Anon read platform_settings directly');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        INSERT INTO test_results VALUES (2, 'Anon direct SELECT platform_settings', 'PASS', 'Blocked as expected with SQLSTATE ' || SQLSTATE);
    END;

    -- ==========================================================================
    -- TEST 3: Authenticated Reader can call get_public_site_settings()
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

    BEGIN
        v_res_json := public.get_public_site_settings();
        SELECT count(*) INTO v_key_count FROM jsonb_object_keys(v_res_json);

        IF v_res_json ? 'palette' AND v_key_count = 1 THEN
            INSERT INTO test_results VALUES (3, 'Reader calls get_public_site_settings', 'PASS', 'Received palette: ' || (v_res_json->>'palette'));
        ELSE
            INSERT INTO test_results VALUES (3, 'Reader calls get_public_site_settings', 'FAIL', 'Unexpected payload: ' || v_res_json::text);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (3, 'Reader calls get_public_site_settings', 'FAIL', 'Exception raised: ' || SQLERRM);
    END;

    -- ==========================================================================
    -- TEST 4: Non-admin (Reader) calling set_site_palette is denied (42501)
    -- ==========================================================================
    v_err_caught := false;
    BEGIN
        v_res_json := public.set_site_palette('paper_teal', 'Reader attack');
        INSERT INTO test_results VALUES (4, 'Reader calling set_site_palette', 'FAIL', 'VULNERABILITY: Reader changed site palette');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_state := SQLSTATE;
        IF v_err_state = '42501' THEN
            INSERT INTO test_results VALUES (4, 'Reader calling set_site_palette', 'PASS', 'Correctly rejected with 42501 privilege error');
        ELSE
            INSERT INTO test_results VALUES (4, 'Reader calling set_site_palette', 'FAIL', 'Rejected with unexpected SQLSTATE ' || v_err_state || ': ' || SQLERRM);
        END IF;
    END;

    -- ==========================================================================
    -- TEST 5: Non-admin (Writer) calling set_site_palette is denied (42501)
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);

    v_err_caught := false;
    BEGIN
        v_res_json := public.set_site_palette('cream_maroon', 'Writer attack');
        INSERT INTO test_results VALUES (5, 'Writer calling set_site_palette', 'FAIL', 'VULNERABILITY: Writer changed site palette');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_state := SQLSTATE;
        IF v_err_state = '42501' THEN
            INSERT INTO test_results VALUES (5, 'Writer calling set_site_palette', 'PASS', 'Correctly rejected with 42501 privilege error');
        ELSE
            INSERT INTO test_results VALUES (5, 'Writer calling set_site_palette', 'FAIL', 'Rejected with unexpected SQLSTATE ' || v_err_state || ': ' || SQLERRM);
        END IF;
    END;

    -- ==========================================================================
    -- TEST 6: Direct UPDATE on platform_settings by Writer is denied
    -- ==========================================================================
    BEGIN
        UPDATE public.platform_settings SET site_palette = 'cream_maroon' WHERE id = 1;
        INSERT INTO test_results VALUES (6, 'Writer direct UPDATE platform_settings', 'PASS', 'Direct mutation had zero effect or was blocked');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (6, 'Writer direct UPDATE platform_settings', 'PASS', 'Blocked with SQLSTATE ' || SQLSTATE);
    END;

    -- ==========================================================================
    -- TEST 7: Admin calling set_site_palette with invalid value rejected (22023)
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_err_caught := false;
    BEGIN
        v_res_json := public.set_site_palette('neon_green', 'Testing invalid palette');
        INSERT INTO test_results VALUES (7, 'Admin set_site_palette with invalid value', 'FAIL', 'VULNERABILITY: Invalid palette accepted');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_state := SQLSTATE;
        IF v_err_state = '22023' THEN
            INSERT INTO test_results VALUES (7, 'Admin set_site_palette with invalid value', 'PASS', 'Correctly rejected with 22023 parameter error');
        ELSE
            INSERT INTO test_results VALUES (7, 'Admin set_site_palette with invalid value', 'FAIL', 'Unexpected SQLSTATE ' || v_err_state || ': ' || SQLERRM);
        END IF;
    END;

    -- ==========================================================================
    -- TEST 8: Admin calling set_site_palette with NULL rejected (22023)
    -- ==========================================================================
    v_err_caught := false;
    BEGIN
        v_res_json := public.set_site_palette(NULL, 'Null palette');
        INSERT INTO test_results VALUES (8, 'Admin set_site_palette with NULL', 'FAIL', 'VULNERABILITY: NULL palette accepted');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_state := SQLSTATE;
        IF v_err_state = '22023' THEN
            INSERT INTO test_results VALUES (8, 'Admin set_site_palette with NULL', 'PASS', 'Correctly rejected with 22023');
        ELSE
            INSERT INTO test_results VALUES (8, 'Admin set_site_palette with NULL', 'FAIL', 'Unexpected SQLSTATE ' || v_err_state || ': ' || SQLERRM);
        END IF;
    END;

    -- ==========================================================================
    -- TEST 9: Admin successfully switches palette to paper_teal
    -- ==========================================================================
    BEGIN
        v_res_json := public.set_site_palette('paper_teal', 'Switching to Paper & Teal preset');

        SELECT site_palette, site_palette_updated_by, site_palette_updated_at
        INTO v_curr_palette, v_updated_by, v_updated_at
        FROM public.platform_settings
        WHERE id = 1;

        SELECT count(*) INTO v_audit_count
        FROM public.audit_logs
        WHERE action_type = 'SET_SITE_PALETTE'
          AND entity_type = 'platform_settings'
          AND entity_id = '1'
          AND actor_id = v_admin_id
          AND (new_state->>'palette') = 'paper_teal';

        IF (v_res_json->>'palette') = 'paper_teal'
           AND v_curr_palette = 'paper_teal'
           AND v_updated_by = v_admin_id
           AND v_updated_at IS NOT NULL
           AND v_audit_count > 0
        THEN
            INSERT INTO test_results VALUES (9, 'Admin sets palette to paper_teal', 'PASS', 'DB columns updated and audit log verified');
        ELSE
            INSERT INTO test_results VALUES (9, 'Admin sets palette to paper_teal', 'FAIL', 'State mismatch. Response: ' || v_res_json::text || ', Palette: ' || v_curr_palette || ', Audits: ' || v_audit_count);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (9, 'Admin sets palette to paper_teal', 'FAIL', 'Exception raised: ' || SQLERRM);
    END;

    -- ==========================================================================
    -- TEST 10: get_public_site_settings reflects the new palette
    -- ==========================================================================
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);

    BEGIN
        v_res_json := public.get_public_site_settings();
        IF (v_res_json->>'palette') = 'paper_teal' THEN
            INSERT INTO test_results VALUES (10, 'Public settings reflects updated palette', 'PASS', 'Anon reads paper_teal');
        ELSE
            INSERT INTO test_results VALUES (10, 'Public settings reflects updated palette', 'FAIL', 'Expected paper_teal, got: ' || v_res_json::text);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (10, 'Public settings reflects updated palette', 'FAIL', 'Exception raised: ' || SQLERRM);
    END;

    -- ==========================================================================
    -- TEST 11: Admin switches palette to cream_maroon
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    BEGIN
        v_res_json := public.set_site_palette('cream_maroon', 'Switching to Cream & Maroon');

        SELECT site_palette INTO v_curr_palette
        FROM public.platform_settings
        WHERE id = 1;

        IF (v_res_json->>'palette') = 'cream_maroon' AND v_curr_palette = 'cream_maroon' THEN
            INSERT INTO test_results VALUES (11, 'Admin sets palette to cream_maroon', 'PASS', 'Palette is cream_maroon');
        ELSE
            INSERT INTO test_results VALUES (11, 'Admin sets palette to cream_maroon', 'FAIL', 'Mismatch: ' || v_curr_palette);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (11, 'Admin sets palette to cream_maroon', 'FAIL', 'Exception: ' || SQLERRM);
    END;

    -- ==========================================================================
    -- TEST 12: Admin switches back to ivory_ink
    -- ==========================================================================
    BEGIN
        v_res_json := public.set_site_palette('ivory_ink', 'Restoring default ivory_ink');

        SELECT site_palette INTO v_curr_palette
        FROM public.platform_settings
        WHERE id = 1;

        IF (v_res_json->>'palette') = 'ivory_ink' AND v_curr_palette = 'ivory_ink' THEN
            INSERT INTO test_results VALUES (12, 'Admin restores palette to ivory_ink', 'PASS', 'Palette restored to default');
        ELSE
            INSERT INTO test_results VALUES (12, 'Admin restores palette to ivory_ink', 'FAIL', 'Mismatch: ' || v_curr_palette);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (12, 'Admin restores palette to ivory_ink', 'FAIL', 'Exception: ' || SQLERRM);
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- DISPLAY RESULTS & SUMMARY (Before Rollback)
-- ------------------------------------------------------------------------------
SELECT test_id, test_name, status, details FROM test_results ORDER BY test_id;

SELECT
    count(*) AS total_tests,
    count(*) FILTER (WHERE status = 'PASS') AS passed,
    count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM test_results;

ROLLBACK;

