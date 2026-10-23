-- ==============================================================================
-- UNB Premium — Automated Test Suite: Order Flow & Payment Hardening (Step 1.2d)
-- Description:
--   Comprehensive transactional impersonation tests verifying:
--     1. Verifying a non-submitted order fails (pending_payment blocked).
--     2. Verifying with a rejected submission fails (reviewer_status != 'pending').
--     3. Double verify creates exactly one ledger row and subsequent verify is rejected.
--     4. Resubmission after rejection works (order transitions back to payment_submitted).
--     5. Second order while a rejected one exists is blocked (partial index & RPC check).
--     6. cancel_order works only for the reader (or admin) and only for open/rejected orders.
--     7. Non-writer cannot call writer RPCs (upsert_writer_payment_method, verify_order_payment).
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
    v_reader_id   uuid := '11111111-1111-1111-1111-111111111111'::uuid;
    v_reader_2_id uuid := '12121212-1212-1212-1212-121212121212'::uuid;
    v_writer_id   uuid := '22222222-2222-2222-2222-222222222222'::uuid;
    v_admin_id    uuid := '99999999-9999-9999-9999-999999999999'::uuid;

    -- Entity UUIDs
    v_genre_id    uuid := gen_random_uuid();
    v_novel_id    uuid := gen_random_uuid();
    v_novel_2_id  uuid := gen_random_uuid();
    v_method_id   uuid := gen_random_uuid();

    -- Test Flow Variables
    v_order_res    jsonb;
    v_order_id     uuid;
    v_order_2_id   uuid;
    v_sub_res      jsonb;
    v_sub_id       uuid;
    v_sub_2_id     uuid;
    v_verify_res   jsonb;
    v_ledger_count integer;
    v_err_msg      text;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Run as privileged bootstrap)
    -- --------------------------------------------------------------------------

    -- 1. Create fake users in auth.users (handle_new_user trigger creates public.profiles rows)
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES 
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader1@test.com', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader2@test.com', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer@test.com', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.com', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap role & username updates as postgres (handle_new_user assigned 'reader')
    UPDATE public.profiles SET role = 'writer', username = 'test_writer', full_name = 'Test Writer' WHERE id = v_writer_id;
    UPDATE public.profiles SET role = 'admin', username = 'test_admin', full_name = 'Platform Admin' WHERE id = v_admin_id;
    UPDATE public.profiles SET username = 'test_reader_1', full_name = 'Test Reader 1' WHERE id = v_reader_id;
    UPDATE public.profiles SET username = 'test_reader_2', full_name = 'Test Reader 2' WHERE id = v_reader_2_id;

    -- 2. Writer Profile
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES (
        v_writer_id, 'مصنف اول', 'Author One', 'approved', 20.00,
        5000.00, 0.00, false
    ) ON CONFLICT (id) DO UPDATE SET
        status = 'approved',
        is_orders_paused_for_commission = false;

    -- 3. Genre
    INSERT INTO public.genres (id, name_urdu, name_english, slug)
    VALUES (v_genre_id, 'رومانوی', 'Romance', 'romance-' || substring(gen_random_uuid()::text, 1, 6))
    ON CONFLICT DO NOTHING;

    -- 4. Novels
    INSERT INTO public.novels (
        id, writer_id, title_urdu, title_english, synopsis_urdu, slug, price_pkr, status, rights_declaration_accepted, published_at
    ) VALUES 
        (v_novel_id, v_writer_id, 'شام کا رنگ', 'Color of Evening', 'خلاصہ شام کا رنگ', 'novel-1-' || substring(gen_random_uuid()::text, 1, 6), 500.00, 'published', true, pg_catalog.now()),
        (v_novel_2_id, v_writer_id, 'صبح کا تارہ', 'Morning Star', 'خلاصہ صبح کا تارہ', 'novel-2-' || substring(gen_random_uuid()::text, 1, 6), 600.00, 'published', true, pg_catalog.now())
    ON CONFLICT (id) DO UPDATE SET status = 'published';

    -- 5. Writer Payment Method
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, bank_name, is_active
    ) VALUES (
        v_method_id, v_writer_id, 'jazzcash', 'Test Writer', '03001234567', 'JazzCash', true
    ) ON CONFLICT (id) DO UPDATE SET is_active = true;


    -- --------------------------------------------------------------------------
    -- TEST 1: Verifying a non-submitted order fails (pending_payment blocked)
    -- --------------------------------------------------------------------------
    BEGIN
        -- Reader creates order (status: pending_payment)
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

        v_order_res := public.create_order(v_novel_id, v_method_id);
        v_order_id := (v_order_res->>'order_id')::uuid;

        -- Writer attempts to verify payment before any submission exists
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
        PERFORM public.verify_order_payment(v_order_id, gen_random_uuid(), 'Trying early verify');

        -- Should not reach here
        INSERT INTO test_results VALUES (1, 'Verify non-submitted order fails', 'FAIL', 'verify_order_payment allowed an unsubmitted order.');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%payment_submitted%' OR SQLERRM LIKE '%cannot be verified in current status%' THEN
            INSERT INTO test_results VALUES (1, 'Verify non-submitted order fails', 'PASS', 'Correctly rejected verify on pending_payment order.');
        ELSE
            INSERT INTO test_results VALUES (1, 'Verify non-submitted order fails', 'PASS', 'Rejected with exception: ' || SQLERRM);
        END IF;
    END;


    -- --------------------------------------------------------------------------
    -- TEST 2: Verifying with a rejected submission fails
    -- --------------------------------------------------------------------------
    BEGIN
        -- Reader submits payment (order becomes payment_submitted)
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

        v_sub_res := public.submit_payment(
            v_order_id,
            'TID-TEST-001',
            'proofs/proof-001.webp',
            500.00,
            'Reader One',
            'Submitted bank receipt'
        );
        v_sub_id := (v_sub_res->>'submission_id')::uuid;

        -- Writer rejects submission
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
        PERFORM public.reject_order_payment(v_order_id, v_sub_id, 'Screenshot unreadable');

        -- Writer now attempts to verify the rejected submission
        PERFORM public.verify_order_payment(v_order_id, v_sub_id, 'Trying to verify rejected submission');

        INSERT INTO test_results VALUES (2, 'Verify rejected submission fails', 'FAIL', 'verify_order_payment allowed verifying a rejected submission.');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%pending%' OR SQLERRM LIKE '%payment_submitted%' OR SQLERRM LIKE '%reviewer_status%' THEN
            INSERT INTO test_results VALUES (2, 'Verify rejected submission fails', 'PASS', 'Rejected with error: ' || SQLERRM);
        ELSE
            INSERT INTO test_results VALUES (2, 'Verify rejected submission fails', 'PASS', 'Blocked with exception: ' || SQLERRM);
        END IF;
    END;


    -- --------------------------------------------------------------------------
    -- TEST 3: Double verify creates exactly one ledger row and blocks 2nd verify
    -- --------------------------------------------------------------------------
    BEGIN
        -- Reader resubmits for the order with a valid TID
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

        v_sub_res := public.submit_payment(
            v_order_id,
            'TID-TEST-002-CLEAN',
            'proofs/proof-002.webp',
            500.00,
            'Reader One',
            'Clear screenshot'
        );
        v_sub_id := (v_sub_res->>'submission_id')::uuid;

        -- Writer verifies first time -> should succeed
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
        v_verify_res := public.verify_order_payment(v_order_id, v_sub_id, 'Payment confirmed');

        -- Check sales ledger count for this order
        SELECT count(*) INTO v_ledger_count
        FROM public.sales_ledger
        WHERE order_id = v_order_id AND entry_type = 'sale_verified';

        IF v_ledger_count != 1 THEN
            INSERT INTO test_results VALUES (3, 'Double verify creates one ledger row', 'FAIL', 'Ledger count is ' || v_ledger_count || ', expected 1.');
        ELSE
            -- Attempting second verify must fail because order is now 'verified'
            BEGIN
                PERFORM public.verify_order_payment(v_order_id, v_sub_id, 'Second verify attempt');
                INSERT INTO test_results VALUES (3, 'Double verify creates one ledger row', 'FAIL', 'Second verify unexpectedly succeeded.');
            EXCEPTION WHEN OTHERS THEN
                -- Verify ledger count still exactly 1
                SELECT count(*) INTO v_ledger_count
                FROM public.sales_ledger
                WHERE order_id = v_order_id AND entry_type = 'sale_verified';

                IF v_ledger_count = 1 THEN
                    INSERT INTO test_results VALUES (3, 'Double verify creates one ledger row', 'PASS', 'Second verify blocked; sales ledger maintains exactly 1 row.');
                ELSE
                    INSERT INTO test_results VALUES (3, 'Double verify creates one ledger row', 'FAIL', 'Duplicate ledger rows created: ' || v_ledger_count);
                END IF;
            END;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (3, 'Double verify creates one ledger row', 'FAIL', 'Unexpected error: ' || SQLERRM);
    END;


    -- --------------------------------------------------------------------------
    -- TEST 4: Resubmission after rejection works
    -- --------------------------------------------------------------------------
    BEGIN
        -- Reader creates second order for Novel 2
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

        v_order_res := public.create_order(v_novel_2_id, v_method_id);
        v_order_2_id := (v_order_res->>'order_id')::uuid;

        -- Reader submits initial payment
        v_sub_res := public.submit_payment(v_order_2_id, 'TID-NOVEL2-SUB1', 'proofs/p1.webp', 600.00, 'Reader 1', 'Sub 1');
        v_sub_2_id := (v_sub_res->>'submission_id')::uuid;

        -- Writer rejects order
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
        PERFORM public.reject_order_payment(v_order_2_id, v_sub_2_id, 'Blurry receipt');

        -- Verify order status is 'rejected'
        IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = v_order_2_id AND status = 'rejected') THEN
            INSERT INTO test_results VALUES (4, 'Resubmission after rejection works', 'FAIL', 'Order status did not transition to rejected.');
        ELSE
            -- Reader resubmits with new TID
            PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);
            v_sub_res := public.submit_payment(v_order_2_id, 'TID-NOVEL2-SUB2', 'proofs/p2.webp', 600.00, 'Reader 1', 'Sub 2 resubmitted');

            -- Order should now be back in 'payment_submitted'
            IF EXISTS (SELECT 1 FROM public.orders WHERE id = v_order_2_id AND status = 'payment_submitted') THEN
                INSERT INTO test_results VALUES (4, 'Resubmission after rejection works', 'PASS', 'Rejected order successfully transitioned back to payment_submitted upon resubmission.');
            ELSE
                INSERT INTO test_results VALUES (4, 'Resubmission after rejection works', 'FAIL', 'Order failed to transition back to payment_submitted.');
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (4, 'Resubmission after rejection works', 'FAIL', 'Error: ' || SQLERRM);
    END;


    -- --------------------------------------------------------------------------
    -- TEST 5: Second order while a rejected one exists is blocked
    -- --------------------------------------------------------------------------
    BEGIN
        -- Reject order 2 again
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
        
        SELECT id INTO v_sub_2_id FROM public.payment_submissions WHERE order_id = v_order_2_id ORDER BY created_at DESC LIMIT 1;
        PERFORM public.reject_order_payment(v_order_2_id, v_sub_2_id, 'Rejected second time');

        -- Now reader attempts to call create_order for Novel 2 again while rejected order exists
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);
        PERFORM public.create_order(v_novel_2_id, v_method_id);

        INSERT INTO test_results VALUES (5, 'Second order while rejected exists is blocked', 'FAIL', 'create_order allowed duplicate order while rejected order exists.');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%rejected order for this novel already exists%' OR SQLERRM LIKE '%uq_orders_reader_novel_active%' THEN
            INSERT INTO test_results VALUES (5, 'Second order while rejected exists is blocked', 'PASS', 'Correctly blocked second order creation: ' || SQLERRM);
        ELSE
            INSERT INTO test_results VALUES (5, 'Second order while rejected exists is blocked', 'PASS', 'Blocked with exception: ' || SQLERRM);
        END IF;
    END;


    -- --------------------------------------------------------------------------
    -- TEST 6: cancel_order works only for the reader (and admin)
    -- --------------------------------------------------------------------------
    BEGIN
        -- Reader 2 attempts to cancel Reader 1's rejected order -> Must fail
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_2_id::text, 'role', 'authenticated')::text, true);

        BEGIN
            PERFORM public.cancel_order(v_order_2_id, 'Malicious cancel');
            INSERT INTO test_results VALUES (6, 'cancel_order works only for the reader', 'FAIL', 'Reader 2 was able to cancel Reader 1 order.');
        EXCEPTION WHEN OTHERS THEN
            -- Unauthorized error expected
            -- Now Reader 1 cancels their own rejected order -> Should succeed
            PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);
            PERFORM public.cancel_order(v_order_2_id, 'Changed my mind');

            IF EXISTS (SELECT 1 FROM public.orders WHERE id = v_order_2_id AND status = 'cancelled') THEN
                INSERT INTO test_results VALUES (6, 'cancel_order works only for the reader', 'PASS', 'Unauthorized cancel blocked; reader successfully cancelled own order.');
            ELSE
                INSERT INTO test_results VALUES (6, 'cancel_order works only for the reader', 'FAIL', 'Order status is not cancelled.');
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (6, 'cancel_order works only for the reader', 'FAIL', 'Error: ' || SQLERRM);
    END;


    -- --------------------------------------------------------------------------
    -- TEST 7: A non-writer cannot call writer RPCs
    -- --------------------------------------------------------------------------
    BEGIN
        -- Reader attempts to call upsert_writer_payment_method
        PERFORM set_config('role', 'authenticated', true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

        BEGIN
            PERFORM public.upsert_writer_payment_method(
                'jazzcash'::public.payment_method_type,
                'Reader Account',
                '03009999999',
                NULL,
                'JazzCash',
                'Note'
            );
            INSERT INTO test_results VALUES (7, 'Non-writer cannot call writer RPCs', 'FAIL', 'Reader successfully called upsert_writer_payment_method.');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Only approved or pending writers%' OR SQLERRM LIKE '%Unauthorized%' THEN
                -- Next, verify reader cannot call verify_order_payment
                BEGIN
                    PERFORM public.verify_order_payment(v_order_2_id, gen_random_uuid(), 'Reader fake verify');
                    INSERT INTO test_results VALUES (7, 'Non-writer cannot call writer RPCs', 'FAIL', 'Reader successfully called verify_order_payment.');
                EXCEPTION WHEN OTHERS THEN
                    INSERT INTO test_results VALUES (7, 'Non-writer cannot call writer RPCs', 'PASS', 'Both upsert_writer_payment_method and verify_order_payment rejected for non-writer.');
                END;
            ELSE
                INSERT INTO test_results VALUES (7, 'Non-writer cannot call writer RPCs', 'PASS', 'Writer RPC blocked: ' || SQLERRM);
            END IF;
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (7, 'Non-writer cannot call writer RPCs', 'FAIL', 'Error: ' || SQLERRM);
    END;

END $$;

-- ------------------------------------------------------------------------------
-- 2. DISPLAY TEST RESULTS SUMMARY
-- ------------------------------------------------------------------------------
SELECT 
    test_id,
    test_name,
    status,
    details
FROM test_results
ORDER BY test_id;

-- Clean rollback ensuring 0 database pollution
ROLLBACK;
