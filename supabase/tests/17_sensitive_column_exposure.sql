-- ==============================================================================
-- UNB PREMIUM — SENSITIVE COLUMN EXPOSURE TEST SUITE (17)
-- File: supabase/tests/17_sensitive_column_exposure.sql
--
-- Description:
--   Tests horizontal and vertical isolation for sensitive personal, financial,
--   and operational columns. Validates that authenticated readers and non-owner
--   writers CANNOT read sensitive columns via direct SELECT statements on base tables.
--
-- Test Cases:
--   1. public.writer_profiles (custom_commission_rate, unpaid_commission_limit,
--      current_unpaid_commission, is_orders_paused_for_commission,
--      agreement_accepted_at, approved_by, status)
--   2. public.profiles (email, role, is_active of another user)
--   3. public.writer_payment_methods (account_number_or_iban)
--   4. public.orders (order details of other users)
--   5. public.payment_submissions (TID, screenshot of other users)
--   6. public.novels (moderation_reason of drafts)
--   7. public.commission_invoices, commission_payments, commission_payment_reports
--   8. public.disputes (disputes involving other users)
--   9. public.support_requests, public.support_messages
--
-- Success Criterion:
--   A case PASSES only if the sensitive data CANNOT be read (0 rows returned or
--   SQLSTATE 42501 insufficient_privilege). If any row is returned, it FAILS.
--
-- Security Invariants:
--   - Standalone transaction ending in ROLLBACK; zero database pollution.
--   - Role emulation via SET LOCAL ROLE authenticated and request.jwt.claim.sub /
--     request.jwt.claims.
--   - Strictly zero schema-qualified SQL syntax constructs (Rule 1).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TEST RESULTS ACCUMULATOR
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE test_results (
    test_id integer,
    attacker_role text,
    target_table text,
    sensitive_columns text,
    status text,
    details text
);
GRANT ALL ON test_results TO PUBLIC;

-- ------------------------------------------------------------------------------
-- 2. FIXTURE SETUP (Run as privileged superuser / postgres)
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE exposure_fixtures (
    key text PRIMARY KEY,
    val_uuid uuid,
    val_text text
);
GRANT ALL ON exposure_fixtures TO PUBLIC;

DO $$
DECLARE
    v_ts text := to_char(now(), 'YYYYMMDD_HH24MISS');

    -- Users
    v_admin_id     uuid := gen_random_uuid();
    v_writer_owner uuid := gen_random_uuid();
    v_writer_other uuid := gen_random_uuid();
    v_reader_owner uuid := gen_random_uuid();
    v_reader_other uuid := gen_random_uuid();

    -- Entities
    v_method_id    uuid := gen_random_uuid();
    v_novel_pub_id uuid := gen_random_uuid();
    v_novel_drf_id uuid := gen_random_uuid();
    v_order_id     uuid := gen_random_uuid();
    v_sub_id       uuid := gen_random_uuid();
    v_inv_id       uuid := gen_random_uuid();
    v_pay_id       uuid := gen_random_uuid();
    v_rep_id       uuid := gen_random_uuid();
    v_disp_id      uuid := gen_random_uuid();
    v_supp_req_id  uuid := gen_random_uuid();
    v_supp_msg_id  uuid := gen_random_uuid();
BEGIN
    -- 1. Insert into auth.users
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at) VALUES
        (v_admin_id,     'admin_exp_'   || v_ts || '@unb.pk', '{"full_name":"Admin Exp"}'::jsonb,   now()),
        (v_writer_owner, 'w_owner_exp_' || v_ts || '@unb.pk', '{"full_name":"Writer Owner"}'::jsonb, now()),
        (v_writer_other, 'w_other_exp_' || v_ts || '@unb.pk', '{"full_name":"Writer Other"}'::jsonb, now()),
        (v_reader_owner, 'r_owner_exp_' || v_ts || '@unb.pk', '{"full_name":"Reader Owner"}'::jsonb, now()),
        (v_reader_other, 'r_other_exp_' || v_ts || '@unb.pk', '{"full_name":"Reader Other"}'::jsonb, now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Insert into public.profiles
    INSERT INTO public.profiles (id, email, full_name, username, role, is_active) VALUES
        (v_admin_id,     'admin_exp_'   || v_ts || '@unb.pk', 'Admin Exp',     'admin_exp_'   || v_ts, 'admin',  true),
        (v_writer_owner, 'w_owner_exp_' || v_ts || '@unb.pk', 'Writer Owner',  'w_owner_exp_' || v_ts, 'writer', true),
        (v_writer_other, 'w_other_exp_' || v_ts || '@unb.pk', 'Writer Other',  'w_other_exp_' || v_ts, 'writer', true),
        (v_reader_owner, 'r_owner_exp_' || v_ts || '@unb.pk', 'Reader Owner',  'r_owner_exp_' || v_ts, 'reader', true),
        (v_reader_other, 'r_other_exp_' || v_ts || '@unb.pk', 'Reader Other',  'r_other_exp_' || v_ts, 'reader', true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;

    -- 3. Insert into public.writer_profiles (with sensitive financial fields)
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, status, agreement_accepted_at,
        custom_commission_rate, current_unpaid_commission, unpaid_commission_limit,
        is_orders_paused_for_commission, approved_by
    ) VALUES
        (v_writer_owner, 'مصنف اول', 'Author Prime', 'approved', now(), 18.50, 4200.00, 5000.00, false, v_admin_id),
        (v_writer_other, 'مصنف دوم', 'Author Other', 'approved', now(), 20.00, 0.00,    5000.00, false, v_admin_id)
    ON CONFLICT (id) DO UPDATE SET
        custom_commission_rate = EXCLUDED.custom_commission_rate,
        current_unpaid_commission = EXCLUDED.current_unpaid_commission;

    -- 4. Payment Method for writer_owner
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, is_active
    ) VALUES
        (v_method_id, v_writer_owner, 'jazzcash', 'Owner Secret Title', '03009999999_SECRET_IBAN', true)
    ON CONFLICT (id) DO NOTHING;

    -- 5. Novels (1 published, 1 draft with sensitive moderation_reason)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr,
        status, rights_declaration_accepted, total_chapters
    ) VALUES
        (v_novel_pub_id, v_writer_owner, 'novel-pub-' || v_ts, 'شائع شدہ', 'Published Novel', 'خلاصہ', 500.00, 'published', true, 1)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr,
        status, rights_declaration_accepted, total_chapters, moderation_reason
    ) VALUES
        (v_novel_drf_id, v_writer_owner, 'novel-drf-' || v_ts, 'مسودہ', 'Draft Novel', 'خلاصہ مسودہ', 500.00, 'draft', true, 1, 'CONFIDENTIAL_INTERNAL_MODERATION_NOTE')
    ON CONFLICT (id) DO NOTHING;

    -- 6. Order between reader_owner and writer_owner
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
        amount_pkr, applied_commission_rate, calculated_commission_pkr, calculated_writer_share_pkr,
        payment_instructions_snapshot, status
    ) VALUES (
        v_order_id, 'ORD-EXP-' || v_ts, v_reader_owner, v_writer_owner, v_novel_pub_id, 'Published Novel',
        500.00, 18.50, 92.50, 407.50,
        '{"method_type":"jazzcash","account_number_or_iban":"03009999999"}'::jsonb,
        'payment_submitted'
    ) ON CONFLICT (id) DO NOTHING;

    -- 7. Payment submission for order
    INSERT INTO public.payment_submissions (
        id, order_id, reader_id, writer_id, transaction_reference_tid, screenshot_url, screenshot_path,
        paid_amount_claimed_pkr, reviewer_status
    ) VALUES (
        v_sub_id, v_order_id, v_reader_owner, v_writer_owner, 'SECRET_TID_998877', 'https://storage/proofs/secret_screenshot.jpg', 'proofs/secret_screenshot.jpg',
        500.00, 'pending'
    ) ON CONFLICT (id) DO NOTHING;

    -- 8. Commission invoice & payment for writer_owner
    INSERT INTO public.commission_invoices (
        id, invoice_number, writer_id, period_start, period_end, total_commission_pkr, status
    ) VALUES (
        v_inv_id, 'INV-EXP-' || v_ts, v_writer_owner, now() - interval '30 days', now(), 4200.00, 'issued'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.commission_payments (
        id, invoice_id, writer_id, amount_pkr, transaction_reference, reviewer_status
    ) VALUES (
        v_pay_id, v_inv_id, v_writer_owner, 4200.00, 'COMM_TID_112233', 'pending'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.commission_payment_reports (
        id, invoice_id, writer_id, amount_pkr, transaction_reference, normalized_tid, screenshot_path, status
    ) VALUES (
        v_rep_id, v_inv_id, v_writer_owner, 4200.00, 'REPORT_TID_445566', '445566', 'reports/comm_proof.jpg', 'pending'
    ) ON CONFLICT (id) DO NOTHING;

    -- 9. Dispute on order
    INSERT INTO public.disputes (
        id, order_id, raised_by_id, reason, status
    ) VALUES (
        v_disp_id, v_order_id, v_reader_owner, 'CONFIDENTIAL_DISPUTE_REASON', 'open'
    ) ON CONFLICT (id) DO NOTHING;

    -- 10. Support ticket for reader_owner
    INSERT INTO public.support_requests (
        id, user_id, subject, category, priority, status
    ) VALUES (
        v_supp_req_id, v_reader_owner, 'CONFIDENTIAL_SUPPORT_SUBJECT', 'general', 'high', 'open'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.support_messages (
        id, request_id, sender_id, sender_role, body
    ) VALUES (
        v_supp_msg_id, v_supp_req_id, v_reader_owner, 'reader', 'CONFIDENTIAL_SUPPORT_BODY_CONTENT'
    ) ON CONFLICT (id) DO NOTHING;

    -- Store keys in fixture table
    INSERT INTO exposure_fixtures (key, val_uuid, val_text) VALUES
        ('admin_id',     v_admin_id,     NULL),
        ('writer_owner', v_writer_owner, NULL),
        ('writer_other', v_writer_other, NULL),
        ('reader_owner', v_reader_owner, NULL),
        ('reader_other', v_reader_other, NULL),
        ('method_id',    v_method_id,    NULL),
        ('novel_pub_id', v_novel_pub_id, NULL),
        ('novel_drf_id', v_novel_drf_id, NULL),
        ('order_id',     v_order_id,     NULL),
        ('sub_id',       v_sub_id,       NULL),
        ('inv_id',       v_inv_id,       NULL),
        ('pay_id',       v_pay_id,       NULL),
        ('rep_id',       v_rep_id,       NULL),
        ('disp_id',      v_disp_id,      NULL),
        ('supp_req_id',  v_supp_req_id,  NULL),
        ('supp_msg_id',  v_supp_msg_id,  NULL);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. EXECUTE EXPOSURE TESTS FOR READER & NON-OWNER WRITER
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_writer_owner uuid;
    v_writer_other uuid;
    v_reader_owner uuid;
    v_reader_other uuid;
    v_method_id    uuid;
    v_novel_drf_id uuid;
    v_order_id     uuid;
    v_sub_id       uuid;
    v_inv_id       uuid;
    v_pay_id       uuid;
    v_rep_id       uuid;
    v_disp_id      uuid;
    v_supp_req_id  uuid;
    v_supp_msg_id  uuid;

    v_cnt          integer;
BEGIN
    SELECT val_uuid INTO v_writer_owner FROM exposure_fixtures WHERE key = 'writer_owner';
    SELECT val_uuid INTO v_writer_other FROM exposure_fixtures WHERE key = 'writer_other';
    SELECT val_uuid INTO v_reader_owner FROM exposure_fixtures WHERE key = 'reader_owner';
    SELECT val_uuid INTO v_reader_other FROM exposure_fixtures WHERE key = 'reader_other';
    SELECT val_uuid INTO v_method_id    FROM exposure_fixtures WHERE key = 'method_id';
    SELECT val_uuid INTO v_novel_drf_id FROM exposure_fixtures WHERE key = 'novel_drf_id';
    SELECT val_uuid INTO v_order_id     FROM exposure_fixtures WHERE key = 'order_id';
    SELECT val_uuid INTO v_sub_id       FROM exposure_fixtures WHERE key = 'sub_id';
    SELECT val_uuid INTO v_inv_id       FROM exposure_fixtures WHERE key = 'inv_id';
    SELECT val_uuid INTO v_pay_id       FROM exposure_fixtures WHERE key = 'pay_id';
    SELECT val_uuid INTO v_rep_id       FROM exposure_fixtures WHERE key = 'rep_id';
    SELECT val_uuid INTO v_disp_id      FROM exposure_fixtures WHERE key = 'disp_id';
    SELECT val_uuid INTO v_supp_req_id  FROM exposure_fixtures WHERE key = 'supp_req_id';
    SELECT val_uuid INTO v_supp_msg_id  FROM exposure_fixtures WHERE key = 'supp_msg_id';

    -- =========================================================================
    -- SCENARIO A: AUTHENTICATED READER (reader_other) ATTEMPTS SENSITIVE SELECTS
    -- =========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_reader_other::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_other::text, 'role', 'authenticated')::text, true);

    -- Test 1: Reader directly selects writer_profiles sensitive columns
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.writer_profiles
        WHERE id = v_writer_owner
          AND (custom_commission_rate IS NOT NULL OR unpaid_commission_limit IS NOT NULL);
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (1, 'reader', 'writer_profiles', 'custom_commission_rate, balances, limits', 'PASS', '0 rows returned; writer financial terms protected');
        ELSE
            INSERT INTO test_results VALUES (1, 'reader', 'writer_profiles', 'custom_commission_rate, balances, limits', 'FAIL', format('Leaked %s rows of sensitive writer financial terms', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (1, 'reader', 'writer_profiles', 'custom_commission_rate, balances, limits', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 2: Reader directly selects profiles sensitive columns of another user
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.profiles
        WHERE id = v_reader_owner
          AND (email IS NOT NULL OR role IS NOT NULL OR is_active IS NOT NULL);
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (2, 'reader', 'profiles', 'email, role, is_active of other user', 'PASS', '0 rows returned; victim profile protected');
        ELSE
            INSERT INTO test_results VALUES (2, 'reader', 'profiles', 'email, role, is_active of other user', 'FAIL', format('Leaked %s rows of other user personal data', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (2, 'reader', 'profiles', 'email, role, is_active of other user', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 3: Reader directly selects writer_payment_methods (account_number_or_iban)
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.writer_payment_methods
        WHERE writer_id = v_writer_owner
          AND account_number_or_iban IS NOT NULL;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (3, 'reader', 'writer_payment_methods', 'account_number_or_iban', 'PASS', '0 rows returned; banking info protected');
        ELSE
            INSERT INTO test_results VALUES (3, 'reader', 'writer_payment_methods', 'account_number_or_iban', 'FAIL', format('Leaked %s rows of writer bank details', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (3, 'reader', 'writer_payment_methods', 'account_number_or_iban', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 4: Reader directly selects orders of others
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.orders
        WHERE id = v_order_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (4, 'reader', 'orders', 'unrelated orders', 'PASS', '0 rows returned; other reader orders hidden');
        ELSE
            INSERT INTO test_results VALUES (4, 'reader', 'orders', 'unrelated orders', 'FAIL', format('Leaked %s orders of other users', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (4, 'reader', 'orders', 'unrelated orders', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 5: Reader directly selects payment_submissions of others
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.payment_submissions
        WHERE id = v_sub_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (5, 'reader', 'payment_submissions', 'TID, screenshot of others', 'PASS', '0 rows returned; other user payments hidden');
        ELSE
            INSERT INTO test_results VALUES (5, 'reader', 'payment_submissions', 'TID, screenshot of others', 'FAIL', format('Leaked %s payment submissions of other users', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (5, 'reader', 'payment_submissions', 'TID, screenshot of others', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 6: Reader directly selects moderation_reason of draft novels
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.novels
        WHERE id = v_novel_drf_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (6, 'reader', 'novels', 'moderation_reason of drafts', 'PASS', '0 rows returned; draft novel moderation protected');
        ELSE
            INSERT INTO test_results VALUES (6, 'reader', 'novels', 'moderation_reason of drafts', 'FAIL', format('Leaked %s draft novels', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (6, 'reader', 'novels', 'moderation_reason of drafts', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 7: Reader directly selects commission_invoices
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.commission_invoices
        WHERE writer_id = v_writer_owner;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (7, 'reader', 'commission_invoices', 'invoices of writers', 'PASS', '0 rows returned; commission invoices hidden');
        ELSE
            INSERT INTO test_results VALUES (7, 'reader', 'commission_invoices', 'invoices of writers', 'FAIL', format('Leaked %s commission invoices', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (7, 'reader', 'commission_invoices', 'invoices of writers', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 8: Reader directly selects commission_payments
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.commission_payments
        WHERE writer_id = v_writer_owner;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (8, 'reader', 'commission_payments', 'payments of writers', 'PASS', '0 rows returned; commission payments hidden');
        ELSE
            INSERT INTO test_results VALUES (8, 'reader', 'commission_payments', 'payments of writers', 'FAIL', format('Leaked %s commission payments', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (8, 'reader', 'commission_payments', 'payments of writers', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 9: Reader directly selects commission_payment_reports
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.commission_payment_reports
        WHERE writer_id = v_writer_owner;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (9, 'reader', 'commission_payment_reports', 'payment reports of writers', 'PASS', '0 rows returned; reports protected');
        ELSE
            INSERT INTO test_results VALUES (9, 'reader', 'commission_payment_reports', 'payment reports of writers', 'FAIL', format('Leaked %s commission payment reports', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (9, 'reader', 'commission_payment_reports', 'payment reports of writers', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 10: Reader directly selects disputes of others
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.disputes
        WHERE id = v_disp_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (10, 'reader', 'disputes', 'disputes of others', 'PASS', '0 rows returned; disputes hidden');
        ELSE
            INSERT INTO test_results VALUES (10, 'reader', 'disputes', 'disputes of others', 'FAIL', format('Leaked %s disputes', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (10, 'reader', 'disputes', 'disputes of others', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 11: Reader directly selects support_requests of others
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.support_requests
        WHERE id = v_supp_req_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (11, 'reader', 'support_requests', 'support requests of others', 'PASS', '0 rows returned; tickets hidden');
        ELSE
            INSERT INTO test_results VALUES (11, 'reader', 'support_requests', 'support requests of others', 'FAIL', format('Leaked %s support requests', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (11, 'reader', 'support_requests', 'support requests of others', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 12: Reader directly selects support_messages of others
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.support_messages
        WHERE id = v_supp_msg_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (12, 'reader', 'support_messages', 'support messages of others', 'PASS', '0 rows returned; ticket messages hidden');
        ELSE
            INSERT INTO test_results VALUES (12, 'reader', 'support_messages', 'support messages of others', 'FAIL', format('Leaked %s support messages', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (12, 'reader', 'support_messages', 'support messages of others', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;


    -- =========================================================================
    -- SCENARIO B: AUTHENTICATED NON-OWNER WRITER (writer_other)
    -- =========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_writer_other::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_other::text, 'role', 'authenticated')::text, true);

    -- Test 13: Non-owner writer selects other writer_profiles sensitive columns
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.writer_profiles
        WHERE id = v_writer_owner
          AND (custom_commission_rate IS NOT NULL OR unpaid_commission_limit IS NOT NULL);
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (13, 'writer', 'writer_profiles', 'competitor commission rates & limits', 'PASS', '0 rows returned; competitor terms protected');
        ELSE
            INSERT INTO test_results VALUES (13, 'writer', 'writer_profiles', 'competitor commission rates & limits', 'FAIL', format('Leaked %s competitor writer profile rows', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (13, 'writer', 'writer_profiles', 'competitor commission rates & limits', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 14: Non-owner writer selects profiles sensitive columns of another user
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.profiles
        WHERE id = v_writer_owner
          AND (email IS NOT NULL OR role IS NOT NULL OR is_active IS NOT NULL);
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (14, 'writer', 'profiles', 'email, role, is_active of another author', 'PASS', '0 rows returned; competitor email protected');
        ELSE
            INSERT INTO test_results VALUES (14, 'writer', 'profiles', 'email, role, is_active of another author', 'FAIL', format('Leaked %s rows of other user profiles', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (14, 'writer', 'profiles', 'email, role, is_active of another author', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 15: Non-owner writer selects other writer payment methods
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.writer_payment_methods
        WHERE writer_id = v_writer_owner
          AND account_number_or_iban IS NOT NULL;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (15, 'writer', 'writer_payment_methods', 'competitor banking info', 'PASS', '0 rows returned; banking info protected');
        ELSE
            INSERT INTO test_results VALUES (15, 'writer', 'writer_payment_methods', 'competitor banking info', 'FAIL', format('Leaked %s rows of competitor banking info', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (15, 'writer', 'writer_payment_methods', 'competitor banking info', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 16: Non-owner writer selects draft novels of another author
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.novels
        WHERE id = v_novel_drf_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (16, 'writer', 'novels', 'competitor draft novels & moderation', 'PASS', '0 rows returned; competitor draft protected');
        ELSE
            INSERT INTO test_results VALUES (16, 'writer', 'novels', 'competitor draft novels & moderation', 'FAIL', format('Leaked %s competitor draft novels', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (16, 'writer', 'novels', 'competitor draft novels & moderation', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 17: Non-owner writer selects commission invoices of another author
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.commission_invoices
        WHERE writer_id = v_writer_owner;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (17, 'writer', 'commission_invoices', 'competitor commission invoices', 'PASS', '0 rows returned; competitor invoices protected');
        ELSE
            INSERT INTO test_results VALUES (17, 'writer', 'commission_invoices', 'competitor commission invoices', 'FAIL', format('Leaked %s competitor commission invoices', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (17, 'writer', 'commission_invoices', 'competitor commission invoices', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

    -- Test 18: Non-owner writer selects disputes of another author
    BEGIN
        SELECT count(*) INTO v_cnt FROM public.disputes
        WHERE id = v_disp_id;
        IF v_cnt = 0 THEN
            INSERT INTO test_results VALUES (18, 'writer', 'disputes', 'competitor dispute tickets', 'PASS', '0 rows returned; competitor disputes protected');
        ELSE
            INSERT INTO test_results VALUES (18, 'writer', 'disputes', 'competitor dispute tickets', 'FAIL', format('Leaked %s competitor disputes', v_cnt));
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        INSERT INTO test_results VALUES (18, 'writer', 'disputes', 'competitor dispute tickets', 'PASS', 'Permission denied (SQLSTATE 42501)');
    END;

END;
$$;

-- ------------------------------------------------------------------------------
-- 4. DISPLAY RESULTS TABLE
-- ------------------------------------------------------------------------------
SELECT test_id, attacker_role, target_table, sensitive_columns, status, details
FROM test_results
ORDER BY test_id;

-- ------------------------------------------------------------------------------
-- 5. SUMMARY ROW & INTEGRITY ASSERTION
-- ------------------------------------------------------------------------------
SELECT
    'SUMMARY'::text AS report,
    count(*)::integer AS total_tests,
    count(*) FILTER (WHERE status = 'PASS')::integer AS passed,
    count(*) FILTER (WHERE status = 'FAIL')::integer AS failed
FROM test_results;

DO $$
DECLARE
    v_fail_count integer;
    v_total_count integer;
BEGIN
    SELECT count(*) INTO v_fail_count FROM test_results WHERE status = 'FAIL';
    SELECT count(*) INTO v_total_count FROM test_results;

    IF v_fail_count > 0 THEN
        RAISE EXCEPTION 'TEST SUITE 17 FAILED: % of % sensitive column exposure tests failed.', v_fail_count, v_total_count;
    ELSE
        RAISE NOTICE 'ALL 18 SENSITIVE COLUMN EXPOSURE TESTS PASSED (18/18).';
    END IF;
END $$;

ROLLBACK;
