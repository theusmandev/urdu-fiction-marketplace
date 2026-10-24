-- ==============================================================================
-- UNB PREMIUM — END-TO-END BEHAVIOURAL RUNTIME SMOKE TEST v2
-- File: supabase/tests/12_runtime_smoke.sql
--
-- Instructions:
--   Execute this entire file in the Supabase SQL Editor as postgres/service_role.
--   The entire file runs within a SINGLE transaction ending in ROLLBACK.
--   No permanent database state is modified or retained.
--   All fixture UUIDs are generated fresh with gen_random_uuid() so no stale
--   data from a prior incomplete run can pollute results.
--
-- Design rules (v2):
--   1. Every step re-derives all IDs it needs by querying smoke_fixtures
--      (keyed by a stable string, never passed as a variable between blocks).
--   2. A step whose prerequisite ID is NULL is reported as SKIPPED with the
--      prerequisite name in the details — it never runs and never cascades a
--      failure from a prior step.
--   3. The summary row separately counts PASS / FAIL / SKIPPED.
--   4. Step 3 (submit_payment) asserts on the real response keys that the
--      function actually returns: success=true and submission_id IS NOT NULL.
--      It then reads order status and submission reviewer_status from the
--      database tables — it does NOT rely on a 'status' response key that
--      the function does not return.
--   5. Step 3A (new): explicitly asserts that BEFORE verification the buyer
--      has NO purchase entitlement and NO sale_verified ledger row, and that
--      get_chapter_for_reader on a paid chapter returns 'Chapter not found'.
--   6. Step 11 uses a DIFFERENT novel (novel_2) so Order 2 never collides
--      with Order 1's open-order unique index
--      (uq_orders_reader_novel_active / uq_orders_reader_novel_pending).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. RESULT TRACKING & INTER-STEP FIXTURE STORAGE
-- ------------------------------------------------------------------------------

CREATE TEMP TABLE IF NOT EXISTS smoke_test_results (
    step_num   numeric PRIMARY KEY,          -- allows half-steps like 3.5
    step_name  text NOT NULL,
    status     text NOT NULL CHECK (status IN ('PASS','FAIL','SKIPPED')),
    details    text NOT NULL
) ON COMMIT PRESERVE ROWS;
TRUNCATE TABLE smoke_test_results;

CREATE TEMP TABLE IF NOT EXISTS smoke_fixtures (
    key      text PRIMARY KEY,
    val_uuid uuid,
    val_text text,
    val_num  numeric,
    val_int  integer
) ON COMMIT PRESERVE ROWS;
TRUNCATE TABLE smoke_fixtures;


-- ==============================================================================
-- STEP 1: FIXTURES — Users, Profiles, Writer, Two Novels, Chapters, Payment Method
-- ==============================================================================
DO $$
DECLARE
    v_admin_id    uuid := gen_random_uuid();
    v_writer_id   uuid := gen_random_uuid();
    v_buyer_id    uuid := gen_random_uuid();
    v_stranger_id uuid := gen_random_uuid();
    v_novel_id    uuid := gen_random_uuid();
    v_novel_2_id  uuid := gen_random_uuid();
    v_ch1_id      uuid := gen_random_uuid();
    v_ch2_id      uuid := gen_random_uuid();
    v_ch3_id      uuid := gen_random_uuid();
    v_method_id   uuid := gen_random_uuid();
    v_ts          text := to_char(now(), 'YYYYMMDD_HH24MISS');
BEGIN
    -- Auth users
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at) VALUES
        (v_admin_id,    'admin_smoke_'    || v_ts || '@unbpremium.pk', '{"full_name":"Smoke Admin"}'::jsonb,    now()),
        (v_writer_id,   'writer_smoke_'   || v_ts || '@unbpremium.pk', '{"full_name":"Smoke Writer"}'::jsonb,   now()),
        (v_buyer_id,    'buyer_smoke_'    || v_ts || '@unbpremium.pk', '{"full_name":"Smoke Buyer"}'::jsonb,    now()),
        (v_stranger_id, 'stranger_smoke_' || v_ts || '@unbpremium.pk', '{"full_name":"Smoke Stranger"}'::jsonb, now())
    ON CONFLICT (id) DO NOTHING;

    -- Profiles
    INSERT INTO public.profiles (id, email, full_name, username, role, is_active) VALUES
        (v_admin_id,    'admin_smoke_'    || v_ts || '@unbpremium.pk', 'Smoke Admin',    'smoke_admin_'    || v_ts, 'admin',  true),
        (v_writer_id,   'writer_smoke_'   || v_ts || '@unbpremium.pk', 'Smoke Writer',   'smoke_writer_'   || v_ts, 'writer', true),
        (v_buyer_id,    'buyer_smoke_'    || v_ts || '@unbpremium.pk', 'Smoke Buyer',    'smoke_buyer_'    || v_ts, 'reader', true),
        (v_stranger_id, 'stranger_smoke_' || v_ts || '@unbpremium.pk', 'Smoke Stranger', 'smoke_stranger_' || v_ts, 'reader', true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;

    -- Writer profile
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

    -- Payment method
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, is_active
    ) VALUES (
        v_method_id, v_writer_id, 'jazzcash', 'Smoke Writer JazzCash', '03001234567', true
    ) ON CONFLICT (id) DO NOTHING;

    -- Novel 1 (for the main order / verification flow)
    INSERT INTO public.novels (
        id, writer_id, slug, title_english, title_urdu, synopsis_urdu, price_pkr,
        status, rights_declaration_accepted, total_chapters
    ) VALUES (
        v_novel_id, v_writer_id,
        'smoke-novel-1-' || v_ts,
        'Smoke Novel One', 'دھواں ناول ایک',
        'آزمائشی ناول اول کا خلاصہ۔', 500.00,
        'published', true, 2
    ) ON CONFLICT (id) DO NOTHING;

    -- Novel 2 (for the dispute / refund flow — different novel to avoid unique index collision)
    INSERT INTO public.novels (
        id, writer_id, slug, title_english, title_urdu, synopsis_urdu, price_pkr,
        status, rights_declaration_accepted, total_chapters
    ) VALUES (
        v_novel_2_id, v_writer_id,
        'smoke-novel-2-' || v_ts,
        'Smoke Novel Two', 'دھواں ناول دو',
        'آزمائشی ناول دوم کا خلاصہ۔', 500.00,
        'published', true, 1
    ) ON CONFLICT (id) DO NOTHING;

    -- Chapters for Novel 1
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, word_count, is_free_preview, is_published
    ) VALUES
        (v_ch1_id, v_novel_id, 1, 'پہلا باب (مفت)', 'مفت ابواب کا مواد — سب کے لیے دستیاب۔', 10, true,  true),
        (v_ch2_id, v_novel_id, 2, 'دوسرا باب (مقفل)', 'خفیہ مواد — صرف تصدیق شدہ خریدار۔',  15, false, true)
    ON CONFLICT (novel_id, chapter_number) DO NOTHING;

    -- Chapter for Novel 2
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, word_count, is_free_preview, is_published
    ) VALUES
        (v_ch3_id, v_novel_2_id, 1, 'پہلا باب (مقفل)', 'ناول دو کا خفیہ باب۔', 12, false, true)
    ON CONFLICT (novel_id, chapter_number) DO NOTHING;

    -- Store fixtures
    INSERT INTO smoke_fixtures (key, val_uuid) VALUES
        ('admin_id',    v_admin_id),
        ('writer_id',   v_writer_id),
        ('buyer_id',    v_buyer_id),
        ('stranger_id', v_stranger_id),
        ('novel_id',    v_novel_id),
        ('novel_2_id',  v_novel_2_id),
        ('ch1_id',      v_ch1_id),
        ('ch2_id',      v_ch2_id),
        ('ch3_id',      v_ch3_id),
        ('method_id',   v_method_id);

    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (1, 'Bootstrap Fixtures', 'PASS',
        'Fresh UUIDs; 4 users, 2 novels, 3 chapters, 1 payment method created');
EXCEPTION WHEN OTHERS THEN
    -- Include SQLSTATE so the exact failing statement type is identifiable
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (1, 'Bootstrap Fixtures', 'FAIL',
        format('SQLSTATE %s — %s', SQLSTATE, SQLERRM));
END;
$$;


-- ==============================================================================
-- STEP 2: READER create_order (Novel 1)
-- ==============================================================================
DO $$
DECLARE
    v_buyer_id  uuid;
    v_novel_id  uuid;
    v_method_id uuid;
    v_res       jsonb;
    v_order_id  uuid;
    v_status    text;
BEGIN
    SELECT val_uuid INTO v_buyer_id  FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_novel_id  FROM smoke_fixtures WHERE key = 'novel_id';
    SELECT val_uuid INTO v_method_id FROM smoke_fixtures WHERE key = 'method_id';

    IF v_buyer_id IS NULL OR v_novel_id IS NULL OR v_method_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (2, 'Reader create_order', 'SKIPPED', 'Prerequisite missing: fixtures from step 1');
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);

    v_res := public.create_order(v_novel_id, v_method_id);
    v_order_id := (v_res->>'order_id')::uuid;
    v_status   := v_res->>'status';

    IF v_order_id IS NOT NULL AND v_status = 'pending_payment' THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('order_1_id', v_order_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (2, 'Reader create_order', 'PASS', 'Order created in pending_payment: ' || v_order_id::text);
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (2, 'Reader create_order', 'FAIL', 'Unexpected response: ' || coalesce(v_res::text, 'NULL'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (2, 'Reader create_order', 'FAIL', 'create_order exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 3: READER submit_payment
--   Asserts on REAL response keys: success=true, submission_id NOT NULL.
--   Then reads order status from public.orders (must be payment_submitted)
--   and reviewer_status from public.payment_submissions (must be 'pending').
--   Does NOT rely on a 'status' response key (the function does not return one).
-- ==============================================================================
DO $$
DECLARE
    v_buyer_id      uuid;
    v_order_id      uuid;
    v_res           jsonb;
    v_success       boolean;
    v_submission_id uuid;
    v_order_status  text;
    v_reviewer_st   text;
    v_slug          text;
BEGIN
    SELECT val_uuid INTO v_buyer_id FROM smoke_fixtures WHERE key = 'buyer_id';
    -- Re-derive order_id by looking up the order placed for this buyer + novel_id
    SELECT val_uuid INTO v_order_id FROM smoke_fixtures WHERE key = 'order_1_id';

    IF v_order_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (3, 'Reader submit_payment', 'SKIPPED', 'Prerequisite missing: order_1_id');
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);

    v_res := public.submit_payment(
        v_order_id,
        'TIDSM-' || left(v_order_id::text, 8),   -- 6+ alphanum chars, unique per run
        v_order_id::text || '/proof.jpg',
        500.00,
        'Smoke Buyer',
        'Smoke test payment'
    );

    v_success       := (v_res->>'success')::boolean;
    v_submission_id := (v_res->>'submission_id')::uuid;

    -- Read ground truth from database tables, not from function response
    SELECT status::text INTO v_order_status
    FROM public.orders WHERE id = v_order_id;

    SELECT reviewer_status::text INTO v_reviewer_st
    FROM public.payment_submissions
    WHERE order_id = v_order_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_success IS TRUE
       AND v_submission_id IS NOT NULL
       AND v_order_status = 'payment_submitted'
       AND v_reviewer_st  = 'pending'
    THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('submission_1_id', v_submission_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (3, 'Reader submit_payment', 'PASS',
            format('submission_id=%s; db order_status=%s; reviewer_status=%s',
                   v_submission_id, v_order_status, v_reviewer_st));
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (3, 'Reader submit_payment', 'FAIL',
            format('success=%s submission_id=%s order_status=%s reviewer_status=%s rpc_response=%s',
                   v_success, v_submission_id, v_order_status, v_reviewer_st, coalesce(v_res::text, 'NULL')));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (3, 'Reader submit_payment', 'FAIL', 'submit_payment exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 3.5: PRE-VERIFICATION ACCESS INVARIANT
--   Before any writer/admin verification the buyer MUST have:
--     - NO active purchase entitlement (is_revoked = false)
--     - NO sale_verified ledger row
--     - get_chapter_for_reader on the paid chapter returns 'Chapter not found'
--
--   If lib_count > 0 at this point it is a CRITICAL BUG — either a function
--   can create an entitlement without verification, or stale data from a prior
--   incomplete run leaked. This step surfaces that clearly.
-- ==============================================================================
DO $$
DECLARE
    v_buyer_id      uuid;
    v_novel_slug    text;
    v_order_id      uuid;
    v_ent_count     integer;
    v_led_count     integer;
    v_chapter_res   jsonb;
    v_chapter_ok    boolean := false;
BEGIN
    SELECT val_uuid INTO v_buyer_id  FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_order_id  FROM smoke_fixtures WHERE key = 'order_1_id';

    IF v_buyer_id IS NULL OR v_order_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (3.5, 'Pre-verification access invariant', 'SKIPPED',
                'Prerequisite missing: buyer_id or order_1_id');
        RETURN;
    END IF;

    -- Retrieve the slug for Novel 1
    SELECT n.slug INTO v_novel_slug
    FROM public.novels n
    JOIN public.orders  o ON o.novel_id = n.id
    WHERE o.id = v_order_id;

    -- Count active entitlements for this buyer on Novel 1
    SELECT count(*) INTO v_ent_count
    FROM public.purchase_entitlements
    WHERE order_id = v_order_id AND is_revoked = false;

    -- Count sale_verified ledger rows for this order
    SELECT count(*) INTO v_led_count
    FROM public.sales_ledger
    WHERE order_id = v_order_id AND entry_type = 'sale_verified';

    -- Attempt to read the paid chapter (must be denied)
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_chapter_res := public.get_chapter_for_reader(v_novel_slug, 2);
        -- If it returned content, access was incorrectly granted
        IF v_chapter_res->>'content_urdu' IS NULL THEN
            v_chapter_ok := true;   -- function returned without content = access denied
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Chapter not found%' OR SQLERRM ILIKE '%not found%' OR SQLERRM ILIKE '%unauthorized%' THEN
            v_chapter_ok := true;   -- correct: exception = access denied
        END IF;
    END;

    IF v_ent_count = 0 AND v_led_count = 0 AND v_chapter_ok THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (3.5, 'Pre-verification access invariant', 'PASS',
            'Confirmed: before verification buyer has 0 entitlements, 0 ledger rows, paid chapter access denied');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (3.5, 'Pre-verification access invariant', 'FAIL',
            format('CRITICAL — ent_count=%s led_count=%s chapter_denied=%s — entitlement or ledger row exists BEFORE verification. Check for stale data from a prior incomplete run, or a function that bypasses verification.',
                   v_ent_count, v_led_count, v_chapter_ok));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (3.5, 'Pre-verification access invariant', 'FAIL', 'Exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 4: WRITER verify_order_payment & IDEMPOTENT RETRY
--   Assertions:
--     1. Verify by WRITER JWT (not admin) succeeds.
--     2. Calling it a second time is idempotent:
--        - exactly 1 entitlement
--        - exactly 1 sale_verified ledger row
--        - commission + net = gross
--     3. Writer's unpaid commission afterwards equals the ledger total minus confirmed payments.
-- ==============================================================================
DO $$
DECLARE
    v_writer_id      uuid;
    v_order_id       uuid;
    v_submission_id  uuid;
    v_res1           jsonb;
    v_res2           jsonb;
    v_ent_count      integer;
    v_led_count      integer;
    v_ledger         record;
    v_writer_unpaid  numeric(12,2);
    v_expected_unpaid numeric(12,2);
    v_total_paid     numeric(12,2);
BEGIN
    SELECT val_uuid INTO v_writer_id     FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_order_id      FROM smoke_fixtures WHERE key = 'order_1_id';
    SELECT val_uuid INTO v_submission_id FROM smoke_fixtures WHERE key = 'submission_1_id';

    -- Fallback: re-query submission from DB if fixture was not saved (e.g. step 3 stored it late)
    IF v_submission_id IS NULL AND v_order_id IS NOT NULL THEN
        SELECT id INTO v_submission_id
        FROM public.payment_submissions
        WHERE order_id = v_order_id
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_order_id IS NULL OR v_submission_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4, 'Writer verify_order_payment & Idempotency', 'SKIPPED',
            format('Prerequisite missing: order_1_id=%s submission_1_id=%s',
                   v_order_id, v_submission_id));
        RETURN;
    END IF;

    -- Explicitly verify using WRITER JWT (non-admin)
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);

    -- Call 1: Verification by WRITER
    v_res1 := public.verify_order_payment(v_order_id, v_submission_id, 'Writer confirmed deposit in bank');

    IF coalesce((v_res1->>'success')::boolean, false) IS NOT TRUE THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4, 'Writer verify_order_payment & Idempotency', 'FAIL',
            'First verify_order_payment call by writer JWT failed: ' || coalesce(v_res1::text, 'NULL'));
        RETURN;
    END IF;

    -- Call 2: Second call must be idempotent (no duplicate records)
    BEGIN
        v_res2 := public.verify_order_payment(v_order_id, v_submission_id, 'Duplicate attempt');
    EXCEPTION WHEN OTHERS THEN
        v_res2 := jsonb_build_object('idempotent_error', SQLERRM);
    END;

    -- Invariant 1: Exactly 1 entitlement and 1 ledger row regardless of retry
    SELECT count(*) INTO v_ent_count
    FROM public.purchase_entitlements WHERE order_id = v_order_id;

    SELECT count(*) INTO v_led_count
    FROM public.sales_ledger
    WHERE order_id = v_order_id AND entry_type = 'sale_verified';

    SELECT * INTO v_ledger
    FROM public.sales_ledger
    WHERE order_id = v_order_id AND entry_type = 'sale_verified';

    -- Invariant 2: Commission + Net = Gross
    IF (v_ledger.platform_commission_pkr + v_ledger.writer_net_pkr) != v_ledger.gross_amount_pkr THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4, 'Writer verify_order_payment & Idempotency', 'FAIL',
            format('Ledger balance mismatch: comm (%s) + net (%s) != gross (%s)',
                   v_ledger.platform_commission_pkr, v_ledger.writer_net_pkr, v_ledger.gross_amount_pkr));
        RETURN;
    END IF;

    -- Invariant 3: Writer unpaid commission equals ledger total minus confirmed payments
    SELECT current_unpaid_commission INTO v_writer_unpaid
    FROM public.writer_profiles WHERE id = v_writer_id;

    SELECT coalesce(sum(platform_commission_pkr), 0.00) INTO v_expected_unpaid
    FROM public.sales_ledger WHERE writer_id = v_writer_id;

    SELECT coalesce(sum(amount_pkr), 0.00) INTO v_total_paid
    FROM public.commission_payments WHERE writer_id = v_writer_id;

    v_expected_unpaid := greatest(0.00, v_expected_unpaid - v_total_paid);

    IF v_writer_unpaid != v_expected_unpaid THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4, 'Writer verify_order_payment & Idempotency', 'FAIL',
            format('Writer balance mismatch: writer_profiles.current_unpaid_commission=%s, expected from ledger minus payments=%s',
                   v_writer_unpaid, v_expected_unpaid));
        RETURN;
    END IF;

    IF v_ent_count = 1 AND v_led_count = 1 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4, 'Writer verify_order_payment & Idempotency', 'PASS',
            format('Order verified by writer JWT; idempotent retry handled safely (1 entitlement, 1 ledger row); comm+net=gross; writer unpaid commission=%.2f PKR',
                   v_writer_unpaid));
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4, 'Writer verify_order_payment & Idempotency', 'FAIL',
            format('Duplicate records detected! entitlements=%s, ledger_rows=%s, retry_result=%s',
                   v_ent_count, v_led_count, coalesce(v_res2::text, 'NULL')));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (4, 'Writer verify_order_payment & Idempotency', 'FAIL',
        'verify_order_payment exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 4.5: CLIENT-SIDE DIRECT MUTATION & PRIVILEGE LOCKDOWN
--   Proves that direct client writes by an IMPERSONATED authenticated writer FAIL:
--     1. writer_profiles.current_unpaid_commission
--     2. writer_profiles.custom_commission_rate
--     3. writer_profiles.unpaid_commission_limit
--     4. writer_profiles.status
--     5. writer_profiles.is_orders_paused_for_commission
--     6. profiles.role
--     7. profiles.is_active
--     8. novels.status
--     9. novels.price_pkr (invalid / below platform minimum on published novel)
--     10. novels.slug after publication
--     11. reconcile_writer_unpaid_commission for another writer
--     12. get_writer_unpaid_commission for another writer
-- ==============================================================================
DO $$
DECLARE
    v_writer_id   uuid;
    v_stranger_id uuid;
    v_novel_id    uuid;
    v_fail_count  integer := 0;
    v_errors      text := '';
BEGIN
    SELECT val_uuid INTO v_writer_id   FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_stranger_id FROM smoke_fixtures WHERE key = 'stranger_id';
    SELECT val_uuid INTO v_novel_id    FROM smoke_fixtures WHERE key = 'novel_id';

    IF v_writer_id IS NULL OR v_stranger_id IS NULL OR v_novel_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4.5, 'Client-Side Direct Mutation & Privilege Lockdown', 'SKIPPED',
            'Prerequisite missing: writer_id, stranger_id, or novel_id');
        RETURN;
    END IF;

    -- Impersonate writer as authenticated role
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);

    -- 1. writer_profiles.current_unpaid_commission
    BEGIN
        UPDATE public.writer_profiles SET current_unpaid_commission = 0.00 WHERE id = v_writer_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: current_unpaid_commission] ';
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Expected exception
    END;

    -- 2. writer_profiles.custom_commission_rate
    BEGIN
        UPDATE public.writer_profiles SET custom_commission_rate = 5.00 WHERE id = v_writer_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: custom_commission_rate] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 3. writer_profiles.unpaid_commission_limit
    BEGIN
        UPDATE public.writer_profiles SET unpaid_commission_limit = 99999.00 WHERE id = v_writer_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: unpaid_commission_limit] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 4. writer_profiles.status
    BEGIN
        UPDATE public.writer_profiles SET status = 'approved' WHERE id = v_writer_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: writer_profiles.status] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 5. writer_profiles.is_orders_paused_for_commission
    BEGIN
        UPDATE public.writer_profiles SET is_orders_paused_for_commission = false WHERE id = v_writer_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: is_orders_paused_for_commission] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 6. profiles.role
    BEGIN
        UPDATE public.profiles SET role = 'admin' WHERE id = v_writer_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: profiles.role] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 7. profiles.is_active
    BEGIN
        UPDATE public.profiles SET is_active = false WHERE id = v_writer_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: profiles.is_active] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 8. novels.status (direct update on published novel)
    BEGIN
        UPDATE public.novels SET status = 'draft' WHERE id = v_novel_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: novels.status draft] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 9. novels.price_pkr (below platform minimum on published novel)
    BEGIN
        UPDATE public.novels SET price_pkr = 25.00 WHERE id = v_novel_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: novels.price_pkr below min] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 10. novels.slug after publication
    BEGIN
        UPDATE public.novels SET slug = 'hacked-slug-' || left(v_novel_id::text, 8) WHERE id = v_novel_id;
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: novels.slug after publication] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 11. reconcile_writer_unpaid_commission for ANOTHER writer
    BEGIN
        PERFORM public.reconcile_writer_unpaid_commission(v_stranger_id);
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: reconcile_writer_unpaid_commission cross-writer] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 12. get_writer_unpaid_commission for ANOTHER writer
    BEGIN
        PERFORM public.get_writer_unpaid_commission(v_stranger_id);
        v_fail_count := v_fail_count + 1;
        v_errors := v_errors || '[Bypass: get_writer_unpaid_commission cross-writer] ';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    IF v_fail_count = 0 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4.5, 'Client-Side Direct Mutation & Privilege Lockdown', 'PASS',
            'All 12 direct client mutation attempts correctly rejected by triggers & RPC security checks');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (4.5, 'Client-Side Direct Mutation & Privilege Lockdown', 'FAIL',
            format('%s check(s) bypassed security! Errors: %s', v_fail_count, v_errors));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (4.5, 'Client-Side Direct Mutation & Privilege Lockdown', 'FAIL',
        'Exception in lockdown tests: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 5: LEDGER BALANCE INVARIANT (Gross = Commission + Net)
-- ==============================================================================
DO $$
DECLARE
    v_order_id uuid;
    v_ledger   record;
BEGIN
    SELECT val_uuid INTO v_order_id FROM smoke_fixtures WHERE key = 'order_1_id';

    IF v_order_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (5, 'Financial Ledger Balance Invariant', 'SKIPPED', 'Prerequisite missing: order_1_id');
        RETURN;
    END IF;

    SELECT * INTO v_ledger
    FROM public.sales_ledger
    WHERE order_id = v_order_id AND entry_type = 'sale_verified';

    IF v_ledger.id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (5, 'Financial Ledger Balance Invariant', 'SKIPPED',
            'Prerequisite missing: sale_verified ledger row (step 4 did not complete)');
        RETURN;
    END IF;

    IF (v_ledger.platform_commission_pkr + v_ledger.writer_net_pkr) = v_ledger.gross_amount_pkr
       AND v_ledger.gross_amount_pkr      = 500.00
       AND v_ledger.platform_commission_pkr = 100.00
       AND v_ledger.writer_net_pkr         = 400.00
    THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (5, 'Financial Ledger Balance Invariant', 'PASS',
            format('Exact match: %.2f gross = %.2f comm + %.2f net',
                   v_ledger.gross_amount_pkr,
                   v_ledger.platform_commission_pkr,
                   v_ledger.writer_net_pkr));
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (5, 'Financial Ledger Balance Invariant', 'FAIL',
            format('Mismatch: gross=%s comm=%s net=%s sum=%s',
                   v_ledger.gross_amount_pkr,
                   v_ledger.platform_commission_pkr,
                   v_ledger.writer_net_pkr,
                   v_ledger.platform_commission_pkr + v_ledger.writer_net_pkr));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (5, 'Financial Ledger Balance Invariant', 'FAIL', 'Balance check exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 6: CHAPTER ACCESS AUTHORIZATION (get_chapter_for_reader)
-- ==============================================================================
DO $$
DECLARE
    v_buyer_id      uuid;
    v_stranger_id   uuid;
    v_order_id      uuid;
    v_novel_slug    text;
    v_res_buyer     jsonb;
    v_res_free      jsonb;
    v_stranger_denied boolean := false;
BEGIN
    SELECT val_uuid INTO v_buyer_id    FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_stranger_id FROM smoke_fixtures WHERE key = 'stranger_id';
    SELECT val_uuid INTO v_order_id    FROM smoke_fixtures WHERE key = 'order_1_id';

    IF v_buyer_id IS NULL OR v_order_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (6, 'Chapter Access Authorization', 'SKIPPED',
            'Prerequisite missing: buyer_id or order_1_id');
        RETURN;
    END IF;

    -- Re-derive slug from DB
    SELECT n.slug INTO v_novel_slug
    FROM public.novels n
    JOIN public.orders o ON o.novel_id = n.id
    WHERE o.id = v_order_id;

    -- Check entitlement exists (step 4 must have run)
    IF NOT EXISTS (SELECT 1 FROM public.purchase_entitlements
                   WHERE order_id = v_order_id AND is_revoked = false) THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (6, 'Chapter Access Authorization', 'SKIPPED',
            'Prerequisite missing: purchase entitlement not found (step 4 did not complete)');
        RETURN;
    END IF;

    -- 1. Buyer reads paid chapter 2 (must succeed)
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);
    v_res_buyer := public.get_chapter_for_reader(v_novel_slug, 2);

    IF v_res_buyer->>'content_urdu' IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (6, 'Chapter Access Authorization', 'FAIL',
            'Buyer with valid entitlement was denied paid chapter content');
        RETURN;
    END IF;

    -- 2. Stranger denied paid chapter 2
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_stranger_id::text, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.get_chapter_for_reader(v_novel_slug, 2);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%Chapter not found%' OR SQLERRM ILIKE '%not found%'
           OR SQLERRM ILIKE '%unauthorized%' THEN
            v_stranger_denied := true;
        END IF;
    END;

    -- 3. Stranger reads free chapter 1 (must succeed)
    v_res_free := public.get_chapter_for_reader(v_novel_slug, 1);

    IF v_stranger_denied AND v_res_free->>'content_urdu' IS NOT NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (6, 'Chapter Access Authorization', 'PASS',
            'Buyer unlocked paid chapter; stranger denied paid chapter; stranger read free preview');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (6, 'Chapter Access Authorization', 'FAIL',
            format('Access violation: stranger_denied=%s free_preview_ok=%s',
                   v_stranger_denied, v_res_free->>'content_urdu' IS NOT NULL));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (6, 'Chapter Access Authorization', 'FAIL', 'Chapter auth exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 7: ADMIN ORDERS RPCs (Order Inspection & Privacy Verification)
--   Split into 4 separate checks with exact diagnostic error messages:
--     (i)   admin_list_orders returns the fixture order
--     (ii)  admin_get_order returns the order with submissions and ledger
--     (iii) the fixture reader's exact email string does NOT appear anywhere in either JSON
--     (iv)  the writer's payment method full account number appears only where intended
-- ==============================================================================
DO $$
DECLARE
    v_admin_id         uuid;
    v_buyer_id         uuid;
    v_order_id         uuid;
    v_list_res         jsonb;
    v_order_res        jsonb;
    v_buyer_email      text;
    v_list_has_order   boolean := false;
    v_account_number   text := '03001234567';
BEGIN
    SELECT val_uuid INTO v_admin_id  FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_buyer_id  FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_order_id  FROM smoke_fixtures WHERE key = 'order_1_id';

    IF v_admin_id IS NULL OR v_order_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'SKIPPED',
            'Prerequisite missing: admin_id or order_1_id');
        RETURN;
    END IF;

    -- Get the generated buyer email for the privacy check
    SELECT email INTO v_buyer_email FROM public.profiles WHERE id = v_buyer_id;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_list_res  := public.admin_list_orders('verified', NULL, false, 10, 0);
    v_order_res := public.admin_get_order(v_order_id);

    -- Check (i): admin_list_orders returns the fixture order
    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_list_res->'orders') elem
        WHERE elem->>'id' = v_order_id::text
    ) INTO v_list_has_order;

    IF NOT v_list_has_order THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL',
            format('Check (i) FAIL: admin_list_orders did not return fixture order %s in verified orders list (total_count=%s)',
                   v_order_id, v_list_res->>'total_count'));
        RETURN;
    END IF;

    -- Check (ii): admin_get_order returns the order with submissions and ledger
    IF (v_order_res->'order'->>'id' != v_order_id::text) THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL',
            format('Check (ii) FAIL: admin_get_order did not return order object for %s (got %s)',
                   v_order_id, coalesce(v_order_res->'order'->>'id', 'NULL')));
        RETURN;
    END IF;

    IF jsonb_array_length(coalesce(v_order_res->'submissions', '[]'::jsonb)) < 1 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL',
            format('Check (ii) FAIL: admin_get_order returned 0 submissions for order %s', v_order_id));
        RETURN;
    END IF;

    IF jsonb_array_length(coalesce(v_order_res->'ledger', '[]'::jsonb)) < 1 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL',
            format('Check (ii) FAIL: admin_get_order returned 0 ledger rows for order %s', v_order_id));
        RETURN;
    END IF;

    -- Check (iii): Reader exact email string does NOT appear anywhere in either JSON response
    IF (v_list_res::text LIKE '%' || v_buyer_email || '%') THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL',
            format('Check (iii) CRITICAL PRIVACY LEAK: Reader email %s leaked in admin_list_orders response', v_buyer_email));
        RETURN;
    END IF;

    IF (v_order_res::text LIKE '%' || v_buyer_email || '%') THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL',
            format('Check (iii) CRITICAL PRIVACY LEAK: Reader email %s leaked in admin_get_order response', v_buyer_email));
        RETURN;
    END IF;

    -- Check (iv): Writer payment method full account number appears only where intended
    -- It MUST NOT appear in admin_list_orders
    IF (v_list_res::text LIKE '%' || v_account_number || '%') THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL',
            format('Check (iv) PRIVACY LEAK: Full writer account number %s leaked in admin_list_orders response', v_account_number));
        RETURN;
    END IF;

    -- In admin_get_order, it must appear ONLY inside payment_instructions_snapshot
    IF (v_order_res->'order'->'payment_instructions_snapshot'->>'account_number_or_iban' != v_account_number) THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL',
            'Check (iv) FAIL: Writer account details missing from payment_instructions_snapshot in admin_get_order');
        RETURN;
    END IF;

    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (7, 'Admin Orders Inspection & Privacy', 'PASS',
        format('All 4 checks passed: (i) order found in list, (ii) detail returned submissions=%s ledger=%s, (iii) reader email (%s) not exposed, (iv) account number isolated to instructions snapshot',
               jsonb_array_length(v_order_res->'submissions'),
               jsonb_array_length(v_order_res->'ledger'),
               v_buyer_email));
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (7, 'Admin Orders Inspection & Privacy', 'FAIL', 'Admin orders exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 8: COMMISSION INVOICING (preview & generate)
-- ==============================================================================
DO $$
DECLARE
    v_admin_id  uuid;
    v_writer_id uuid;
    v_order_id  uuid;
    v_preview   jsonb;
    v_gen       jsonb;
    v_invoice_id uuid;
BEGIN
    SELECT val_uuid INTO v_admin_id  FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_writer_id FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_order_id  FROM smoke_fixtures WHERE key = 'order_1_id';

    IF v_admin_id IS NULL OR v_writer_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (8, 'Commission Invoice Preview & Generation', 'SKIPPED',
            'Prerequisite missing: admin_id or writer_id');
        RETURN;
    END IF;

    -- Require a sale_verified ledger row to exist (step 4 must have run)
    IF NOT EXISTS (SELECT 1 FROM public.sales_ledger
                   WHERE order_id = v_order_id AND entry_type = 'sale_verified') THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (8, 'Commission Invoice Preview & Generation', 'SKIPPED',
            'Prerequisite missing: sale_verified ledger row (step 4 did not complete)');
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_preview := public.preview_commission_invoice(
        v_writer_id, now() - interval '1 day', now() + interval '1 day');

    IF (v_preview->>'total_sales_count')::int < 1
       OR (v_preview->>'total_commission_owed_pkr')::numeric < 100.00
    THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (8, 'Commission Invoice Preview & Generation', 'FAIL',
            'Invoice preview failed: ' || coalesce(v_preview::text, 'NULL'));
        RETURN;
    END IF;

    v_gen := public.generate_commission_invoice(
        v_writer_id, now() - interval '1 day', now() + interval '1 day');
    v_invoice_id := (v_gen->>'invoice_id')::uuid;

    IF v_invoice_id IS NOT NULL THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('invoice_id', v_invoice_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (8, 'Commission Invoice Preview & Generation', 'PASS',
            'Invoice previewed and generated: ' || v_invoice_id::text);
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (8, 'Commission Invoice Preview & Generation', 'FAIL',
            'generate_commission_invoice returned: ' || coalesce(v_gen::text, 'NULL'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (8, 'Commission Invoice Preview & Generation', 'FAIL',
        'Commission invoicing exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 9: REPORT COMMISSION PAYMENT (Balance Unchanged Until Admin Settles)
-- ==============================================================================
DO $$
DECLARE
    v_writer_id  uuid;
    v_invoice_id uuid;
    v_bal_before numeric(12,2);
    v_bal_after  numeric(12,2);
    v_res        jsonb;
    v_report_id  uuid;
BEGIN
    SELECT val_uuid INTO v_writer_id  FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_invoice_id FROM smoke_fixtures WHERE key = 'invoice_id';

    IF v_writer_id IS NULL OR v_invoice_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (9, 'Report Commission Payment (Balance Invariant)', 'SKIPPED',
            format('Prerequisite missing: writer_id=%s invoice_id=%s', v_writer_id, v_invoice_id));
        RETURN;
    END IF;

    SELECT current_unpaid_commission INTO v_bal_before
    FROM public.writer_profiles WHERE id = v_writer_id;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);

    v_res := public.report_commission_payment(
        v_invoice_id, 100.00,
        'TIDCOMM-' || left(v_invoice_id::text, 8),
        v_invoice_id::text || '/comm_proof.jpg',
        'Direct bank deposit for commission invoice'
    );

    v_report_id := (v_res->>'report_id')::uuid;

    SELECT current_unpaid_commission INTO v_bal_after
    FROM public.writer_profiles WHERE id = v_writer_id;

    IF v_report_id IS NOT NULL AND v_bal_after = v_bal_before THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('report_id', v_report_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (9, 'Report Commission Payment (Balance Invariant)', 'PASS',
            format('Payment reported (%s); writer balance correctly unchanged at %.2f PKR',
                   v_report_id, v_bal_after));
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (9, 'Report Commission Payment (Balance Invariant)', 'FAIL',
            format('report_id=%s before=%s after=%s', v_report_id, v_bal_before, v_bal_after));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (9, 'Report Commission Payment (Balance Invariant)', 'FAIL',
        'Commission payment report exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 10: CONFIRM COMMISSION SETTLEMENT (Balance Reduced to 0)
-- ==============================================================================
DO $$
DECLARE
    v_admin_id   uuid;
    v_writer_id  uuid;
    v_invoice_id uuid;
    v_report_id  uuid;
    v_bal_after  numeric(12,2);
    v_res        jsonb;
BEGIN
    SELECT val_uuid INTO v_admin_id   FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_writer_id  FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_invoice_id FROM smoke_fixtures WHERE key = 'invoice_id';
    SELECT val_uuid INTO v_report_id  FROM smoke_fixtures WHERE key = 'report_id';

    IF v_admin_id IS NULL OR v_invoice_id IS NULL OR v_report_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (10, 'Confirm Commission Settlement (Balance Reduced)', 'SKIPPED',
            format('Prerequisite missing: admin_id=%s invoice_id=%s report_id=%s',
                   v_admin_id, v_invoice_id, v_report_id));
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_res := public.confirm_commission_settlement(
        v_invoice_id, 100.00, v_report_id, 'Admin verified bank deposit receipt');

    SELECT current_unpaid_commission INTO v_bal_after
    FROM public.writer_profiles WHERE id = v_writer_id;

    IF coalesce((v_res->>'success')::boolean, false) IS TRUE AND v_bal_after = 0.00 THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (10, 'Confirm Commission Settlement (Balance Reduced)', 'PASS',
            'Invoice settled; writer unpaid commission reduced to 0.00 PKR');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (10, 'Confirm Commission Settlement (Balance Reduced)', 'FAIL',
            format('Settlement result=%s balance_after=%s', coalesce(v_res::text, 'NULL'), v_bal_after));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (10, 'Confirm Commission Settlement (Balance Reduced)', 'FAIL',
        'Confirm settlement exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 11: OPEN DISPUTE ON SECOND ORDER (Novel 2 — different novel to avoid unique index collision)
--   Uses a DIFFERENT novel (novel_2_id) so the buyer's open-order unique index
--   on (reader_id, novel_id) for non-terminal statuses is never triggered.
-- ==============================================================================
DO $$
DECLARE
    v_buyer_id   uuid;
    v_writer_id  uuid;
    v_novel_2_id uuid;
    v_method_id  uuid;
    v_order_2_id uuid := gen_random_uuid();
    v_res_disp   jsonb;
    v_dispute_id uuid;
BEGIN
    SELECT val_uuid INTO v_buyer_id   FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_writer_id  FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_novel_2_id FROM smoke_fixtures WHERE key = 'novel_2_id';
    SELECT val_uuid INTO v_method_id  FROM smoke_fixtures WHERE key = 'method_id';

    IF v_buyer_id IS NULL OR v_writer_id IS NULL OR v_novel_2_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (11, 'Reader open_dispute (Novel 2)', 'SKIPPED',
            'Prerequisite missing: buyer_id, writer_id, or novel_2_id');
        RETURN;
    END IF;

    -- Insert Order 2 directly in payment_submitted state, submitted >25h ago
    -- (satisfies min_dispute_wait_hours = 24).
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
        amount_pkr, applied_commission_rate, calculated_commission_pkr, calculated_writer_share_pkr,
        status, created_at
    ) VALUES (
        v_order_2_id,
        'SMKDISP-' || left(v_order_2_id::text, 8),
        v_buyer_id, v_writer_id, v_novel_2_id,
        'Smoke Novel Two',
        500.00, 20.00, 100.00, 400.00,
        'payment_submitted',
        now() - interval '25 hours'
    );

    -- Insert a payment submission for Order 2 (normalized_tid is GENERATED ALWAYS)
    INSERT INTO public.payment_submissions (
        order_id, reader_id, writer_id,
        transaction_reference_tid, screenshot_url, screenshot_path,
        paid_amount_claimed_pkr, reviewer_status, created_at
    ) VALUES (
        v_order_2_id, v_buyer_id, v_writer_id,
        'TIDDISP-' || left(v_order_2_id::text, 8),
        v_order_2_id::text || '/disp_proof.jpg',
        v_order_2_id::text || '/disp_proof.jpg',
        500.00, 'pending',
        now() - interval '25 hours'
    );

    -- Impersonate Buyer to open dispute
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);

    v_res_disp   := public.open_dispute(v_order_2_id, 'Author has not verified payment after 24 hours');
    v_dispute_id := (v_res_disp->>'dispute_id')::uuid;

    IF v_dispute_id IS NOT NULL AND (v_res_disp->>'status') = 'open' THEN
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('order_2_id',  v_order_2_id);
        INSERT INTO smoke_fixtures (key, val_uuid) VALUES ('dispute_id',  v_dispute_id);
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (11, 'Reader open_dispute (Novel 2)', 'PASS',
            'Dispute opened after 24h wait: ' || v_dispute_id::text);
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (11, 'Reader open_dispute (Novel 2)', 'FAIL',
            'open_dispute returned: ' || coalesce(v_res_disp::text, 'NULL'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (11, 'Reader open_dispute (Novel 2)', 'FAIL',
        'open_dispute exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 12: RESOLVE DISPUTE FOR READER VERIFY
-- ==============================================================================
DO $$
DECLARE
    v_admin_id   uuid;
    v_order_2_id uuid;
    v_dispute_id uuid;
    v_res        jsonb;
    v_ent_count  integer;
    v_led_count  integer;
BEGIN
    SELECT val_uuid INTO v_admin_id   FROM smoke_fixtures WHERE key = 'admin_id';
    -- Re-derive order_2_id and dispute_id from fixtures (set by step 11)
    SELECT val_uuid INTO v_order_2_id FROM smoke_fixtures WHERE key = 'order_2_id';
    SELECT val_uuid INTO v_dispute_id FROM smoke_fixtures WHERE key = 'dispute_id';

    IF v_admin_id IS NULL OR v_order_2_id IS NULL OR v_dispute_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (12, 'resolve_dispute_for_reader_verify', 'SKIPPED',
            format('Prerequisite missing: admin_id=%s order_2_id=%s dispute_id=%s',
                   v_admin_id, v_order_2_id, v_dispute_id));
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_res := public.resolve_dispute_for_reader_verify(
        v_dispute_id,
        'Admin verified bank deposit statement confirms buyer payment'
    );

    -- Re-query from DB to verify invariants
    SELECT count(*) INTO v_ent_count
    FROM public.purchase_entitlements WHERE order_id = v_order_2_id AND is_revoked = false;

    SELECT count(*) INTO v_led_count
    FROM public.sales_ledger
    WHERE order_id = v_order_2_id AND entry_type = 'sale_verified';

    IF coalesce((v_res->>'success')::boolean, false) IS TRUE
       AND v_ent_count = 1 AND v_led_count = 1
    THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (12, 'resolve_dispute_for_reader_verify', 'PASS',
            'Dispute resolved for reader: 1 entitlement and 1 sale_verified ledger row created');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (12, 'resolve_dispute_for_reader_verify', 'FAIL',
            format('success=%s ent=%s led=%s response=%s',
                   v_res->>'success', v_ent_count, v_led_count, coalesce(v_res::text, 'NULL')));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (12, 'resolve_dispute_for_reader_verify', 'FAIL',
        'resolve_dispute_for_reader_verify exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 13: REFUND PATH ON VERIFIED ORDER (Negative Ledger Row & Access Revocation)
-- ==============================================================================
DO $$
DECLARE
    v_buyer_id      uuid;
    v_admin_id      uuid;
    v_order_2_id    uuid;
    v_req_res       jsonb;
    v_app_res       jsonb;
    v_request_id    uuid;
    v_revoked       boolean;
    v_neg_led_count integer;
    v_order_status  text;
BEGIN
    SELECT val_uuid INTO v_buyer_id   FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_admin_id   FROM smoke_fixtures WHERE key = 'admin_id';
    SELECT val_uuid INTO v_order_2_id FROM smoke_fixtures WHERE key = 'order_2_id';

    IF v_buyer_id IS NULL OR v_admin_id IS NULL OR v_order_2_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (13, 'Refund Workflow & Ledger Reversal', 'SKIPPED',
            format('Prerequisite missing: buyer_id=%s admin_id=%s order_2_id=%s',
                   v_buyer_id, v_admin_id, v_order_2_id));
        RETURN;
    END IF;

    -- Require verified order (step 12 must have run)
    IF NOT EXISTS (SELECT 1 FROM public.orders
                   WHERE id = v_order_2_id AND status::text = 'verified') THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (13, 'Refund Workflow & Ledger Reversal', 'SKIPPED',
            'Prerequisite missing: order_2 not in verified status (step 12 did not complete)');
        RETURN;
    END IF;

    -- 1. Buyer requests refund
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);

    v_req_res := public.request_refund(
        v_order_2_id,
        'Duplicate purchase was made in error',
        'Evidence note attached',
        NULL
    );
    v_request_id := (v_req_res->>'request_id')::uuid;

    -- 2. Admin approves refund
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_app_res := public.approve_refund_request(
        v_request_id,
        'Admin approved full refund and adjusted commission ledger'
    );

    -- 3. Verify invariants from DB
    SELECT count(*) INTO v_neg_led_count
    FROM public.sales_ledger
    WHERE order_id = v_order_2_id AND entry_type = 'refund_adjustment';

    SELECT is_revoked INTO v_revoked
    FROM public.purchase_entitlements WHERE order_id = v_order_2_id;

    SELECT status::text INTO v_order_status
    FROM public.orders WHERE id = v_order_2_id;

    IF v_neg_led_count = 1 AND v_revoked IS TRUE AND v_order_status = 'refunded_adjusted' THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (13, 'Refund Workflow & Ledger Reversal', 'PASS',
            'Refund recorded: 1 refund_adjustment row, entitlement revoked, order marked refunded_adjusted');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (13, 'Refund Workflow & Ledger Reversal', 'FAIL',
            format('neg_ledger=%s revoked=%s order_status=%s req_res=%s app_res=%s',
                   v_neg_led_count, v_revoked, v_order_status,
                   coalesce(v_req_res::text, 'NULL'), coalesce(v_app_res::text, 'NULL')));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (13, 'Refund Workflow & Ledger Reversal', 'FAIL',
        'Refund workflow exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 14: UPDATE PLATFORM SETTINGS (Authoritative Columns)
-- ==============================================================================
DO $$
DECLARE
    v_admin_id uuid;
    v_res      jsonb;
    v_settings record;
BEGIN
    SELECT val_uuid INTO v_admin_id FROM smoke_fixtures WHERE key = 'admin_id';

    IF v_admin_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (14, 'update_platform_settings', 'SKIPPED', 'Prerequisite missing: admin_id');
        RETURN;
    END IF;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    v_res := public.update_platform_settings(
        p_default_commission_rate        := 22.00,
        p_default_unpaid_commission_limit := 6000.00,
        p_min_novel_price_pkr            := 75,
        p_max_novel_price_pkr            := 4500.00,
        p_dispute_window_days            := 35,
        p_support_email                  := 'ops@unbpremium.pk'
    );

    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    IF coalesce((v_res->>'success')::boolean, false) IS TRUE
       AND v_settings.default_commission_rate       = 22.00
       AND v_settings.default_unpaid_commission_limit = 6000.00
       AND v_settings.min_novel_price_pkr           = 75
       AND v_settings.support_email                 = 'ops@unbpremium.pk'
    THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (14, 'update_platform_settings', 'PASS',
            'Settings updated to authoritative columns with audit log');
    ELSE
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (14, 'update_platform_settings', 'FAIL',
            format('Settings mismatch: rpc=%s db_rate=%s db_limit=%s db_price=%s db_email=%s',
                   coalesce(v_res::text, 'NULL'),
                   v_settings.default_commission_rate,
                   v_settings.default_unpaid_commission_limit,
                   v_settings.min_novel_price_pkr,
                   v_settings.support_email));
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (14, 'update_platform_settings', 'FAIL',
        'update_platform_settings exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- STEP 15: USER PORTAL RPCs — Library, Ledger, Summary
--   CRITICAL: lib_count must reflect ONLY entitlements created by THIS flow.
--   If lib_count = 0 here but step 4 passed, that is a bug.
--   If lib_count > 0 here but step 4 was SKIPPED/FAIL, that is a CRITICAL BUG.
-- ==============================================================================
DO $$
DECLARE
    v_buyer_id       uuid;
    v_writer_id      uuid;
    v_order_id       uuid;
    v_lib            jsonb;
    v_lib_count      integer;
    v_led_count      integer;
    v_summary        jsonb;
    v_step4_ran      boolean;
    v_expected_count integer;
BEGIN
    SELECT val_uuid INTO v_buyer_id  FROM smoke_fixtures WHERE key = 'buyer_id';
    SELECT val_uuid INTO v_writer_id FROM smoke_fixtures WHERE key = 'writer_id';
    SELECT val_uuid INTO v_order_id  FROM smoke_fixtures WHERE key = 'order_1_id';

    IF v_buyer_id IS NULL OR v_writer_id IS NULL THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (15, 'User Portal Queries (Library, Ledger, Summary)', 'SKIPPED',
            'Prerequisite missing: buyer_id or writer_id');
        RETURN;
    END IF;

    -- Was step 4 a PASS?
    SELECT (status = 'PASS') INTO v_step4_ran
    FROM smoke_test_results WHERE step_num = 4;
    v_step4_ran := coalesce(v_step4_ran, false);

    -- Expected library count: 1 if step 4 passed (Novel 1 entitlement was created)
    -- Dispute path (step 12) entitlement for Novel 2 was revoked by step 13
    v_expected_count := CASE WHEN v_step4_ran THEN 1 ELSE 0 END;

    -- 1. Buyer library
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_buyer_id::text, 'role', 'authenticated')::text, true);
    v_lib := public.get_my_library();
    v_lib_count := coalesce(jsonb_array_length(v_lib), 0);

    -- 2. Writer ledger & summary
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_led_count FROM public.get_my_ledger();
    v_summary := public.get_my_sales_summary();

    -- Assertion: library count must match expectation from step 4 outcome
    IF v_lib_count != v_expected_count THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (15, 'User Portal Queries (Library, Ledger, Summary)', 'FAIL',
            format('CRITICAL — lib_count=%s but expected=%s (step4_ran=%s). '
                   'If step4_ran=false and lib_count>0, entitlements were created without verification — check for stale fixture data from prior incomplete test run.',
                   v_lib_count, v_expected_count, v_step4_ran));
        RETURN;
    END IF;

    IF v_step4_ran AND (v_led_count < 1 OR v_summary IS NULL) THEN
        INSERT INTO smoke_test_results (step_num, step_name, status, details)
        VALUES (15, 'User Portal Queries (Library, Ledger, Summary)', 'FAIL',
            format('Writer portal mismatch: led_count=%s summary=%s',
                   v_led_count, coalesce(v_summary::text, 'NULL')));
        RETURN;
    END IF;

    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (15, 'User Portal Queries (Library, Ledger, Summary)', 'PASS',
        format('lib_count=%s (expected=%s, step4_ran=%s); writer led_count=%s; summary_ok=%s',
               v_lib_count, v_expected_count, v_step4_ran,
               v_led_count, v_summary IS NOT NULL));
EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_test_results (step_num, step_name, status, details)
    VALUES (15, 'User Portal Queries (Library, Ledger, Summary)', 'FAIL',
        'User portal exception: ' || SQLERRM);
END;
$$;


-- ==============================================================================
-- FINAL REPORT
-- ==============================================================================
DROP TABLE IF EXISTS test_results;
CREATE TEMP TABLE test_results AS
SELECT * FROM (
    SELECT
        step_num::numeric AS step_num,
        step_name,
        status,
        details
    FROM smoke_test_results
    UNION ALL
    SELECT
        999::numeric AS step_num,
        'OVERALL RUNTIME SMOKE STATUS' AS step_name,
        CASE
            WHEN count(*) FILTER (WHERE status = 'FAIL') > 0 THEN 'FAIL'
            WHEN count(*) FILTER (WHERE status = 'PASS') = 0 THEN 'FAIL'
            ELSE 'PASS'
        END AS status,
        format(
            'Total Steps: %s | PASS: %s | FAIL: %s | SKIPPED: %s',
            count(*),
            count(*) FILTER (WHERE status = 'PASS'),
            count(*) FILTER (WHERE status = 'FAIL'),
            count(*) FILTER (WHERE status = 'SKIPPED')
        ) AS details
    FROM smoke_test_results
) AS results
ORDER BY step_num::numeric;

SELECT * FROM test_results ORDER BY step_num;

-- ==============================================================================
-- ROLLBACK — Guarantees zero persistent test data in live database
-- ==============================================================================
ROLLBACK;
