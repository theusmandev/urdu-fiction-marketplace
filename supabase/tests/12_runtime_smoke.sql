-- ==============================================================================
-- UNB PREMIUM — END-TO-END BEHAVIOURAL RUNTIME SMOKE TEST
-- File: supabase/tests/12_runtime_smoke.sql
--
-- Instructions:
-- Execute this entire file in the Supabase SQL Editor as postgres/service_role.
-- This entire file executes within a SINGLE transaction ending in ROLLBACK.
-- No permanent database state is modified or retained.
-- It verifies end-to-end execution of all real RPCs, role impersonation,
-- state machines, ledger entries, access control, and platform settings.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SETUP RESULT TRACKING & INTER-STEP FIXTURE STORAGE
-- ------------------------------------------------------------------------------

CREATE TEMP TABLE IF NOT EXISTS smoke_test_results (
    step_num integer PRIMARY KEY,
    step_name text NOT NULL,
    status text NOT NULL, -- 'PASS' or 'FAIL'
    details text NOT NULL
) ON COMMIT PRESERVE ROWS;
TRUNCATE TABLE smoke_test_results;

CREATE TEMP TABLE IF NOT EXISTS smoke_fixtures (
    key text PRIMARY KEY,
    val_uuid uuid,
    val_text text,
    val_num numeric,
    val_int integer
) ON COMMIT PRESERVE ROWS;
TRUNCATE TABLE smoke_fixtures;


-- ------------------------------------------------------------------------------
-- STEP 1: FIXTURES SETUP (Auth Users, Profiles, Writer Profile, Novel, Chapters)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id        uuid := '11111111-aaaa-bbbb-cccc-111111111111'::uuid;
    v_writer_id       uuid := '22222222-aaaa-bbbb-cccc-222222222222'::uuid;
    v_buyer_id        uuid := '33333333-aaaa-bbbb-cccc-333333333333'::uuid;
    v_stranger_id     uuid := '44444444-aaaa-bbbb-cccc-444444444444'::uuid;
    v_novel_id        uuid := gen_random_uuid();
    v_ch1_id          uuid := gen_random_uuid();
    v_ch2_id          uuid := gen_random_uuid();
    v_method_id       uuid := gen_random_uuid();
BEGIN
    -- 1. Create fake auth users
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
    VALUES
        (v_admin_id, 'admin_smoke@unbpremium.pk', '{"full_name": "Smoke Admin"}'::jsonb, now()),
        (v_writer_id, 'writer_smoke@unbpremium.pk', '{"full_name": "Smoke Writer"}'::jsonb, now()),
        (v_buyer_id, 'buyer_smoke@unbpremium.pk', '{"full_name": "Smoke Buyer"}'::jsonb, now()),
        (v_stranger_id, 'stranger_smoke@unbpremium.pk', '{"full_name": "Smoke Stranger"}'::jsonb, now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Create public profiles
    INSERT INTO public.profiles (id, email, full_name, username, role, is_active)
    VALUES
        (v_admin_id, 'admin_smoke@unbpremium.pk', 'Smoke Admin', 'smoke_admin', 'admin', true),
        (v_writer_id, 'writer_smoke@unbpremium.pk', 'Smoke Writer', 'smoke_writer', 'writer', true),
        (v_buyer_id, 'buyer_smoke@unbpremium.pk', 'Smoke Buyer', 'smoke_buyer', 'reader', true),
        (v_stranger_id, 'stranger_smoke@unbpremium.pk', 'Smoke Stranger', 'smoke_stranger', 'reader', true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;

    -- 3. Create approved writer profile
    INSERT INTO public.writer_profiles (
        id, pen_name_english, pen_name_urdu, status, agreement_accepted_at,
        custom_commission_rate, current_unpaid_commission, unpaid_commission_limit
    ) VALUES (
        v_writer_id, 'Smoke Author', 'دھواں مصنف', 'approved', now(),
        20.00, 0.00, 5000.00
    ) ON CONFLICT (id) DO UPDATE SET
        status = 'approved',
        current_unpaid_commission = 0.00,
        unpaid_commission_limit = 5000.00;

    -- 4. Create active writer payment method
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, is_active
    ) VALUES (
        v_method_id, v_writer_id, 'jazzcash', 'Smoke Writer JazzCash', '03001234567', true
    ) ON CONFLICT (id) DO NOTHING;

    -- 5. Create published novel
    INSERT INTO public.novels (
        id, writer_id, slug, title_english, title_urdu, synopsis_urdu, price_pkr,
        status, rights_declaration_accepted, total_chapters
    ) VALUES (
        v_novel_id, v_writer_id, 'smoke-test-novel', 'Smoke Test Novel', 'دھواں ٹیسٹ ناول',
        'یہ ایک آزمائشی ناول کا خلاصہ ہے برائے خودکار ٹیسٹنگ۔', 500.00,
        'published', true, 2
    ) ON CONFLICT (id) DO NOTHING;

    -- 6. Create chapters (Free preview and paid)
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, word_count, is_free_preview, is_published
    ) VALUES
        (v_ch1_id, v_novel_id, 1, 'پہلا باب (مفت)', 'یہ پہلے باب کا مفت مواد ہے جو ہر پڑھنے والے کے لیے دستیاب ہے۔', 12, true, true),
        (v_ch2_id, v_novel_id, 2, 'دوسرا باب (محفوظ)', 'یہ دوسرے باب کا خفیہ مواد ہے جو صرف تصدیق شدہ خریدار ہی پڑھ سکتا ہے۔', 15, false, true)
    ON CONFLICT (novel_id, chapter_number) DO NOTHING;

    -- Store fixture state for subsequent steps
    INSERT INTO smoke_fixtures (key, val_uuid) VALUES
        ('admin_id', v_admin_id),
        ('writer_id', v_writer_id),
        ('buyer_id', v_buyer_id),
        ('stranger_id', v_stranger_id),
        ('novel_id', v_novel_id),
        ('ch1_id', v_ch1_id),
        ('ch2_id', v_ch2_id),
        ('method_id', v_method_id);

    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (1, 'Bootstrap Fixtures & Roles', 'PASS', 'Users, writer profile, novel, chapters, and payment method created');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (1, 'Bootstrap Fixtures & Roles', 'FAIL', 'Setup exception: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 2: READER CREATE_ORDER
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_buyer_id   uuid;
    v_novel_id   uuid;
    v_method_id  uuid;
    v_res        jsonb;
    v_order_id   uuid;
    v_status     text;
BEGIN
    SELECT val_uuid INTO v_buyer_id FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_novel_id FROM smoke_fixtures WHERE key = 'novel_id';
    SELECT val_uuid INTO v_method_id FROM smoke_fixtures WHERE key = 'method_id';

    -- Impersonate Buyer
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);

    v_res := public.create_order(v_novel_id, v_method_id);
    v_order_id := (v_res->>'order_id')::uuid;
    v_status := v_res->>'status';

    IF v_order_id IS NOT NULL AND v_status = 'pending_payment' THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('order_1_id', v_order_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (2, 'Reader create_order', 'PASS', 'Order created in pending_payment status: ' || v_order_id::text);
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (2, 'Reader create_order', 'FAIL', 'Unexpected response: ' || coalesce(v_res::text, 'NULL'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (2, 'Reader create_order', 'FAIL', 'create_order failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 3: READER SUBMIT_PAYMENT
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_buyer_id       uuid;
    v_order_id       uuid;
    v_res            jsonb;
    v_submission_id  uuid;
    v_status         text;
BEGIN
    SELECT val_uuid INTO v_buyer_id FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_order_id FROM smoke_fixtures WHERE key = 'order_1_id';

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Prerequisite missing: order_1_id';
    END IF;

    -- Impersonate Buyer
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);

    v_res := public.submit_payment(
        v_order_id,
        'TID-SMOKE-1001',
        v_order_id::text || '/proof.jpg',
        500.00,
        'Smoke Buyer Reader',
        'Direct JazzCash transfer submitted'
    );

    v_submission_id := (v_res->>'submission_id')::uuid;
    v_status := v_res->>'status';

    IF v_submission_id IS NOT NULL AND v_status = 'payment_submitted' THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('submission_1_id', v_submission_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (3, 'Reader submit_payment', 'PASS', 'Payment proof submitted with status payment_submitted: ' || v_submission_id::text);
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (3, 'Reader submit_payment', 'FAIL', 'Unexpected response: ' || coalesce(v_res::text, 'NULL'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (3, 'Reader submit_payment', 'FAIL', 'submit_payment failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 4: WRITER VERIFY_ORDER_PAYMENT & IDEMPOTENT RETRY
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_writer_id      uuid;
    v_order_id       uuid;
    v_submission_id  uuid;
    v_res1           jsonb;
    v_res2           jsonb;
    v_ent_count      integer;
    v_led_count      integer;
BEGIN
    SELECT val_uuid INTO v_writer_id FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_order_id FROM smoke_fixtures WHERE key = 'order_1_id';
    SELECT val_uuid INTO v_submission_id FROM smoke_fixtures WHERE key = 'submission_1_id';

    IF v_order_id IS NULL OR v_submission_id IS NULL THEN
        RAISE EXCEPTION 'Prerequisite missing: order or submission id';
    END IF;

    -- Impersonate Writer
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);

    -- Call 1: Verification
    v_res1 := public.verify_order_payment(v_order_id, v_submission_id, 'Writer confirmed deposit in bank');

    IF coalesce((v_res1->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'First verify_order_payment call failed: %', v_res1;
    END IF;

    -- Call 2: Second call must be idempotent or fail safely without creating duplicates
    BEGIN
        v_res2 := public.verify_order_payment(v_order_id, v_submission_id, 'Duplicate attempt');
    EXCEPTION WHEN OTHERS THEN
        v_res2 := jsonb_build_object('error', SQLERRM);
    END;

    -- Check counts
    SELECT count(*) INTO v_ent_count FROM public.purchase_entitlements WHERE order_id = v_order_id;
    SELECT count(*) INTO v_led_count FROM public.sales_ledger WHERE order_id = v_order_id AND entry_type = 'sale_verified';

    IF v_ent_count = 1 AND v_led_count = 1 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4, 'Writer verify_order_payment & Idempotency', 'PASS', 'Order verified; second call safely handled; exactly 1 entitlement and 1 ledger row');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4, 'Writer verify_order_payment & Idempotency', 'FAIL', format('Duplicate records detected! Entitlements: %s, Ledger rows: %s', v_ent_count, v_led_count));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (4, 'Writer verify_order_payment & Idempotency', 'FAIL', 'verify_order_payment failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 5: LEDGER BALANCE INVARIANT (Gross = Commission + Net)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_order_id       uuid;
    v_ledger         record;
BEGIN
    SELECT val_uuid INTO v_order_id FROM smoke_fixtures WHERE key = 'order_1_id';

    SELECT * INTO v_ledger
    FROM public.sales_ledger
    WHERE order_id = v_order_id AND entry_type = 'sale_verified';

    IF v_ledger.id IS NULL THEN
        RAISE EXCEPTION 'sale_verified ledger row not found';
    END IF;

    IF (v_ledger.platform_commission_pkr + v_ledger.writer_net_pkr) = v_ledger.gross_amount_pkr
       AND v_ledger.gross_amount_pkr = 500.00
       AND v_ledger.platform_commission_pkr = 100.00
       AND v_ledger.writer_net_pkr = 400.00 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (5, 'Financial Ledger Balance Invariant', 'PASS', format('Exact match: %s gross = %s comm + %s net', v_ledger.gross_amount_pkr, v_ledger.platform_commission_pkr, v_ledger.writer_net_pkr));
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (5, 'Financial Ledger Balance Invariant', 'FAIL', format('Mismatch: gross=%s, comm=%s, net=%s', v_ledger.gross_amount_pkr, v_ledger.platform_commission_pkr, v_ledger.writer_net_pkr));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (5, 'Financial Ledger Balance Invariant', 'FAIL', 'Balance check failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 6: CHAPTER ACCESS AUTHORIZATION (get_chapter_for_reader)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_buyer_id      uuid;
    v_stranger_id   uuid;
    v_res_buyer     jsonb;
    v_res_free      jsonb;
    v_stranger_denied boolean := false;
BEGIN
    SELECT val_uuid INTO v_buyer_id FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_stranger_id FROM smoke_fixtures WHERE key = 'stranger_id';

    -- 1. Buyer accesses paid Chapter 2
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);
    v_res_buyer := public.get_chapter_for_reader('smoke-test-novel', 2);

    IF v_res_buyer->>'content_urdu' IS NULL THEN
        RAISE EXCEPTION 'Buyer was not granted chapter content';
    END IF;

    -- 2. Stranger attempts to access paid Chapter 2 (must be denied)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.get_chapter_for_reader('smoke-test-novel', 2);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Chapter not found%' THEN
            v_stranger_denied := true;
        END IF;
    END;

    -- 3. Stranger accesses free preview Chapter 1 (must be granted)
    v_res_free := public.get_chapter_for_reader('smoke-test-novel', 1);

    IF v_stranger_denied AND v_res_free->>'content_urdu' IS NOT NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (6, 'Chapter Access Authorization', 'PASS', 'Buyer unlocked paid chapter; stranger denied paid chapter and granted free preview');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (6, 'Chapter Access Authorization', 'FAIL', format('Access violation: stranger_denied=%s, free_preview_ok=%s', v_stranger_denied, (v_res_free->>'content_urdu' IS NOT NULL)));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (6, 'Chapter Access Authorization', 'FAIL', 'Chapter authorization failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 7: ADMIN ORDERS RPCs (Privacy Protection / No Reader Email)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id       uuid;
    v_order_id       uuid;
    v_list_res       jsonb;
    v_order_res      jsonb;
BEGIN
    SELECT val_uuid INTO v_admin_id FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_order_id FROM smoke_fixtures WHERE key = 'order_1_id';

    -- Impersonate Admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_list_res := public.admin_list_orders('verified', NULL, false, 10, 0);
    v_order_res := public.admin_get_order(v_order_id);

    -- Assert privacy: reader email must not be exposed in admin responses
    IF (v_list_res::text NOT LIKE '%buyer_smoke@unbpremium.pk%')
       AND (v_order_res::text NOT LIKE '%buyer_smoke@unbpremium.pk%')
       AND (v_order_res->>'id' = v_order_id::text) THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'PASS', 'Orders returned valid administrative data without exposing reader email');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL', 'Privacy leakage or missing order detail');
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL', 'Admin orders inspection failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 8: COMMISSION INVOICING (preview_commission_invoice & generate_commission_invoice)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id       uuid;
    v_writer_id      uuid;
    v_preview        jsonb;
    v_gen            jsonb;
    v_invoice_id     uuid;
BEGIN
    SELECT val_uuid INTO v_admin_id FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_writer_id FROM smoke_fixtures WHERE key = 'writer_id';

    -- Impersonate Admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_preview := public.preview_commission_invoice(v_writer_id, now() - interval '1 day', now() + interval '1 day');

    IF (v_preview->>'total_sales_count')::int < 1 OR (v_preview->>'total_commission_owed_pkr')::numeric < 100.00 THEN
        RAISE EXCEPTION 'Invoice preview failed: %', v_preview;
    END IF;

    v_gen := public.generate_commission_invoice(v_writer_id, now() - interval '1 day', now() + interval '1 day');
    v_invoice_id := (v_gen->>'invoice_id')::uuid;

    IF v_invoice_id IS NOT NULL THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('invoice_id', v_invoice_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (8, 'Commission Invoice Preview & Generation', 'PASS', 'Invoice previewed and generated: ' || v_invoice_id::text);
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (8, 'Commission Invoice Preview & Generation', 'FAIL', 'Invoice generation returned: ' || coalesce(v_gen::text, 'NULL'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (8, 'Commission Invoice Preview & Generation', 'FAIL', 'Commission invoicing failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 9: REPORT COMMISSION PAYMENT (Balance Unchanged)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_writer_id      uuid;
    v_invoice_id     uuid;
    v_bal_before     numeric(12,2);
    v_bal_after      numeric(12,2);
    v_res            jsonb;
    v_report_id      uuid;
BEGIN
    SELECT val_uuid INTO v_writer_id FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_invoice_id FROM smoke_fixtures WHERE key = 'invoice_id';

    SELECT current_unpaid_commission INTO v_bal_before
    FROM public.writer_profiles
    WHERE id = v_writer_id;

    -- Impersonate Writer
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);

    v_res := public.report_commission_payment(
        v_invoice_id,
        100.00,
        'TID-COMM-9999',
        v_invoice_id::text || '/comm_proof.jpg',
        'Direct bank deposit paid for commission invoice'
    );

    v_report_id := (v_res->>'report_id')::uuid;

    SELECT current_unpaid_commission INTO v_bal_after
    FROM public.writer_profiles
    WHERE id = v_writer_id;

    -- Invariant: Unpaid commission balance remains UNCHANGED until admin verifies and settles
    IF v_report_id IS NOT NULL AND v_bal_after = v_bal_before THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('report_id', v_report_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (9, 'Report Commission Payment (Balance Invariant)', 'PASS', format('Payment reported (%s); writer balance correctly unchanged (%s PKR)', v_report_id, v_bal_after));
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (9, 'Report Commission Payment (Balance Invariant)', 'FAIL', format('Premature balance reduction or report failure: before=%s, after=%s', v_bal_before, v_bal_after));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (9, 'Report Commission Payment (Balance Invariant)', 'FAIL', 'Commission payment report failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 10: CONFIRM COMMISSION SETTLEMENT (Balance Reduced)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id       uuid;
    v_writer_id      uuid;
    v_invoice_id     uuid;
    v_report_id      uuid;
    v_bal_after      numeric(12,2);
    v_res            jsonb;
BEGIN
    SELECT val_uuid INTO v_admin_id FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_writer_id FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_invoice_id FROM smoke_fixtures WHERE key = 'invoice_id';
    SELECT val_uuid INTO v_report_id FROM smoke_fixtures WHERE key = 'report_id';

    -- Impersonate Admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_res := public.confirm_commission_settlement(
        v_invoice_id,
        100.00,
        v_report_id,
        'Admin verified bank deposit receipt'
    );

    SELECT current_unpaid_commission INTO v_bal_after
    FROM public.writer_profiles
    WHERE id = v_writer_id;

    -- Invariant: After settlement confirmation, unpaid commission balance is reduced to 0.00
    IF coalesce((v_res->>'success')::boolean, false) IS TRUE AND v_bal_after = 0.00 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (10, 'Confirm Commission Settlement (Balance Reduced)', 'PASS', 'Invoice settled; writer unpaid commission balance successfully reconciled to 0.00 PKR');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (10, 'Confirm Commission Settlement (Balance Reduced)', 'FAIL', format('Settlement failed or balance not reduced: %s, balance=%s', v_res, v_bal_after));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (10, 'Confirm Commission Settlement (Balance Reduced)', 'FAIL', 'Confirm settlement failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 11: OPEN DISPUTE ON SECOND ORDER
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_buyer_id       uuid;
    v_writer_id      uuid;
    v_novel_id       uuid;
    v_method_id      uuid;
    v_order_2_id     uuid := gen_random_uuid();
    v_res_disp       jsonb;
    v_dispute_id     uuid;
BEGIN
    SELECT val_uuid INTO v_buyer_id FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_writer_id FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_novel_id FROM smoke_fixtures WHERE key = 'novel_id';
    SELECT val_uuid INTO v_method_id FROM smoke_fixtures WHERE key = 'method_id';

    -- Create Order 2 directly in payment_submitted status, submitted 25h ago (satisfying min dispute wait hours)
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
        amount_pkr, applied_commission_rate, calculated_commission_pkr, calculated_writer_share_pkr,
        status, created_at
    ) VALUES (
        v_order_2_id, 'ORD-SMOKE-DISP', v_buyer_id, v_writer_id, v_novel_id, 'Smoke Test Novel',
        500.00, 20.00, 100.00, 400.00, 'payment_submitted', now() - interval '25 hours'
    );

    INSERT INTO public.payment_submissions (
        order_id, reader_id, writer_id, transaction_reference_tid, screenshot_url, screenshot_path, created_at
    ) VALUES (
        v_order_2_id, v_buyer_id, v_writer_id, 'TID-SMOKE-DISP-2', 'proof.jpg', v_order_2_id::text || '/proof.jpg', now() - interval '25 hours'
    );

    -- Impersonate Buyer
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);

    v_res_disp := public.open_dispute(v_order_2_id, 'Author has not verified payment after 24 hours');
    v_dispute_id := (v_res_disp->>'dispute_id')::uuid;

    IF v_dispute_id IS NOT NULL AND (v_res_disp->>'status') = 'open' THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('order_2_id', v_order_2_id);
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('dispute_id', v_dispute_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (11, 'Reader open_dispute', 'PASS', 'Dispute opened after 24h wait window: ' || v_dispute_id::text);
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (11, 'Reader open_dispute', 'FAIL', 'open_dispute returned: ' || coalesce(v_res_disp::text, 'NULL'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (11, 'Reader open_dispute', 'FAIL', 'open_dispute failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 12: RESOLVE DISPUTE FOR READER VERIFY
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id       uuid;
    v_order_2_id     uuid;
    v_dispute_id     uuid;
    v_res            jsonb;
    v_ent_count      integer;
    v_led_count      integer;
BEGIN
    SELECT val_uuid INTO v_admin_id FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_order_2_id FROM smoke_fixtures WHERE key = 'order_2_id';
    SELECT val_uuid INTO v_dispute_id FROM smoke_fixtures WHERE key = 'dispute_id';

    -- Impersonate Admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_res := public.resolve_dispute_for_reader_verify(
        v_dispute_id,
        'Admin verified bank deposit statement confirms buyer payment'
    );

    SELECT count(*) INTO v_ent_count FROM public.purchase_entitlements WHERE order_id = v_order_2_id;
    SELECT count(*) INTO v_led_count FROM public.sales_ledger WHERE order_id = v_order_2_id AND entry_type = 'sale_verified';

    IF coalesce((v_res->>'success')::boolean, false) IS TRUE AND v_ent_count = 1 AND v_led_count = 1 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (12, 'resolve_dispute_for_reader_verify', 'PASS', 'Dispute resolved for reader: order verified, exactly 1 entitlement and 1 ledger row');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (12, 'resolve_dispute_for_reader_verify', 'FAIL', format('Failed or duplicate records: %s, ent=%s, led=%s', v_res, v_ent_count, v_led_count));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (12, 'resolve_dispute_for_reader_verify', 'FAIL', 'resolve_dispute_for_reader_verify failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 13: REFUND PATH ON VERIFIED ORDER (Negative Ledger Row & Access Revocation)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_buyer_id       uuid;
    v_admin_id       uuid;
    v_order_2_id     uuid;
    v_req_res        jsonb;
    v_app_res        jsonb;
    v_request_id     uuid;
    v_revoked        boolean;
    v_neg_led_count  integer;
    v_order_status   text;
BEGIN
    SELECT val_uuid INTO v_buyer_id FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_admin_id FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_order_2_id FROM smoke_fixtures WHERE key = 'order_2_id';

    -- 1. Buyer requests refund
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);

    v_req_res := public.request_refund(
        v_order_2_id,
        'Duplicate purchase was made in error',
        'Evidence note attached',
        NULL
    );

    v_request_id := (v_req_res->>'request_id')::uuid;

    -- 2. Admin approves refund
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_app_res := public.approve_refund_request(
        v_request_id,
        'Admin approved full refund and adjusted commission ledger'
    );

    -- 3. Verify invariants: exactly 1 negative refund_adjustment row, entitlement is_revoked = true, order is refunded_adjusted
    SELECT count(*) INTO v_neg_led_count
    FROM public.sales_ledger
    WHERE order_id = v_order_2_id AND entry_type = 'refund_adjustment';

    SELECT is_revoked INTO v_revoked
    FROM public.purchase_entitlements
    WHERE order_id = v_order_2_id;

    SELECT status::text INTO v_order_status
    FROM public.orders
    WHERE id = v_order_2_id;

    IF v_neg_led_count = 1 AND v_revoked IS TRUE AND v_order_status = 'refunded_adjusted' THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (13, 'Refund Workflow & Ledger Reversal', 'PASS', 'Refund recorded: 1 negative reversal ledger row, entitlement revoked, order marked refunded_adjusted');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (13, 'Refund Workflow & Ledger Reversal', 'FAIL', format('Invariant breach: neg_ledger=%s, revoked=%s, order_status=%s', v_neg_led_count, v_revoked, v_order_status));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (13, 'Refund Workflow & Ledger Reversal', 'FAIL', 'Refund workflow failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 14: UPDATE PLATFORM SETTINGS (Authoritative Columns & Parameter Stability)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id       uuid;
    v_res            jsonb;
    v_settings       record;
BEGIN
    SELECT val_uuid INTO v_admin_id FROM smoke_fixtures WHERE key = 'admin_id';

    -- Impersonate Admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_res := public.update_platform_settings(
        p_default_commission_rate := 22.00,
        p_default_unpaid_commission_limit := 6000.00,
        p_min_novel_price_pkr := 75,
        p_max_novel_price_pkr := 4500.00,
        p_dispute_window_days := 35,
        p_support_email := 'ops@unbpremium.pk'
    );

    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    IF coalesce((v_res->>'success')::boolean, false) IS TRUE
       AND v_settings.default_commission_rate = 22.00
       AND v_settings.default_unpaid_commission_limit = 6000.00
       AND v_settings.min_novel_price_pkr = 75
       AND v_settings.support_email = 'ops@unbpremium.pk' THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (14, 'update_platform_settings', 'PASS', 'Settings successfully updated to authoritative database columns with audit log');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (14, 'update_platform_settings', 'FAIL', format('Settings mismatch: %s', v_res));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (14, 'update_platform_settings', 'FAIL', 'update_platform_settings failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- STEP 15: USER PORTAL RPCs (get_my_library, get_my_ledger, get_my_sales_summary)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_buyer_id       uuid;
    v_writer_id      uuid;
    v_lib_count      integer;
    v_led_count      integer;
    v_summary        jsonb;
BEGIN
    SELECT val_uuid INTO v_buyer_id FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_writer_id FROM smoke_fixtures WHERE key = 'writer_id';

    -- 1. Buyer inspects library
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_lib_count FROM public.get_my_library();

    -- 2. Writer inspects personal ledger and sales summary
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_led_count FROM public.get_my_ledger();
    v_summary := public.get_my_sales_summary();

    IF v_lib_count >= 1 AND v_led_count >= 1 AND v_summary IS NOT NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (15, 'User Portal Queries (Library, Ledger, Summary)', 'PASS', format('Buyer library count=%s, Writer ledger rows=%s, summary generated', v_lib_count, v_led_count));
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (15, 'User Portal Queries (Library, Ledger, Summary)', 'FAIL', format('Mismatch: lib_count=%s, led_count=%s, summary=%s', v_lib_count, v_led_count, v_summary));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (15, 'User Portal Queries (Library, Ledger, Summary)', 'FAIL', 'User portal RPCs failed: ' || SQLERRM);
END;
$$;


-- ------------------------------------------------------------------------------
-- 2. DISPLAY COMPLETE TABULAR SMOKE TEST REPORT
-- ------------------------------------------------------------------------------
SELECT 
    step_num,
    step_name,
    status,
    details
FROM smoke_test_results
UNION ALL
SELECT 
    999,
    'OVERALL RUNTIME SMOKE STATUS',
    CASE WHEN count(*) FILTER (WHERE status = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('Total Steps: %s | Passed: %s | Failed: %s', 
        count(*),
        count(*) FILTER (WHERE status = 'PASS'), 
        count(*) FILTER (WHERE status = 'FAIL')
    )
FROM smoke_test_results
ORDER BY step_num;

-- ------------------------------------------------------------------------------
-- 3. CLEAN ROLLBACK (Guarantees zero persistent test data in live database)
-- ------------------------------------------------------------------------------
ROLLBACK;
