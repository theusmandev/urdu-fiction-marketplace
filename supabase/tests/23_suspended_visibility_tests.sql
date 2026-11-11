-- ==============================================================================
-- UNB Premium — Test Suite 23: Suspended Writer & Novel Visibility Hardening
-- Verifies:
--   1. Published novels of approved, active writers appear in public_novels and public_genres.
--   2. Suspending a writer immediately hides their novels from public_novels.
--   3. Suspending a writer immediately zeroes/decrements their count in public_genres.
--   4. Suspending a writer blocks get_chapter_for_reader free preview access for non-entitled readers.
--   5. Suspending a writer blocks create_order for new buyers.
--   6. Entitlement Preservation: Legitimate paying readers holding an active
--      purchase_entitlement maintain full read access in get_chapter_for_reader
--      even when the author or novel is suspended.
--   7. Deactivating a user profile (is_active = false) immediately hides their novels
--      from public_novels, zeroes genre counts, and blocks free preview access.
-- ==============================================================================

DO $$
DECLARE
    v_admin_id       uuid := '11111111-2323-2323-2323-111111111111'::uuid;
    v_writer_id      uuid := '22222222-2323-2323-2323-222222222222'::uuid;
    v_buyer_id       uuid := '33333333-2323-2323-2323-333333333333'::uuid;
    v_guest_id       uuid := '44444444-2323-2323-2323-444444444444'::uuid;

    v_genre_id       uuid := gen_random_uuid();
    v_novel_id       uuid := gen_random_uuid();
    v_ch1_id         uuid := gen_random_uuid();
    v_ch2_id         uuid := gen_random_uuid();
    v_payment_id     uuid := gen_random_uuid();
    v_order_id       uuid := gen_random_uuid();
    v_entitlement_id uuid := gen_random_uuid();

    v_count          integer;
    v_err_caught     boolean;
    v_res            jsonb;
BEGIN
    RAISE NOTICE '=== Running Test Suite 23: Suspended Writer & Novel Visibility Hardening ===';

    -- -------------------------------------------------------------------------
    -- 0. FIXTURE SETUP
    -- -------------------------------------------------------------------------
    -- Create auth users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_test23@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_writer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_test23@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_buyer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'buyer_test23@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()),
        (v_guest_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guest_test23@unb.pk', '', pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now())
    ON CONFLICT (id) DO NOTHING;

    -- Profiles
    INSERT INTO public.profiles (id, role, username, display_name, is_active)
    VALUES
        (v_admin_id, 'admin', 'admin_test23', 'Platform Admin 23', true),
        (v_writer_id, 'writer', 'writer_test23', 'Urdu Author 23', true),
        (v_buyer_id, 'reader', 'buyer_test23', 'Entitled Reader 23', true),
        (v_guest_id, 'reader', 'guest_test23', 'Guest Reader 23', true)
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        is_active = true;

    -- Writer profile
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES (
        v_writer_id, 'احمد ندیم', 'Ahmed Nadeem', 'اردو فکشن نگار', 'approved', NULL, 5000, 0, false
    ) ON CONFLICT (id) DO UPDATE SET
        status = 'approved',
        is_orders_paused_for_commission = false;

    -- Writer payment method
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, is_active
    ) VALUES (
        v_payment_id, v_writer_id, 'easypaisa', 'Ahmed Nadeem', '03121234567', true
    ) ON CONFLICT (id) DO NOTHING;

    -- Genre
    INSERT INTO public.genres (
        id, slug, name_english, name_urdu, display_order, is_active
    ) VALUES (
        v_genre_id, 'test-genre-23', 'Test Genre 23', 'ٹیسٹ صنف ۲۳', 99, true
    ) ON CONFLICT (id) DO NOTHING;

    -- Novel (published)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu,
        cover_url, price_pkr, language, status, total_chapters, is_featured,
        rights_declaration_accepted, published_at
    ) VALUES (
        v_novel_id, v_writer_id, 'test-novel-23', 'ٹیسٹ ناول ۲۳', 'Test Novel 23', 'خلاصہ ناول',
        'https://example.com/cover23.jpg', 400, 'Urdu', 'published', 2, true,
        true, pg_catalog.now()
    ) ON CONFLICT (id) DO UPDATE SET status = 'published';

    INSERT INTO public.novel_genres (novel_id, genre_id)
    VALUES (v_novel_id, v_genre_id)
    ON CONFLICT DO NOTHING;

    -- Chapters: Ch1 (Free preview), Ch2 (Paid)
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, word_count, is_published
    ) VALUES
        (v_ch1_id, v_novel_id, 1, 'پہلا باب', 'یہ مفت پیش منظر کا مواد ہے۔', true, 100, true),
        (v_ch2_id, v_novel_id, 2, 'دوسرا باب', 'یہ خریداروں کے لیے نجی مواد ہے۔', false, 200, true)
    ON CONFLICT (id) DO NOTHING;

    -- Reader 1 holds active purchase entitlement
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot, amount_pkr, currency, status,
        applied_commission_rate, calculated_commission_pkr, calculated_writer_share_pkr
    ) VALUES (
        v_order_id, 'ORD-TEST-23', v_buyer_id, v_writer_id, v_novel_id, 'Test Novel 23', 400, 'PKR', 'verified',
        30.00, 120.00, 280.00
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.purchase_entitlements (
        id, reader_id, novel_id, order_id, is_revoked, granted_at
    ) VALUES (
        v_entitlement_id, v_buyer_id, v_novel_id, v_order_id, false, pg_catalog.now()
    ) ON CONFLICT (id) DO UPDATE SET is_revoked = false;

    -- -------------------------------------------------------------------------
    -- TEST 1: Baseline when writer is APPROVED and ACTIVE
    -- -------------------------------------------------------------------------
    SELECT count(*) INTO v_count FROM public.public_novels WHERE id = v_novel_id;
    ASSERT v_count = 1, 'Test 1a Failed: Published novel must appear in public_novels when author is approved';

    SELECT published_novels_count INTO v_count FROM public.public_genres WHERE id = v_genre_id;
    ASSERT v_count = 1, 'Test 1b Failed: Genre must count 1 novel when author is approved';

    -- Impersonate guest reader: can read free preview
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_guest_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    v_res := public.get_chapter_for_reader('test-novel-23', 1);
    ASSERT (v_res->>'access_reason') = 'free_preview', 'Test 1c Failed: Guest must access free preview when writer is approved';

    -- -------------------------------------------------------------------------
    -- TEST 2: Suspend Writer via suspend_writer RPC
    -- -------------------------------------------------------------------------
    -- Impersonate admin to suspend writer
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    PERFORM public.suspend_writer(v_writer_id, 'Test suspension for policy violation');

    -- Verify author is suspended
    SELECT count(*) INTO v_count FROM public.writer_profiles WHERE id = v_writer_id AND status = 'suspended';
    ASSERT v_count = 1, 'Test 2a Failed: Writer status must be suspended';

    -- Verify novel is immediately hidden from public_novels
    SELECT count(*) INTO v_count FROM public.public_novels WHERE id = v_novel_id;
    ASSERT v_count = 0, 'Test 2b Failed: Novel must immediately disappear from public_novels when author is suspended';

    -- Verify public_genres novel count is immediately 0
    SELECT published_novels_count INTO v_count FROM public.public_genres WHERE id = v_genre_id;
    ASSERT v_count = 0, 'Test 2c Failed: Genre published_novels_count must be 0 for suspended author';

    -- Impersonate guest reader: Free preview must be BLOCKED
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_guest_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    v_err_caught := false;
    BEGIN
        v_res := public.get_chapter_for_reader('test-novel-23', 1);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Test 2d Failed: get_chapter_for_reader free preview must fail when writer is suspended';

    -- Guest reader attempting to create order must be BLOCKED
    v_err_caught := false;
    BEGIN
        PERFORM public.create_order(v_novel_id, v_payment_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Test 2e Failed: create_order must fail when writer is suspended';

    -- -------------------------------------------------------------------------
    -- TEST 3: ENTITLEMENT PRESERVATION (Existing paying buyer keeps read access)
    -- -------------------------------------------------------------------------
    -- Impersonate buyer who already purchased before suspension
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_buyer_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    -- Buyer can read paid Chapter 2 with access_reason = 'entitled'
    v_res := public.get_chapter_for_reader('test-novel-23', 2);
    ASSERT (v_res->>'access_reason') = 'entitled', 'Test 3a Failed: Paying buyer must preserve access to paid chapter';
    ASSERT (v_res->>'content_urdu') IS NOT NULL, 'Test 3b Failed: Entitled buyer must receive chapter content';

    -- -------------------------------------------------------------------------
    -- TEST 4: Profile Deactivation (is_active = false)
    -- -------------------------------------------------------------------------
    -- Impersonate admin to re-approve writer, then deactivate profile
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    PERFORM public.approve_writer(v_writer_id);
    PERFORM public.admin_update_user_role_status(v_writer_id, 'writer', false, 'Test deactivation');

    -- Novel must disappear from public_novels because profile is_active = false
    SELECT count(*) INTO v_count FROM public.public_novels WHERE id = v_novel_id;
    ASSERT v_count = 0, 'Test 4a Failed: Novel must not appear in public_novels when profile is inactive';

    -- Genre published count must be 0
    SELECT published_novels_count INTO v_count FROM public.public_genres WHERE id = v_genre_id;
    ASSERT v_count = 0, 'Test 4b Failed: Genre novel count must be 0 when profile is inactive';

    -- Guest reader cannot access free preview
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_guest_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    v_err_caught := false;
    BEGIN
        v_res := public.get_chapter_for_reader('test-novel-23', 1);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;
    ASSERT v_err_caught = true, 'Test 4c Failed: Free preview must be denied when author is inactive';

    -- Entitled buyer STILL has read access
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_buyer_id::text, true);
    PERFORM pg_catalog.set_config('role', 'authenticated', true);

    v_res := public.get_chapter_for_reader('test-novel-23', 2);
    ASSERT (v_res->>'access_reason') = 'entitled', 'Test 4d Failed: Paying buyer must keep access even if author profile is deactivated';

    -- -------------------------------------------------------------------------
    -- CLEANUP
    -- -------------------------------------------------------------------------
    PERFORM pg_catalog.set_config('role', 'postgres', true);
    DELETE FROM public.purchase_entitlements WHERE id = v_entitlement_id;
    DELETE FROM public.orders WHERE id = v_order_id;
    DELETE FROM public.chapters WHERE novel_id = v_novel_id;
    DELETE FROM public.novel_genres WHERE novel_id = v_novel_id;
    DELETE FROM public.novels WHERE id = v_novel_id;
    DELETE FROM public.genres WHERE id = v_genre_id;
    DELETE FROM public.writer_payment_methods WHERE id = v_payment_id;
    DELETE FROM public.writer_profiles WHERE id = v_writer_id;
    DELETE FROM public.profiles WHERE id IN (v_admin_id, v_writer_id, v_buyer_id, v_guest_id);
    DELETE FROM auth.users WHERE id IN (v_admin_id, v_writer_id, v_buyer_id, v_guest_id);

    RAISE NOTICE '=== Test Suite 23 PASSED: All 4 test sections verified successfully ===';
END $$;
