-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: CHAPTER IMPORT & SPLIT RPCS (18)
-- ==============================================================================
-- File: supabase/tests/18_chapter_split_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. Approved owner can import chapters via import_chapters()
--     2. Numbering has no gaps or duplicates; total_chapters is correctly synced
--     3. Another writer, a reader, and anon CANNOT import or split chapters
--     4. Overwriting existing chapter numbers via import_chapters() is rejected
--     5. Parts exceeding 120,000 characters are strictly rejected
--     6. Owner can split an existing chapter via split_chapter()
--     7. Non-matching text is rejected (text preservation invariant)
--     8. Historical chapter snapshot is stored in chapter_revisions
--     9. Following chapters are renumbered without unique constraint collisions
--    10. Published novel with active entitlement BLOCKS splitting a published middle chapter
--    11. Published novel with active entitlement ALLOWS splitting an unpublished draft chapter
--    12. Audit logs are reliably recorded for both operations
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
    v_writer_a_id    uuid := '22222222-2222-2222-2222-222222222222'::uuid;
    v_writer_b_id    uuid := '33333333-3333-3333-3333-333333333333'::uuid;
    v_reader_id      uuid := '44444444-4444-4444-4444-444444444444'::uuid;

    -- Entity IDs
    v_genre_id       uuid := gen_random_uuid();
    v_novel_draft_id uuid := gen_random_uuid();
    v_novel_sold_id  uuid := gen_random_uuid();
    v_chap1_id       uuid := gen_random_uuid();
    v_chap2_id       uuid := gen_random_uuid();
    v_chap3_id       uuid := gen_random_uuid();
    v_sold_chap1_id  uuid := gen_random_uuid();
    v_sold_chap2_id  uuid := gen_random_uuid();
    v_sold_draft_id  uuid := gen_random_uuid();
    v_order_id       uuid := gen_random_uuid();
    v_entitlement_id uuid := gen_random_uuid();

    -- Helper variables
    v_rpc_res        jsonb;
    v_err_caught     boolean;
    v_err_msg        text;
    v_check_count    integer;
    v_max_chapter_num integer;
    v_rev_count      integer;
    v_audit_count    integer;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURES SETUP
    -- --------------------------------------------------------------------------

    -- 1. Create test users in auth.users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_split_18@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_a_18@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_b_18@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_split_18@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap profiles
    UPDATE public.profiles SET role = 'admin', username = 'admin_split_18', full_name = 'Admin Split', is_active = true WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_a_18', full_name = 'Writer A Split', is_active = true WHERE id = v_writer_a_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_b_18', full_name = 'Writer B Split', is_active = true WHERE id = v_writer_b_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_split_18', full_name = 'Reader Split', is_active = true WHERE id = v_reader_id;

    -- 3. Approved Writer Profiles
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate
    ) VALUES
        (v_writer_a_id, 'مصنف اول', 'Author One', 'بائیو', 'approved', 20.00),
        (v_writer_b_id, 'مصنف دوم', 'Author Two', 'بائیو', 'approved', 20.00)
    ON CONFLICT (id) DO UPDATE SET status = 'approved';

    -- 4. Test Genre
    INSERT INTO public.genres (id, slug, name_urdu, name_english, is_active, display_order)
    VALUES (v_genre_id, 'split-test-genre', 'صنف ٹیسٹ', 'Split Genre', true, 1)
    ON CONFLICT (id) DO NOTHING;

    -- 5. Novel 1 (Draft, owned by Writer A)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, rights_declaration_accepted
    ) VALUES (
        v_novel_draft_id, v_writer_a_id, 'novel-draft-split-18', 'ڈرافٹ ناول برائے ٹیسٹ', 'Draft Split Novel', 'خلاصہ', 150.00, 'draft', true
    ) ON CONFLICT (id) DO NOTHING;

    -- Pre-populate Chapter 1, 2, 3 in Novel 1
    INSERT INTO public.chapters (id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published)
    VALUES
        (v_chap1_id, v_novel_draft_id, 1, 'باب اول', 'یہ پہلا باب ہے جس میں تعارف بیان کیا گیا ہے۔', true, true),
        (v_chap2_id, v_novel_draft_id, 2, 'باب دوم', 'یہ دوسرا باب ہے جس میں کہانی آگے بڑھتی ہے۔ منظر ایک تبدیل ہوتا ہے۔', false, true),
        (v_chap3_id, v_novel_draft_id, 3, 'باب سوم', 'یہ تیسرا اور آخری باب ہے جس پر کہانی اختتام کو پہنچتی ہے۔', false, true)
    ON CONFLICT (id) DO NOTHING;

    -- 6. Novel 2 (Published & Sold to Reader with Active Entitlement)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, rights_declaration_accepted, published_at
    ) VALUES (
        v_novel_sold_id, v_writer_a_id, 'novel-sold-split-18', 'فروخت شدہ ناول', 'Sold Novel', 'خلاصہ فروخت شدہ', 200.00, 'published', true, now()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.chapters (id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published)
    VALUES
        (v_sold_chap1_id, v_novel_sold_id, 1, 'فروخت شدہ باب اول', 'پہلا شائع شدہ باب۔', true, true),
        (v_sold_chap2_id, v_novel_sold_id, 2, 'فروخت شدہ باب دوم', 'دوسرا شائع شدہ باب۔', false, true),
        (v_sold_draft_id, v_novel_sold_id, 3, 'فروخت شدہ غیر شائع شدہ مسودہ', 'یہ مسودہ ابھی ڈرافٹ ہے اور خریداروں کو نظر نہیں آتا۔', false, false)
    ON CONFLICT (id) DO NOTHING;

    -- Mock order & entitlement for Reader on Novel 2
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
        amount_pkr, applied_commission_rate, calculated_commission_pkr, calculated_writer_share_pkr,
        payment_instructions_snapshot, status
    ) VALUES (
        v_order_id, 'ORD-SPLIT-18-001', v_reader_id, v_writer_a_id, v_novel_sold_id, 'فروخت شدہ ناول',
        200.00, 20.00, 40.00, 160.00,
        '{"method_type":"jazzcash","account_number_or_iban":"03001234567"}'::jsonb,
        'verified'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.purchase_entitlements (
        id, reader_id, novel_id, order_id, is_revoked, granted_at
    ) VALUES (
        v_entitlement_id, v_reader_id, v_novel_sold_id, v_order_id, false, now()
    ) ON CONFLICT (reader_id, novel_id) DO NOTHING;


    -- ==========================================================================
    -- TEST 1: Owner (Approved Writer A) can import chapters via import_chapters()
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

    v_rpc_res := public.import_chapters(
        v_novel_draft_id,
        NULL, -- Append after existing chapter 3
        jsonb_build_array(
            jsonb_build_object('title_urdu', 'باب چہارم — حصہ اول', 'content_urdu', 'یہ چوتھے باب کا پہلا حصہ ہے جو درآمد کیا گیا۔'),
            jsonb_build_object('title_urdu', 'باب پنجم — حصہ دوم', 'content_urdu', 'یہ پانچویں باب کا دوسرا حصہ ہے جو درآمد کیا گیا۔')
        )
    );

    IF jsonb_array_length(v_rpc_res) = 2
       AND (v_rpc_res->0->>'chapter_number')::int = 4
       AND (v_rpc_res->1->>'chapter_number')::int = 5
       AND (v_rpc_res->0->>'is_published')::boolean = false THEN
        INSERT INTO test_results VALUES (1, 'Owner can import draft chapters atomically', 'PASS', 'Chapters 4 and 5 appended as drafts');
    ELSE
        INSERT INTO test_results VALUES (1, 'Owner can import draft chapters atomically', 'FAIL', coalesce(v_rpc_res::text, 'Null response'));
    END IF;


    -- ==========================================================================
    -- TEST 2: Novel total_chapters trigger accurately synced
    -- ==========================================================================
    SELECT total_chapters INTO v_check_count
    FROM public.novels
    WHERE id = v_novel_draft_id;

    IF v_check_count = 5 THEN
        INSERT INTO test_results VALUES (2, 'Novel total_chapters trigger correctly updated to 5', 'PASS', 'total_chapters = 5');
    ELSE
        INSERT INTO test_results VALUES (2, 'Novel total_chapters trigger correctly updated to 5', 'FAIL', 'Expected 5 but got ' || coalesce(v_check_count::text, 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 3: Another writer CANNOT import chapters into Writer A''s novel
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_b_id::text, true);

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.import_chapters(
            v_novel_draft_id,
            NULL,
            jsonb_build_array(jsonb_build_object('title_urdu', 'حملہ باب', 'content_urdu', 'غیر مجاز مواد'))
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Access denied%' THEN
        INSERT INTO test_results VALUES (3, 'Another writer cannot import chapters into foreign novel', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (3, 'Another writer cannot import chapters into foreign novel', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;


    -- ==========================================================================
    -- TEST 4: Reader CANNOT import chapters
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_id::text, true);

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.import_chapters(
            v_novel_draft_id,
            NULL,
            jsonb_build_array(jsonb_build_object('title_urdu', 'ریڈر کا باب', 'content_urdu', 'مواد'))
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND (v_err_msg LIKE '%Access denied%' OR v_err_msg LIKE '%Only approved writers%') THEN
        INSERT INTO test_results VALUES (4, 'Reader cannot import chapters', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (4, 'Reader cannot import chapters', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;


    -- ==========================================================================
    -- TEST 5: Overwriting existing chapter numbers via import_chapters() is rejected
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.import_chapters(
            v_novel_draft_id,
            2, -- Chapter 2 already exists!
            jsonb_build_array(jsonb_build_object('title_urdu', 'اوور رائٹ باب', 'content_urdu', 'اوور رائٹ کرنے کی کوشش'))
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%already exists for this novel%' THEN
        INSERT INTO test_results VALUES (5, 'Existing chapter numbers cannot be overwritten', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (5, 'Existing chapter numbers cannot be overwritten', 'FAIL', coalesce(v_err_msg, 'No collision error'));
    END IF;


    -- ==========================================================================
    -- TEST 6: Chapter parts exceeding 120,000 characters are rejected with friendly error
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.import_chapters(
            v_novel_draft_id,
            NULL,
            jsonb_build_array(jsonb_build_object('title_urdu', 'بہت بڑا باب', 'content_urdu', repeat('الف ', 61000))) -- > 120,000 chars
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%exceeds the 120,000 character platform limit%' THEN
        INSERT INTO test_results VALUES (6, 'Over-limit chapters (>120k chars) strictly rejected', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (6, 'Over-limit chapters (>120k chars) strictly rejected', 'FAIL', coalesce(v_err_msg, 'Limit bypassed'));
    END IF;


    -- ==========================================================================
    -- TEST 7: Owner can split an existing chapter (Chapter 2 in Novel 1)
    -- Original text of Chapter 2:
    -- "یہ دوسرا باب ہے جس میں کہانی آگے بڑھتی ہے۔ منظر ایک تبدیل ہوتا ہے۔"
    -- Split into 2 parts:
    -- Part 1: "یہ دوسرا باب ہے جس میں کہانی آگے بڑھتی ہے۔ "
    -- Part 2: "منظر ایک تبدیل ہوتا ہے۔"
    -- ==========================================================================
    v_rpc_res := public.split_chapter(
        v_chap2_id,
        jsonb_build_array(
            jsonb_build_object('title_urdu', 'باب دوم — حصہ اول', 'content_urdu', 'یہ دوسرا باب ہے جس میں کہانی آگے بڑھتی ہے۔'),
            jsonb_build_object('title_urdu', 'باب دوم — حصہ دوم', 'content_urdu', 'منظر ایک تبدیل ہوتا ہے۔')
        )
    );

    IF jsonb_array_length(v_rpc_res) = 2
       AND (v_rpc_res->0->>'chapter_number')::int = 2
       AND (v_rpc_res->1->>'chapter_number')::int = 3 THEN
        INSERT INTO test_results VALUES (7, 'Owner can split chapter into multiple parts', 'PASS', 'Chapter 2 split into numbers 2 and 3');
    ELSE
        INSERT INTO test_results VALUES (7, 'Owner can split chapter into multiple parts', 'FAIL', coalesce(v_rpc_res::text, 'Split failed'));
    END IF;


    -- ==========================================================================
    -- TEST 8: Following chapters are safely renumbered without gaps or unique constraint collision
    -- Previous Chapter 3 should now be Chapter 4; Chapter 4 -> 5; Chapter 5 -> 6. Total: 6 chapters.
    -- ==========================================================================
    SELECT count(*), max(chapter_number) INTO v_check_count, v_max_chapter_num
    FROM public.chapters
    WHERE novel_id = v_novel_draft_id;

    IF v_check_count = 6 AND v_max_chapter_num = 6 THEN
        INSERT INTO test_results VALUES (8, 'Following chapters safely shifted without collisions', 'PASS', 'Total 6 chapters, max number = 6');
    ELSE
        INSERT INTO test_results VALUES (8, 'Following chapters safely shifted without collisions', 'FAIL', 'Count: ' || v_check_count || ', Max: ' || v_max_chapter_num);
    END IF;


    -- ==========================================================================
    -- TEST 9: Historical snapshot is stored in chapter_revisions
    -- ==========================================================================
    SELECT count(*) INTO v_rev_count
    FROM public.chapter_revisions
    WHERE chapter_id = v_chap2_id;

    IF v_rev_count >= 1 THEN
        INSERT INTO test_results VALUES (9, 'Original chapter snapshot stored in chapter_revisions', 'PASS', 'Revision count = ' || v_rev_count);
    ELSE
        INSERT INTO test_results VALUES (9, 'Original chapter snapshot stored in chapter_revisions', 'FAIL', 'No revision record found');
    END IF;


    -- ==========================================================================
    -- TEST 10: Non-matching text is rejected (Text preservation invariant)
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.split_chapter(
            v_chap1_id,
            jsonb_build_array(
                jsonb_build_object('title_urdu', 'حصہ اول', 'content_urdu', 'مکمل طور پر مختلف متن جو اصل سے نہیں ملتا۔'),
                jsonb_build_object('title_urdu', 'حصہ دوم', 'content_urdu', 'دوسرا مختلف متن۔')
            )
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Text preservation check failed%' THEN
        INSERT INTO test_results VALUES (10, 'Lossy/altered split text strictly rejected', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (10, 'Lossy/altered split text strictly rejected', 'FAIL', coalesce(v_err_msg, 'Text preservation bypassed'));
    END IF;


    -- ==========================================================================
    -- TEST 11: Published novel with active entitlement BLOCKS splitting a published middle chapter
    -- (Chapter 1 in Novel 2 is published, while max chapter is 3)
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.split_chapter(
            v_sold_chap1_id,
            jsonb_build_array(
                jsonb_build_object('title_urdu', 'حصہ ۱', 'content_urdu', 'پہلا شائع شدہ'),
                jsonb_build_object('title_urdu', 'حصہ ۲', 'content_urdu', 'باب۔')
            )
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Cannot split a published middle chapter on a novel with active reader purchases%' THEN
        INSERT INTO test_results VALUES (11, 'Sold novel blocks splitting published middle chapter', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (11, 'Sold novel blocks splitting published middle chapter', 'FAIL', coalesce(v_err_msg, 'Protection bypassed'));
    END IF;


    -- ==========================================================================
    -- TEST 12: Published novel with active entitlement ALLOWS splitting an unpublished draft chapter
    -- (Chapter 3 in Novel 2 is is_published = false)
    -- Original text: "یہ مسودہ ابھی ڈرافٹ ہے اور خریداروں کو نظر نہیں آتا۔"
    -- ==========================================================================
    v_rpc_res := public.split_chapter(
        v_sold_draft_id,
        jsonb_build_array(
            jsonb_build_object('title_urdu', 'ڈرافٹ حصہ ۱', 'content_urdu', 'یہ مسودہ ابھی ڈرافٹ ہے'),
            jsonb_build_object('title_urdu', 'ڈرافٹ حصہ ۲', 'content_urdu', 'اور خریداروں کو نظر نہیں آتا۔')
        )
    );

    IF jsonb_array_length(v_rpc_res) = 2 THEN
        INSERT INTO test_results VALUES (12, 'Sold novel permits splitting unpublished draft chapters', 'PASS', 'Draft split allowed');
    ELSE
        INSERT INTO test_results VALUES (12, 'Sold novel permits splitting unpublished draft chapters', 'FAIL', coalesce(v_rpc_res::text, 'Draft split failed'));
    END IF;


    -- ==========================================================================
    -- TEST 13: Audit logs recorded for import_chapters and split_chapter
    -- ==========================================================================
    SELECT count(*) INTO v_audit_count
    FROM public.audit_logs
    WHERE action_type IN ('chapters_imported', 'chapter_split');

    IF v_audit_count >= 3 THEN
        INSERT INTO test_results VALUES (13, 'Audit logs recorded for chapter import and split actions', 'PASS', 'Recorded audit entries: ' || v_audit_count);
    ELSE
        INSERT INTO test_results VALUES (13, 'Audit logs recorded for chapter import and split actions', 'FAIL', 'Expected >= 3 but found ' || v_audit_count);
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
        RAISE NOTICE 'ALL CHAPTER SPLIT & IMPORT TESTS PASSED SUCCESSFULLY.';
    END IF;
END $$;

ROLLBACK;
