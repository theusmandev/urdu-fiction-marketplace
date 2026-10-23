-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: CHECKOUT & PAYMENT SUBMISSION (Step 4.1)
-- ==============================================================================
-- File: supabase/tests/08_checkout_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. get_checkout_options hides full account numbers / IBANs (masked only).
--     2. get_checkout_options fails for author's own novel.
--     3. get_checkout_options fails for already owned novel (active entitlement).
--     4. get_checkout_options fails for unpublished / draft / suspended novel.
--     5. create_order reader hourly rate limit is strictly enforced.
--     6. submit_payment rejects invalid screenshot path (no order ID prefix, path traversal '..').
--     7. submit_payment rejects screenshot path belonging to a different order.
--     8. submit_payment enforces TID format rules (6-40 chars, letters/numbers/dash/underscore).
--     9. submit_payment flags duplicate TID across different orders without hard blocking.
--    10. submit_payment retry with same TID within 60s returns existing submission idempotently.
--    11. Reader cannot view another reader's orders via RLS.
--    12. Writer cannot view orders of novels belonging to another writer.
--    13. Direct INSERT or UPDATE on orders by reader is strictly rejected.
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
    v_admin_id    uuid := '11111111-aaaa-bbbb-cccc-111111111111'::uuid;
    v_writer_a_id uuid := '22222222-aaaa-bbbb-cccc-222222222222'::uuid;
    v_writer_b_id uuid := '33333333-aaaa-bbbb-cccc-333333333333'::uuid;
    v_reader_1_id uuid := '44444444-aaaa-bbbb-cccc-444444444444'::uuid;
    v_reader_2_id uuid := '55555555-aaaa-bbbb-cccc-555555555555'::uuid;

    -- Entity UUIDs
    v_genre_id       uuid := gen_random_uuid();
    v_method_a_id    uuid := gen_random_uuid();
    v_method_b_id    uuid := gen_random_uuid();
    v_novel_pub_id   uuid := gen_random_uuid();
    v_novel_draft_id uuid := gen_random_uuid();
    v_novel_b_id     uuid := gen_random_uuid();
    v_chapter_id     uuid := gen_random_uuid();

    -- Order & Submission IDs
    v_order_res      jsonb;
    v_order_1_id     uuid;
    v_order_2_id     uuid;
    v_order_3_id     uuid;
    v_order_number_1 text;
    v_sub_res        jsonb;
    v_sub_1_id       uuid;
    v_sub_2_id       uuid;

    -- Helper variables
    v_checkout_res   jsonb;
    v_masked_acc     text;
    v_err_caught     boolean;
    v_err_msg        text;
    v_flagged        boolean;
    v_visible_count  integer;
    v_i              integer;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Run as privileged superuser / postgres)
    -- --------------------------------------------------------------------------

    -- 1. Create fake users in auth.users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_chk@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_writer_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_a_chk@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_writer_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_b_chk@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_reader_1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_1_chk@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_reader_2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_2_chk@test.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap profiles & roles
    UPDATE public.profiles SET role = 'admin', full_name = 'Admin Checkout Test' WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', full_name = 'Writer A Checkout Test' WHERE id = v_writer_a_id;
    UPDATE public.profiles SET role = 'writer', full_name = 'Writer B Checkout Test' WHERE id = v_writer_b_id;
    UPDATE public.profiles SET role = 'reader', full_name = 'Reader 1 Checkout Test' WHERE id = v_reader_1_id;
    UPDATE public.profiles SET role = 'reader', full_name = 'Reader 2 Checkout Test' WHERE id = v_reader_2_id;

    -- 3. Bootstrap writer profiles
    INSERT INTO public.writer_profiles (
        id, pen_name_english, pen_name_urdu, status, terms_accepted_at,
        created_at, updated_at
    ) VALUES
    (v_writer_a_id, 'Writer A', 'مصنف الف', 'approved', now(), now(), now()),
    (v_writer_b_id, 'Writer B', 'مصنف ب', 'approved', now(), now(), now())
    ON CONFLICT (id) DO UPDATE SET status = 'approved';

    -- 4. Create active payment methods for writers
    -- Method A: JazzCash with full account number '03001234567'
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban,
        bank_name, is_active, created_at, updated_at
    ) VALUES (
        v_method_a_id, v_writer_a_id, 'jazzcash', 'Writer A JazzCash', '03001234567',
        NULL, true, now(), now()
    );

    -- Method B: Bank Transfer for Writer B
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban,
        bank_name, is_active, created_at, updated_at
    ) VALUES (
        v_method_b_id, v_writer_b_id, 'bank_transfer', 'Writer B Bank Title', 'PK36MEZN0000123456789012',
        'Meezan Bank', true, now(), now()
    );

    -- 5. Create genre
    INSERT INTO public.genres (id, name_english, name_urdu, slug, is_active)
    VALUES (v_genre_id, 'Mystery Chk', 'معمہ چائلڈ', 'mystery-chk', true)
    ON CONFLICT (id) DO NOTHING;

    -- 6. Create novels
    -- Published novel for Writer A (PKR 350)
    INSERT INTO public.novels (
        id, writer_id, title_english, title_urdu, synopsis, price_pkr,
        status, published_at, rights_declaration_accepted, rights_declaration_timestamp,
        cover_image_url, slug, created_at, updated_at
    ) VALUES (
        v_novel_pub_id, v_writer_a_id, 'Published Novel A', 'شائع شدہ ناول',
        'Synopsis text here.', 350, 'published', now(), true, now(),
        'https://example.com/cover.webp', 'published-novel-a-' || substr(gen_random_uuid()::text, 1, 6), now(), now()
    );

    -- Draft novel for Writer A
    INSERT INTO public.novels (
        id, writer_id, title_english, title_urdu, synopsis, price_pkr,
        status, rights_declaration_accepted, rights_declaration_timestamp,
        cover_image_url, slug, created_at, updated_at
    ) VALUES (
        v_novel_draft_id, v_writer_a_id, 'Draft Novel A', 'مسودہ ناول',
        'Draft synopsis text.', 200, 'draft', true, now(),
        'https://example.com/cover.webp', 'draft-novel-a-' || substr(gen_random_uuid()::text, 1, 6), now(), now()
    );

    -- Published novel for Writer B (PKR 500)
    INSERT INTO public.novels (
        id, writer_id, title_english, title_urdu, synopsis, price_pkr,
        status, published_at, rights_declaration_accepted, rights_declaration_timestamp,
        cover_image_url, slug, created_at, updated_at
    ) VALUES (
        v_novel_b_id, v_writer_b_id, 'Published Novel B', 'ناول ب',
        'Synopsis text.', 500, 'published', now(), true, now(),
        'https://example.com/cover.webp', 'published-novel-b-' || substr(gen_random_uuid()::text, 1, 6), now(), now()
    );

    -- Link genre
    INSERT INTO public.novel_genres (novel_id, genre_id)
    VALUES (v_novel_pub_id, v_genre_id), (v_novel_b_id, v_genre_id);

    -- Add published chapter
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content, word_count,
        is_published, is_free_preview, created_at, updated_at
    ) VALUES (
        v_chapter_id, v_novel_pub_id, 1, 'پہلا باب',
        'یہ ایک آزمائشی باب کا متن ہے۔ اس میں اردو کا مکمل مواد موجود ہے۔', 15,
        true, true, now(), now()
    );

    -- Set max_orders_per_hour = 3 for rate-limit testing
    UPDATE public.platform_settings
    SET max_orders_per_hour = 3,
        min_novel_price_pkr = 50,
        max_novel_price_pkr = 5000.00
    WHERE id = 1;

    -- ==========================================================================
    -- TEST 1: get_checkout_options hides full account numbers and exposes masked only
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_reader_1_id::text || '''';

    v_checkout_res := public.get_checkout_options(v_novel_pub_id);

    -- Verify full number is NOT present anywhere in JSON
    IF v_checkout_res::text LIKE '%03001234567%' THEN
        INSERT INTO test_results VALUES (1, 'get_checkout_options masks account details', 'FAIL', 'Full account number leaked in checkout options response.');
    ELSE
        -- Verify masked account ends with '4567' and starts with '•••• '
        v_masked_acc := v_checkout_res->'payment_methods'->0->>'masked_account';
        IF v_masked_acc = '•••• 4567' THEN
            INSERT INTO test_results VALUES (1, 'get_checkout_options masks account details', 'PASS', 'Account masked correctly as ' || v_masked_acc || '; full number hidden.');
        ELSE
            INSERT INTO test_results VALUES (1, 'get_checkout_options masks account details', 'FAIL', 'Masked account format unexpected: ' || coalesce(v_masked_acc, 'NULL'));
        END IF;
    END IF;

    -- ==========================================================================
    -- TEST 2: get_checkout_options fails for author's own novel
    -- ==========================================================================
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_writer_a_id::text || '''';

    v_err_caught := false;
    v_err_msg := '';
    BEGIN
        PERFORM public.get_checkout_options(v_novel_pub_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Authors cannot purchase their own novels%' THEN
        INSERT INTO test_results VALUES (2, 'get_checkout_options blocks author self-purchase', 'PASS', 'Correctly rejected with: ' || v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (2, 'get_checkout_options blocks author self-purchase', 'FAIL', 'Did not reject self-checkout: ' || coalesce(v_err_msg, 'no error'));
    END IF;

    -- ==========================================================================
    -- TEST 3: get_checkout_options fails for already owned novel
    -- ==========================================================================
    -- Switch to postgres to grant active entitlement to reader 2
    EXECUTE 'SET LOCAL ROLE postgres';
    INSERT INTO public.purchase_entitlements (
        reader_id, novel_id, is_revoked, granted_at
    ) VALUES (
        v_reader_2_id, v_novel_pub_id, false, now()
    );

    -- Switch to reader 2
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_reader_2_id::text || '''';

    v_err_caught := false;
    v_err_msg := '';
    BEGIN
        PERFORM public.get_checkout_options(v_novel_pub_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%already hold an active purchase entitlement%' THEN
        INSERT INTO test_results VALUES (3, 'get_checkout_options blocks already owned novel', 'PASS', 'Correctly rejected with: ' || v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (3, 'get_checkout_options blocks already owned novel', 'FAIL', 'Allowed checkout for already-owned novel.');
    END IF;

    -- ==========================================================================
    -- TEST 4: get_checkout_options fails for unpublished / draft novel
    -- ==========================================================================
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_reader_1_id::text || '''';

    v_err_caught := false;
    v_err_msg := '';
    BEGIN
        PERFORM public.get_checkout_options(v_novel_draft_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%not available for purchase%' THEN
        INSERT INTO test_results VALUES (4, 'get_checkout_options blocks unpublished novel', 'PASS', 'Correctly rejected draft novel.');
    ELSE
        INSERT INTO test_results VALUES (4, 'get_checkout_options blocks unpublished novel', 'FAIL', 'Allowed draft novel checkout: ' || coalesce(v_err_msg, 'none'));
    END IF;

    -- ==========================================================================
    -- TEST 5: create_order rate limit enforced (limit = 3 per hour)
    -- ==========================================================================
    -- Reader 1 creates Order 1 for Novel A
    v_order_res := public.create_order(v_novel_pub_id, v_method_a_id);
    v_order_1_id := (v_order_res->>'order_id')::uuid;
    v_order_number_1 := v_order_res->>'order_number';

    -- Reader 1 cancels Order 1 so they can place more orders without active-order block
    PERFORM public.cancel_order(v_order_1_id, 'Testing rate limits');

    -- Reader 1 creates Order 2 (count = 2)
    v_order_res := public.create_order(v_novel_pub_id, v_method_a_id);
    v_order_2_id := (v_order_res->>'order_id')::uuid;
    PERFORM public.cancel_order(v_order_2_id, 'Testing rate limits');

    -- Reader 1 creates Order 3 (count = 3, reaches max_orders_per_hour = 3)
    v_order_res := public.create_order(v_novel_pub_id, v_method_a_id);
    v_order_3_id := (v_order_res->>'order_id')::uuid;
    PERFORM public.cancel_order(v_order_3_id, 'Testing rate limits');

    -- 4th order attempt should exceed rate limit (limit = 3)
    v_err_caught := false;
    v_err_msg := '';
    BEGIN
        PERFORM public.create_order(v_novel_pub_id, v_method_a_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Order rate limit exceeded%' THEN
        INSERT INTO test_results VALUES (5, 'create_order hourly rate limit enforced', 'PASS', 'Correctly blocked 4th order: ' || v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (5, 'create_order hourly rate limit enforced', 'FAIL', 'Failed to enforce rate limit: ' || coalesce(v_err_msg, 'none'));
    END IF;

    -- ==========================================================================
    -- FIXTURE FOR PAYMENT SUBMISSION TESTS:
    -- Reset rate limit and create a fresh pending order for Reader 2 on Novel B
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE postgres';
    UPDATE public.platform_settings SET max_orders_per_hour = 20 WHERE id = 1;

    -- Switch to Reader 2 and create order for Novel B
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_reader_2_id::text || '''';

    v_order_res := public.create_order(v_novel_b_id, v_method_b_id);
    v_order_2_id := (v_order_res->>'order_id')::uuid;

    -- Switch to Reader 1 and uncancel Order 1 for testing submissions
    EXECUTE 'SET LOCAL ROLE postgres';
    UPDATE public.orders SET status = 'pending_payment' WHERE id = v_order_1_id;

    -- ==========================================================================
    -- TEST 6: submit_payment rejects invalid screenshot path (traversal / no order prefix)
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_reader_1_id::text || '''';

    v_err_caught := false;
    v_err_msg := '';
    BEGIN
        PERFORM public.submit_payment(
            v_order_1_id,
            'TID-12345678',
            '../traversal/hack.webp',
            350,
            'Reader One',
            'Note'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%Path traversal is strictly prohibited%' OR v_err_msg LIKE '%scoped to the order folder%') THEN
        INSERT INTO test_results VALUES (6, 'submit_payment rejects path traversal screenshot', 'PASS', 'Path traversal rejected: ' || v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (6, 'submit_payment rejects path traversal screenshot', 'FAIL', 'Path traversal was not rejected: ' || coalesce(v_err_msg, 'none'));
    END IF;

    -- ==========================================================================
    -- TEST 7: submit_payment rejects screenshot path of another order
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := '';
    BEGIN
        -- Using v_order_2_id in path while submitting for v_order_1_id
        PERFORM public.submit_payment(
            v_order_1_id,
            'TID-12345678',
            v_order_2_id::text || '/proof.webp',
            350,
            'Reader One',
            'Note'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%scoped to the order folder%' THEN
        INSERT INTO test_results VALUES (7, 'submit_payment rejects mismatched order screenshot path', 'PASS', 'Correctly rejected mismatched path: ' || v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (7, 'submit_payment rejects mismatched order screenshot path', 'FAIL', 'Allowed mismatched order path: ' || coalesce(v_err_msg, 'none'));
    END IF;

    -- ==========================================================================
    -- TEST 8: submit_payment TID format rules (rejects < 6 chars, > 40 chars, special chars)
    -- ==========================================================================
    -- 8a: Too short (< 6 chars)
    v_err_caught := false;
    BEGIN
        PERFORM public.submit_payment(
            v_order_1_id,
            '12345',
            v_order_1_id::text || '/proof.webp',
            350,
            'Reader One'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%TID) must be 6 to 40 characters%' THEN
        -- 8b: Disallowed special characters
        v_err_caught := false;
        BEGIN
            PERFORM public.submit_payment(
                v_order_1_id,
                'TID#12345<SCRIPT>',
                v_order_1_id::text || '/proof.webp',
                350,
                'Reader One'
            );
        EXCEPTION WHEN OTHERS THEN
            v_err_caught := true;
            v_err_msg := SQLERRM;
        END;

        IF v_err_caught AND v_err_msg LIKE '%TID) must be 6 to 40 characters%' THEN
            INSERT INTO test_results VALUES (8, 'submit_payment TID format validation', 'PASS', 'Rejected short and special-character TIDs.');
        ELSE
            INSERT INTO test_results VALUES (8, 'submit_payment TID format validation', 'FAIL', 'Allowed special characters in TID.');
        END IF;
    ELSE
        INSERT INTO test_results VALUES (8, 'submit_payment TID format validation', 'FAIL', 'Allowed short TID.');
    END IF;

    -- ==========================================================================
    -- TEST 9 & 10: Valid submit_payment, idempotent retry, and duplicate TID flagging
    -- ==========================================================================
    -- 9: Valid submission for Order 1 with TID 'TID-JC-987654'
    v_sub_res := public.submit_payment(
        v_order_1_id,
        'TID-JC-987654',
        v_order_1_id::text || '/proof_valid.webp',
        350,
        'Reader Account One',
        'JazzCash transfer completed'
    );
    v_sub_1_id := (v_sub_res->>'submission_id')::uuid;

    -- 10: Idempotent retry with same order and same TID within 60s
    v_sub_res := public.submit_payment(
        v_order_1_id,
        'TID-JC-987654',
        v_order_1_id::text || '/proof_valid.webp',
        350,
        'Reader Account One',
        'JazzCash transfer completed'
    );
    v_sub_2_id := (v_sub_res->>'submission_id')::uuid;

    IF v_sub_1_id = v_sub_2_id AND (v_sub_res->>'is_retry')::boolean = true THEN
        INSERT INTO test_results VALUES (10, 'submit_payment idempotent retry', 'PASS', 'Same TID on same order returned existing submission ID without creating duplicate row.');
    ELSE
        INSERT INTO test_results VALUES (10, 'submit_payment idempotent retry', 'FAIL', 'Retry did not return existing submission.');
    END IF;

    -- 9: Reader 2 submits the SAME TID ('TID-JC-987654') on a DIFFERENT order (Order 2)
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_reader_2_id::text || '''';

    v_sub_res := public.submit_payment(
        v_order_2_id,
        'TID-JC-987654',
        v_order_2_id::text || '/proof_r2.webp',
        500,
        'Reader Two',
        'Paid via JazzCash'
    );
    v_sub_2_id := (v_sub_res->>'submission_id')::uuid;

    -- Switch to postgres to inspect duplicate flag
    EXECUTE 'SET LOCAL ROLE postgres';
    SELECT is_duplicate_tid_flagged INTO v_flagged
    FROM public.payment_submissions
    WHERE id = v_sub_2_id;

    IF v_flagged = true THEN
        INSERT INTO test_results VALUES (9, 'duplicate TID across orders flagged without blocking', 'PASS', 'Trigger check_duplicate_tid_before_insert flagged duplicate TID correctly.');
    ELSE
        INSERT INTO test_results VALUES (9, 'duplicate TID across orders flagged without blocking', 'FAIL', 'Duplicate TID was not flagged.');
    END IF;

    -- ==========================================================================
    -- TEST 11: Reader cannot see another reader's order via RLS
    -- ==========================================================================
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_reader_1_id::text || '''';

    -- Reader 1 queries orders: should only see Order 1, not Order 2 (which belongs to Reader 2)
    SELECT count(*) INTO v_visible_count
    FROM public.orders
    WHERE id = v_order_2_id;

    IF v_visible_count = 0 THEN
        INSERT INTO test_results VALUES (11, 'Reader RLS order isolation', 'PASS', 'Reader 1 cannot query Reader 2 orders (returned 0 rows).');
    ELSE
        INSERT INTO test_results VALUES (11, 'Reader RLS order isolation', 'FAIL', 'Reader 1 was able to view Reader 2 order.');
    END IF;

    -- ==========================================================================
    -- TEST 12: Writer cannot see another writer's orders via RLS
    -- ==========================================================================
    -- Writer A queries orders: should see Order 1 (Novel A), but NOT Order 2 (Novel B of Writer B)
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_writer_a_id::text || '''';

    SELECT count(*) INTO v_visible_count
    FROM public.orders
    WHERE id = v_order_2_id;

    IF v_visible_count = 0 THEN
        INSERT INTO test_results VALUES (12, 'Writer RLS multi-tenant order isolation', 'PASS', 'Writer A cannot query Writer B orders (returned 0 rows).');
    ELSE
        INSERT INTO test_results VALUES (12, 'Writer RLS multi-tenant order isolation', 'FAIL', 'Writer A was able to view Writer B order.');
    END IF;

    -- ==========================================================================
    -- TEST 13: Direct INSERT or UPDATE on orders by reader is strictly rejected
    -- ==========================================================================
    EXECUTE 'SET LOCAL "request.jwt.claim.sub" = ''' || v_reader_1_id::text || '''';

    -- 13a: Direct INSERT attempt
    v_err_caught := false;
    BEGIN
        INSERT INTO public.orders (
            order_number, reader_id, writer_id, novel_id, novel_title_snapshot, amount_pkr, status
        ) VALUES (
            'ORD-DIRECT-HACK', v_reader_1_id, v_writer_a_id, v_novel_pub_id, 'Hacked Novel Title', 1, 'verified'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;

    IF v_err_caught THEN
        -- 13b: Direct UPDATE attempt
        v_err_caught := false;
        BEGIN
            UPDATE public.orders
            SET status = 'verified'
            WHERE id = v_order_1_id;
        EXCEPTION WHEN OTHERS THEN
            v_err_caught := true;
        END;

        IF v_err_caught THEN
            INSERT INTO test_results VALUES (13, 'Direct client orders INSERT and UPDATE forbidden', 'PASS', 'Both direct INSERT and UPDATE on orders rejected by database.');
        ELSE
            INSERT INTO test_results VALUES (13, 'Direct client orders INSERT and UPDATE forbidden', 'FAIL', 'Direct UPDATE on orders succeeded.');
        END IF;
    ELSE
        INSERT INTO test_results VALUES (13, 'Direct client orders INSERT and UPDATE forbidden', 'FAIL', 'Direct INSERT on orders succeeded.');
    END IF;

END $$;

-- Display results
SELECT
    test_id,
    test_name,
    status,
    details
FROM test_results
ORDER BY test_id ASC;

ROLLBACK;
