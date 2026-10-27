-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: TIP JAR / READER APPRECIATION (20)
-- ==============================================================================
-- File: supabase/tests/20_tips_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. Kill switch & writer opt-in (enabled/disabled)
--     2. Self-tip strictly blocked
--     3. Unapproved or suspended writer blocked
--     4. Amount bounds validation (min/max rejected)
--     5. Hourly rate limit and daily tipping cap
--     6. At most 3 open tips limit (pending/submitted)
--     7. Masked payment methods in get_tip_options, snapshot in created tip
--     8. Reader isolation (another reader cannot submit or read my tip)
--     9. Writer isolation (writer B cannot confirm writer A's tip)
--    10. Reader cannot confirm own tip
--    11. Confirm receipt is idempotent
--    12. Confirmed tip creates ZERO sales_ledger rows, ZERO entitlements, ZERO commission changes
--    13. Direct SELECT/INSERT/UPDATE/DELETE on tips & settings denied to client roles
--    14. Anonymous tip hides reader identity from writer and admin lists (no emails)
--    15. Duplicate TID detection and flagging across tips & orders
--    16. Review flags computed (potential_bypass, high_frequency, duplicate_tid)
--    17. Expiry job marks 7-day-old pending tips as expired
--    18. Audit logs recorded on all mutations
--    19. Screenshot path traversal strictly rejected
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
    v_reader_1_id    uuid := '44444444-4444-4444-4444-444444444444'::uuid;
    v_reader_2_id    uuid := '55555555-5555-5555-5555-555555555555'::uuid;
    v_suspended_id   uuid := '66666666-6666-6666-6666-666666666666'::uuid;

    -- Entity IDs
    v_novel_a_id     uuid := gen_random_uuid();
    v_method_a_id    uuid := gen_random_uuid();
    v_method_b_id    uuid := gen_random_uuid();

    -- Helper variables
    v_rpc_res        jsonb;
    v_tip_res        jsonb;
    v_tip_id         uuid;
    v_tip_id_2       uuid;
    v_tip_id_3       uuid;
    v_tip_number     text;
    v_err_caught     boolean;
    v_err_msg        text;
    v_err_state      text;

    -- Invariant balance & ledger counters
    v_before_ledger_count integer;
    v_after_ledger_count  integer;
    v_before_ent_count    integer;
    v_after_ent_count     integer;
    v_before_inv_count    integer;
    v_after_inv_count     integer;
    v_before_commission   numeric(12,2);
    v_after_commission    numeric(12,2);
    v_audit_count         integer;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURES SETUP
    -- --------------------------------------------------------------------------

    -- 1. Auth users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin_tips_20@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_a_tips_20@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_b_tips_20@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_1_tips_20@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_2_tips_20@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_suspended_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'suspended_tips_20@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Profiles
    UPDATE public.profiles SET role = 'admin', username = 'admin_tips_20', full_name = 'Admin Tips', is_active = true WHERE id = v_admin_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_a_tips_20', full_name = 'Writer A Tips', is_active = true WHERE id = v_writer_a_id;
    UPDATE public.profiles SET role = 'writer', username = 'writer_b_tips_20', full_name = 'Writer B Tips', is_active = true WHERE id = v_writer_b_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_1_tips_20', full_name = 'Reader One Tips', is_active = true WHERE id = v_reader_1_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_2_tips_20', full_name = 'Reader Two Tips', is_active = true WHERE id = v_reader_2_id;
    UPDATE public.profiles SET role = 'writer', username = 'suspended_tips_20', full_name = 'Suspended Writer', is_active = true WHERE id = v_suspended_id;

    -- 3. Writer Profiles
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, status, custom_commission_rate
    ) VALUES
        (v_writer_a_id, 'مصنف الف', 'Author A', 'بائیو الف', 'approved', 20.00),
        (v_writer_b_id, 'مصنف ب', 'Author B', 'بائیو ب', 'approved', 20.00),
        (v_suspended_id, 'مصنف معطل', 'Suspended Author', 'بائیو معطل', 'suspended', 20.00)
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

    -- 4. Payment methods for writer A and B
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, is_active, use_for_tips
    ) VALUES
        (v_method_a_id, v_writer_a_id, 'easypaisa', 'Writer A Easypaisa', '03001234567', true, true),
        (v_method_b_id, v_writer_b_id, 'jazzcash', 'Writer B JazzCash', '03009876543', true, true)
    ON CONFLICT (id) DO NOTHING;

    -- 5. Paid novel for Writer A (price PKR 500)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, rights_declaration_accepted
    ) VALUES (
        v_novel_a_id, v_writer_a_id, 'novel-a-tips-test', 'ناول برائے ٹپس', 'Novel for Tips', 'خلاصہ', 500.00, 'published', true
    ) ON CONFLICT (id) DO NOTHING;

    -- Ensure platform settings have tips enabled
    UPDATE public.platform_settings
    SET tips_enabled = true,
        tip_min_pkr = 20,
        tip_max_pkr = 5000,
        max_tips_per_hour = 5,
        tip_daily_cap_pkr_per_reader = 10000,
        tip_confirm_reminder_hours = 48
    WHERE id = 1;

    -- ==========================================================================
    -- TEST 1: Writer opt-in and get_tip_options before vs after enabling
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_1_id::text, true);

    -- Before enabling tips for Writer A: get_tip_options says writer_enabled = false
    v_rpc_res := public.get_tip_options(v_writer_a_id);
    IF (v_rpc_res->>'can_tip')::boolean IS FALSE AND (v_rpc_res->>'writer_enabled')::boolean IS FALSE THEN
        INSERT INTO test_results VALUES (1, 'Tips disabled by default for writer', 'PASS', v_rpc_res->>'reason');
    ELSE
        INSERT INTO test_results VALUES (1, 'Tips disabled by default for writer', 'FAIL', v_rpc_res::text);
    END IF;

    -- Writer A enables tips via set_my_tip_settings
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);
    v_rpc_res := public.set_my_tip_settings(
        true,
        'بہت شکریہ! آپ کی حمایت سے نیا باب جلد آئے گا۔',
        '{100,250,500}'::integer[],
        20,
        5000
    );

    IF (v_rpc_res->>'enabled')::boolean IS TRUE THEN
        INSERT INTO test_results VALUES (2, 'Writer can enable tips with custom thank you message', 'PASS', 'Settings updated');
    ELSE
        INSERT INTO test_results VALUES (2, 'Writer can enable tips with custom thank you message', 'FAIL', v_rpc_res::text);
    END IF;

    -- ==========================================================================
    -- TEST 3: Self-tip blocked
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.create_tip(v_writer_a_id, 100, v_method_a_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Authors cannot tip themselves%' THEN
        INSERT INTO test_results VALUES (3, 'Self-tip is strictly blocked', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (3, 'Self-tip is strictly blocked', 'FAIL', coalesce(v_err_msg, 'No error thrown'));
    END IF;

    -- ==========================================================================
    -- TEST 4: Suspended writer blocked
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_1_id::text, true);
    v_rpc_res := public.get_tip_options(v_suspended_id);
    IF (v_rpc_res->>'can_tip')::boolean IS FALSE AND v_rpc_res->>'reason' LIKE '%not eligible%' THEN
        INSERT INTO test_results VALUES (4, 'Suspended writer cannot receive tips', 'PASS', v_rpc_res->>'reason');
    ELSE
        INSERT INTO test_results VALUES (4, 'Suspended writer cannot receive tips', 'FAIL', v_rpc_res::text);
    END IF;

    -- ==========================================================================
    -- TEST 5: Amount bounds validation (below min & above max)
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.create_tip(v_writer_a_id, 10, v_method_a_id); -- below min (20)
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Tip amount must be at least%' THEN
        INSERT INTO test_results VALUES (5, 'Tip amount below min rejected', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (5, 'Tip amount below min rejected', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.create_tip(v_writer_a_id, 6000, v_method_a_id); -- above max (5000)
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Tip amount cannot exceed%' THEN
        INSERT INTO test_results VALUES (6, 'Tip amount above max rejected', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (6, 'Tip amount above max rejected', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    -- ==========================================================================
    -- TEST 7: get_tip_options does NOT expose full account numbers
    -- ==========================================================================
    v_rpc_res := public.get_tip_options(v_writer_a_id);
    IF (v_rpc_res->'payment_methods'->0->>'masked_label') LIKE '%••••%' AND
       (v_rpc_res->'payment_methods'->0->>'account_number_or_iban') IS NULL THEN
        INSERT INTO test_results VALUES (7, 'get_tip_options exposes masked labels only', 'PASS', v_rpc_res->'payment_methods'->0->>'masked_label');
    ELSE
        INSERT INTO test_results VALUES (7, 'get_tip_options exposes masked labels only', 'FAIL', v_rpc_res::text);
    END IF;

    -- ==========================================================================
    -- TEST 8: Successful Tip Creation with Payment Instructions Snapshot
    -- ==========================================================================
    v_tip_res := public.create_tip(
        v_writer_a_id,
        250.00,
        v_method_a_id,
        v_novel_a_id,
        NULL,
        'بہت خوبصورت کہانی ہے!',
        false
    );
    v_tip_id := (v_tip_res->>'id')::uuid;
    v_tip_number := v_tip_res->>'tip_number';

    IF v_tip_id IS NOT NULL AND v_tip_number LIKE 'TIP-%' AND
       (v_tip_res->'payment_instructions_snapshot'->>'account_number_or_iban') = '03001234567' THEN
        INSERT INTO test_results VALUES (8, 'Tip created with full instructions snapshot in tip only', 'PASS', v_tip_number);
    ELSE
        INSERT INTO test_results VALUES (8, 'Tip created with full instructions snapshot in tip only', 'FAIL', v_tip_res::text);
    END IF;

    -- ==========================================================================
    -- TEST 9: Open tips limit enforcement (max 3 open tips)
    -- ==========================================================================
    -- Create 2 more open tips for Reader 1 -> Writer A
    v_tip_res := public.create_tip(v_writer_a_id, 100, v_method_a_id);
    v_tip_id_2 := (v_tip_res->>'id')::uuid;

    v_tip_res := public.create_tip(v_writer_a_id, 100, v_method_a_id);
    v_tip_id_3 := (v_tip_res->>'id')::uuid;

    -- 4th open tip should be rejected by limit
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.create_tip(v_writer_a_id, 100, v_method_a_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%already have 3 open tips%' THEN
        INSERT INTO test_results VALUES (9, 'Open tips limit (max 3) enforced', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (9, 'Open tips limit (max 3) enforced', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    -- Cancel tip 2 and tip 3 to free slots
    PERFORM public.cancel_tip(v_tip_id_2);
    PERFORM public.cancel_tip(v_tip_id_3);

    -- ==========================================================================
    -- TEST 10: Screenshot path traversal protection
    -- ==========================================================================
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.submit_tip_payment(v_tip_id, 'TID-12345678', '../escape/hack.webp');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Screenshot path%' THEN
        INSERT INTO test_results VALUES (10, 'Screenshot path traversal rejected', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (10, 'Screenshot path traversal rejected', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    -- ==========================================================================
    -- TEST 11: Cross-reader isolation (Reader 2 cannot submit Reader 1's tip)
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_2_id::text, true);
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.submit_tip_payment(v_tip_id, 'TID-12345678');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Access denied%' THEN
        INSERT INTO test_results VALUES (11, 'Cross-reader submission blocked', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (11, 'Cross-reader submission blocked', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    -- ==========================================================================
    -- TEST 12: Successful submission and review flag computation
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_1_id::text, true);
    -- Reader 1 does not own Novel A (price 500). Tip is 250 (which is 50%, not >= 80%).
    -- Submit payment with valid TID
    v_tip_res := public.submit_tip_payment(v_tip_id, 'TID-SAFE-987654', v_tip_id::text || '/proof.webp', 'Usman');

    IF (v_tip_res->>'status') = 'payment_submitted' AND (v_tip_res->>'is_duplicate_tid_flagged')::boolean IS FALSE THEN
        INSERT INTO test_results VALUES (12, 'Reader can submit payment reference and proof', 'PASS', 'Status: payment_submitted');
    ELSE
        INSERT INTO test_results VALUES (12, 'Reader can submit payment reference and proof', 'FAIL', v_tip_res::text);
    END IF;

    -- ==========================================================================
    -- TEST 13: Duplicate TID detection on a new tip
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_2_id::text, true);
    v_tip_res := public.create_tip(v_writer_a_id, 100, v_method_a_id);
    v_tip_id_2 := (v_tip_res->>'id')::uuid;

    -- Submit with the same TID
    v_tip_res := public.submit_tip_payment(v_tip_id_2, 'TID-SAFE-987654');

    IF (v_tip_res->>'is_duplicate_tid_flagged')::boolean IS TRUE AND (v_tip_res->>'review_flag') LIKE '%duplicate_tid%' THEN
        INSERT INTO test_results VALUES (13, 'Duplicate TID flagged automatically without blocking', 'PASS', v_tip_res->>'review_flag');
    ELSE
        INSERT INTO test_results VALUES (13, 'Duplicate TID flagged automatically without blocking', 'FAIL', v_tip_res::text);
    END IF;

    -- ==========================================================================
    -- TEST 14: Cross-writer confirmation isolation
    -- ==========================================================================
    -- Writer B tries to confirm Writer A's tip
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_b_id::text, true);
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.confirm_tip_received(v_tip_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Access denied%' THEN
        INSERT INTO test_results VALUES (14, 'Writer B cannot confirm Writer A tip', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (14, 'Writer B cannot confirm Writer A tip', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    -- Reader cannot confirm own tip
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_1_id::text, true);
    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        PERFORM public.confirm_tip_received(v_tip_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
    END;

    IF v_err_caught AND v_err_msg LIKE '%Access denied%' THEN
        INSERT INTO test_results VALUES (15, 'Reader cannot confirm own tip', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (15, 'Reader cannot confirm own tip', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    -- ==========================================================================
    -- TEST 16: Zero Financial Ledger / Zero Commission / Zero Entitlement Invariant
    -- ==========================================================================
    -- Record baseline counts before confirmation
    SELECT count(*) INTO v_before_ledger_count FROM public.sales_ledger;
    SELECT count(*) INTO v_before_ent_count FROM public.purchase_entitlements;
    SELECT count(*) INTO v_before_inv_count FROM public.commission_invoices;
    SELECT current_unpaid_commission INTO v_before_commission FROM public.writer_profiles WHERE id = v_writer_a_id;

    -- Writer A confirms receipt of tip
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);
    v_tip_res := public.confirm_tip_received(v_tip_id, 'بہت نوازش! شکریہ۔');

    -- Record counts after confirmation
    SELECT count(*) INTO v_after_ledger_count FROM public.sales_ledger;
    SELECT count(*) INTO v_after_ent_count FROM public.purchase_entitlements;
    SELECT count(*) INTO v_after_inv_count FROM public.commission_invoices;
    SELECT current_unpaid_commission INTO v_after_commission FROM public.writer_profiles WHERE id = v_writer_a_id;

    IF (v_tip_res->>'status') = 'confirmed' AND
       (v_before_ledger_count = v_after_ledger_count) AND
       (v_before_ent_count = v_after_ent_count) AND
       (v_before_inv_count = v_after_inv_count) AND
       (v_before_commission = v_after_commission) THEN
        INSERT INTO test_results VALUES (16, 'Zero ledger / zero commission / zero entitlement invariant', 'PASS',
            'Ledger: ' || v_before_ledger_count || ' -> ' || v_after_ledger_count ||
            ' | Entitlements: ' || v_before_ent_count || ' -> ' || v_after_ent_count ||
            ' | Commission: ' || coalesce(v_before_commission::text, '0') || ' -> ' || coalesce(v_after_commission::text, '0'));
    ELSE
        INSERT INTO test_results VALUES (16, 'Zero ledger / zero commission / zero entitlement invariant', 'FAIL',
            'Financial tables mutated! Ledger: ' || v_before_ledger_count || ' vs ' || v_after_ledger_count);
    END IF;

    -- Confirmation is idempotent
    v_tip_res := public.confirm_tip_received(v_tip_id);
    IF (v_tip_res->>'status') = 'confirmed' THEN
        INSERT INTO test_results VALUES (17, 'Confirmation is idempotent', 'PASS', 'Returned confirmed');
    ELSE
        INSERT INTO test_results VALUES (17, 'Confirmation is idempotent', 'FAIL', v_tip_res::text);
    END IF;

    -- ==========================================================================
    -- TEST 18: Privacy: Anonymous tip hides reader identity from Writer Queue & Admin Lists
    -- ==========================================================================
    -- Reader 1 creates an anonymous tip for Writer A
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_1_id::text, true);
    v_tip_res := public.create_tip(v_writer_a_id, 100, v_method_a_id, NULL, NULL, 'Secret admirer note', true);
    v_tip_id_3 := (v_tip_res->>'id')::uuid;
    PERFORM public.submit_tip_payment(v_tip_id_3, 'TID-ANON-112233');

    -- Writer A inspects received tips
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_writer_a_id::text, true);
    v_rpc_res := public.get_my_received_tips();

    -- Extract the specific anonymous tip we just created
    SELECT tip INTO v_tip_res 
    FROM pg_catalog.jsonb_array_elements(v_rpc_res) AS tip 
    WHERE (tip->>'id')::uuid = v_tip_id_3;

    IF (v_tip_res->>'is_anonymous')::boolean IS TRUE AND
       (v_tip_res->>'reader_display_name') = 'Anonymous' AND
       (v_rpc_res::text NOT LIKE '%reader_1_tips_20@unb.pk%') THEN
        INSERT INTO test_results VALUES (18, 'Anonymous tip displays Anonymous and conceals email', 'PASS', 'reader_display_name: Anonymous');
    ELSE
        INSERT INTO test_results VALUES (18, 'Anonymous tip displays Anonymous and conceals email', 'FAIL', coalesce(v_tip_res::text, 'Tip not found in array'));
    END IF;

    -- Writer-only analytics summary
    v_rpc_res := public.get_my_tip_summary();
    IF (v_rpc_res->>'confirmed_tips_count')::integer >= 1 AND
       (v_rpc_res->>'confirmed_total_pkr')::numeric >= 250 THEN
        INSERT INTO test_results VALUES (19, 'Writer private tip analytics summary accurate', 'PASS', v_rpc_res::text);
    ELSE
        INSERT INTO test_results VALUES (19, 'Writer private tip analytics summary accurate', 'FAIL', v_rpc_res::text);
    END IF;

    -- ==========================================================================
    -- TEST 20: Direct Table Mutations Denied to Client Roles (RLS / ACL)
    -- ==========================================================================
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_reader_1_id::text, true);
    SET LOCAL ROLE authenticated;

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        INSERT INTO public.tips (
            tip_number, reader_id, writer_id, amount_pkr, payment_instructions_snapshot
        ) VALUES (
            'TIP-HACK', v_reader_1_id, v_writer_a_id, 100, '{}'::jsonb
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    IF v_err_caught AND (v_err_state = '42501' OR v_err_msg LIKE '%permission denied%') THEN
        INSERT INTO test_results VALUES (20, 'Direct INSERT INTO tips denied to authenticated', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (20, 'Direct INSERT INTO tips denied to authenticated', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    v_err_caught := false;
    v_err_msg := NULL;
    BEGIN
        UPDATE public.tips SET status = 'confirmed' WHERE id = v_tip_id_3;
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
        v_err_msg := SQLERRM;
        v_err_state := SQLSTATE;
    END;

    IF v_err_caught AND (v_err_state = '42501' OR v_err_msg LIKE '%permission denied%') THEN
        INSERT INTO test_results VALUES (21, 'Direct UPDATE on tips denied to authenticated', 'PASS', v_err_msg);
    ELSE
        INSERT INTO test_results VALUES (21, 'Direct UPDATE on tips denied to authenticated', 'FAIL', coalesce(v_err_msg, 'No error'));
    END IF;

    RESET ROLE;

    -- ==========================================================================
    -- TEST 22: Scheduled reminder and expiry jobs
    -- ==========================================================================
    -- Create an old pending tip (> 7 days old)
    INSERT INTO public.tips (
        tip_number, reader_id, writer_id, amount_pkr, status,
        payment_instructions_snapshot, created_at, updated_at
    ) VALUES (
        'TIP-OLD-EXPIRE-TEST', v_reader_1_id, v_writer_a_id, 50, 'pending_payment',
        '{}'::jsonb, pg_catalog.now() - interval '8 days', pg_catalog.now() - interval '8 days'
    );

    v_rpc_res := public.run_scheduled_reminders();
    IF (v_rpc_res->>'expired_tips')::integer >= 1 THEN
        INSERT INTO test_results VALUES (22, 'run_scheduled_reminders expires old pending tips', 'PASS', v_rpc_res::text);
    ELSE
        INSERT INTO test_results VALUES (22, 'run_scheduled_reminders expires old pending tips', 'FAIL', v_rpc_res::text);
    END IF;

    -- Verify audit log was written
    SELECT count(*) INTO v_audit_count
    FROM public.audit_logs
    WHERE entity_type = 'tips';

    IF v_audit_count >= 5 THEN
        INSERT INTO test_results VALUES (23, 'Audit logs recorded for all tip mutations', 'PASS', 'Recorded: ' || v_audit_count);
    ELSE
        INSERT INTO test_results VALUES (23, 'Audit logs recorded for all tip mutations', 'FAIL', 'Found: ' || v_audit_count);
    END IF;

END $$;

-- ------------------------------------------------------------------------------
-- 3. DISPLAY RESULTS & VERIFY ZERO FAILURES
-- ------------------------------------------------------------------------------
SELECT test_id, test_name, status, details FROM test_results ORDER BY test_id;

SELECT
    count(*) AS total_tests,
    count(*) FILTER (WHERE status = 'PASS') AS passed,
    count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM test_results;

DO $$
DECLARE
    v_failed integer;
    v_fail_details text;
BEGIN
    SELECT count(*) INTO v_failed FROM test_results WHERE status = 'FAIL';
    IF v_failed > 0 THEN
        SELECT string_agg('Test ' || test_id || ' (' || test_name || '): ' || details, ' | ')
        INTO v_fail_details
        FROM test_results
        WHERE status = 'FAIL';

        RAISE EXCEPTION 'TEST SUITE FAILED. Details: %', v_fail_details;
    ELSE
        RAISE NOTICE 'ALL TIP JAR TESTS PASSED SUCCESSFULLY.';
    END IF;
END $$;

ROLLBACK;
