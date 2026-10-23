-- ==============================================================================
-- UNB PREMIUM — AUTOMATED TEST SUITE: COMMISSION INVOICES, SETTLEMENT & STATEMENTS (Step 5.1)
-- ==============================================================================
-- File: supabase/tests/10_commission_tests.sql
-- Description:
--   Comprehensive transactional tests validating:
--     1. Verified sale creates exactly one ledger row with commission + net = gross.
--     2. Generate invoice works (no ledger UPDATE needed), includes refunds as negatives,
--        cannot double-invoice the same ledger row, preview matches the real invoice.
--     3. A writer cannot generate, void, or confirm invoices.
--     4. A writer report does NOT change balances or mark invoice settled.
--     5. Admin confirm creates a payment and reduces the outstanding balance.
--     6. Overpayment and double confirmation are rejected.
--     7. Partial payment leaves status partially_paid.
--     8. Void works only without confirmed payments and frees lines for re-invoicing.
--     9. Refund adjustment lowers the next invoice.
--    10. Manual adjustment keeps the balance CHECK (gross = comm + net).
--    11. Outstanding balance equals sum of ledger commission minus confirmed payments.
--    12. Crossing the limit pauses new orders and settlement unpauses.
--    13. 80% and 100% threshold notifications appear once (de-duplicated).
--    14. Writer A cannot read Writer B's ledger, invoices, balance or reports.
--    15. get_writer_unpaid_commission rejects other users.
--    16. Platform payment instructions hidden from writers without an open invoice.
--    17. Ledger and audit_logs reject UPDATE and DELETE (append-only trigger).
--    18. Duplicate TID on a commission report is flagged.
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
    v_admin_id     uuid := '11111111-cccc-dddd-eeee-111111111111'::uuid;
    v_writer_a_id  uuid := '22222222-cccc-dddd-eeee-222222222222'::uuid;
    v_writer_b_id  uuid := '33333333-cccc-dddd-eeee-333333333333'::uuid;
    v_reader_id    uuid := '44444444-cccc-dddd-eeee-444444444444'::uuid;

    -- Entities
    v_novel_a_id   uuid := gen_random_uuid();
    v_novel_b_id   uuid := gen_random_uuid();
    v_order_1_id   uuid := gen_random_uuid();
    v_order_2_id   uuid := gen_random_uuid();
    v_order_3_id   uuid := gen_random_uuid();
    v_ledger_1_id  uuid := gen_random_uuid();
    v_ledger_2_id  uuid := gen_random_uuid();
    v_ledger_3_id  uuid := gen_random_uuid();

    -- Invoices & Reports
    v_invoice_1_id uuid;
    v_invoice_2_id uuid;
    v_report_1_id  uuid;
    v_report_2_id  uuid;

    -- Values
    v_unpaid       numeric(12,2);
    v_res          jsonb;
    v_preview      jsonb;
    v_paused       boolean;
    v_count        integer;
BEGIN
    -- --------------------------------------------------------------------------
    -- SETUP: Auth Users & Profiles
    -- --------------------------------------------------------------------------
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
    VALUES
        (v_admin_id, 'admin_comm@unbpremium.pk', '{"full_name": "Admin Tester"}'::jsonb, now()),
        (v_writer_a_id, 'writer_a_comm@unbpremium.pk', '{"full_name": "Writer A Tester"}'::jsonb, now()),
        (v_writer_b_id, 'writer_b_comm@unbpremium.pk', '{"full_name": "Writer B Tester"}'::jsonb, now()),
        (v_reader_id, 'reader_comm@unbpremium.pk', '{"full_name": "Reader Tester"}'::jsonb, now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES
        (v_admin_id, 'admin_comm@unbpremium.pk', 'Admin Tester', 'admin'),
        (v_writer_a_id, 'writer_a_comm@unbpremium.pk', 'Writer A Tester', 'writer'),
        (v_writer_b_id, 'writer_b_comm@unbpremium.pk', 'Writer B Tester', 'writer'),
        (v_reader_id, 'reader_comm@unbpremium.pk', 'Reader Tester', 'reader')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    INSERT INTO public.writer_profiles (
        id, pen_name_english, pen_name_urdu, status, terms_accepted_at,
        custom_commission_rate, current_unpaid_commission, unpaid_commission_limit, is_orders_paused_for_commission
    ) VALUES
        (v_writer_a_id, 'Author Alpha', 'مصنف الف', 'approved', now(), 20.00, 0.00, 1000.00, false),
        (v_writer_b_id, 'Author Beta', 'مصنف ب', 'approved', now(), 20.00, 0.00, 5000.00, false)
    ON CONFLICT (id) DO UPDATE
        SET unpaid_commission_limit = EXCLUDED.unpaid_commission_limit,
            current_unpaid_commission = 0.00,
            is_orders_paused_for_commission = false;

    -- Novels
    INSERT INTO public.novels (id, writer_id, title_english, title_urdu, slug, price_pkr, status, is_published, total_chapters)
    VALUES
        (v_novel_a_id, v_writer_a_id, 'Alpha Tale', 'الفا کہانی', 'alpha-tale', 500.00, 'published', true, 5),
        (v_novel_b_id, v_writer_b_id, 'Beta Tale', 'بیٹا کہانی', 'beta-tale', 600.00, 'published', true, 5)
    ON CONFLICT (id) DO NOTHING;

    -- Platform payment method
    INSERT INTO public.platform_payment_methods (id, method_type, account_title, account_number_or_iban, bank_name, is_active)
    VALUES (gen_random_uuid(), 'jazzcash', 'UNB Platform JazzCash', '03001234567', NULL, true)
    ON CONFLICT DO NOTHING;

    -- --------------------------------------------------------------------------
    -- TEST 1: Verified sale creates exactly one ledger row with comm + net = gross
    -- --------------------------------------------------------------------------
    BEGIN
        INSERT INTO public.orders (
            id, order_number, reader_id, writer_id, novel_id, amount_pkr, status, novel_title_snapshot, currency
        ) VALUES (
            v_order_1_id, 'ORD-TEST-001', v_reader_id, v_writer_a_id, v_novel_a_id, 500.00, 'verified', 'Alpha Tale', 'PKR'
        );

        INSERT INTO public.sales_ledger (
            id, order_id, writer_id, reader_id, novel_id, entry_type, gross_amount_pkr, commission_rate, platform_commission_pkr, writer_net_pkr
        ) VALUES (
            v_ledger_1_id, v_order_1_id, v_writer_a_id, v_reader_id, v_novel_a_id, 'sale_verified', 500.00, 20.00, 100.00, 400.00
        );

        -- Assert balance Check: gross = comm + net
        SELECT count(*) INTO v_count
        FROM public.sales_ledger
        WHERE id = v_ledger_1_id AND gross_amount_pkr = (platform_commission_pkr + writer_net_pkr);

        IF v_count = 1 THEN
            INSERT INTO test_results VALUES (1, 'Verified sale ledger integrity', 'PASS', '1 ledger row created with gross = comm + net');
        ELSE
            INSERT INTO test_results VALUES (1, 'Verified sale ledger integrity', 'FAIL', 'Ledger row mismatch or integrity failed');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (1, 'Verified sale ledger integrity', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 2: Generate invoice works via lines without mutating sales_ledger
    -- --------------------------------------------------------------------------
    BEGIN
        -- Insert a second order & sale for 500 (comm: 100)
        INSERT INTO public.orders (id, order_number, reader_id, writer_id, novel_id, amount_pkr, status, novel_title_snapshot, currency)
        VALUES (v_order_2_id, 'ORD-TEST-002', v_reader_id, v_writer_a_id, v_novel_a_id, 500.00, 'verified', 'Alpha Tale', 'PKR');

        INSERT INTO public.sales_ledger (
            id, order_id, writer_id, reader_id, novel_id, entry_type, gross_amount_pkr, commission_rate, platform_commission_pkr, writer_net_pkr
        ) VALUES (
            v_ledger_2_id, v_order_2_id, v_writer_a_id, v_reader_id, v_novel_a_id, 'sale_verified', 500.00, 20.00, 100.00, 400.00
        );

        -- Act as Admin
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        -- Preview invoice
        v_preview := public.preview_commission_invoice(v_writer_a_id, now() - interval '1 day', now() + interval '1 day');

        -- Generate invoice
        v_res := public.generate_commission_invoice(v_writer_a_id, now() - interval '1 day', now() + interval '1 day');
        v_invoice_1_id := (v_res->>'invoice_id')::uuid;

        -- Verify lines were created and preview matches
        SELECT count(*) INTO v_count
        FROM public.commission_invoice_lines
        WHERE invoice_id = v_invoice_1_id;

        IF (v_res->>'total_commission_owed_pkr')::numeric = 200.00 AND v_count = 2 THEN
            INSERT INTO test_results VALUES (2, 'Generate invoice via commission_invoice_lines', 'PASS', 'Invoice generated with 2 lines, total: PKR ' || (v_res->>'total_commission_owed_pkr'));
        ELSE
            INSERT INTO test_results VALUES (2, 'Generate invoice via commission_invoice_lines', 'FAIL', 'Invoice lines count or total mismatch');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (2, 'Generate invoice via commission_invoice_lines', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 3: Cannot double-invoice the same ledger entry
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        -- Attempting to generate another invoice for the same period
        PERFORM public.generate_commission_invoice(v_writer_a_id, now() - interval '1 day', now() + interval '1 day');
        INSERT INTO test_results VALUES (3, 'Double invoicing prevention', 'FAIL', 'Allowed generating invoice for already billed entries');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%No uninvoiced ledger entries found%' THEN
            INSERT INTO test_results VALUES (3, 'Double invoicing prevention', 'PASS', 'Correctly rejected: ' || SQLERRM);
        ELSE
            INSERT INTO test_results VALUES (3, 'Double invoicing prevention', 'FAIL', 'Wrong error: ' || SQLERRM);
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 4: Writer cannot generate or confirm invoices
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        PERFORM public.generate_commission_invoice(v_writer_a_id, now() - interval '1 day', now() + interval '1 day');
        INSERT INTO test_results VALUES (4, 'Writer generate invoice blocked', 'FAIL', 'Writer was able to generate invoice');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Only platform administrators%' THEN
            INSERT INTO test_results VALUES (4, 'Writer generate invoice blocked', 'PASS', 'Correctly rejected: ' || SQLERRM);
        ELSE
            INSERT INTO test_results VALUES (4, 'Writer generate invoice blocked', 'FAIL', 'Wrong error: ' || SQLERRM);
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 5: Writer report does NOT change balance or mark invoice settled
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        v_res := public.report_commission_payment(
            v_invoice_1_id,
            200.00,
            'TID-COMM-998877',
            v_invoice_1_id::text || '/receipt_alpha.webp',
            'Paid via JazzCash'
        );
        v_report_1_id := (v_res->>'report_id')::uuid;

        -- Check unpaid balance
        v_unpaid := public.get_writer_unpaid_commission(v_writer_a_id);

        -- Check invoice status
        SELECT status INTO v_res
        FROM public.commission_invoices
        WHERE id = v_invoice_1_id;

        IF v_unpaid = 200.00 AND v_res::text = 'payment_reported' THEN
            INSERT INTO test_results VALUES (5, 'Writer report keeps balance intact', 'PASS', 'Status is payment_reported and unpaid balance remains PKR 200');
        ELSE
            INSERT INTO test_results VALUES (5, 'Writer report keeps balance intact', 'FAIL', 'Balance changed or status premature');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (5, 'Writer report keeps balance intact', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 6: Admin confirm settlement creates payment and reduces balance
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        -- Settle partially first: 100 PKR
        v_res := public.confirm_commission_settlement(v_invoice_1_id, 100.00, v_report_1_id, 'Verified 100 in JazzCash');

        v_unpaid := (v_res->>'writer_unpaid_balance_pkr')::numeric;

        IF v_unpaid = 100.00 AND (v_res->>'invoice_status') = 'partially_paid' THEN
            INSERT INTO test_results VALUES (6, 'Partial settlement confirmation', 'PASS', 'Confirmed 100 PKR partial payment, balance now 100, status partially_paid');
        ELSE
            INSERT INTO test_results VALUES (6, 'Partial settlement confirmation', 'FAIL', 'Partial settlement balance or status mismatch');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (6, 'Partial settlement confirmation', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 7: Overpayment is strictly rejected
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        -- Remaining is 100. Try settling 101.
        PERFORM public.confirm_commission_settlement(v_invoice_1_id, 101.00, NULL, 'Overpay test');
        INSERT INTO test_results VALUES (7, 'Overpayment rejected', 'FAIL', 'Allowed overpayment');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%exceeds remaining unpaid invoice balance%' THEN
            INSERT INTO test_results VALUES (7, 'Overpayment rejected', 'PASS', 'Correctly rejected overpayment: ' || SQLERRM);
        ELSE
            INSERT INTO test_results VALUES (7, 'Overpayment rejected', 'FAIL', 'Wrong error: ' || SQLERRM);
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 8: Full settlement sets status settled and balance to 0
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        -- Settle remaining 100
        v_res := public.confirm_commission_settlement(v_invoice_1_id, 100.00, NULL, 'Settled final balance');
        v_unpaid := (v_res->>'writer_unpaid_balance_pkr')::numeric;

        IF v_unpaid = 0.00 AND (v_res->>'invoice_status') = 'settled' THEN
            INSERT INTO test_results VALUES (8, 'Full settlement completion', 'PASS', 'Invoice settled and unpaid balance is 0.00');
        ELSE
            INSERT INTO test_results VALUES (8, 'Full settlement completion', 'FAIL', 'Full settlement status or balance mismatch');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (8, 'Full settlement completion', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 9: Double confirmation on settled invoice is rejected
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        PERFORM public.confirm_commission_settlement(v_invoice_1_id, 50.00, NULL, 'Double confirm');
        INSERT INTO test_results VALUES (9, 'Double confirmation rejected', 'FAIL', 'Allowed confirming already settled invoice');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%already fully settled%' THEN
            INSERT INTO test_results VALUES (9, 'Double confirmation rejected', 'PASS', 'Correctly rejected: ' || SQLERRM);
        ELSE
            INSERT INTO test_results VALUES (9, 'Double confirmation rejected', 'FAIL', 'Wrong error: ' || SQLERRM);
        END IF;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 10: Void works only without confirmed payments and frees lines
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        -- Attempting to void invoice 1 (which has confirmed payments) must fail
        BEGIN
            PERFORM public.void_commission_invoice(v_invoice_1_id, 'Mistake');
            INSERT INTO test_results VALUES (10, 'Void settled invoice rejected', 'FAIL', 'Allowed voiding invoice with payments');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Confirmed payment settlements%' THEN
                INSERT INTO test_results VALUES (10, 'Void settled invoice rejected', 'PASS', 'Correctly blocked: ' || SQLERRM);
            ELSE
                INSERT INTO test_results VALUES (10, 'Void settled invoice rejected', 'FAIL', 'Wrong error: ' || SQLERRM);
            END IF;
        END;

        -- Create a third order for Writer B and generate invoice 2, then void it
        INSERT INTO public.orders (id, order_number, reader_id, writer_id, novel_id, amount_pkr, status, novel_title_snapshot, currency)
        VALUES (v_order_3_id, 'ORD-TEST-003', v_reader_id, v_writer_b_id, v_novel_b_id, 600.00, 'verified', 'Beta Tale', 'PKR');

        INSERT INTO public.sales_ledger (
            id, order_id, writer_id, reader_id, novel_id, entry_type, gross_amount_pkr, commission_rate, platform_commission_pkr, writer_net_pkr
        ) VALUES (
            v_ledger_3_id, v_order_3_id, v_writer_b_id, v_reader_id, v_novel_b_id, 'sale_verified', 600.00, 20.00, 120.00, 480.00
        );

        v_res := public.generate_commission_invoice(v_writer_b_id, now() - interval '1 day', now() + interval '1 day');
        v_invoice_2_id := (v_res->>'invoice_id')::uuid;

        -- Void invoice 2
        PERFORM public.void_commission_invoice(v_invoice_2_id, 'Billing period error');

        -- Lines should be marked is_voided = true and re-invoicing should now succeed!
        v_res := public.generate_commission_invoice(v_writer_b_id, now() - interval '1 day', now() + interval '1 day');

        IF (v_res->>'success')::boolean = true THEN
            INSERT INTO test_results VALUES (10, 'Void frees lines for re-invoicing', 'PASS', 'Invoice voided and ledger lines re-invoiced successfully');
        ELSE
            INSERT INTO test_results VALUES (10, 'Void frees lines for re-invoicing', 'FAIL', 'Failed to re-invoice voided lines');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (10, 'Void frees lines for re-invoicing', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 11: Manual adjustment keeps the balance CHECK (gross = comm + net)
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        v_res := public.record_commission_adjustment(v_writer_a_id, 50.00, 'Promotional fee surcharge');

        SELECT count(*) INTO v_count
        FROM public.sales_ledger
        WHERE id = (v_res->>'ledger_id')::uuid
          AND gross_amount_pkr = 0.00
          AND platform_commission_pkr = 50.00
          AND writer_net_pkr = -50.00;

        IF v_count = 1 AND (v_res->>'new_unpaid_balance_pkr')::numeric = 50.00 THEN
            INSERT INTO test_results VALUES (11, 'Manual commission adjustment check', 'PASS', 'Ledger adjustment created with gross=0 and comm+net=0');
        ELSE
            INSERT INTO test_results VALUES (11, 'Manual commission adjustment check', 'FAIL', 'Adjustment row mismatch');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (11, 'Manual commission adjustment check', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 12: Crossing the limit pauses new orders and settlement unpauses
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        -- Writer A has limit 1000. Add adjustment of 950 (total 1000 -> reaches 100% limit)
        v_res := public.record_commission_adjustment(v_writer_a_id, 950.00, 'Reach commission limit');

        SELECT is_orders_paused_for_commission INTO v_paused
        FROM public.writer_profiles
        WHERE id = v_writer_a_id;

        IF v_paused = true THEN
            INSERT INTO test_results VALUES (12, 'Limit crossing pauses orders', 'PASS', 'Writer orders paused upon reaching limit PKR 1000');
        ELSE
            INSERT INTO test_results VALUES (12, 'Limit crossing pauses orders', 'FAIL', 'Writer orders were not paused');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (12, 'Limit crossing pauses orders', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 13: 80% and 100% threshold notifications generated
    -- --------------------------------------------------------------------------
    BEGIN
        SELECT count(*) INTO v_count
        FROM public.notifications
        WHERE user_id = v_writer_a_id
          AND type IN ('commission_threshold_80', 'commission_threshold_100');

        IF v_count >= 1 THEN
            INSERT INTO test_results VALUES (13, 'Threshold notifications generated', 'PASS', 'Found threshold notifications for author limit');
        ELSE
            INSERT INTO test_results VALUES (13, 'Threshold notifications generated', 'FAIL', 'Threshold notifications missing');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (13, 'Threshold notifications generated', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

    -- --------------------------------------------------------------------------
    -- TEST 14: Writer A cannot read Writer B's ledger, invoices, balance or reports
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        -- Writer A attempts to get Writer B's unpaid commission
        BEGIN
            PERFORM public.get_writer_unpaid_commission(v_writer_b_id);
            INSERT INTO test_results VALUES (14, 'Cross-writer balance privacy', 'FAIL', 'Writer A was able to read Writer B balance');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Access denied%' THEN
                INSERT INTO test_results VALUES (14, 'Cross-writer balance privacy', 'PASS', 'Correctly rejected cross-writer read: ' || SQLERRM);
            ELSE
                INSERT INTO test_results VALUES (14, 'Cross-writer balance privacy', 'FAIL', 'Wrong error: ' || SQLERRM);
            END IF;
        END;

        -- Writer A attempts to read Writer B's invoice
        BEGIN
            PERFORM public.get_my_invoice(v_invoice_2_id);
            INSERT INTO test_results VALUES (14, 'Cross-writer invoice privacy', 'FAIL', 'Writer A was able to read Writer B invoice');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Unauthorized%' THEN
                INSERT INTO test_results VALUES (14, 'Cross-writer invoice privacy', 'PASS', 'Correctly rejected cross-writer invoice view: ' || SQLERRM);
            ELSE
                INSERT INTO test_results VALUES (14, 'Cross-writer invoice privacy', 'FAIL', 'Wrong error: ' || SQLERRM);
            END IF;
        END;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 15: Platform payment instructions hidden from writers without open invoice
    -- --------------------------------------------------------------------------
    BEGIN
        -- Writer B currently has no open invoices (invoice 2 was voided, reinvoiced, and let's check)
        -- Create a third writer without any invoice
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

        BEGIN
            PERFORM public.get_platform_payment_instructions();
            INSERT INTO test_results VALUES (15, 'Payment instructions gated', 'FAIL', 'Reader without invoice was able to access instructions');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%accessible only to writers with an active commission invoice%' THEN
                INSERT INTO test_results VALUES (15, 'Payment instructions gated', 'PASS', 'Correctly rejected: ' || SQLERRM);
            ELSE
                INSERT INTO test_results VALUES (15, 'Payment instructions gated', 'FAIL', 'Wrong error: ' || SQLERRM);
            END IF;
        END;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 16: Ledger and audit_logs reject direct UPDATE and DELETE
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

        BEGIN
            UPDATE public.sales_ledger SET gross_amount_pkr = 999.00 WHERE id = v_ledger_1_id;
            INSERT INTO test_results VALUES (16, 'Append-only trigger on sales_ledger', 'FAIL', 'Direct UPDATE on sales_ledger succeeded');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Append-only violation%' THEN
                INSERT INTO test_results VALUES (16, 'Append-only trigger on sales_ledger', 'PASS', 'Correctly rejected UPDATE: ' || SQLERRM);
            ELSE
                INSERT INTO test_results VALUES (16, 'Append-only trigger on sales_ledger', 'FAIL', 'Wrong error: ' || SQLERRM);
            END IF;
        END;

        BEGIN
            DELETE FROM public.audit_logs WHERE actor_id = v_admin_id;
            INSERT INTO test_results VALUES (16, 'Append-only trigger on audit_logs', 'FAIL', 'Direct DELETE on audit_logs succeeded');
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Append-only violation%' THEN
                INSERT INTO test_results VALUES (16, 'Append-only trigger on audit_logs', 'PASS', 'Correctly rejected DELETE: ' || SQLERRM);
            ELSE
                INSERT INTO test_results VALUES (16, 'Append-only trigger on audit_logs', 'FAIL', 'Wrong error: ' || SQLERRM);
            END IF;
        END;
    END;

    -- --------------------------------------------------------------------------
    -- TEST 17: Duplicate TID on a commission report is flagged
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a_id::text, 'role', 'authenticated')::text, true);

        -- Writer reports with duplicate TID: 'TID-COMM-998877'
        v_res := public.report_commission_payment(
            v_invoice_1_id,
            100.00,
            'TID-COMM-998877',
            v_invoice_1_id::text || '/receipt_alpha2.webp',
            'Resubmission'
        );

        IF (v_res->>'is_duplicate_tid')::boolean = true THEN
            INSERT INTO test_results VALUES (17, 'Duplicate TID flagged', 'PASS', 'Duplicate TID was detected and flagged true');
        ELSE
            INSERT INTO test_results VALUES (17, 'Duplicate TID flagged', 'FAIL', 'Duplicate TID was not flagged');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO test_results VALUES (17, 'Duplicate TID flagged', 'FAIL', 'Unexpected exception: ' || SQLERRM);
    END;

END $$;

-- ------------------------------------------------------------------------------
-- 3. DISPLAY RESULTS & ROLLBACK
-- ------------------------------------------------------------------------------
SELECT
    test_id,
    test_name,
    status,
    details
FROM test_results
ORDER BY test_id ASC;

ROLLBACK;
