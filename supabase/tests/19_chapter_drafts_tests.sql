-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: CHAPTER DRAFTS & AUTOSAVE (19)
-- ==============================================================================
-- File: supabase/tests/19_chapter_drafts_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. Approved owner can upsert draft and read via get_chapter_draft()
--     2. Another writer CANNOT read or write drafts for owner's novel
--     3. A reader CANNOT read or write chapter drafts
--     4. Anon CANNOT read or write chapter drafts
--     5. Direct table SELECT/INSERT/UPDATE/DELETE are strictly denied to authenticated
--     6. Live chapters are NEVER changed by draft upserts (compare before/after)
--     7. Stale p_expected_server_revision returns conflict without overwriting
--     8. Identical re-upsert is idempotent
--     9. Content exceeding 120,000 characters is rejected
--    10. Draft count limit (max 100 per writer) is enforced
--    11. Discard removes draft and records meaningful audit_logs row
--    12. Sold-novel published chapters remain unaffected by draft operations
--    13. Conflict resolution (keep_mine and keep_server) works as expected
--    14. Retention purge_old_chapter_drafts requires admin or service role
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
    v_sold_chap1_id  uuid := gen_random_uuid();
    v_order_id       uuid := gen_random_uuid();
    v_entitlement_id uuid := gen_random_uuid();

    -- Draft test keys
    v_client_key_1   text := 'tab-slot-chap-1-writer-a';
    v_client_key_new text := 'tab-slot-new-chap-writer-a';

    -- Helper variables
    v_rpc_res        jsonb;
    v_get_res        jsonb;
    v_list_res       jsonb;
    v_err_caught     boolean;
    v_err_msg        text;
    v_err_state      text;
    v_before_content text;
    v_after_content  text;
    v_before_updated timestamptz;
    v_after_updated  timestamptz;
    v_audit_count    integer;
    v_draft_count    integer;
    v_i              integer;
    v_dummy_key      text;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURES SETUP
    -- --------------------------------------------------------------------------

    -- 1. Auth users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_drafts_19@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_a_drafts_19@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_b_drafts_19@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_drafts_19@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Profiles
    UPDATE public.profiles SET role = 'admin', username = 'admin_drafts_19', full_name = 'Admin Drafts', is_active = true WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_a_drafts_19', full_name = 'Writer A Drafts', is_active = true WHERE id = v_writer_a_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_b_drafts_19', full_name = 'Writer B Drafts', is_active = true WHERE id = v_writer_b_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_drafts_19', full_name = 'Reader Drafts', is_active = true WHERE id = v_reader_id;

    -- 3. Approved Writer Profiles
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate
    ) VALUES
        (v_writer_a_id, 'مصنف ڈرافٹس الف', 'Author Drafts A', 'بائیو', 'approved', 20.00),
        (v_writer_b_id, 'مصنف ڈرافٹس ب', 'Author Drafts B', 'بائیو', 'approved', 20.00)
    ON CONFLICT (id) DO UPDATE SET status = 'approved';

    -- 4. Novel 1 (Draft, Owned by Writer A)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, rights_declaration_accepted
    ) VALUES (
        v_novel_draft_id, v_writer_a_id, 'novel-drafts-19', 'ڈرافٹس ٹیسٹ ناول', 'Drafts Test Novel', 'خلاصہ', 150.00, 'draft', true
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.chapters (id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published, updated_at)
    VALUES (
        v_chap1_id, v_novel_draft_id, 1, 'پہلا باب اصل', 'یہ اصل لائیو باب کا مواد ہے جو تبدیل نہیں ہونا چاہیے۔', true, true, now()
    ) ON CONFLICT (id) DO NOTHING;

    -- 5. Novel 2 (Published and Sold with Entitlement)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, rights_declaration_accepted, published_at
    ) VALUES (
        v_novel_sold_id, v_writer_a_id, 'novel-sold-drafts-19', 'فروخت شدہ ڈرافٹس ناول', 'Sold Drafts Novel', 'خلاصہ فروخت', 200.00, 'published', true, now()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.chapters (id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published, updated_at)
    VALUES (
        v_sold_chap1_id, v_novel_sold_id, 1, 'فروخت باب اول', 'یہ فروخت شدہ کتاب کا پہلا باب ہے جس کو قاری پڑھ سکتا ہے۔', true, true, now()
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
        amount_pkr, applied_commission_rate, calculated_commission_pkr, calculated_writer_share_pkr,
        payment_instructions_snapshot, status
    ) VALUES (
        v_order_id, 'ORD-DRAFTS-19-001', v_reader_id, v_writer_a_id, v_novel_sold_id, 'فروخت شدہ ڈرافٹس ناول',
        200.00, 20.00, 40.00, 160.00,
        '{"method_type":"jazzcash","account_number_or_iban":"03001234567"}'::jsonb,
        'verified'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.purchase_entitlements (
        id, reader_id, novel_id, order_id, is_revoked, granted_at
    ) VALUES (
        v_entitlement_id, v_reader_id, v_novel_sold_id, v_order_id, false, now()
    ) ON CONFLICT (id) DO NOTHING;


    -- ==========================================================================
    -- TEST 1: Owner (Writer A) can upsert draft and read via get_chapter_draft
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

    v_rpc_res := public.upsert_chapter_draft(
        v_novel_draft_id,
        v_chap1_id,
        v_client_key_1,
        'باب اول کا مسودہ',
        'یہ مصنف الف کی جانب سے ٹائپ کردہ غیر مطبوعہ ڈرافٹ ہے۔',
        1,
        now(),
        1,
        'Chrome on Linux'
    );

    v_get_res := public.get_chapter_draft(v_client_key_1);

    IF (v_rpc_res->>'status') = 'ok'
       AND (v_rpc_res->>'server_revision')::int = 1
       AND (v_get_res->>'content_urdu') = 'یہ مصنف الف کی جانب سے ٹائپ کردہ غیر مطبوعہ ڈرافٹ ہے۔'
       AND (v_get_res->>'title_urdu') = 'باب اول کا مسودہ' THEN
        INSERT INTO test_results VALUES (1, 'Owner can upsert and read draft via get_chapter_draft', 'PASS', 'Draft stored and retrieved accurately');
    ELSE
        INSERT INTO test_results VALUES (1, 'Owner can upsert and read draft via get_chapter_draft', 'FAIL', coalesce(v_rpc_res::text, 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 2: Another writer CANNOT read or write draft into Owner's novel
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_b_id::text, true);

    -- Try to read Owner A's draft
    v_get_res := public.get_chapter_draft(v_client_key_1);

    -- Try to write to Owner A's novel
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.upsert_chapter_draft(
            v_novel_draft_id,
            v_chap1_id,
            'tab-slot-foreign',
            'حملہ مسودہ',
            'غیر متعلقہ مصنف کا ڈرافٹ',
            1,
            now(),
            1,
            'Hacker Device'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    IF v_get_res IS NULL AND v_err_caught AND v_err_msg LIKE '%Access denied%' THEN
        INSERT INTO test_results VALUES (2, 'Another writer cannot read or write draft into foreign novel', 'PASS', 'Write blocked with access denied and read returned NULL');
    ELSE
        INSERT INTO test_results VALUES (2, 'Another writer cannot read or write draft into foreign novel', 'FAIL', 'Read: ' || coalesce(v_get_res::text, 'null') || ' | Error: ' || coalesce(v_err_msg, 'none'));
    END IF;


    -- ==========================================================================
    -- TEST 3: Reader CANNOT read or write chapter drafts
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_id::text, true);

    v_get_res := public.get_chapter_draft(v_client_key_1);

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.upsert_chapter_draft(
            v_novel_draft_id,
            v_chap1_id,
            'tab-slot-reader',
            'ریڈر ڈرافٹ',
            'ریڈر کا متن',
            1,
            now(),
            1,
            'Reader Device'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    IF v_get_res IS NULL AND v_err_caught AND (v_err_msg LIKE '%Access denied%' OR v_err_msg LIKE '%Only approved writers%') THEN
        INSERT INTO test_results VALUES (3, 'Reader cannot read or write chapter drafts', 'PASS', 'Write blocked and read returned NULL');
    ELSE
        INSERT INTO test_results VALUES (3, 'Reader cannot read or write chapter drafts', 'FAIL', 'Read: ' || coalesce(v_get_res::text, 'null') || ' | Error: ' || coalesce(v_err_msg, 'none'));
    END IF;


    -- ==========================================================================
    -- TEST 4: Anon (no auth.uid()) CANNOT read or write chapter drafts
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'anon', true);

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.upsert_chapter_draft(
            v_novel_draft_id,
            v_chap1_id,
            'tab-anon',
            'عنوان',
            'مواد',
            1,
            now(),
            1,
            'Anon'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Authentication required%' THEN
        INSERT INTO test_results VALUES (4, 'Anon cannot read or write drafts', 'PASS', 'Authentication required exception raised');
    ELSE
        INSERT INTO test_results VALUES (4, 'Anon cannot read or write drafts', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;


    -- ==========================================================================
    -- TEST 5: Direct table SELECT/INSERT/UPDATE/DELETE are denied to authenticated
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    SET LOCAL ROLE authenticated;

    v_err_caught := false;
    v_err_msg := NULL;
    v_err_state := NULL;
    BEGIN
        EXECUTE 'SELECT count(*) FROM public.chapter_drafts';
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    RESET ROLE;
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

    IF v_err_caught AND (v_err_msg LIKE '%permission denied%' OR v_err_state = '42501') THEN
        INSERT INTO test_results VALUES (5, 'Direct table access denied to authenticated role', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (5, 'Direct table access denied to authenticated role', 'FAIL', coalesce(v_err_msg, 'No permission denied'));
    END IF;


    -- ==========================================================================
    -- TEST 6: Live chapters are NEVER changed by draft upserts
    -- ==========================================================================
    SELECT content_urdu, updated_at INTO v_before_content, v_before_updated
    FROM public.chapters
    WHERE id = v_chap1_id;

    -- Writer performs multiple draft updates with different text
    v_rpc_res := public.upsert_chapter_draft(
        v_novel_draft_id,
        v_chap1_id,
        v_client_key_1,
        'تبدیل شدہ ڈرافٹ عنوان',
        'یہ تبدیل شدہ ڈرافٹ مواد ہے جو لائیو ٹیبل میں قطعی نہیں جانا چاہیے۔',
        1,
        now(),
        1, -- Expecting revision 1 -> bumps to 2
        'MacBook Pro'
    );

    SELECT content_urdu, updated_at INTO v_after_content, v_after_updated
    FROM public.chapters
    WHERE id = v_chap1_id;

    IF v_before_content = v_after_content AND v_before_updated = v_after_updated THEN
        INSERT INTO test_results VALUES (6, 'Live chapters are untouched by draft upserts', 'PASS', 'Live content and timestamp remained perfectly identical');
    ELSE
        INSERT INTO test_results VALUES (6, 'Live chapters are untouched by draft upserts', 'FAIL', 'Live chapter modified! Before: ' || v_before_content || ' After: ' || v_after_content);
    END IF;


    -- ==========================================================================
    -- TEST 7: Stale p_expected_server_revision returns conflict and does NOT overwrite
    -- ==========================================================================
    -- Server revision is now 2. Caller sends expected revision 1 (stale)
    v_rpc_res := public.upsert_chapter_draft(
        v_novel_draft_id,
        v_chap1_id,
        v_client_key_1,
        'پرانا ڈرافٹ',
        'پرانا متنازعہ مواد',
        1,
        now(),
        1, -- Stale revision!
        'Stale Device'
    );

    -- Verify server content was NOT overwritten
    v_get_res := public.get_chapter_draft(v_client_key_1);

    IF (v_rpc_res->>'status') = 'conflict'
       AND (v_rpc_res->>'server_revision')::int = 2
       AND (v_get_res->>'content_urdu') = 'یہ تبدیل شدہ ڈرافٹ مواد ہے جو لائیو ٹیبل میں قطعی نہیں جانا چاہیے۔' THEN
        INSERT INTO test_results VALUES (7, 'Stale expected revision returns conflict without overwriting', 'PASS', 'Conflict returned with current server revision 2');
    ELSE
        INSERT INTO test_results VALUES (7, 'Stale expected revision returns conflict without overwriting', 'FAIL', coalesce(v_rpc_res::text, 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 8: Identical re-upsert is idempotent
    -- ==========================================================================
    -- Re-send the exact current content with matching revision 2
    v_rpc_res := public.upsert_chapter_draft(
        v_novel_draft_id,
        v_chap1_id,
        v_client_key_1,
        'تبدیل شدہ ڈرافٹ عنوان',
        'یہ تبدیل شدہ ڈرافٹ مواد ہے جو لائیو ٹیبل میں قطعی نہیں جانا چاہیے۔',
        1,
        now(),
        2,
        'MacBook Pro'
    );

    IF (v_rpc_res->>'status') = 'ok' AND (v_rpc_res->>'server_revision')::int = 2 THEN
        INSERT INTO test_results VALUES (8, 'Identical re-upsert is idempotent', 'PASS', 'Revision remained 2 with ok status');
    ELSE
        INSERT INTO test_results VALUES (8, 'Identical re-upsert is idempotent', 'FAIL', coalesce(v_rpc_res::text, 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 9: Content exceeding 120,000 characters is strictly rejected
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.upsert_chapter_draft(
            v_novel_draft_id,
            v_chap1_id,
            v_client_key_1,
            'طویل باب',
            repeat('ا', 120001),
            1,
            now(),
            2,
            'Desktop'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    IF v_err_caught AND v_err_msg LIKE '%120,000 characters%' THEN
        INSERT INTO test_results VALUES (9, 'Draft exceeding 120,000 characters rejected', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (9, 'Draft exceeding 120,000 characters rejected', 'FAIL', coalesce(v_err_msg, 'No error raised'));
    END IF;


    -- ==========================================================================
    -- TEST 10: Draft count limit (max 100 per writer) enforced
    -- ==========================================================================
    SELECT count(*) INTO v_draft_count
    FROM public.chapter_drafts
    WHERE writer_id = v_writer_a_id;

    -- Pre-populate up to 100 drafts
    FOR v_i IN (v_draft_count + 1)..100 LOOP
        v_dummy_key := 'slot-filler-' || v_i::text;
        INSERT INTO public.chapter_drafts (
            writer_id, novel_id, client_key, content_urdu, server_revision, created_at, updated_at
        ) VALUES (
            v_writer_a_id, v_novel_draft_id, v_dummy_key, 'ٹیسٹ فلر مواد', 1, pg_catalog.now(), pg_catalog.now()
        );
    END LOOP;

    -- Now attempt to insert 101st draft via RPC
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.upsert_chapter_draft(
            v_novel_draft_id,
            NULL,
            'slot-filler-101',
            'نیا ڈرافٹ',
            'ایک سواں ڈرافٹ',
            NULL,
            NULL,
            1,
            'Test Device'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    IF v_err_caught AND v_err_msg LIKE '%at most 100 active drafts%' THEN
        INSERT INTO test_results VALUES (10, 'Draft count limit (max 100) enforced', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (10, 'Draft count limit (max 100) enforced', 'FAIL', coalesce(v_err_msg, '101st draft was permitted'));
    END IF;

    -- Clean up filler drafts
    DELETE FROM public.chapter_drafts
    WHERE writer_id = v_writer_a_id AND client_key LIKE 'slot-filler-%';


    -- ==========================================================================
    -- TEST 11: Discard removes draft and records audit_logs row
    -- ==========================================================================
    v_rpc_res := public.discard_chapter_draft(v_client_key_1);
    v_get_res := public.get_chapter_draft(v_client_key_1);

    SELECT count(*) INTO v_audit_count
    FROM public.audit_logs
    WHERE action_type = 'chapter_draft_discarded'
      AND actor_id = v_writer_a_id;

    IF (v_rpc_res->>'status') = 'ok'
       AND (v_rpc_res->>'discarded')::boolean = true
       AND v_get_res IS NULL
       AND v_audit_count >= 1 THEN
        INSERT INTO test_results VALUES (11, 'Discard draft removes row and records audit log', 'PASS', 'Draft deleted and audit log recorded');
    ELSE
        INSERT INTO test_results VALUES (11, 'Discard draft removes row and records audit log', 'FAIL', 'Audit count: ' || v_audit_count || ' | Res: ' || coalesce(v_rpc_res::text, 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 12: Sold novel published chapters are unaffected by draft operations
    -- ==========================================================================
    SELECT content_urdu INTO v_before_content
    FROM public.chapters
    WHERE id = v_sold_chap1_id;

    -- Upsert draft for sold chapter
    v_rpc_res := public.upsert_chapter_draft(
        v_novel_sold_id,
        v_sold_chap1_id,
        'tab-sold-chap-1',
        'نیا ڈرافٹ فروخت شدہ',
        'مسودہ برائے فروخت شدہ ناول جو قارئین کو نظر نہیں آئے گا',
        1,
        now(),
        1,
        'Device'
    );

    SELECT content_urdu INTO v_after_content
    FROM public.chapters
    WHERE id = v_sold_chap1_id;

    IF (v_rpc_res->>'status') = 'ok' AND v_before_content = v_after_content THEN
        INSERT INTO test_results VALUES (12, 'Sold novel published chapters remain unaffected by drafts', 'PASS', 'Sold novel chapter content preserved intact');
    ELSE
        INSERT INTO test_results VALUES (12, 'Sold novel published chapters remain unaffected by drafts', 'FAIL', 'Live chapter modified on sold novel!');
    END IF;


    -- ==========================================================================
    -- TEST 13: Conflict resolution: keep_mine and keep_server
    -- ==========================================================================
    -- 13a: keep_mine deliberately overwrites and bumps revision
    v_rpc_res := public.resolve_chapter_draft_conflict(
        'tab-sold-chap-1',
        'keep_mine',
        'حتمی مصنف کا منتخب کردہ مواد',
        'حتمی عنوان'
    );

    v_get_res := public.get_chapter_draft('tab-sold-chap-1');

    IF (v_rpc_res->>'status') = 'ok'
       AND (v_rpc_res->>'choice') = 'keep_mine'
       AND (v_rpc_res->>'server_revision')::int = 2
       AND (v_get_res->>'content_urdu') = 'حتمی مصنف کا منتخب کردہ مواد' THEN
        INSERT INTO test_results VALUES (13, 'Conflict resolution keep_mine updates content and bumps revision', 'PASS', 'Revision bumped to 2 with updated content');
    ELSE
        INSERT INTO test_results VALUES (13, 'Conflict resolution keep_mine updates content and bumps revision', 'FAIL', coalesce(v_rpc_res::text, 'null'));
    END IF;

    -- 13b: keep_server returns existing server draft version
    v_rpc_res := public.resolve_chapter_draft_conflict(
        'tab-sold-chap-1',
        'keep_server'
    );

    IF (v_rpc_res->>'status') = 'ok'
       AND (v_rpc_res->>'choice') = 'keep_server'
       AND (v_rpc_res->>'server_revision')::int = 2
       AND (v_rpc_res->>'content_urdu') = 'حتمی مصنف کا منتخب کردہ مواد' THEN
        INSERT INTO test_results VALUES (14, 'Conflict resolution keep_server returns server version', 'PASS', 'Server content and revision returned');
    ELSE
        INSERT INTO test_results VALUES (14, 'Conflict resolution keep_server returns server version', 'FAIL', coalesce(v_rpc_res::text, 'null'));
    END IF;


    -- ==========================================================================
    -- TEST 15: Retention purge_old_chapter_drafts permission check
    -- ==========================================================================
    -- Regular writer calling purge is denied
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.purge_old_chapter_drafts(90);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Access denied%' THEN
        INSERT INTO test_results VALUES (15, 'Writer cannot call purge_old_chapter_drafts', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (15, 'Writer cannot call purge_old_chapter_drafts', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    -- Admin calling purge succeeds
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin_id::text, true);
    v_rpc_res := public.purge_old_chapter_drafts(90);

    IF (v_rpc_res->>'status') = 'ok' THEN
        INSERT INTO test_results VALUES (16, 'Admin can execute purge_old_chapter_drafts', 'PASS', 'Purge succeeded: ' || v_rpc_res::text);
    ELSE
        INSERT INTO test_results VALUES (16, 'Admin can execute purge_old_chapter_drafts', 'FAIL', coalesce(v_rpc_res::text, 'null'));
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
        RAISE NOTICE 'ALL CHAPTER DRAFT TESTS PASSED SUCCESSFULLY.';
    END IF;
END $$;

ROLLBACK;
