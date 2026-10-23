-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: MINIMUM NOVEL PRICE (Step 2.1b)
-- ==============================================================================
-- File: supabase/tests/07_min_price_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. Prices 0, 49, and 49.5 are strictly rejected on novel creation.
--     2. Minimum price (PKR 50) is accepted.
--     3. Price above platform maximum (PKR 5,000) is rejected.
--     4. Platform administrators CANNOT bypass whole-number and minimum price limits via direct SQL updates.
--     5. Changing the admin minimum price in platform_settings affects future changes only
--        and does NOT modify existing orders or ledger entries.
--     6. submit_novel_for_review strictly rejects legacy below-minimum novels with an
--        explicit actionable message to raise the price.
--     7. create_order defensively rejects any novel whose price <= 0 or below minimum,
--        guaranteeing amount_pkr <= 0 is never produced.
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
    v_admin_id  uuid := '77777777-7777-7777-7777-777777777777'::uuid;
    v_writer_id uuid := '88888888-8888-8888-8888-888888888888'::uuid;
    v_reader_id uuid := '99999999-9999-9999-9999-999999999999'::uuid;

    -- Entity UUIDs
    v_genre_id       uuid := gen_random_uuid();
    v_method_id      uuid := gen_random_uuid();
    v_novel_50_id    uuid;
    v_novel_100_id   uuid;
    v_legacy_novel_id uuid := gen_random_uuid();
    v_chapter_id     uuid := gen_random_uuid();
    v_order_res      jsonb;
    v_order_id       uuid;
    v_existing_amount numeric(10,2);

    -- Helper flags & records
    v_err_caught     boolean;
    v_err_msg        text;
    v_rpc_res        jsonb;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Run as privileged superuser / postgres)
    -- --------------------------------------------------------------------------

    -- 1. Create fake users in auth.users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES 
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_min_07@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_min_07@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_min_07@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap profiles
    UPDATE public.profiles SET role = 'admin', username = 'admin_min_07', full_name = 'Admin MinPrice', is_active = true WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_min_07', full_name = 'Writer MinPrice', is_active = true WHERE id = v_writer_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_min_07', full_name = 'Reader MinPrice', is_active = true WHERE id = v_reader_id;

    -- 3. Approved Writer Profile
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, terms_accepted_at, custom_commission_rate
    ) VALUES (
        v_writer_id, 'قلم کار منیمم', 'MinPrice Author', 'مصنف بائیو', 'approved', now(), 20.00
    ) ON CONFLICT (id) DO UPDATE SET status = 'approved';

    -- 4. Active Payout Method for Writer
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, is_active
    ) VALUES (
        v_method_id, v_writer_id, 'jazzcash', 'Writer Account', '03001234567', true
    ) ON CONFLICT (id) DO NOTHING;

    -- 5. Test Genre
    INSERT INTO public.genres (id, slug, name_urdu, name_english, is_active, display_order)
    VALUES (v_genre_id, 'min-price-genre', 'قیمت صنف', 'Price Genre', true, 1)
    ON CONFLICT (id) DO NOTHING;

    -- Ensure platform_settings has default min 50 and max 5000
    UPDATE public.platform_settings
    SET min_novel_price_pkr = 50,
        max_novel_price_pkr = 5000.00
    WHERE id = 1;


    -- ==========================================================================
    -- TEST 1: Price 0, 49, and 49.5 are strictly rejected on novel creation
    -- ==========================================================================

    -- Impersonate Writer
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_id::text, true);

    -- 1a. Test Price = 0
    v_err_caught := false;
    BEGIN
        PERFORM public.create_novel(
            'ناول مفت', 'Free Novel', 'خلاصہ خلاصہ خلاصہ خلاصہ',
            NULL, NULL, NULL, 0, 'ur', true, ARRAY[v_genre_id]
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%below the platform minimum%' OR v_err_msg LIKE '%between 50 and 5000%') THEN
        INSERT INTO test_results VALUES (1, 'create_novel rejects price 0 (no free novels)', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (1, 'create_novel rejects price 0 (no free novels)', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;

    -- 1b. Test Price = 49 (below 50)
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.create_novel(
            'ناول انچاس', 'Forty Nine Novel', 'خلاصہ خلاصہ خلاصہ خلاصہ',
            NULL, NULL, NULL, 49, 'ur', true, ARRAY[v_genre_id]
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%below the platform minimum%' OR v_err_msg LIKE '%between 50 and 5000%') THEN
        INSERT INTO test_results VALUES (2, 'create_novel rejects price 49 (below minimum)', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (2, 'create_novel rejects price 49 (below minimum)', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;

    -- 1c. Test Price = 49.5 (fractional paise)
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.create_novel(
            'ناول پیسے', 'Paise Novel', 'خلاصہ خلاصہ خلاصہ خلاصہ',
            NULL, NULL, NULL, 49.5, 'ur', true, ARRAY[v_genre_id]
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%whole rupee amount%' OR v_err_msg LIKE '%without paise%') THEN
        INSERT INTO test_results VALUES (3, 'create_novel rejects price 49.5 (paise / fraction rejected)', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (3, 'create_novel rejects price 49.5 (paise / fraction rejected)', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;


    -- ==========================================================================
    -- TEST 2: Price = 50 (Minimum Allowed Price) is successfully accepted
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        v_rpc_res := public.create_novel(
            'ناول پچاس روپے', 'Fifty Rupee Novel', 'خلاصہ خلاصہ خلاصہ خلاصہ',
            NULL, NULL, NULL, 50, 'ur', true, ARRAY[v_genre_id]
        );
        v_novel_50_id := (v_rpc_res->>'novel_id')::uuid;
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF NOT v_err_caught AND v_novel_50_id IS NOT NULL THEN
        INSERT INTO test_results VALUES (4, 'create_novel accepts minimum price 50 PKR', 'PASS', 'Created novel ID: ' || v_novel_50_id::text);
    ELSE
        INSERT INTO test_results VALUES (4, 'create_novel accepts minimum price 50 PKR', 'FAIL', coalesce(v_err_msg, 'Failed to create'));
    END IF;


    -- ==========================================================================
    -- TEST 3: Price exceeding maximum limit (5001 PKR) is rejected
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.create_novel(
            'مہنگا ترین ناول', 'Over Max Price Novel', 'خلاصہ خلاصہ خلاصہ خلاصہ',
            NULL, NULL, NULL, 5001, 'ur', true, ARRAY[v_genre_id]
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%exceed%' OR v_err_msg LIKE '%between 50 and 5000%') THEN
        INSERT INTO test_results VALUES (5, 'create_novel rejects price 5001 (above max)', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (5, 'create_novel rejects price 5001 (above max)', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;


    -- ==========================================================================
    -- TEST 4: Admin cannot bypass price validation via direct update
    -- ==========================================================================
    -- Impersonate Admin
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin_id::text, true);

    -- 4a. Admin attempts direct UPDATE to price 0
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        UPDATE public.novels
        SET price_pkr = 0
        WHERE id = v_novel_50_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%cannot be below the platform minimum%' OR v_err_msg LIKE '%below the platform minimum%') THEN
        INSERT INTO test_results VALUES (6, 'trg_novels_validate_price blocks admin direct update to price 0', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (6, 'trg_novels_validate_price blocks admin direct update to price 0', 'FAIL', coalesce(v_err_msg, 'Admin bypassed trigger'));
    END IF;

    -- 4b. Admin attempts direct UPDATE to price 49.5 (fraction)
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        UPDATE public.novels
        SET price_pkr = 49.5
        WHERE id = v_novel_50_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%whole rupee amount%' OR v_err_msg LIKE '%without paise%') THEN
        INSERT INTO test_results VALUES (7, 'trg_novels_validate_price blocks admin direct update to fractional price', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (7, 'trg_novels_validate_price blocks admin direct update to fractional price', 'FAIL', coalesce(v_err_msg, 'Admin bypassed trigger'));
    END IF;


    -- ==========================================================================
    -- TEST 5: submit_novel_for_review rejects legacy below-minimum novel
    -- ==========================================================================
    -- Switch to superuser context to insert a legacy draft novel with price 30
    PERFORM pg_catalog.set_config('role', 'postgres', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);

    ALTER TABLE public.novels DISABLE TRIGGER trg_novels_validate_price;
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu,
        cover_url, price_pkr, language, status, total_chapters, is_featured,
        rights_declaration_accepted, created_at, updated_at
    ) VALUES (
        v_legacy_novel_id, v_writer_id, 'legacy-cheap-novel', 'پرانا سستا ناول', 'Legacy Cheap Novel',
        'پرانا خلاصہ کم از کم دس حروف کا', 'https://cdn.example.com/cover.webp', 30, 'ur', 'draft', 1, false,
        true, now(), now()
    );
    ALTER TABLE public.novels ENABLE TRIGGER trg_novels_validate_price;

    -- Link genre and published chapter for legacy novel
    INSERT INTO public.novel_genres (novel_id, genre_id) VALUES (v_legacy_novel_id, v_genre_id);
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published, created_at, updated_at
    ) VALUES (
        v_chapter_id, v_legacy_novel_id, 1, 'پہلا باب', 'یہ پہلے باب کا مکمل متن ہے۔', true, true, now(), now()
    );

    -- Impersonate Writer to submit legacy novel
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_id::text, true);

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.submit_novel_for_review(v_legacy_novel_id);
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%below the platform minimum of PKR 50%' AND v_err_msg LIKE '%Please update your novel price%') THEN
        INSERT INTO test_results VALUES (8, 'submit_novel_for_review rejects legacy below-minimum novel with actionable message', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (8, 'submit_novel_for_review rejects legacy below-minimum novel with actionable message', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;


    -- ==========================================================================
    -- TEST 6: create_order defensively rejects novel price <= 0 or < min
    -- ==========================================================================
    -- Temporarily set legacy novel to published via admin superuser
    PERFORM pg_catalog.set_config('role', 'postgres', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);
    UPDATE public.novels SET status = 'published' WHERE id = v_legacy_novel_id;

    -- Impersonate Reader to attempt order creation on legacy novel
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_id::text, true);

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.create_order(v_legacy_novel_id, v_method_id);
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%outside allowable limits%' OR v_err_msg LIKE '%invalid or outside allowable limits%') THEN
        INSERT INTO test_results VALUES (9, 'create_order defensively rejects order for below-minimum novel', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (9, 'create_order defensively rejects order for below-minimum novel', 'FAIL', coalesce(v_err_msg, 'Order created with invalid price'));
    END IF;


    -- ==========================================================================
    -- TEST 7: Changing admin minimum affects future changes only, preserves past orders
    -- ==========================================================================
    -- 7a. Create a published novel priced at 100 PKR
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_id::text, true);

    v_rpc_res := public.create_novel(
        'سو روپے والا ناول', 'Hundred Rupee Novel', 'خلاصہ خلاصہ خلاصہ خلاصہ خلاصہ',
        NULL, NULL, NULL, 100, 'ur', true, ARRAY[v_genre_id]
    );
    v_novel_100_id := (v_rpc_res->>'novel_id')::uuid;

    -- Switch to superuser to publish novel 100 and add chapter
    PERFORM pg_catalog.set_config('role', 'postgres', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);
    UPDATE public.novels SET status = 'published' WHERE id = v_novel_100_id;

    -- 7b. Reader creates order for Novel 100
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_id::text, true);

    v_order_res := public.create_order(v_novel_100_id, v_method_id);
    v_order_id := (v_order_res->>'order_id')::uuid;

    SELECT amount_pkr INTO v_existing_amount FROM public.orders WHERE id = v_order_id;

    -- 7c. Admin raises minimum price to 150 PKR
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin_id::text, true);

    PERFORM public.update_platform_settings(
        20.00,  -- default_commission_rate
        5000.00, -- default_unpaid_commission_limit
        30,     -- dispute_window_days
        150,    -- min_novel_price_pkr (raised to 150)
        5000.00, -- max_novel_price_pkr
        'support@unb.pk'
    );

    -- 7d. Verify existing order amount remains 100 PKR (immutable snapshot)
    SELECT amount_pkr INTO v_existing_amount FROM public.orders WHERE id = v_order_id;
    IF v_existing_amount = 100.00 THEN
        INSERT INTO test_results VALUES (10, 'Existing order amount_pkr remains immutable after admin raised min price', 'PASS', 'Amount preserved: ' || v_existing_amount::text || ' PKR');
    ELSE
        INSERT INTO test_results VALUES (10, 'Existing order amount_pkr remains immutable after admin raised min price', 'FAIL', 'Amount changed to: ' || coalesce(v_existing_amount::text, 'NULL'));
    END IF;

    -- 7e. Writer attempts to update novel price to 120 PKR (now below new min 150)
    PERFORM pg_catalog.set_config('role', 'authenticated', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_id::text, true);

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.update_novel(
            v_novel_100_id, 'سو روپے والا ناول', 'Hundred Rupee Novel', 'خلاصہ خلاصہ خلاصہ خلاصہ خلاصہ',
            NULL, NULL, NULL, 120, 'ur', ARRAY[v_genre_id]
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%between 150 and 5000%' OR v_err_msg LIKE '%cannot be below the platform minimum of PKR 150%') THEN
        INSERT INTO test_results VALUES (11, 'Future price update respects new admin minimum (150 PKR)', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (11, 'Future price update respects new admin minimum (150 PKR)', 'FAIL', coalesce(v_err_msg, 'No error raised on sub-150 price'));
    END IF;

END $$;

-- ------------------------------------------------------------------------------
-- 3. DISPLAY RESULTS & VERIFY ZERO FAILURES
-- ------------------------------------------------------------------------------
SELECT test_id, test_name, status, details FROM test_results ORDER BY test_id;

DO $$
DECLARE
    v_failed integer;
BEGIN
    SELECT count(*) INTO v_failed FROM test_results WHERE status = 'FAIL';
    IF v_failed > 0 THEN
        RAISE EXCEPTION 'TEST SUITE FAILED: % test(s) failed.', v_failed;
    ELSE
        RAISE NOTICE 'ALL MINIMUM NOVEL PRICE TESTS PASSED SUCCESSFULLY.';
    END IF;
END $$;

ROLLBACK;
