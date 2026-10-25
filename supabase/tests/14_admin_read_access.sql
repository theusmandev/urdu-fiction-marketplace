-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: ADMIN READ ACCESS & ISOLATION MATRIX (14)
-- ==============================================================================
-- File: supabase/tests/14_admin_read_access.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. Authenticated Admin can SELECT novels across ALL 5 statuses
--        (draft, under_review, published, rejected, suspended).
--     2. Authenticated Admin can SELECT all chapters of an under_review novel,
--        including free preview, paid entitlement, and unpublished draft chapters.
--     3. Authenticated Admin can SELECT novel_genres, genres, and writer_profiles
--        needed for the editorial moderation desk.
--     4. Authenticated Reader CANNOT view draft or under_review novels.
--     5. Authenticated Reader CANNOT view any chapters of an under_review novel.
--     6. Non-owner Writer CANNOT view another author's draft or under_review novels or chapters.
--     7. Owner Writer CAN view their own draft and under_review novels and chapters.
--     8. Anonymous client CANNOT view draft/under_review novels or unpublished chapters.
--
-- Security Invariants:
--   - Standalone transaction ending in ROLLBACK; zero database pollution.
--   - Role impersonation via SET LOCAL ROLE and request.jwt.claim.sub.
--   - No forbidden schema-qualified SQL syntax constructs (Rule 1).
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
    v_admin_id    uuid := '14141414-1414-1414-1414-141414141414'::uuid;
    v_writer1_id  uuid := '24242424-2424-2424-2424-242424242424'::uuid;
    v_writer2_id  uuid := '34343434-3434-3434-3434-343434343434'::uuid;
    v_reader_id   uuid := '44444444-4444-4444-4444-444444444444'::uuid;

    -- Entity UUIDs
    v_genre_id       uuid := gen_random_uuid();
    v_novel_draft_id uuid := gen_random_uuid();
    v_novel_rev_id   uuid := gen_random_uuid();
    v_novel_pub_id   uuid := gen_random_uuid();
    v_novel_rej_id   uuid := gen_random_uuid();
    v_novel_susp_id  uuid := gen_random_uuid();

    v_ch1_id uuid := gen_random_uuid();
    v_ch2_id uuid := gen_random_uuid();
    v_ch3_id uuid := gen_random_uuid();

    -- Inspection counts
    v_cnt integer;
    v_err_msg text;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Run as privileged superuser / postgres)
    -- --------------------------------------------------------------------------

    -- 1. Create fake users in auth.users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES 
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_mod_14@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer1_mod_14@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer2_mod_14@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_mod_14@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap profiles
    UPDATE public.profiles SET role = 'admin', username = 'admin_mod_14', full_name = 'Admin Moderator', is_active = true WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer1_mod_14', full_name = 'Owner Author', is_active = true WHERE id = v_writer1_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer2_mod_14', full_name = 'Other Author', is_active = true WHERE id = v_writer2_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_mod_14', full_name = 'Test Reader', is_active = true WHERE id = v_reader_id;

    -- 3. Approved Writer Profiles
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate
    ) VALUES 
        (v_writer1_id, 'مصنف اول', 'Primary Writer', 'تعارف مصنف اول', 'approved', 20.00),
        (v_writer2_id, 'مصنف دوم', 'Secondary Writer', 'تعارف مصنف دوم', 'approved', 20.00)
    ON CONFLICT (id) DO UPDATE SET status = 'approved';

    -- 4. Test Genre
    INSERT INTO public.genres (id, slug, name_urdu, name_english, is_active, display_order)
    VALUES (v_genre_id, 'fiction-moderation-14', 'ناول فکشن', 'Fiction Moderation', true, 1)
    ON CONFLICT (id) DO NOTHING;

    -- 5. Novel fixtures across all 5 statuses (Owned by Writer 1)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu,
        price_pkr, status, is_featured, rights_declaration_accepted, total_chapters
    ) VALUES
        (v_novel_draft_id, v_writer1_id, 'test-draft-novel-14', 'مسودہ ناول', 'Draft Novel 14', 'خلاصہ مسودہ', 100.00, 'draft', false, true, 0),
        (v_novel_rev_id,   v_writer1_id, 'test-review-novel-14', 'زیر جائزہ ناول', 'Under Review Novel 14', 'خلاصہ جائزہ', 150.00, 'under_review', false, true, 3),
        (v_novel_pub_id,   v_writer1_id, 'test-published-novel-14', 'شائع شدہ ناول', 'Published Novel 14', 'خلاصہ شائع', 200.00, 'published', true, true, 1),
        (v_novel_rej_id,   v_writer1_id, 'test-rejected-novel-14', 'مسترد شدہ ناول', 'Rejected Novel 14', 'خلاصہ مسترد', 100.00, 'rejected', false, false, 0),
        (v_novel_susp_id,  v_writer1_id, 'test-suspended-novel-14', 'معطل شدہ ناول', 'Suspended Novel 14', 'خلاصہ معطل', 120.00, 'suspended', false, true, 0)
    ON CONFLICT (id) DO NOTHING;

    -- 6. Link Under Review novel to Genre
    INSERT INTO public.novel_genres (novel_id, genre_id)
    VALUES (v_novel_rev_id, v_genre_id)
    ON CONFLICT DO NOTHING;

    -- 7. Chapters for the Under Review novel
    -- Chapter 1: Free preview, published
    INSERT INTO public.chapters (id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published, word_count)
    VALUES (v_ch1_id, v_novel_rev_id, 1, 'پہلا باب', 'یہ زیر جائزہ مفت باب کا متن ہے۔', true, true, 7);

    -- Chapter 2: Paid chapter, published
    INSERT INTO public.chapters (id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published, word_count)
    VALUES (v_ch2_id, v_novel_rev_id, 2, 'دوسرا باب', 'یہ زیر جائزہ ادا شدہ باب کا متن ہے۔', false, true, 8);

    -- Chapter 3: Paid chapter, draft/unpublished
    INSERT INTO public.chapters (id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published, word_count)
    VALUES (v_ch3_id, v_novel_rev_id, 3, 'تیسرا باب', 'یہ زیر جائزہ مسودہ باب کا متن ہے۔', false, false, 7);


    -- ==========================================================================
    -- CATEGORY 1: PLATFORM ADMINISTRATOR READ ACCESS
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin_id::text, true);

    -- Test 1: Admin can SELECT draft novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_draft_id;
    IF v_cnt = 1 THEN
        INSERT INTO test_results VALUES (1, 'Admin can SELECT draft novel', 'PASS', 'Draft novel visible to admin');
    ELSE
        INSERT INTO test_results VALUES (1, 'Admin can SELECT draft novel', 'FAIL', 'Admin unable to select draft novel');
    END IF;

    -- Test 2: Admin can SELECT under_review novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_rev_id;
    IF v_cnt = 1 THEN
        INSERT INTO test_results VALUES (2, 'Admin can SELECT under_review novel', 'PASS', 'Under review novel visible to admin');
    ELSE
        INSERT INTO test_results VALUES (2, 'Admin can SELECT under_review novel', 'FAIL', 'Admin unable to select under_review novel');
    END IF;

    -- Test 3: Admin can SELECT published novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_pub_id;
    IF v_cnt = 1 THEN
        INSERT INTO test_results VALUES (3, 'Admin can SELECT published novel', 'PASS', 'Published novel visible to admin');
    ELSE
        INSERT INTO test_results VALUES (3, 'Admin can SELECT published novel', 'FAIL', 'Admin unable to select published novel');
    END IF;

    -- Test 4: Admin can SELECT rejected novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_rej_id;
    IF v_cnt = 1 THEN
        INSERT INTO test_results VALUES (4, 'Admin can SELECT rejected novel', 'PASS', 'Rejected novel visible to admin');
    ELSE
        INSERT INTO test_results VALUES (4, 'Admin can SELECT rejected novel', 'FAIL', 'Admin unable to select rejected novel');
    END IF;

    -- Test 5: Admin can SELECT suspended novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_susp_id;
    IF v_cnt = 1 THEN
        INSERT INTO test_results VALUES (5, 'Admin can SELECT suspended novel', 'PASS', 'Suspended novel visible to admin');
    ELSE
        INSERT INTO test_results VALUES (5, 'Admin can SELECT suspended novel', 'FAIL', 'Admin unable to select suspended novel');
    END IF;

    -- Test 6: Admin can SELECT all 3 chapters of under_review novel (preview, paid, unpublished draft)
    SELECT count(*) INTO v_cnt FROM public.chapters WHERE novel_id = v_novel_rev_id;
    IF v_cnt = 3 THEN
        INSERT INTO test_results VALUES (6, 'Admin can SELECT all chapters of under_review novel', 'PASS', 'All 3 chapters visible to admin');
    ELSE
        INSERT INTO test_results VALUES (6, 'Admin can SELECT all chapters of under_review novel', 'FAIL', format('Expected 3 chapters, got %s', v_cnt));
    END IF;

    -- Test 7: Admin can SELECT genres and novel_genres for under_review novel
    SELECT count(*) INTO v_cnt
    FROM public.novel_genres ng
    JOIN public.genres g ON g.id = ng.genre_id
    WHERE ng.novel_id = v_novel_rev_id;
    IF v_cnt = 1 THEN
        INSERT INTO test_results VALUES (7, 'Admin can SELECT genres for under_review novel', 'PASS', 'Linked genre visible to admin');
    ELSE
        INSERT INTO test_results VALUES (7, 'Admin can SELECT genres for under_review novel', 'FAIL', 'Genre join failed for admin');
    END IF;

    -- Test 8: Admin can SELECT writer_profiles pen names needed for moderation queue
    SELECT count(*) INTO v_cnt
    FROM public.writer_profiles wp
    WHERE wp.id = v_writer1_id AND wp.pen_name_english = 'Primary Writer';
    IF v_cnt = 1 THEN
        INSERT INTO test_results VALUES (8, 'Admin can SELECT author pen name from writer_profiles', 'PASS', 'Author profile visible to admin');
    ELSE
        INSERT INTO test_results VALUES (8, 'Admin can SELECT author pen name from writer_profiles', 'FAIL', 'Author profile inaccessible to admin');
    END IF;


    -- ==========================================================================
    -- CATEGORY 2: READER ISOLATION & LOCKDOWN
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_id::text, true);

    -- Test 9: Reader CANNOT SELECT draft novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_draft_id;
    IF v_cnt = 0 THEN
        INSERT INTO test_results VALUES (9, 'Reader CANNOT SELECT draft novel', 'PASS', 'Draft novel strictly hidden from reader');
    ELSE
        INSERT INTO test_results VALUES (9, 'Reader CANNOT SELECT draft novel', 'FAIL', 'Reader leaked draft novel');
    END IF;

    -- Test 10: Reader CANNOT SELECT under_review novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_rev_id;
    IF v_cnt = 0 THEN
        INSERT INTO test_results VALUES (10, 'Reader CANNOT SELECT under_review novel', 'PASS', 'Under review novel strictly hidden from reader');
    ELSE
        INSERT INTO test_results VALUES (10, 'Reader CANNOT SELECT under_review novel', 'FAIL', 'Reader leaked under_review novel');
    END IF;

    -- Test 11: Reader CANNOT SELECT rejected or suspended novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id IN (v_novel_rej_id, v_novel_susp_id);
    IF v_cnt = 0 THEN
        INSERT INTO test_results VALUES (11, 'Reader CANNOT SELECT rejected/suspended novel', 'PASS', 'Rejected and suspended novels hidden from reader');
    ELSE
        INSERT INTO test_results VALUES (11, 'Reader CANNOT SELECT rejected/suspended novel', 'FAIL', 'Reader leaked non-published novel');
    END IF;

    -- Test 12: Reader CANNOT SELECT any chapters of under_review novel
    SELECT count(*) INTO v_cnt FROM public.chapters WHERE novel_id = v_novel_rev_id;
    IF v_cnt = 0 THEN
        INSERT INTO test_results VALUES (12, 'Reader CANNOT SELECT chapters of under_review novel', 'PASS', 'All under_review chapters hidden from reader');
    ELSE
        INSERT INTO test_results VALUES (12, 'Reader CANNOT SELECT chapters of under_review novel', 'FAIL', format('Reader leaked %s chapters', v_cnt));
    END IF;

    -- Test 13: Reader CAN SELECT published novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_pub_id;
    IF v_cnt = 1 THEN
        INSERT INTO test_results VALUES (13, 'Reader CAN SELECT published novel', 'PASS', 'Published novel visible to reader');
    ELSE
        INSERT INTO test_results VALUES (13, 'Reader CAN SELECT published novel', 'FAIL', 'Published novel inaccessible to reader');
    END IF;


    -- ==========================================================================
    -- CATEGORY 3: WRITER HORIZONTAL ISOLATION
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer2_id::text, true);

    -- Test 14: Non-owner Writer CANNOT SELECT another author draft novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_draft_id;
    IF v_cnt = 0 THEN
        INSERT INTO test_results VALUES (14, 'Non-owner writer CANNOT SELECT another author draft novel', 'PASS', 'Foreign draft strictly hidden');
    ELSE
        INSERT INTO test_results VALUES (14, 'Non-owner writer CANNOT SELECT another author draft novel', 'FAIL', 'Foreign draft leaked to other writer');
    END IF;

    -- Test 15: Non-owner Writer CANNOT SELECT another author under_review novel
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id = v_novel_rev_id;
    IF v_cnt = 0 THEN
        INSERT INTO test_results VALUES (15, 'Non-owner writer CANNOT SELECT another author under_review novel', 'PASS', 'Foreign under_review strictly hidden');
    ELSE
        INSERT INTO test_results VALUES (15, 'Non-owner writer CANNOT SELECT another author under_review novel', 'FAIL', 'Foreign under_review leaked to other writer');
    END IF;

    -- Test 16: Non-owner Writer CANNOT SELECT chapters of another author under_review novel
    SELECT count(*) INTO v_cnt FROM public.chapters WHERE novel_id = v_novel_rev_id;
    IF v_cnt = 0 THEN
        INSERT INTO test_results VALUES (16, 'Non-owner writer CANNOT SELECT chapters of foreign novel', 'PASS', 'Foreign novel chapters strictly hidden');
    ELSE
        INSERT INTO test_results VALUES (16, 'Non-owner writer CANNOT SELECT chapters of foreign novel', 'FAIL', format('Foreign chapters leaked: %s', v_cnt));
    END IF;


    -- ==========================================================================
    -- CATEGORY 4: AUTHOR SELF-ACCESS
    -- ==========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer1_id::text, true);

    -- Test 17: Owner author CAN SELECT their own draft and under_review novels
    SELECT count(*) INTO v_cnt FROM public.novels WHERE id IN (v_novel_draft_id, v_novel_rev_id);
    IF v_cnt = 2 THEN
        INSERT INTO test_results VALUES (17, 'Owner author CAN SELECT own draft and under_review novels', 'PASS', 'Both author novels visible');
    ELSE
        INSERT INTO test_results VALUES (17, 'Owner author CAN SELECT own draft and under_review novels', 'FAIL', format('Expected 2, got %s', v_cnt));
    END IF;

    -- Test 18: Owner author CAN SELECT their own chapters (including unpublished drafts)
    SELECT count(*) INTO v_cnt FROM public.chapters WHERE novel_id = v_novel_rev_id;
    IF v_cnt = 3 THEN
        INSERT INTO test_results VALUES (18, 'Owner author CAN SELECT all own chapters including drafts', 'PASS', 'All 3 author chapters visible');
    ELSE
        INSERT INTO test_results VALUES (18, 'Owner author CAN SELECT all own chapters including drafts', 'FAIL', format('Expected 3, got %s', v_cnt));
    END IF;


    -- ==========================================================================
    -- CATEGORY 5: ANONYMOUS ACCESS LOCKDOWN
    -- ==========================================================================
    SET LOCAL ROLE anon;
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);

    -- Test 19: Anon CANNOT SELECT draft or under_review novels from public.novels
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.novels WHERE id IN (v_novel_draft_id, v_novel_rev_id);
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (19, 'Anon CANNOT SELECT draft/under_review novels from public.novels', 'PASS', '0 rows returned under anon');
        ELSE
            INSERT INTO test_results VALUES (19, 'Anon CANNOT SELECT draft/under_review novels from public.novels', 'FAIL', format('Leaked %s rows to anon', v_cnt));
        END IF;
    EXCEPTION
        WHEN insufficient_privilege THEN
            INSERT INTO test_results VALUES (19, 'Anon CANNOT SELECT draft/under_review novels from public.novels', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 20: Anon CANNOT SELECT chapters of under_review novel from public.chapters
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.chapters WHERE novel_id = v_novel_rev_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (20, 'Anon CANNOT SELECT chapters of under_review novel from public.chapters', 'PASS', '0 rows returned under anon');
        ELSE
            INSERT INTO test_results VALUES (20, 'Anon CANNOT SELECT chapters of under_review novel from public.chapters', 'FAIL', format('Leaked %s chapters to anon', v_cnt));
        END IF;
    EXCEPTION
        WHEN insufficient_privilege THEN
            INSERT INTO test_results VALUES (20, 'Anon CANNOT SELECT chapters of under_review novel from public.chapters', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

END $$;

-- ------------------------------------------------------------------------------
-- 3. DISPLAY RESULTS & VERIFY ZERO FAILURES
-- ------------------------------------------------------------------------------
SELECT test_id, test_name, status, details FROM test_results ORDER BY test_id;

DO $$
DECLARE
    v_failed integer;
    v_total  integer;
BEGIN
    SELECT count(*) INTO v_failed FROM test_results WHERE status = 'FAIL';
    SELECT count(*) INTO v_total FROM test_results;
    IF v_failed > 0 THEN
        RAISE EXCEPTION 'TEST SUITE 14 FAILED: % of % test(s) failed.', v_failed, v_total;
    ELSE
        RAISE NOTICE 'ALL 20 ADMIN READ ACCESS AND ISOLATION TESTS PASSED (20/20).';
    END IF;
END $$;

ROLLBACK;
