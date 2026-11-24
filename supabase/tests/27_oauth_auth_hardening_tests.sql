-- ==============================================================================
-- UNB Premium — Test Suite 27: Auth Hardening for Google OAuth & Inactive Profiles
--
-- Instructions:
--   Execute this entire file in the Supabase SQL Editor as postgres/service_role.
--   Transaction is wrapped in BEGIN ... ROLLBACK so NO test data is persisted.
--
-- Covers:
--   1. Metadata role='admin' still yields role='reader' and is_active=true.
--   2. Google-like metadata (name, picture, no username) yields full_name, avatar_url,
--      and a regex-compliant username (/^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/).
--   3. Hostile emails (dots, plus tags, uppercase, 60+ chars, symbols only, unicode)
--      all produce valid regex-compliant usernames.
--   4. Explicit invalid username in metadata is replaced with regex-compliant username.
--   5. Forced username collision falls back via UUID suffix without failing signup.
--   6. Deactivated user (is_active=false) is denied by get_chapter_for_reader on paid chapters.
--   7. Active entitled reader successfully reads paid chapter via get_chapter_for_reader.
--   8. Deactivated reader can still read free-preview chapters.
--   9. get_my_library executes with zero SQL error and returns novel for active reader.
--   10. get_my_library executes with zero SQL error and returns empty library for deactivated reader.
--   11. has_novel_entitlement returns true for active reader and false for deactivated reader.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. RESULTS TABLE SETUP (Accessible across role switches)
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS test_27_results (
    test_id             integer PRIMARY KEY,
    test_name           text NOT NULL,
    status              text NOT NULL CHECK (status IN ('PASS', 'FAIL')),
    details             text NOT NULL
);
GRANT ALL ON test_27_results TO PUBLIC;

-- ------------------------------------------------------------------------------
-- 1. SETUP TEST FIXTURES & RUN TESTS IN PL/PGSQL BLOCK
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_user_id      uuid := '27000000-0000-0000-0000-000000000001'::uuid;
    v_google_user_id     uuid := '27000000-0000-0000-0000-000000000002'::uuid;
    v_hostile1_id        uuid := '27000000-0000-0000-0000-000000000003'::uuid;
    v_hostile2_id        uuid := '27000000-0000-0000-0000-000000000004'::uuid;
    v_hostile3_id        uuid := '27000000-0000-0000-0000-000000000005'::uuid;
    v_hostile4_id        uuid := '27000000-0000-0000-0000-000000000006'::uuid;
    v_hostile5_id        uuid := '27000000-0000-0000-0000-000000000007'::uuid;
    v_hostile6_id        uuid := '27000000-0000-0000-0000-000000000008'::uuid;
    v_inv_user_id        uuid := '27000000-0000-0000-0000-000000000009'::uuid;
    v_clash_pre_id       uuid := '27000000-0000-0000-0000-000000000010'::uuid;
    v_clash_user_id      uuid := '27000000-0000-0000-0000-000000000011'::uuid;

    v_author_id          uuid := '27000000-0000-0000-0000-000000000020'::uuid;
    v_active_reader_id   uuid := '27000000-0000-0000-0000-000000000021'::uuid;
    v_inactive_reader_id uuid := '27000000-0000-0000-0000-000000000022'::uuid;

    v_novel_id           uuid := '27000000-1111-0000-0000-000000000001'::uuid;
    v_ch1_id             uuid := '27000000-2222-0000-0000-000000000001'::uuid;
    v_ch2_id             uuid := '27000000-2222-0000-0000-000000000002'::uuid;
    v_order1_id          uuid := '27000000-3333-0000-0000-000000000001'::uuid;
    v_order2_id          uuid := '27000000-3333-0000-0000-000000000002'::uuid;

    v_prof               record;
    v_res                jsonb;
    v_item               jsonb;
    v_err                text;
    v_caught             boolean;
    v_has_ent            boolean;
    v_username_regex     text := '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$';
BEGIN
    RAISE NOTICE '=== Running Test Suite 27: Auth Hardening & Inactive Reader Access ===';

    -- -------------------------------------------------------------------------
    -- TEST 1: Metadata role='admin' still yields reader
    -- -------------------------------------------------------------------------
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        v_admin_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'attacker_27@unb.pk', '', pg_catalog.now(), '{"provider":"google"}'::jsonb,
        '{"role": "admin", "is_admin": true, "full_name": "Privilege Attacker"}'::jsonb,
        pg_catalog.now(), pg_catalog.now()
    );

    SELECT role, is_active, full_name, username INTO v_prof
    FROM public.profiles WHERE id = v_admin_user_id;

    IF v_prof.role = 'reader' AND v_prof.is_active = true AND v_prof.full_name = 'Privilege Attacker' THEN
        INSERT INTO test_27_results VALUES (1, 'Metadata role=admin yields reader', 'PASS',
            format('role=%s, is_active=%s, full_name=%s', v_prof.role, v_prof.is_active, v_prof.full_name));
    ELSE
        INSERT INTO test_27_results VALUES (1, 'Metadata role=admin yields reader', 'FAIL',
            format('Privilege leak! role=%s, is_active=%s', v_prof.role, v_prof.is_active));
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 2: Google-like metadata (name, picture, no username)
    -- -------------------------------------------------------------------------
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        v_google_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'googlereader27@gmail.com', '', pg_catalog.now(), '{"provider":"google"}'::jsonb,
        '{"name": "Google Reader", "picture": "https://lh3.googleusercontent.com/a/photo.jpg"}'::jsonb,
        pg_catalog.now(), pg_catalog.now()
    );

    SELECT full_name, avatar_url, username INTO v_prof
    FROM public.profiles WHERE id = v_google_user_id;

    IF v_prof.full_name = 'Google Reader'
       AND v_prof.avatar_url = 'https://lh3.googleusercontent.com/a/photo.jpg'
       AND v_prof.username ~ v_username_regex THEN
        INSERT INTO test_27_results VALUES (2, 'Google OIDC claims (name, picture) mapped', 'PASS',
            format('full_name=%s, avatar=%s, username=%s', v_prof.full_name, v_prof.avatar_url, v_prof.username));
    ELSE
        INSERT INTO test_27_results VALUES (2, 'Google OIDC claims (name, picture) mapped', 'FAIL',
            format('OIDC claim mapping failed: full_name=%s, avatar=%s, username=%s', v_prof.full_name, v_prof.avatar_url, v_prof.username));
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 3: Hostile emails producing valid regex usernames
    -- -------------------------------------------------------------------------
    -- 3a: Dots in local part
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_hostile1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'first.middle.last@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    -- 3b: Plus tags
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_hostile2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader+tag123@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    -- 3c: Uppercase
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_hostile3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'UpperCASE_Email@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    -- 3d: 60+ chars email prefix
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_hostile4_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a_very_long_email_local_part_that_exceeds_sixty_characters_in_total_length@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    -- 3e: Symbols only
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_hostile5_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '...---___@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    -- 3f: Unicode characters
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_hostile6_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'اردو@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    IF (SELECT bool_and(username ~ v_username_regex) FROM public.profiles WHERE id IN (v_hostile1_id, v_hostile2_id, v_hostile3_id, v_hostile4_id, v_hostile5_id, v_hostile6_id)) THEN
        INSERT INTO test_27_results VALUES (3, 'Hostile emails yield regex-compliant usernames', 'PASS',
            'All 6 hostile email variants produced valid usernames matching ^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$');
    ELSE
        INSERT INTO test_27_results VALUES (3, 'Hostile emails yield regex-compliant usernames', 'FAIL',
            'One or more hostile email variants failed regex check');
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 4: Explicit invalid username replaced with valid username
    -- -------------------------------------------------------------------------
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        v_inv_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'invaliduser27@unb.pk', '', pg_catalog.now(), '{}'::jsonb,
        '{"username": "INVALID SPACES AND SYMBOLS!@#"}'::jsonb,
        pg_catalog.now(), pg_catalog.now()
    );

    SELECT username INTO v_prof FROM public.profiles WHERE id = v_inv_user_id;

    IF v_prof.username <> 'INVALID SPACES AND SYMBOLS!@#' AND v_prof.username ~ v_username_regex THEN
        INSERT INTO test_27_results VALUES (4, 'Invalid metadata username sanitized to regex', 'PASS',
            format('Sanitized username: %s', v_prof.username));
    ELSE
        INSERT INTO test_27_results VALUES (4, 'Invalid metadata username sanitized to regex', 'FAIL',
            format('Failed to sanitize: %s', v_prof.username));
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 5: Username collision retry loop handles duplicate without failing
    -- -------------------------------------------------------------------------
    -- Pre-insert first user with an explicit valid username
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        v_clash_pre_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'clashpre@unb.pk', '', pg_catalog.now(), '{}'::jsonb,
        '{"username": "shared_clash_name"}'::jsonb,
        pg_catalog.now(), pg_catalog.now()
    );

    -- Insert second user requesting the EXACT same username
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
        v_clash_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'clashsecond@unb.pk', '', pg_catalog.now(), '{}'::jsonb,
        '{"username": "shared_clash_name"}'::jsonb,
        pg_catalog.now(), pg_catalog.now()
    );

    SELECT username INTO v_prof FROM public.profiles WHERE id = v_clash_user_id;

    IF v_prof.username IS NOT NULL AND v_prof.username <> 'shared_clash_name' AND v_prof.username ~ v_username_regex THEN
        INSERT INTO test_27_results VALUES (5, 'Forced username collision retried safely', 'PASS',
            format('Original collision resolved to: %s', v_prof.username));
    ELSE
        INSERT INTO test_27_results VALUES (5, 'Forced username collision retried safely', 'FAIL',
            format('Collision resolution failed: %s', coalesce(v_prof.username, 'NULL')));
    END IF;

    -- -------------------------------------------------------------------------
    -- FIXTURE SETUP FOR CHAPTER ACCESS & LIBRARY TESTS
    -- -------------------------------------------------------------------------
    -- 1. Create Author user & profile
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_author_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author_27@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    UPDATE public.profiles SET role = 'writer', is_active = true WHERE id = v_author_id;

    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES (
        v_author_id, 'مصنف ستائیس', 'Author 27', 'بایو', 'approved', NULL, 5000, 0, false
    ) ON CONFLICT (id) DO UPDATE SET status = 'approved';

    -- 2. Create Active Reader
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_active_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'active_reader_27@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    UPDATE public.profiles SET is_active = true WHERE id = v_active_reader_id;

    -- 3. Create Inactive / Deactivated Reader
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_inactive_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inactive_reader_27@unb.pk', '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now());

    UPDATE public.profiles SET is_active = false WHERE id = v_inactive_reader_id;

    -- 4. Create Novel with 1 free preview chapter and 1 paid chapter
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu,
        price_pkr, language, status, total_chapters, created_at, updated_at
    ) VALUES (
        v_novel_id, v_author_id, 'test-novel-27', 'ٹیسٹ ناول ستائیس', 'Test Novel 27',
        'خلاصہ ٹیسٹ ناول ستائیس', 150, 'ur', 'published', 2, pg_catalog.now(), pg_catalog.now()
    );

    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published, created_at, updated_at
    ) VALUES
        (v_ch1_id, v_novel_id, 1, 'پہلا مفت باب', 'مفت پیش نظارہ مواد', true, true, pg_catalog.now(), pg_catalog.now()),
        (v_ch2_id, v_novel_id, 2, 'دوسرا خریدا ہوا باب', 'خفیہ ادا شدہ باب کا مواد', false, true, pg_catalog.now(), pg_catalog.now());

    -- 5. Create orders and entitlements for both active and inactive readers
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
        amount_pkr, applied_commission_rate, calculated_commission_pkr, calculated_writer_share_pkr, status
    ) VALUES
        (v_order1_id, 'ORD-27-001', v_active_reader_id, v_author_id, v_novel_id, 'ٹیسٹ ناول ستائیس', 150, 30.00, 45.00, 105.00, 'verified'),
        (v_order2_id, 'ORD-27-002', v_inactive_reader_id, v_author_id, v_novel_id, 'ٹیسٹ ناول ستائیس', 150, 30.00, 45.00, 105.00, 'verified');

    INSERT INTO public.purchase_entitlements (id, order_id, reader_id, novel_id, is_revoked, granted_at)
    VALUES
        (gen_random_uuid(), v_order1_id, v_active_reader_id, v_novel_id, false, pg_catalog.now()),
        (gen_random_uuid(), v_order2_id, v_inactive_reader_id, v_novel_id, false, pg_catalog.now());

    -- -------------------------------------------------------------------------
    -- TEST 6: Active entitled reader can read paid chapter
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_active_reader_id::text, 'role', 'authenticated')::text, true);

    BEGIN
        v_res := public.get_chapter_for_reader('test-novel-27', 2);
        IF (v_res->>'access_reason') = 'entitled' AND (v_res->>'content_urdu') = 'خفیہ ادا شدہ باب کا مواد' THEN
            INSERT INTO test_27_results VALUES (6, 'Active entitled reader reads paid chapter', 'PASS',
                format('access_reason=%s, chapter=%s', v_res->>'access_reason', v_res->>'chapter_number'));
        ELSE
            INSERT INTO test_27_results VALUES (6, 'Active entitled reader reads paid chapter', 'FAIL',
                format('Unexpected payload: %s', v_res::text));
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            INSERT INTO test_27_results VALUES (6, 'Active entitled reader reads paid chapter', 'FAIL',
                format('Unexpected error: %s', SQLERRM));
    END;

    -- -------------------------------------------------------------------------
    -- TEST 7: Inactive / deactivated entitled reader DENIED paid chapter
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_inactive_reader_id::text, 'role', 'authenticated')::text, true);

    v_caught := false;
    v_err := '';
    BEGIN
        v_res := public.get_chapter_for_reader('test-novel-27', 2);
    EXCEPTION
        WHEN OTHERS THEN
            v_caught := true;
            v_err := SQLERRM;
    END;

    IF v_caught AND v_err = 'Chapter not found' THEN
        INSERT INTO test_27_results VALUES (7, 'Deactivated reader denied paid chapter access', 'PASS',
            format('Expected generic denial caught: %s', v_err));
    ELSE
        INSERT INTO test_27_results VALUES (7, 'Deactivated reader denied paid chapter access', 'FAIL',
            format('Security failure! Access allowed or incorrect error: caught=%s, err=%s', v_caught, v_err));
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 8: Deactivated reader CAN read free-preview chapter
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_inactive_reader_id::text, 'role', 'authenticated')::text, true);

    BEGIN
        v_res := public.get_chapter_for_reader('test-novel-27', 1);
        IF (v_res->>'access_reason') = 'free_preview' AND (v_res->>'content_urdu') = 'مفت پیش نظارہ مواد' THEN
            INSERT INTO test_27_results VALUES (8, 'Deactivated reader can read free preview', 'PASS',
                format('access_reason=%s, chapter=%s', v_res->>'access_reason', v_res->>'chapter_number'));
        ELSE
            INSERT INTO test_27_results VALUES (8, 'Deactivated reader can read free preview', 'FAIL',
                format('Unexpected preview payload: %s', v_res::text));
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            INSERT INTO test_27_results VALUES (8, 'Deactivated reader can read free preview', 'FAIL',
                format('Unexpected preview denial error: %s', SQLERRM));
    END;

    -- -------------------------------------------------------------------------
    -- TEST 9: get_my_library executes with zero SQL error and returns entitled novel for active reader
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_active_reader_id::text, 'role', 'authenticated')::text, true);
    v_caught := false;
    v_err := '';
    BEGIN
        v_res := public.get_my_library();
    EXCEPTION
        WHEN OTHERS THEN
            v_caught := true;
            v_err := SQLERRM;
    END;

    IF v_caught THEN
        INSERT INTO test_27_results VALUES (9, 'Active reader get_my_library succeeds without SQL error', 'FAIL',
            format('SQL error during get_my_library(): %s', v_err));
    ELSIF pg_catalog.jsonb_array_length(v_res) <> 1 THEN
        INSERT INTO test_27_results VALUES (9, 'Active reader get_my_library succeeds without SQL error', 'FAIL',
            format('Expected 1 novel, got length=%s', pg_catalog.jsonb_array_length(v_res)::text));
    ELSE
        v_item := v_res->0;
        IF (v_item->>'novel_id')::uuid = v_novel_id
           AND (v_item->>'novel_slug') = 'test-novel-27'
           AND (v_item->>'title_urdu') = 'ٹیسٹ ناول ستائیس'
           AND (v_item ? 'cover_url')
           AND (v_item ? 'granted_at')
           AND (v_item ? 'order_number')
           AND (v_item->>'is_temporarily_unavailable')::boolean = false THEN
            INSERT INTO test_27_results VALUES (9, 'Active reader get_my_library succeeds without SQL error', 'PASS',
                format('Returned entitled novel with canonical 0016 columns: slug=%s, granted_at=%s', v_item->>'novel_slug', v_item->>'granted_at'));
        ELSE
            INSERT INTO test_27_results VALUES (9, 'Active reader get_my_library succeeds without SQL error', 'FAIL',
                format('Canonical column verification failed: %s', v_item::text));
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 10: get_my_library executes with zero SQL error and returns empty library for deactivated reader
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_inactive_reader_id::text, 'role', 'authenticated')::text, true);
    v_caught := false;
    v_err := '';
    BEGIN
        v_res := public.get_my_library();
    EXCEPTION
        WHEN OTHERS THEN
            v_caught := true;
            v_err := SQLERRM;
    END;

    IF v_caught THEN
        INSERT INTO test_27_results VALUES (10, 'Deactivated reader get_my_library returns empty library', 'FAIL',
            format('SQL error during get_my_library(): %s', v_err));
    ELSIF pg_catalog.jsonb_array_length(v_res) = 0 THEN
        INSERT INTO test_27_results VALUES (10, 'Deactivated reader get_my_library returns empty library', 'PASS',
            'Zero SQL error; returned exact empty library shape []');
    ELSE
        INSERT INTO test_27_results VALUES (10, 'Deactivated reader get_my_library returns empty library', 'FAIL',
            format('Deactivated reader saw novels: %s', v_res::text));
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 11: has_novel_entitlement returns true for active reader and false for deactivated reader
    -- -------------------------------------------------------------------------
    -- 11a: Active reader check
    PERFORM set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_active_reader_id::text, 'role', 'authenticated')::text, true);
    v_has_ent := public.has_novel_entitlement(v_novel_id);

    -- 11b: Deactivated reader check
    PERFORM set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_inactive_reader_id::text, 'role', 'authenticated')::text, true);
    IF v_has_ent = true AND public.has_novel_entitlement(v_novel_id) = false THEN
        INSERT INTO test_27_results VALUES (11, 'has_novel_entitlement respects active reader status', 'PASS',
            'Active reader entitlement=true; deactivated reader entitlement=false');
    ELSE
        INSERT INTO test_27_results VALUES (11, 'has_novel_entitlement respects active reader status', 'FAIL',
            format('Active reader entitlement=%s; deactivated reader entitlement=%s', v_has_ent::text, public.has_novel_entitlement(v_novel_id)::text));
    END IF;

END $$;

-- ------------------------------------------------------------------------------
-- 2. REPORT RESULTS
-- ------------------------------------------------------------------------------
SELECT
    test_id,
    test_name,
    status,
    details
FROM test_27_results
ORDER BY test_id;

-- ------------------------------------------------------------------------------
-- 3. ALWAYS ROLLBACK SO NOTHING PERSISTS
-- ------------------------------------------------------------------------------
ROLLBACK;
