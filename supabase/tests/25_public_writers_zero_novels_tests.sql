-- ==============================================================================
-- UNB Premium — Test Suite 25: Public Writers View Zero Novels & Status Isolation
-- Verifies:
--   1. Approved, active author with 0 published novels is returned in public_writers
--      with published_novels_count = 0.
--   2. Author with published novel is returned with published_novels_count = 1.
--   3. Suspended author (status = 'suspended') returns 0 rows.
--   4. Deactivated author profile (is_active = false) returns 0 rows.
--   5. Pending approval applicant (status = 'pending_approval') returns 0 rows.
--   6. Anonymous role (anon) can directly SELECT from public.public_writers
--      without encountering base-table RLS permission denial.
-- ==============================================================================

DO $$
DECLARE
    v_approved_zero_id   uuid := '25252525-0000-0000-0000-000000000001'::uuid;
    v_approved_novel_id  uuid := '25252525-0000-0000-0000-000000000002'::uuid;
    v_suspended_id       uuid := '25252525-0000-0000-0000-000000000003'::uuid;
    v_inactive_id        uuid := '25252525-0000-0000-0000-000000000004'::uuid;
    v_pending_id         uuid := '25252525-0000-0000-0000-000000000005'::uuid;

    v_novel_id           uuid := gen_random_uuid();
    v_count              integer;
    v_novel_count        integer;
BEGIN
    RAISE NOTICE '=== Running Test Suite 25: Public Writers Zero Novels & Status Isolation ===';

    -- -------------------------------------------------------------------------
    -- 0. FIXTURE SETUP
    -- -------------------------------------------------------------------------
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_approved_zero_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_zero25@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_approved_novel_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_novel25@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_suspended_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_suspended25@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_inactive_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_inactive25@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_pending_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_pending25@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, role, username, display_name, email, is_active)
    VALUES
        (v_approved_zero_id, 'writer', 'saba_zero25', 'Saba Zero', 'writer_zero25@unb.pk', true),
        (v_approved_novel_id, 'writer', 'tariq_novel25', 'Tariq Novel', 'writer_novel25@unb.pk', true),
        (v_suspended_id, 'writer', 'suspended_w25', 'Suspended Writer', 'writer_suspended25@unb.pk', true),
        (v_inactive_id, 'writer', 'inactive_w25', 'Inactive Writer', 'writer_inactive25@unb.pk', false),
        (v_pending_id, 'writer', 'pending_w25', 'Pending Writer', 'writer_pending25@unb.pk', true)
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active,
        username = EXCLUDED.username;

    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES
        (v_approved_zero_id, 'صبا خان', 'Saba Khan', 'نئی اردو مصنفہ', 'approved', NULL, 5000, 0, false),
        (v_approved_novel_id, 'طارق عزیز', 'Tariq Aziz', 'معروف ناول نگار', 'approved', NULL, 5000, 0, false),
        (v_suspended_id, 'معطل مصنف', 'Suspended Author', 'معطل کھاتہ', 'suspended', NULL, 5000, 0, false),
        (v_inactive_id, 'غیر فعال مصنف', 'Inactive Author', 'غیر فعال کھاتہ', 'approved', NULL, 5000, 0, false),
        (v_pending_id, 'زیر جائزہ مصنف', 'Pending Author', 'درخواست زیر جائزہ', 'pending_approval', NULL, 5000, 0, false)
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status;

    -- Add published novel for Tariq Aziz only
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu,
        cover_url, price_pkr, language, status, total_chapters, is_featured,
        rights_declaration_accepted, published_at
    ) VALUES (
        v_novel_id, v_approved_novel_id, 'test-novel-25', 'ٹیسٹ ناول ۲۵', 'Test Novel 25', 'خلاصہ',
        'https://example.com/cover25.jpg', 350, 'Urdu', 'published', 1, false,
        true, pg_catalog.now()
    ) ON CONFLICT (id) DO UPDATE SET status = 'published';

    -- -------------------------------------------------------------------------
    -- TEST 1: Approved Writer With 0 Published Novels Appears in public.public_writers
    -- -------------------------------------------------------------------------
    SELECT count(*), coalesce(max(published_novels_count), -1)
    INTO v_count, v_novel_count
    FROM public.public_writers
    WHERE id = v_approved_zero_id;

    IF v_count = 1 AND v_novel_count = 0 THEN
        RAISE NOTICE 'SUCCESS: Test 1 - Approved author with 0 published novels visible in public_writers with published_novels_count = 0';
    ELSE
        RAISE EXCEPTION 'FAILURE: Test 1 - Expected 1 row with novel_count=0, got count=% novel_count=%', v_count, v_novel_count;
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 2: Approved Writer With 1 Published Novel Has published_novels_count = 1
    -- -------------------------------------------------------------------------
    SELECT count(*), coalesce(max(published_novels_count), -1)
    INTO v_count, v_novel_count
    FROM public.public_writers
    WHERE id = v_approved_novel_id;

    IF v_count = 1 AND v_novel_count = 1 THEN
        RAISE NOTICE 'SUCCESS: Test 2 - Approved author with published novel visible with published_novels_count = 1';
    ELSE
        RAISE EXCEPTION 'FAILURE: Test 2 - Expected 1 row with novel_count=1, got count=% novel_count=%', v_count, v_novel_count;
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 3: Suspended Author MUST NOT Appear in public.public_writers
    -- -------------------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM public.public_writers
    WHERE id = v_suspended_id;

    IF v_count = 0 THEN
        RAISE NOTICE 'SUCCESS: Test 3 - Suspended author strictly hidden from public_writers';
    ELSE
        RAISE EXCEPTION 'FAILURE: Test 3 - Suspended author leaked into public_writers!';
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 4: Inactive Account (is_active = false) MUST NOT Appear in public.public_writers
    -- -------------------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM public.public_writers
    WHERE id = v_inactive_id;

    IF v_count = 0 THEN
        RAISE NOTICE 'SUCCESS: Test 4 - Inactive user profile strictly hidden from public_writers';
    ELSE
        RAISE EXCEPTION 'FAILURE: Test 4 - Inactive user leaked into public_writers!';
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 5: Pending Approval Author MUST NOT Appear in public.public_writers
    -- -------------------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM public.public_writers
    WHERE id = v_pending_id;

    IF v_count = 0 THEN
        RAISE NOTICE 'SUCCESS: Test 5 - Pending approval applicant strictly hidden from public_writers';
    ELSE
        RAISE EXCEPTION 'FAILURE: Test 5 - Pending approval applicant leaked into public_writers!';
    END IF;

    -- -------------------------------------------------------------------------
    -- TEST 6: Anonymous (anon) Role Can Query public.public_writers
    -- -------------------------------------------------------------------------
    PERFORM pg_catalog.set_config('role', 'anon', true);

    SELECT count(*) INTO v_count
    FROM public.public_writers
    WHERE id = v_approved_zero_id;

    IF v_count = 1 THEN
        RAISE NOTICE 'SUCCESS: Test 6 - Anonymous caller can read approved writer with 0 novels via security_invoker = false';
    ELSE
        RAISE EXCEPTION 'FAILURE: Test 6 - Anonymous caller blocked or unable to read public_writers row!';
    END IF;

    -- Reset role
    PERFORM pg_catalog.set_config('role', 'postgres', true);

    RAISE NOTICE '=== All Test Suite 25 checks PASSED successfully! ===';
END $$;

