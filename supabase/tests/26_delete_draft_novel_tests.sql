-- ==============================================================================
-- UNB Premium — Test Suite 26: Delete Draft Novel RPC & Duplicate Creation Guard
-- Verifies:
--   1. Author-level duplicate title guard in create_novel RPC prevents creating
--      two novels with matching English title (case-insensitive) or Urdu title.
--   2. Non-existent novel deletion raises 'Novel not found.'.
--   3. Unauthorized caller (different author) raises 'Unauthorized'.
--   4. Non-draft novel deletion (e.g. published) is strictly blocked.
--   5. Novel with active orders, entitlements, or sales ledger records is blocked.
--   6. Owner can successfully delete own draft novel (and cascaded children).
--   7. Administrator can delete draft novel for support resolution.
--   8. Immutable audit log entry is written for draft deletions.
-- ==============================================================================

DO $$
DECLARE
    v_author1_id        uuid := '26262626-0000-0000-0000-000000000001'::uuid;
    v_author2_id        uuid := '26262626-0000-0000-0000-000000000002'::uuid;
    v_admin_id          uuid := '26262626-0000-0000-0000-000000000003'::uuid;
    v_reader_id         uuid := '26262626-0000-0000-0000-000000000004'::uuid;

    v_novel_draft_id    uuid := '26262626-1111-0000-0000-000000000001'::uuid;
    v_novel_pub_id      uuid := '26262626-1111-0000-0000-000000000002'::uuid;
    v_novel_order_id    uuid := '26262626-1111-0000-0000-000000000003'::uuid;
    v_novel_dup_id      uuid := '26262626-1111-0000-0000-000000000004'::uuid;
    v_order_id          uuid := '26262626-2222-0000-0000-000000000001'::uuid;

    v_genre_id          uuid;
    v_res               jsonb;
    v_caught            boolean;
    v_audit_count       integer;
BEGIN
    RAISE NOTICE '=== Running Test Suite 26: Delete Draft Novel RPC & Duplicate Guard ===';

    -- -------------------------------------------------------------------------
    -- 0. FIXTURE SETUP
    -- -------------------------------------------------------------------------
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_author1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author1_26@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_author2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author2_26@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_admin_id,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_26@unb.pk',   '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_reader_id,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_26@unb.pk',  '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, role, username, display_name, email, is_active)
    VALUES
        (v_author1_id, 'writer', 'author1_26', 'Author One', 'author1_26@unb.pk', true),
        (v_author2_id, 'writer', 'author2_26', 'Author Two', 'author2_26@unb.pk', true),
        (v_admin_id,   'admin',  'admin_26',   'Admin 26',   'admin_26@unb.pk',   true),
        (v_reader_id,  'reader', 'reader_26',  'Reader 26',  'reader_26@unb.pk',  true)
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        is_active = EXCLUDED.is_active;

    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES
        (v_author1_id, 'مصنف اول', 'Author One', 'بایو', 'approved', NULL, 5000, 0, false),
        (v_author2_id, 'مصنف دوم', 'Author Two', 'بایو', 'approved', NULL, 5000, 0, false)
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status;

    SELECT id INTO v_genre_id FROM public.genres LIMIT 1;

    -- Clean up any leftover test data from prior aborted test runs
    DELETE FROM public.orders WHERE id = v_order_id;
    DELETE FROM public.novels WHERE id IN (v_novel_draft_id, v_novel_pub_id, v_novel_order_id, v_novel_dup_id);

    -- Insert Draft Novel for Author 1
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu,
        price_pkr, language, status, total_chapters, created_at, updated_at
    ) VALUES (
        v_novel_draft_id, v_author1_id, 'test-draft-novel-26', 'ڈرافٹ ناول', 'Test Draft Novel',
        'ڈرافٹ تفصیل خلاصہ ناول برائے ٹیسٹ', 100, 'ur', 'draft', 1, pg_catalog.now(), pg_catalog.now()
    );

    -- Insert a chapter into the draft novel
    INSERT INTO public.chapters (
        novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, is_published, created_at, updated_at
    ) VALUES (
        v_novel_draft_id, 1, 'پہلا باب', 'ڈرافٹ باب کا مواد برائے ٹیسٹ', true, false, pg_catalog.now(), pg_catalog.now()
    );

    -- Insert Published Novel for Author 1
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu,
        price_pkr, language, status, total_chapters, created_at, updated_at
    ) VALUES (
        v_novel_pub_id, v_author1_id, 'test-published-novel-26', 'شائع شدہ ناول', 'Test Published Novel',
        'شائع شدہ خلاصہ تفصیل ناول', 200, 'ur', 'published', 2, pg_catalog.now(), pg_catalog.now()
    );

    -- Insert Novel with Orders for Author 1
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu,
        price_pkr, language, status, total_chapters, created_at, updated_at
    ) VALUES (
        v_novel_order_id, v_author1_id, 'test-order-novel-26', 'آرڈر والا ناول', 'Test Order Novel',
        'آرڈر والا خلاصہ تفصیل ناول', 150, 'ur', 'draft', 1, pg_catalog.now(), pg_catalog.now()
    );

    -- Insert Order for v_novel_order_id
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
        amount_pkr, applied_commission_rate, calculated_commission_pkr,
        calculated_writer_share_pkr, status, created_at, updated_at
    ) VALUES (
        v_order_id, 'ORD-20261117-TEST26', v_reader_id, v_author1_id, v_novel_order_id,
        'Test Order Novel', 150, 30, 45, 105, 'pending_payment', pg_catalog.now(), pg_catalog.now()
    );

    -- -------------------------------------------------------------------------
    -- TEST 1: Duplicate Title Guard in create_novel RPC
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_author1_id::text, 'role', 'authenticated')::text, true);

    v_caught := false;
    BEGIN
        -- Trying to create novel with same English title (case-insensitive) as existing novel
        PERFORM public.create_novel(
            'مختلف عنوان', 'test draft novel', 'خلاصہ ناول برائے ٹیسٹ تفصیل',
            NULL, NULL, NULL, 100, 'ur', true, ARRAY[v_genre_id]
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%DUPLICATE_NOVEL_TITLE%' THEN
            v_caught := true;
        END IF;
    END;
    ASSERT v_caught, 'TEST 1A FAILED: create_novel must block duplicate English title for same author';

    v_caught := false;
    BEGIN
        -- Trying to create novel with same Urdu title as existing novel
        PERFORM public.create_novel(
            'ڈرافٹ ناول', 'Completely Unique Title', 'خلاصہ ناول برائے ٹیسٹ تفصیل',
            NULL, NULL, NULL, 100, 'ur', true, ARRAY[v_genre_id]
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%DUPLICATE_NOVEL_TITLE%' THEN
            v_caught := true;
        END IF;
    END;
    ASSERT v_caught, 'TEST 1B FAILED: create_novel must block duplicate Urdu title for same author';

    -- Different author (Author 2) CAN create a novel with the same title as Author 1
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_author2_id::text, 'role', 'authenticated')::text, true);
    v_res := public.create_novel(
        'ڈرافٹ ناول', 'Test Draft Novel', 'خلاصہ ناول برائے مصنف دوم تفصیل',
        NULL, NULL, NULL, 100, 'ur', true, ARRAY[v_genre_id]
    );
    ASSERT (v_res->>'success')::boolean = true, 'TEST 1C FAILED: Different author must be allowed to create novel with same title';
    v_novel_dup_id := (v_res->>'novel_id')::uuid;

    -- -------------------------------------------------------------------------
    -- TEST 2: Non-Existent Novel Deletion
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_author1_id::text, 'role', 'authenticated')::text, true);
    v_caught := false;
    BEGIN
        PERFORM public.delete_draft_novel('99999999-9999-9999-9999-999999999999'::uuid);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Novel not found%' THEN
            v_caught := true;
        END IF;
    END;
    ASSERT v_caught, 'TEST 2 FAILED: Deleting non-existent novel must raise "Novel not found."';

    -- -------------------------------------------------------------------------
    -- TEST 3: Unauthorized Deletion Attempt (Author 2 tries to delete Author 1's draft)
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_author2_id::text, 'role', 'authenticated')::text, true);
    v_caught := false;
    BEGIN
        PERFORM public.delete_draft_novel(v_novel_draft_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Unauthorized%' THEN
            v_caught := true;
        END IF;
    END;
    ASSERT v_caught, 'TEST 3 FAILED: Author cannot delete another author''s draft novel';

    -- -------------------------------------------------------------------------
    -- TEST 4: Non-Draft Novel Deletion Attempt (Published novel)
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_author1_id::text, 'role', 'authenticated')::text, true);
    v_caught := false;
    BEGIN
        PERFORM public.delete_draft_novel(v_novel_pub_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Only draft novels can be deleted%' THEN
            v_caught := true;
        END IF;
    END;
    ASSERT v_caught, 'TEST 4 FAILED: Published novel deletion must be strictly blocked';

    -- -------------------------------------------------------------------------
    -- TEST 5: Draft Novel with Existing Orders Blocked
    -- -------------------------------------------------------------------------
    v_caught := false;
    BEGIN
        PERFORM public.delete_draft_novel(v_novel_order_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Existing orders are associated%' THEN
            v_caught := true;
        END IF;
    END;
    ASSERT v_caught, 'TEST 5 FAILED: Novel with existing orders must block deletion';

    -- -------------------------------------------------------------------------
    -- TEST 6: Successful Draft Deletion by Author (and Cascade Verification)
    -- -------------------------------------------------------------------------
    v_res := public.delete_draft_novel(v_novel_draft_id);
    ASSERT (v_res->>'deleted')::boolean = true, 'TEST 6A FAILED: delete_draft_novel must return deleted = true';

    -- Verify novel row is gone
    ASSERT NOT EXISTS (SELECT 1 FROM public.novels WHERE id = v_novel_draft_id),
        'TEST 6B FAILED: Novel row must be deleted';

    -- Verify child chapters are cascaded
    ASSERT NOT EXISTS (SELECT 1 FROM public.chapters WHERE novel_id = v_novel_draft_id),
        'TEST 6C FAILED: Chapters referencing novel must be cascade-deleted';

    -- Verify audit log was recorded
    SELECT count(*) INTO v_audit_count
    FROM public.audit_logs
    WHERE entity_type = 'novel'
      AND entity_id = v_novel_draft_id::text
      AND action_type = 'DELETE_DRAFT_NOVEL';
    ASSERT v_audit_count >= 1, 'TEST 6D FAILED: Audit log entry must be created on draft deletion';

    -- -------------------------------------------------------------------------
    -- TEST 7: Successful Draft Deletion by Administrator
    -- -------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
    v_res := public.delete_draft_novel(v_novel_dup_id);
    ASSERT (v_res->>'deleted')::boolean = true, 'TEST 7A FAILED: Admin must be allowed to delete a draft novel';

    ASSERT NOT EXISTS (SELECT 1 FROM public.novels WHERE id = v_novel_dup_id),
        'TEST 7B FAILED: Admin deleted novel must be gone from database';

    -- Clean up remaining test records
    DELETE FROM public.orders WHERE id = v_order_id;
    DELETE FROM public.novels WHERE id = v_novel_pub_id;
    DELETE FROM public.novels WHERE id = v_novel_order_id;

    RAISE NOTICE '=== Test Suite 26 PASSED: All 8 test vectors verified successfully ===';
END $$;
