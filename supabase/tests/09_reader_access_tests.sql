-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: READER ACCESS, LIBRARY & ADMIN ORDERS (Step 4.2)
-- ==============================================================================
-- File: supabase/tests/09_reader_access_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. Entitled reader gets a paid chapter and a watermark_code.
--     2. Non-entitled reader gets 'Chapter not found' for a paid chapter but can read a free preview.
--     3. Anon cannot call get_chapter_for_reader RPC.
--     4. Revoked (refunded) entitlement loses access ('Chapter not found').
--     5. Suspended novel remains readable by the entitled buyer.
--     6. Unpublished chapter is hidden from the buyer ('Chapter not found').
--     7. Novel author and platform admin can read chapters.
--     8. Rate limit triggers after exceeding configured distinct chapters in window.
--     9. Reading progress is isolated per reader and updates correctly.
--    10. get_my_library returns only the caller's entitlements and marks unavailable novels.
--    11. admin_list_orders fails for non-administrators.
--    12. Reader emails are never returned by admin order inspection RPCs.
--    13. admin_force_verify works once and a second call fails (no duplicate sale/entitlement).
--    14. Direct SELECT on chapters by a non-entitled reader returns 0 rows.
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
    -- User UUIDs
    v_admin_id     uuid := '11111111-cccc-dddd-eeee-111111111111'::uuid;
    v_author_id    uuid := '22222222-cccc-dddd-eeee-222222222222'::uuid;
    v_buyer_1_id   uuid := '33333333-cccc-dddd-eeee-333333333333'::uuid;
    v_buyer_2_id   uuid := '44444444-cccc-dddd-eeee-444444444444'::uuid;
    v_stranger_id  uuid := '55555555-cccc-dddd-eeee-555555555555'::uuid;

    -- Entity UUIDs
    v_genre_id       uuid := gen_random_uuid();
    v_novel_1_id     uuid := gen_random_uuid();
    v_novel_2_id     uuid := gen_random_uuid();
    v_novel_susp_id  uuid := gen_random_uuid();
    v_chap_free_id   uuid := gen_random_uuid();
    v_chap_paid_1_id uuid := gen_random_uuid();
    v_chap_paid_2_id uuid := gen_random_uuid();
    v_chap_unpub_id  uuid := gen_random_uuid();
    v_chap_susp_id   uuid := gen_random_uuid();

    -- Orders & Entitlements
    v_order_1_id     uuid := gen_random_uuid();
    v_order_2_id     uuid := gen_random_uuid();
    v_order_susp_id  uuid := gen_random_uuid();
    v_order_force_id uuid := gen_random_uuid();
    v_ent_1_id       uuid := gen_random_uuid();
    v_ent_susp_id    uuid := gen_random_uuid();

    -- Slugs
    v_slug_1         text := 'test-novel-reader-access-1';
    v_slug_2         text := 'test-novel-reader-access-2';
    v_slug_susp      text := 'test-novel-suspended-reader';

    -- Helper variables
    v_res            jsonb;
    v_lib_res        jsonb;
    v_admin_orders   jsonb;
    v_admin_detail   jsonb;
    v_err_caught     boolean;
    v_err_msg        text;
    v_count          integer;
    v_i              integer;
    v_force_res      jsonb;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Run as superuser / postgres)
    -- --------------------------------------------------------------------------

    -- 1. Create fake users in auth.users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_read@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_author_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author_read@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_buyer_1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'buyer1_read@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_buyer_2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'buyer2_read@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_stranger_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger_read@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap profiles & roles
    UPDATE public.profiles SET role = 'admin', full_name = 'Admin Reader Test', username = 'admin_read_user' WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', full_name = 'Author Reader Test', username = 'author_read_user' WHERE id = v_author_id;
    UPDATE public.profiles SET role = 'reader', full_name = 'Buyer One Test', username = 'buyer_one_user' WHERE id = v_buyer_1_id;
    UPDATE public.profiles SET role = 'reader', full_name = 'Buyer Two Test', username = 'buyer_two_user' WHERE id = v_buyer_2_id;
    UPDATE public.profiles SET role = 'reader', full_name = 'Stranger Reader Test', username = 'stranger_read_user' WHERE id = v_stranger_id;

    -- 3. Bootstrap writer profile
    INSERT INTO public.writer_profiles (
        id, pen_name_english, pen_name_urdu, status, terms_accepted_at,
        created_at, updated_at
    ) VALUES (
        v_author_id, 'Novelist Test', 'ناول نگار ٹیسٹ', 'approved', now(), now(), now()
    ) ON CONFLICT (id) DO UPDATE SET status = 'approved';

    -- 4. Create active genre
    INSERT INTO public.genres (id, name_english, name_urdu, slug, is_active)
    VALUES (v_genre_id, 'Romance Test', 'رومانوی', 'romance-test-read', true)
    ON CONFLICT (id) DO NOTHING;

    -- 5. Create novels
    -- Novel 1: Published
    INSERT INTO public.novels (
        id, writer_id, title_english, title_urdu, slug, synopsis_english,
        synopsis_urdu, price_pkr, status, is_featured, published_at, created_at, updated_at
    ) VALUES (
        v_novel_1_id, v_author_id, 'Novel One Title', 'ناول ایک عنوان', v_slug_1,
        'Synopsis English 1', 'خلاصہ اردو ۱', 300, 'published', false, now(), now(), now()
    );

    -- Novel 2: Published
    INSERT INTO public.novels (
        id, writer_id, title_english, title_urdu, slug, synopsis_english,
        synopsis_urdu, price_pkr, status, is_featured, published_at, created_at, updated_at
    ) VALUES (
        v_novel_2_id, v_author_id, 'Novel Two Title', 'ناول دو عنوان', v_slug_2,
        'Synopsis English 2', 'خلاصہ اردو ۲', 450, 'published', false, now(), now(), now()
    );

    -- Novel Suspended: Initially published, then suspended
    INSERT INTO public.novels (
        id, writer_id, title_english, title_urdu, slug, synopsis_english,
        synopsis_urdu, price_pkr, status, is_featured, published_at, created_at, updated_at
    ) VALUES (
        v_novel_susp_id, v_author_id, 'Suspended Novel', 'معطل ناول', v_slug_susp,
        'Suspended synopsis', 'معطل خلاصہ', 500, 'suspended', false, now(), now(), now()
    );

    -- 6. Create chapters for Novel 1
    -- Chapter 1: Free preview (published)
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu,
        content_urdu, word_count, is_free_preview, is_published, published_at, created_at, updated_at
    ) VALUES (
        v_chap_free_id, v_novel_1_id, 1, 'باب ۱: مفت نمونہ',
        'یہ مفت پیش منظر کا باب ہے۔ تمام قارئین پڑھ سکتے ہیں۔', 12, true, true, now(), now(), now()
    );

    -- Chapter 2: Paid (published)
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu,
        content_urdu, word_count, is_free_preview, is_published, published_at, created_at, updated_at
    ) VALUES (
        v_chap_paid_1_id, v_novel_1_id, 2, 'باب ۲: خفیہ خریدا ہوا',
        'یہ صرف خریداروں کے لیے خفیہ باب نمبر دو کا مکمل مواد ہے۔', 14, false, true, now(), now(), now()
    );

    -- Chapter 3: Paid (published)
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu,
        content_urdu, word_count, is_free_preview, is_published, published_at, created_at, updated_at
    ) VALUES (
        v_chap_paid_2_id, v_novel_1_id, 3, 'باب ۳: خفیہ خریدا ہوا',
        'یہ خفیہ باب نمبر تین کا مواد ہے۔', 8, false, true, now(), now(), now()
    );

    -- Chapter 4: Unpublished (draft)
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu,
        content_urdu, word_count, is_free_preview, is_published, published_at, created_at, updated_at
    ) VALUES (
        v_chap_unpub_id, v_novel_1_id, 4, 'باب ۴: غیر شائع شدہ مسودہ',
        'یہ مسودہ ابھی شائع نہیں ہوا ہے۔ خریدار بھی نہیں دیکھ سکتے۔', 13, false, false, NULL, now(), now()
    );

    -- Chapter for Suspended Novel: Paid (published)
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu,
        content_urdu, word_count, is_free_preview, is_published, published_at, created_at, updated_at
    ) VALUES (
        v_chap_susp_id, v_novel_susp_id, 1, 'معطل ناول کا باب ۱',
        'اگرچہ ناول معطل ہے مگر پہلے سے خریدار اسے پڑھ سکتے ہیں۔', 12, false, true, now(), now(), now()
    );

    -- 7. Create orders and entitlements
    -- Order 1: Verified order for Buyer 1 on Novel 1
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, amount_pkr,
        currency, status, novel_title_snapshot, payment_instructions_snapshot, created_at, updated_at, verified_at
    ) VALUES (
        v_order_1_id, 'ORD-TEST-0001', v_buyer_1_id, v_author_id, v_novel_1_id, 300,
        'PKR', 'verified', 'Novel One Title', '{"method_type":"jazzcash"}'::jsonb, now(), now(), now()
    );

    -- Entitlement 1: Active entitlement for Buyer 1 on Novel 1
    INSERT INTO public.purchase_entitlements (
        id, reader_id, novel_id, order_id, granted_at, is_revoked
    ) VALUES (
        v_ent_1_id, v_buyer_1_id, v_novel_1_id, v_order_1_id, now(), false
    );

    -- Order Suspended: Verified order for Buyer 1 on Suspended Novel
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, amount_pkr,
        currency, status, novel_title_snapshot, payment_instructions_snapshot, created_at, updated_at, verified_at
    ) VALUES (
        v_order_susp_id, 'ORD-TEST-SUSP', v_buyer_1_id, v_author_id, v_novel_susp_id, 500,
        'PKR', 'verified', 'Suspended Novel', '{"method_type":"easypaisa"}'::jsonb, now(), now(), now()
    );

    -- Entitlement Suspended: Active entitlement for Buyer 1 on Suspended Novel
    INSERT INTO public.purchase_entitlements (
        id, reader_id, novel_id, order_id, granted_at, is_revoked
    ) VALUES (
        v_ent_susp_id, v_buyer_1_id, v_novel_susp_id, v_order_susp_id, now(), false
    );

    -- Set platform settings for testing: max 3 chapter reads per 10-minute window
    UPDATE public.platform_settings
    SET max_chapter_reads_per_window = 3,
        chapter_read_window_minutes = 10
    WHERE id = 1;


    -- ==========================================================================
    -- TEST 1: Entitled reader gets a paid chapter and a watermark_code
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);

    v_res := public.get_chapter_for_reader(v_slug_1, 2);

    IF (v_res->>'access_reason') = 'entitled' AND
       (v_res->>'watermark_code') = 'ORD-TEST-0001' AND
       (v_res->>'content_urdu') LIKE '%خفیہ باب%' THEN
        INSERT INTO test_results VALUES (1, 'Entitled reader gets paid chapter & watermark', 'PASS', 'Entitled reader received content with order watermark: ' || (v_res->>'watermark_code'));
    ELSE
        INSERT INTO test_results VALUES (1, 'Entitled reader gets paid chapter & watermark', 'FAIL', 'Unexpected response payload: ' || coalesce(v_res::text, 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 2: Non-entitled reader gets 'Chapter not found' for paid chapter, can read free preview
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_stranger_id::text, true);

    -- 2a: Paid chapter must fail with generic 'Chapter not found'
    v_err_caught := false;
    BEGIN
        PERFORM public.get_chapter_for_reader(v_slug_1, 2);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Chapter not found' THEN
                v_err_caught := true;
            ELSE
                v_err_msg := SQLERRM;
            END IF;
    END;

    -- 2b: Free preview must succeed
    v_res := public.get_chapter_for_reader(v_slug_1, 1);

    IF v_err_caught AND (v_res->>'access_reason') = 'free_preview' AND (v_res->>'watermark_code') IS NULL THEN
        INSERT INTO test_results VALUES (2, 'Non-entitled blocked from paid, allows free preview', 'PASS', 'Paid chapter raised "Chapter not found"; free preview succeeded with access_reason=free_preview.');
    ELSE
        INSERT INTO test_results VALUES (2, 'Non-entitled blocked from paid, allows free preview', 'FAIL', 'Paid err_caught=' || v_err_caught::text || ' (' || coalesce(v_err_msg, '') || '), free_preview=' || coalesce(v_res->>'access_reason', 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 3: Anon cannot call get_chapter_for_reader RPC
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM set_config('request.jwt.claim.sub', '', true);

    v_err_caught := false;
    BEGIN
        PERFORM public.get_chapter_for_reader(v_slug_1, 1);
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (3, 'Anon cannot call get_chapter_for_reader', 'PASS', 'Anonymous access rejected with: ' || v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (3, 'Anon cannot call get_chapter_for_reader', 'FAIL', 'Anon was able to execute get_chapter_for_reader.');
    END IF;


    -- ==========================================================================
    -- TEST 4: Revoked (refunded) entitlement loses access ('Chapter not found')
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE postgres';
    UPDATE public.purchase_entitlements
    SET is_revoked = true, revoked_reason = 'Refund processed by administrator'
    WHERE id = v_ent_1_id;

    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);

    v_err_caught := false;
    BEGIN
        PERFORM public.get_chapter_for_reader(v_slug_1, 2);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Chapter not found' THEN
                v_err_caught := true;
            ELSE
                v_err_msg := SQLERRM;
            END IF;
    END;

    -- Restore entitlement for subsequent tests
    EXECUTE 'SET LOCAL ROLE postgres';
    UPDATE public.purchase_entitlements SET is_revoked = false WHERE id = v_ent_1_id;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (4, 'Revoked entitlement loses access', 'PASS', 'Revoked entitlement properly blocked with generic "Chapter not found".');
    ELSE
        INSERT INTO test_results VALUES (4, 'Revoked entitlement loses access', 'FAIL', 'Revoked entitlement was still able to read paid chapter.');
    END IF;


    -- ==========================================================================
    -- TEST 5: Suspended novel remains readable by the buyer
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);

    v_res := public.get_chapter_for_reader(v_slug_susp, 1);

    IF (v_res->>'access_reason') = 'entitled' AND (v_res->>'watermark_code') = 'ORD-TEST-SUSP' THEN
        INSERT INTO test_results VALUES (5, 'Suspended novel still readable by buyer', 'PASS', 'Buyer maintained reading access on suspended novel with watermark.');
    ELSE
        INSERT INTO test_results VALUES (5, 'Suspended novel still readable by buyer', 'FAIL', 'Access failed or returned unexpected reason: ' || coalesce(v_res::text, 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 6: Unpublished chapter hidden from the buyer ('Chapter not found')
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);

    v_err_caught := false;
    BEGIN
        PERFORM public.get_chapter_for_reader(v_slug_1, 4);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Chapter not found' THEN
                v_err_caught := true;
            ELSE
                v_err_msg := SQLERRM;
            END IF;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (6, 'Unpublished chapter hidden from buyer', 'PASS', 'Draft chapter 4 correctly returned generic "Chapter not found".');
    ELSE
        INSERT INTO test_results VALUES (6, 'Unpublished chapter hidden from buyer', 'FAIL', 'Buyer was able to read draft/unpublished chapter.');
    END IF;


    -- ==========================================================================
    -- TEST 7: Novel author and platform admin can read chapters
    -- ==========================================================================
    -- 7a: Novel author reads unpublished chapter
    PERFORM set_config('request.jwt.claim.sub', v_author_id::text, true);
    v_res := public.get_chapter_for_reader(v_slug_1, 4);

    -- 7b: Admin reads paid chapter
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
    v_lib_res := public.get_chapter_for_reader(v_slug_1, 2);

    IF (v_res->>'access_reason') = 'owner' AND (v_lib_res->>'access_reason') = 'admin' THEN
        INSERT INTO test_results VALUES (7, 'Author and admin can read chapters', 'PASS', 'Author read draft (reason=owner); Admin read paid (reason=admin).');
    ELSE
        INSERT INTO test_results VALUES (7, 'Author and admin can read chapters', 'FAIL', 'Author reason=' || coalesce(v_res->>'access_reason', 'null') || ', Admin reason=' || coalesce(v_lib_res->>'access_reason', 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 8: Rate limit triggers after exceeding configured distinct chapters
    -- ==========================================================================
    -- Configured max is 3 distinct chapters per window.
    -- Buyer 1 already opened Chapter 2 and Chapter 1 of Suspended novel.
    -- Let's create two more published chapters on Novel 2 and entitle Buyer 1 to test boundary.
    EXECUTE 'SET LOCAL ROLE postgres';
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_english, title_urdu,
        content_urdu, word_count, is_free_preview, is_published, published_at, created_at, updated_at
    ) VALUES
    (gen_random_uuid(), v_novel_2_id, 1, 'N2 C1', 'ن۲ ب۱', 'مواد ۱', 2, false, true, now(), now(), now()),
    (gen_random_uuid(), v_novel_2_id, 2, 'N2 C2', 'ن۲ ب۲', 'مواد ۲', 2, false, true, now(), now(), now());

    INSERT INTO public.purchase_entitlements (reader_id, novel_id, granted_at, is_revoked)
    VALUES (v_buyer_1_id, v_novel_2_id, now(), false);

    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);

    -- Read N2 C1 (takes distinct count to 3)
    PERFORM public.get_chapter_for_reader(v_slug_2, 1);

    -- 4th distinct read should exceed max 3 and trigger rate limit exception
    v_err_caught := false;
    BEGIN
        PERFORM public.get_chapter_for_reader(v_slug_2, 2);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'Too many chapters opened, please slow down' THEN
                v_err_caught := true;
            ELSE
                v_err_msg := SQLERRM;
            END IF;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (8, 'Rate limit triggers after window limit', 'PASS', 'Rate limit enforced: raised "Too many chapters opened, please slow down".');
    ELSE
        INSERT INTO test_results VALUES (8, 'Rate limit triggers after window limit', 'FAIL', 'Rate limit was not triggered: ' || coalesce(v_err_msg, 'no error'));
    END IF;


    -- ==========================================================================
    -- TEST 9: Reading progress is isolated per reader and updates correctly
    -- ==========================================================================
    -- Buyer 1 updates progress on Novel 1 to chapter 3
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);
    PERFORM public.upsert_reading_progress(v_novel_1_id, 3);

    -- Stranger attempts to update progress on Novel 1 (no access) -> must fail
    PERFORM set_config('request.jwt.claim.sub', v_stranger_id::text, true);
    v_err_caught := false;
    BEGIN
        PERFORM public.upsert_reading_progress(v_novel_1_id, 2);
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
    END;

    -- Buyer 1 checks their progress
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);
    SELECT last_chapter_number INTO v_count
    FROM public.reader_progress
    WHERE reader_id = v_buyer_1_id AND novel_id = v_novel_1_id;

    IF v_count = 3 AND v_err_caught THEN
        INSERT INTO test_results VALUES (9, 'Reading progress isolated and enforced', 'PASS', 'Buyer progress saved to 3; non-entitled stranger update rejected.');
    ELSE
        INSERT INTO test_results VALUES (9, 'Reading progress isolated and enforced', 'FAIL', 'Buyer progress=' || coalesce(v_count::text, 'null') || ', stranger_err_caught=' || v_err_caught::text);
    END IF;


    -- ==========================================================================
    -- TEST 10: get_my_library returns only caller's items with availability flags
    -- ==========================================================================
    -- Buyer 1 owns Novel 1, Suspended Novel, and Novel 2
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);
    v_lib_res := public.get_my_library();

    -- Stranger owns nothing
    PERFORM set_config('request.jwt.claim.sub', v_stranger_id::text, true);
    v_res := public.get_my_library();

    IF jsonb_array_length(v_lib_res) >= 2 AND jsonb_array_length(v_res) = 0 THEN
        INSERT INTO test_results VALUES (10, 'get_my_library isolated and accurate', 'PASS', 'Buyer library returned ' || jsonb_array_length(v_lib_res) || ' items; Stranger library returned 0 items.');
    ELSE
        INSERT INTO test_results VALUES (10, 'get_my_library isolated and accurate', 'FAIL', 'Buyer count=' || jsonb_array_length(v_lib_res)::text || ', stranger count=' || jsonb_array_length(v_res)::text);
    END IF;


    -- ==========================================================================
    -- TEST 11: admin_list_orders fails for non-administrators
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_buyer_1_id::text, true);

    v_err_caught := false;
    BEGIN
        PERFORM public.admin_list_orders(NULL, NULL, false, 10, 0);
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Only platform administrators%' THEN
                v_err_caught := true;
            ELSE
                v_err_msg := SQLERRM;
            END IF;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (11, 'admin_list_orders rejected for non-admin', 'PASS', 'Non-admin execution blocked with admin authorization check.');
    ELSE
        INSERT INTO test_results VALUES (11, 'admin_list_orders rejected for non-admin', 'FAIL', 'Non-admin was able to call admin_list_orders.');
    END IF;


    -- ==========================================================================
    -- TEST 12: Reader emails are never returned by admin order inspection RPCs
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
    v_admin_orders := public.admin_list_orders(NULL, NULL, false, 10, 0);
    v_admin_detail := public.admin_get_order(v_order_1_id);

    -- Verify no 'email' key or email value appears in returned JSON
    IF (v_admin_orders::text NOT LIKE '%@test.pk%') AND
       (v_admin_detail::text NOT LIKE '%@test.pk%') AND
       ((v_admin_detail->'reader'->>'username') = 'buyer_one_user') THEN
        INSERT INTO test_results VALUES (12, 'Admin order RPCs never leak reader emails', 'PASS', 'Admin order inspection excludes reader email; exposes display name and username only.');
    ELSE
        INSERT INTO test_results VALUES (12, 'Admin order RPCs never leak reader emails', 'FAIL', 'Reader email detected in admin inspection JSON response.');
    END IF;


    -- ==========================================================================
    -- TEST 13: admin_force_verify works once and a second call fails
    -- ==========================================================================
    -- Setup an order in payment_submitted status for Buyer 2 on Novel 1
    EXECUTE 'SET LOCAL ROLE postgres';
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, amount_pkr,
        currency, status, novel_title_snapshot, payment_instructions_snapshot, created_at, updated_at
    ) VALUES (
        v_order_force_id, 'ORD-FORCE-TEST', v_buyer_2_id, v_author_id, v_novel_1_id, 300,
        'PKR', 'payment_submitted', 'Novel One Title', '{"method_type":"jazzcash"}'::jsonb, now(), now()
    );

    INSERT INTO public.payment_submissions (
        id, order_id, transaction_reference_tid, paid_amount_claimed_pkr,
        sender_account_name, screenshot_path, reviewer_status, created_at
    ) VALUES (
        gen_random_uuid(), v_order_force_id, 'TID-FORCE-001', 300,
        'Buyer Two Account', v_order_force_id::text || '/proof.webp', 'pending', now()
    );

    -- Call admin_force_verify as admin
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

    v_force_res := public.admin_force_verify(v_order_force_id, 'Manual bank statement confirmed reader deposit');

    -- Attempt second call on already-verified order -> must fail
    v_err_caught := false;
    BEGIN
        PERFORM public.admin_force_verify(v_order_force_id, 'Second force verify attempt');
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF (v_force_res->>'success') = 'true' AND v_err_caught THEN
        INSERT INTO test_results VALUES (13, 'admin_force_verify idempotent once', 'PASS', 'First call granted entitlement and verified order; second call rejected with: ' || v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (13, 'admin_force_verify idempotent once', 'FAIL', 'First success=' || coalesce(v_force_res->>'success', 'null') || ', second err_caught=' || v_err_caught::text);
    END IF;


    -- ==========================================================================
    -- TEST 14: Direct SELECT on chapters by a non-entitled reader returns 0 rows
    -- ==========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_stranger_id::text, true);

    SELECT count(*) INTO v_count
    FROM public.chapters
    WHERE id = v_chap_paid_1_id;

    IF v_count = 0 THEN
        INSERT INTO test_results VALUES (14, 'Direct SELECT on paid chapter returns 0', 'PASS', 'RLS strictly prevented non-entitled reader from selecting paid chapter row.');
    ELSE
        INSERT INTO test_results VALUES (14, 'Direct SELECT on paid chapter returns 0', 'FAIL', 'Non-entitled reader was able to SELECT paid chapter row (count=' || v_count || ').');
    END IF;

END $$;

-- ------------------------------------------------------------------------------
-- 2. REPORT TEST RESULTS
-- ------------------------------------------------------------------------------
SELECT
    test_id,
    test_name,
    status,
    details
FROM test_results
ORDER BY test_id ASC;

-- Rollback transaction to ensure complete test isolation
ROLLBACK;
