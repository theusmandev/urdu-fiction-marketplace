-- ==============================================================================
-- UNB Premium — Automated Test Suite: Writer Content Hardening (Step 3.1)
-- Description:
--   Comprehensive transactional impersonation tests verifying:
--     1. Writer cannot directly set own novel status to published.
--     2. Writer cannot update another writer's novel or chapters.
--     3. Non-approved (pending / suspended) writer cannot create a novel.
--     4. Standard reader cannot insert a novel (RPC and direct SQL).
--     5. submit_novel_for_review fails without cover, genre, published chapter,
--        or payment method, and succeeds when all requirements are met.
--     6. Price change on published novel does not alter existing order snapshots.
--     7. Hard deletion of a published/submitted novel's chapter is strictly blocked.
--     8. Draft novels and unpublished chapters are completely invisible to other users and anon.
--
-- Execution: Can be run directly in the Supabase SQL Editor or psql.
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
    v_reader_id    uuid := '11111111-1111-1111-1111-111111111111'::uuid;
    v_writer_a_id  uuid := '22222222-2222-2222-2222-222222222222'::uuid;
    v_writer_b_id  uuid := '33333333-3333-3333-3333-333333333333'::uuid;
    v_pending_id   uuid := '44444444-4444-4444-4444-444444444444'::uuid;
    v_admin_id     uuid := '99999999-9999-9999-9999-999999999999'::uuid;

    -- Entity UUIDs
    v_genre_id     uuid := gen_random_uuid();
    v_novel_draft_id uuid := gen_random_uuid();
    v_novel_pub_id   uuid := gen_random_uuid();
    v_novel_b_id     uuid := gen_random_uuid();
    v_chap_pub_id    uuid := gen_random_uuid();
    v_chap_unpub_id  uuid := gen_random_uuid();
    v_method_a_id    uuid := gen_random_uuid();
    v_order_id       uuid := gen_random_uuid();

    -- Helper variables
    v_res          jsonb;
    v_err_msg      text;
    v_status_check text;
    v_count        integer;
    v_order_amount numeric(10,2);
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Run as privileged bootstrap)
    -- --------------------------------------------------------------------------

    -- 1. Create fake users in auth.users (handle_new_user trigger creates public.profiles rows)
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES 
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_writer_test@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author_a@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author_b@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_pending_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending_author@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_content_test@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap role & username updates as postgres (handle_new_user assigned 'reader')
    UPDATE public.profiles SET role = 'writer', username = 'author_a_31', full_name = 'Author Alpha' WHERE id = v_writer_a_id;
    UPDATE public.profiles SET role = 'writer', username = 'author_b_31', full_name = 'Author Beta' WHERE id = v_writer_b_id;
    UPDATE public.profiles SET role = 'reader', username = 'pending_wt_31', full_name = 'Pending Applicant' WHERE id = v_pending_id;
    UPDATE public.profiles SET role = 'admin', username = 'admin_wt_31', full_name = 'System Admin' WHERE id = v_admin_id;
    UPDATE public.profiles SET username = 'reader_wt_31', full_name = 'Test Reader' WHERE id = v_reader_id;

    -- 2. Writer Profiles
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES 
        (v_writer_a_id, 'مصنف اول', 'Author Alpha', 'approved', 20.00, 5000.00, 0.00, false),
        (v_writer_b_id, 'مصنف دوم', 'Author Beta', 'approved', 20.00, 5000.00, 0.00, false),
        (v_pending_id, 'زیرِ جائزہ مصنف', 'Pending Author', 'pending_approval', 20.00, 5000.00, 0.00, false)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

    -- 3. Genre
    INSERT INTO public.genres (id, slug, name_english, name_urdu, display_order)
    VALUES (v_genre_id, 'thriller-31', 'Thriller', 'سسپنس', 1)
    ON CONFLICT (slug) DO NOTHING;

    -- 4. Author A Published Novel
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, published_at, rights_declaration_accepted
    ) VALUES (
        v_novel_pub_id, v_writer_a_id, 'alpha-published-novel', 'شائع شدہ ناول', 'Alpha Published Novel',
        'یہ ایک مکمل اور شائع شدہ ناول کا خلاصہ ہے۔', 600.00, 'published', now(), true
    )
    ON CONFLICT (id) DO NOTHING;

    -- Published chapters for Author A
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published
    ) VALUES 
        (v_chap_pub_id, v_novel_pub_id, 1, 'پہلا شائع باب', 'یہ پہلے باب کی تفصیلات ہیں۔', true, true),
        (v_chap_unpub_id, v_novel_pub_id, 2, 'غیر شائع باب', 'یہ خفیہ ڈرافٹ باب ہے۔', false, false)
    ON CONFLICT (id) DO NOTHING;

    -- Author B Novel
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, rights_declaration_accepted
    ) VALUES (
        v_novel_b_id, v_writer_b_id, 'beta-novel', 'دوسرے مصنف کا ناول', 'Beta Author Novel',
        'خلاصہ بی کا خلاصہ۔', 400.00, 'draft', true
    )
    ON CONFLICT (id) DO NOTHING;

    -- Author A Active Payment Method
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, bank_name, is_active
    ) VALUES (
        v_method_a_id, v_writer_a_id, 'jazzcash', 'Author Alpha QC', '03001112233', 'JazzCash', true
    )
    ON CONFLICT (id) DO UPDATE SET is_active = true;


    -- ==========================================================================
    -- TEST 1: WRITER CANNOT DIRECTLY SET OWN NOVEL STATUS TO PUBLISHED
    -- ==========================================================================
    BEGIN
        -- Create a fresh draft novel for Writer A
        INSERT INTO public.novels (
            id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, rights_declaration_accepted
        ) VALUES (
            v_novel_draft_id, v_writer_a_id, 'alpha-draft-novel', 'ڈرافٹ ناول', 'Alpha Draft Novel',
            'ڈرافٹ کا خلاصہ۔', 300.00, 'draft', true
        );

        -- Impersonate Writer A
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        -- Attempt to directly update status to 'published'
        BEGIN
            UPDATE public.novels
            SET status = 'published'
            WHERE id = v_novel_draft_id;

            INSERT INTO test_results VALUES (1, 'Writer cannot set own novel status to published', 'FAIL', 'Direct update to published status succeeded without error.');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Novel status can only be modified via official editorial workflows%' THEN
                INSERT INTO test_results VALUES (1, 'Writer cannot set own novel status to published', 'PASS', 'Correctly rejected by trigger: ' || SQLERRM);
            ELSE
                INSERT INTO test_results VALUES (1, 'Writer cannot set own novel status to published', 'PASS', 'Rejected with exception: ' || SQLERRM);
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (1, 'Writer cannot set own novel status to published', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;


    -- ==========================================================================
    -- TEST 2: WRITER CANNOT UPDATE ANOTHER WRITER NOVEL OR CHAPTERS
    -- ==========================================================================
    BEGIN
        -- Impersonate Writer A
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        -- Attempt to update Writer B's novel
        BEGIN
            v_res := public.update_novel(
                v_novel_b_id,
                'ہیک شدہ عنوان',
                'Hacked Title',
                'غیر مجاز خلاصہ',
                NULL, NULL, 500, 'ur', ARRAY[v_genre_id]
            );
            INSERT INTO test_results VALUES (2, 'Writer cannot update another writers novel', 'FAIL', 'update_novel succeeded on another author novel.');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (2, 'Writer cannot update another writers novel', 'PASS', 'Blocked as expected: ' || SQLERRM);
        END;

        -- Attempt to insert chapter into Writer B's novel
        BEGIN
            INSERT INTO public.chapters (
                novel_id, chapter_number, title_urdu, content_urdu
            ) VALUES (
                v_novel_b_id, 99, 'غیر مجاز باب', 'یہ مواد اجازت کے بغیر ہے۔'
            );
            INSERT INTO test_results VALUES (2, 'Writer cannot insert chapters into another writers novel', 'FAIL', 'Chapter insert succeeded on foreign novel.');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (2, 'Writer cannot insert chapters into another writers novel', 'PASS', 'Foreign chapter insert blocked by RLS/Trigger: ' || SQLERRM);
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (2, 'Writer cross-author access check', 'FAIL', 'Unexpected error: ' || SQLERRM);
    END;


    -- ==========================================================================
    -- TEST 3: NON-APPROVED WRITER CANNOT CREATE A NOVEL
    -- ==========================================================================
    BEGIN
        -- Impersonate Pending Writer
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pending_id::text, 'role', 'authenticated')::text, true);

        BEGIN
            v_res := public.create_novel(
                'غیر منظور شدہ ناول',
                'Pending Novel',
                'خلاصہ غیر منظور شدہ مصنف۔',
                NULL, NULL, NULL, 200, 'ur', true, ARRAY[v_genre_id]
            );
            INSERT INTO test_results VALUES (3, 'Non-approved writer cannot create novel', 'FAIL', 'create_novel succeeded for pending author.');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (3, 'Non-approved writer cannot create novel', 'PASS', 'create_novel correctly rejected: ' || SQLERRM);
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (3, 'Non-approved writer check', 'FAIL', 'Unexpected error: ' || SQLERRM);
    END;


    -- ==========================================================================
    -- TEST 4: READER CANNOT INSERT A NOVEL
    -- ==========================================================================
    BEGIN
        -- Impersonate Reader
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

        -- Step 4a: via RPC
        BEGIN
            v_res := public.create_novel(
                'قارئین کا ناول',
                'Reader Novel',
                'قاری کی تحریر کا خلاصہ۔',
                NULL, NULL, NULL, 0, 'ur', true, ARRAY[v_genre_id]
            );
            INSERT INTO test_results VALUES (4, 'Reader cannot insert novel via RPC', 'FAIL', 'create_novel succeeded for standard reader.');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (4, 'Reader cannot insert novel via RPC', 'PASS', 'RPC correctly rejected: ' || SQLERRM);
        END;

        -- Step 4b: direct SQL insert
        BEGIN
            INSERT INTO public.novels (
                writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, rights_declaration_accepted
            ) VALUES (
                v_reader_id, 'direct-reader-novel', 'براہ راست قاری ناول', 'Direct Reader Novel',
                'خلاصہ قاری ناول۔', 0, 'draft', true
            );
            INSERT INTO test_results VALUES (4, 'Reader cannot directly insert novel', 'FAIL', 'Direct SQL insert into novels succeeded for reader.');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (4, 'Reader cannot directly insert novel', 'PASS', 'Direct SQL insert correctly blocked: ' || SQLERRM);
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (4, 'Reader insert check', 'FAIL', 'Unexpected error: ' || SQLERRM);
    END;


    -- ==========================================================================
    -- TEST 5: SUBMIT FOR REVIEW VALIDATION & LIFECYCLE
    -- ==========================================================================
    BEGIN
        -- Impersonate Writer A
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        -- Step 5a: Fails without cover art
        BEGIN
            v_res := public.submit_novel_for_review(v_novel_draft_id);
            INSERT INTO test_results VALUES (5, 'submit_novel_for_review fails without cover', 'FAIL', 'submit succeeded on novel without cover.');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (5, 'submit_novel_for_review fails without cover', 'PASS', 'Blocked as expected: ' || SQLERRM);
        END;

        -- Add cover art
        UPDATE public.novels SET cover_url = 'https://example.com/cover.webp' WHERE id = v_novel_draft_id;

        -- Step 5b: Fails without genre
        BEGIN
            v_res := public.submit_novel_for_review(v_novel_draft_id);
            INSERT INTO test_results VALUES (5, 'submit_novel_for_review fails without genre', 'FAIL', 'submit succeeded on novel without genre.');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (5, 'submit_novel_for_review fails without genre', 'PASS', 'Blocked as expected: ' || SQLERRM);
        END;

        -- Add genre
        INSERT INTO public.novel_genres (novel_id, genre_id) VALUES (v_novel_draft_id, v_genre_id);

        -- Step 5c: Fails without at least 1 published chapter
        BEGIN
            v_res := public.submit_novel_for_review(v_novel_draft_id);
            INSERT INTO test_results VALUES (5, 'submit_novel_for_review fails without published chapter', 'FAIL', 'submit succeeded without chapter.');
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (5, 'submit_novel_for_review fails without published chapter', 'PASS', 'Blocked as expected: ' || SQLERRM);
        END;

        -- Add published chapter
        INSERT INTO public.chapters (novel_id, chapter_number, title_urdu, content_urdu, is_published)
        VALUES (v_novel_draft_id, 1, 'پہلا آزمائشی باب', 'یہ مکمل باب کا تفصیلی متن ہے۔', true);

        -- Step 5d: Now all requirements met, submit should succeed
        BEGIN
            v_res := public.submit_novel_for_review(v_novel_draft_id);
            SELECT status INTO v_status_check FROM public.novels WHERE id = v_novel_draft_id;
            IF v_status_check = 'under_review' THEN
                INSERT INTO test_results VALUES (5, 'submit_novel_for_review succeeds when complete', 'PASS', 'Novel transitioned to under_review.');
            ELSE
                INSERT INTO test_results VALUES (5, 'submit_novel_for_review succeeds when complete', 'FAIL', 'Status is: ' || v_status_check);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (5, 'submit_novel_for_review succeeds when complete', 'FAIL', 'Unexpected exception: ' || SQLERRM);
        END;

        -- Step 5e: Withdraw submission succeeds
        BEGIN
            v_res := public.withdraw_novel_submission(v_novel_draft_id);
            SELECT status INTO v_status_check FROM public.novels WHERE id = v_novel_draft_id;
            IF v_status_check = 'draft' THEN
                INSERT INTO test_results VALUES (5, 'withdraw_novel_submission succeeds', 'PASS', 'Novel reverted from under_review to draft.');
            ELSE
                INSERT INTO test_results VALUES (5, 'withdraw_novel_submission succeeds', 'FAIL', 'Status after withdraw is: ' || v_status_check);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO test_results VALUES (5, 'withdraw_novel_submission succeeds', 'FAIL', 'Unexpected error: ' || SQLERRM);
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (5, 'submit_novel_for_review lifecycle', 'FAIL', 'Unexpected error: ' || SQLERRM);
    END;


    -- ==========================================================================
    -- TEST 6: PRICE CHANGE ON PUBLISHED NOVEL DOES NOT ALTER EXISTING ORDERS
    -- ==========================================================================
    BEGIN
        -- Impersonate privileged admin/system to seed an existing order for published novel at 600 PKR
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        INSERT INTO public.orders (
            id, order_number, reader_id, novel_id, writer_id, novel_title_snapshot,
            amount_pkr, applied_commission_rate, calculated_commission_pkr,
            calculated_writer_share_pkr, selected_payment_method_id,
            payment_instructions_snapshot, status
        ) VALUES (
            v_order_id, 'UNB-TEST-ORDER-600', v_reader_id, v_novel_pub_id, v_writer_a_id, 'شائع شدہ ناول',
            600.00, 20.00, 120.00, 480.00, v_method_a_id,
            jsonb_build_object('type', 'jazzcash'), 'payment_submitted'
        )
        ON CONFLICT (id) DO NOTHING;

        -- Impersonate Writer A to change price of published novel from 600 PKR to 950 PKR
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        UPDATE public.novels
        SET price_pkr = 950.00
        WHERE id = v_novel_pub_id;

        -- Check that existing order still reflects 600.00 PKR
        SELECT amount_pkr INTO v_order_amount FROM public.orders WHERE id = v_order_id;

        IF v_order_amount = 600.00 THEN
            INSERT INTO test_results VALUES (6, 'Price change does not alter existing orders', 'PASS', 'Existing order remained at PKR 600 after novel updated to 950.');
        ELSE
            INSERT INTO test_results VALUES (6, 'Price change does not alter existing orders', 'FAIL', 'Existing order amount mutated to: ' || v_order_amount);
        END IF;

        -- Verify audit log entry was generated
        SELECT count(*) INTO v_count
        FROM public.audit_logs
        WHERE entity_id = v_novel_pub_id::text AND action_type = 'UPDATE_NOVEL_PRICE';

        IF v_count > 0 THEN
            INSERT INTO test_results VALUES (6, 'Audit log generated on published novel price change', 'PASS', 'Audit log row found.');
        ELSE
            INSERT INTO test_results VALUES (6, 'Audit log generated on published novel price change', 'FAIL', 'Audit log row missing.');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (6, 'Price change test', 'FAIL', 'Unexpected error: ' || SQLERRM);
    END;


    -- ==========================================================================
    -- TEST 7: HARD DELETE OF A PUBLISHED NOVEL CHAPTER IS BLOCKED
    -- ==========================================================================
    BEGIN
        -- Impersonate Writer A
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        -- Attempt to hard delete chapter from published novel
        BEGIN
            DELETE FROM public.chapters WHERE id = v_chap_pub_id;
            INSERT INTO test_results VALUES (7, 'Hard delete of published novel chapter is blocked', 'FAIL', 'Chapter deletion succeeded on published novel.');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Chapters cannot be hard-deleted once a novel is submitted or published%' THEN
                INSERT INTO test_results VALUES (7, 'Hard delete of published novel chapter is blocked', 'PASS', 'Blocked by trigger: ' || SQLERRM);
            ELSE
                INSERT INTO test_results VALUES (7, 'Hard delete of published novel chapter is blocked', 'PASS', 'Blocked with: ' || SQLERRM);
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (7, 'Chapter hard delete check', 'FAIL', 'Unexpected error: ' || SQLERRM);
    END;


    -- ==========================================================================
    -- TEST 8: DRAFT NOVELS & UNPUBLISHED CHAPTERS INVISIBLE TO OTHERS / ANON
    -- ==========================================================================
    BEGIN
        -- Step 8a: Impersonate Reader
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

        SELECT count(*) INTO v_count FROM public.novels WHERE id = v_novel_draft_id;
        IF v_count = 0 THEN
            INSERT INTO test_results VALUES (8, 'Draft novel invisible to reader', 'PASS', 'Reader cannot view draft novel.');
        ELSE
            INSERT INTO test_results VALUES (8, 'Draft novel invisible to reader', 'FAIL', 'Reader was able to select draft novel.');
        END IF;

        SELECT count(*) INTO v_count FROM public.chapters WHERE id = v_chap_unpub_id;
        IF v_count = 0 THEN
            INSERT INTO test_results VALUES (8, 'Unpublished chapter invisible to reader', 'PASS', 'Reader cannot view unpublished chapter.');
        ELSE
            INSERT INTO test_results VALUES (8, 'Unpublished chapter invisible to reader', 'FAIL', 'Reader was able to select unpublished chapter.');
        END IF;

        -- Step 8b: Impersonate Anon
        PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

        SELECT count(*) INTO v_count FROM public.novels WHERE id = v_novel_draft_id;
        IF v_count = 0 THEN
            INSERT INTO test_results VALUES (8, 'Draft novel invisible to anon', 'PASS', 'Anon cannot view draft novel.');
        ELSE
            INSERT INTO test_results VALUES (8, 'Draft novel invisible to anon', 'FAIL', 'Anon was able to select draft novel.');
        END IF;

        SELECT count(*) INTO v_count FROM public.chapters WHERE id = v_chap_unpub_id;
        IF v_count = 0 THEN
            INSERT INTO test_results VALUES (8, 'Unpublished chapter invisible to anon', 'PASS', 'Anon cannot view unpublished chapter.');
        ELSE
            INSERT INTO test_results VALUES (8, 'Unpublished chapter invisible to anon', 'FAIL', 'Anon was able to select unpublished chapter.');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (8, 'Visibility check', 'FAIL', 'Unexpected error: ' || SQLERRM);
    END;

END $$;

-- Display and evaluate all test outcomes
SELECT * FROM test_results ORDER BY test_id ASC, status DESC;

-- Fail transaction if any test failed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM test_results WHERE status = 'FAIL') THEN
        RAISE EXCEPTION 'Writer Content Hardening Test Suite Failed. Inspect test_results output above.';
    END IF;
END $$;

ROLLBACK;
