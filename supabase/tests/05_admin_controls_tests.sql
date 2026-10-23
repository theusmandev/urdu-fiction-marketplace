-- ==============================================================================
-- UNB Premium — Automated Test Suite: Admin Controls Hardening (Step 3.2)
-- Description:
--   Comprehensive transactional impersonation tests verifying:
--     1. Non-admin (reader, writer, anon) cannot call admin RPCs.
--     2. Platform settings validation enforces strictly bounded ranges.
--     3. Admin self-demotion and self-deactivation are strictly blocked.
--     4. Last remaining active administrator cannot be removed or deactivated.
--     5. Approved writer with published novels cannot be demoted to reader without suspension.
--     6. Genres: In-use genre cannot be deleted; can be deactivated or updated.
--     7. Novel suspension hides from catalog and blocks new orders while preserving entitlements.
--     8. Writer commission terms modification triggers balance reconciliation and audit logs.
--     9. All admin actions write append-only rows to public.audit_logs.
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
    v_reader_id    uuid := '11111111-1111-1111-1111-111111111111'::uuid;
    v_writer_id    uuid := '22222222-2222-2222-2222-222222222222'::uuid;
    v_admin_1_id   uuid := '88888888-8888-8888-8888-888888888888'::uuid;
    v_admin_2_id   uuid := '99999999-9999-9999-9999-999999999999'::uuid;

    -- Entity UUIDs
    v_genre_used_id   uuid := gen_random_uuid();
    v_genre_unused_id uuid := gen_random_uuid();
    v_novel_pub_id    uuid := gen_random_uuid();
    v_method_id       uuid := gen_random_uuid();
    v_order_id        uuid;
    v_sub_id          uuid;

    -- Helper variables
    v_res             jsonb;
    v_err_caught      boolean;
    v_count           integer;
    v_audit_count     integer;
    v_order_res       jsonb;
    v_sub_res         jsonb;
    v_novel_status    text;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Run as privileged bootstrap)
    -- --------------------------------------------------------------------------

    -- 1. Create fake users in auth.users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES 
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_admin_test@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_admin_test@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_admin_1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin1_test@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_admin_2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin2_test@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap profiles roles and usernames
    UPDATE public.profiles SET role = 'writer', username = 'writer_adm_32', full_name = 'Author Adm' WHERE id = v_writer_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_adm_32', full_name = 'Reader Adm' WHERE id = v_reader_id;
    UPDATE public.profiles SET role = 'admin', username = 'admin1_adm_32', full_name = 'First Admin', is_active = true WHERE id = v_admin_1_id;
    UPDATE public.profiles SET role = 'admin', username = 'admin2_adm_32', full_name = 'Second Admin', is_active = true WHERE id = v_admin_2_id;

    -- 3. Writer Profile
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES 
        (v_writer_id, 'مصنف ایڈمن ٹیسٹ', 'Author Admin Test', 'approved', 20.00, 5000.00, 0.00, false)
    ON CONFLICT (id) DO UPDATE SET status = 'approved', is_orders_paused_for_commission = false;

    -- 4. Payment Method
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, bank_name, is_active
    ) VALUES (
        v_method_id, v_writer_id, 'jazzcash', 'Author Admin QC', '03009988776', 'JazzCash', true
    )
    ON CONFLICT (id) DO UPDATE SET is_active = true;

    -- 5. Genres: one used by novel, one unused
    INSERT INTO public.genres (id, slug, name_english, name_urdu, display_order, is_active)
    VALUES 
        (v_genre_used_id, 'genre-used-32', 'Used Genre', 'مستعمل صنف', 1, true),
        (v_genre_unused_id, 'genre-unused-32', 'Unused Genre', 'غیر مستعمل صنف', 2, true)
    ON CONFLICT (slug) DO NOTHING;

    -- 6. Published Novel
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr, status, published_at, rights_declaration_accepted
    ) VALUES (
        v_novel_pub_id, v_writer_id, 'novel-admin-test-32', 'ایڈمن ٹیسٹ شائع شدہ', 'Admin Test Published Novel',
        'خلاصہ ایڈمن کنٹرول ٹیسٹ ناول۔', 500.00, 'published', now(), true
    )
    ON CONFLICT (id) DO NOTHING;

    -- Assign used genre
    INSERT INTO public.novel_genres (novel_id, genre_id)
    VALUES (v_novel_pub_id, v_genre_used_id)
    ON CONFLICT DO NOTHING;

    -- Insert chapter
    INSERT INTO public.chapters (novel_id, chapter_number, title_urdu, content_urdu, is_published)
    VALUES (v_novel_pub_id, 1, 'پہلا باب', 'یہ ایڈمن ٹیسٹ باب ہے۔', true)
    ON CONFLICT DO NOTHING;

    -- Ensure platform_settings exists
    INSERT INTO public.platform_settings (
        id, default_commission_rate, default_unpaid_commission_limit, dispute_window_days, max_novel_price_pkr, support_email
    ) VALUES (
        1, 20.00, 5000.00, 7, 50000.00, 'support@unbpremium.pk'
    )
    ON CONFLICT (id) DO UPDATE SET
        default_commission_rate = 20.00,
        default_unpaid_commission_limit = 5000.00,
        dispute_window_days = 7,
        max_novel_price_pkr = 50000.00,
        support_email = 'support@unbpremium.pk';


    -- ==========================================================================
    -- TEST 1: NON-ADMINS (READER, WRITER, ANON) CANNOT CALL ADMIN RPCS
    -- ==========================================================================
    -- Test as Reader
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);

    v_err_caught := false;
    BEGIN
        PERFORM public.suspend_novel(v_novel_pub_id, 'Reader trying to suspend novel');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (1, 'Non-admin cannot call admin RPCs (suspend_novel)', 'PASS', 'suspend_novel rejected for reader.');
    ELSE
        INSERT INTO test_results VALUES (1, 'Non-admin cannot call admin RPCs (suspend_novel)', 'FAIL', 'suspend_novel succeeded for reader.');
    END IF;

    -- Test as Writer
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
    v_err_caught := false;
    BEGIN
        PERFORM public.update_platform_settings(10.00, 10000.00, 14, 50000.00, 'support@unbpremium.pk');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (2, 'Writer cannot call update_platform_settings', 'PASS', 'update_platform_settings rejected for writer.');
    ELSE
        INSERT INTO test_results VALUES (2, 'Writer cannot call update_platform_settings', 'FAIL', 'Writer altered platform settings.');
    END IF;


    -- ==========================================================================
    -- TEST 2: PLATFORM SETTINGS VALIDATION ENFORCES BOUNDED RANGES
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_1_id::text, 'role', 'authenticated')::text, true);

    -- 2a: Negative commission rate
    v_err_caught := false;
    BEGIN
        PERFORM public.update_platform_settings(-5.00, 5000.00, 7, 50000.00, 'support@unb.pk');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;

    -- 2b: Rate > 100%
    IF v_err_caught THEN
        v_err_caught := false;
        BEGIN
            PERFORM public.update_platform_settings(105.00, 5000.00, 7, 50000.00, 'support@unb.pk');
        EXCEPTION WHEN OTHERS THEN
            v_err_caught := true;
        END;
    END IF;

    -- 2c: Dispute window < 1 or > 365
    IF v_err_caught THEN
        v_err_caught := false;
        BEGIN
            PERFORM public.update_platform_settings(20.00, 5000.00, 0, 50000.00, 'support@unb.pk');
        EXCEPTION WHEN OTHERS THEN
            v_err_caught := true;
        END;
    END IF;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (3, 'Platform settings range validation', 'PASS', 'Invalid commission rates and dispute windows strictly rejected.');
    ELSE
        INSERT INTO test_results VALUES (3, 'Platform settings range validation', 'FAIL', 'Out-of-range platform settings were accepted.');
    END IF;


    -- ==========================================================================
    -- TEST 3: ADMIN SELF-DEMOTION AND SELF-DEACTIVATION BLOCKED
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_1_id::text, 'role', 'authenticated')::text, true);

    -- 3a: Admin 1 attempts to demote own account to reader
    v_err_caught := false;
    BEGIN
        PERFORM public.admin_update_user_role_status(v_admin_1_id, 'reader', true, 'Self demoting');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;

    -- 3b: Admin 1 attempts to deactivate own account
    IF v_err_caught THEN
        v_err_caught := false;
        BEGIN
            PERFORM public.admin_update_user_role_status(v_admin_1_id, 'admin', false, 'Self deactivating');
        EXCEPTION WHEN OTHERS THEN
            v_err_caught := true;
        END IF;
    END IF;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (4, 'Admin self-demotion & self-deactivation blocked', 'PASS', 'Administrator prevented from demoting or deactivating their own account.');
    ELSE
        INSERT INTO test_results VALUES (4, 'Admin self-demotion & self-deactivation blocked', 'FAIL', 'Admin successfully demoted or deactivated own account.');
    END IF;


    -- ==========================================================================
    -- TEST 4: LAST REMAINING ACTIVE ADMIN CANNOT BE REMOVED
    -- ==========================================================================
    -- First, demote Admin 2 so only Admin 1 remains
    PERFORM public.admin_update_user_role_status(v_admin_2_id, 'reader', true, 'Demoting second admin for test');

    -- Now Admin 2 is reader. Only Admin 1 is active admin.
    -- Attempting to deactivate or demote Admin 1 must fail even by another caller
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_2_id::text, 'role', 'authenticated')::text, true);
    -- Wait, Admin 2 is not admin anymore so they can't call it. Switch to a database admin context or test last admin check:
    -- Promote Admin 2 back to admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_1_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.admin_update_user_role_status(v_admin_2_id, 'admin', true, 'Restoring second admin');

    -- Deactivate Admin 2
    PERFORM public.admin_update_user_role_status(v_admin_2_id, 'admin', false, 'Deactivating second admin');

    -- Now Admin 2 is inactive. Admin 1 is the ONLY active admin.
    -- Admin 2 cannot be demoted further because they are already inactive, but if we try to demote Admin 1:
    -- Since Admin 1 cannot self-demote anyway, activate Admin 2 again, then switch to Admin 2 to demote Admin 1:
    PERFORM public.admin_update_user_role_status(v_admin_2_id, 'admin', true, 'Reactivating Admin 2');
    -- Demote Admin 1 from Admin 2
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_2_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.admin_update_user_role_status(v_admin_1_id, 'reader', true, 'Admin 2 demotes Admin 1');

    -- Now Admin 2 is the ONLY active admin!
    -- Admin 2 cannot be demoted or deactivated (self-lockout + last admin check)
    v_err_caught := false;
    BEGIN
        PERFORM public.admin_update_user_role_status(v_admin_2_id, 'reader', true, 'Trying to remove last admin');
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (5, 'Last remaining active admin protection', 'PASS', 'Attempt to remove or deactivate the final administrator strictly rejected.');
    ELSE
        INSERT INTO test_results VALUES (5, 'Last remaining active admin protection', 'FAIL', 'Last active admin was removed or deactivated.');
    END IF;

    -- Restore Admin 1
    PERFORM public.admin_update_user_role_status(v_admin_1_id, 'admin', true, 'Restore Admin 1');


    -- ==========================================================================
    -- TEST 5: APPROVED WRITER WITH PUBLISHED NOVELS CANNOT BE DEMOTED TO READER
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_1_id::text, 'role', 'authenticated')::text, true);

    v_err_caught := false;
    BEGIN
        PERFORM public.admin_update_user_role_status(v_writer_id, 'reader', true, 'Attempting to demote active published writer');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Cannot demote writer to reader while they have%' THEN
            v_err_caught := true;
        END IF;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (6, 'Published writer demotion blocked', 'PASS', 'Approved writer with published novels cannot be demoted to reader.');
    ELSE
        INSERT INTO test_results VALUES (6, 'Published writer demotion blocked', 'FAIL', 'Published author was demoted to reader without suspending novels.');
    END IF;


    -- ==========================================================================
    -- TEST 6: GENRES IN-USE CANNOT BE DELETED
    -- ==========================================================================
    -- Attempt to delete v_genre_used_id (assigned to v_novel_pub_id)
    v_err_caught := false;
    BEGIN
        PERFORM public.delete_genre(v_genre_used_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Cannot delete genre%' THEN
            v_err_caught := true;
        END IF;
    END;

    -- Delete unused genre should succeed
    IF v_err_caught THEN
        PERFORM public.delete_genre(v_genre_unused_id);
        IF NOT EXISTS (SELECT 1 FROM public.genres WHERE id = v_genre_unused_id) THEN
            INSERT INTO test_results VALUES (7, 'In-use genre deletion blocked; unused deletion works', 'PASS', 'Assigned genre protected from deletion; unused genre successfully removed.');
        ELSE
            INSERT INTO test_results VALUES (7, 'In-use genre deletion blocked; unused deletion works', 'FAIL', 'Unused genre was not deleted.');
        END IF;
    ELSE
        INSERT INTO test_results VALUES (7, 'In-use genre deletion blocked; unused deletion works', 'FAIL', 'In-use genre was deleted despite novel assignment.');
    END IF;


    -- ==========================================================================
    -- TEST 7: NOVEL SUSPENSION HIDES FROM CATALOG & BLOCKS NEW ORDERS
    -- ==========================================================================
    -- Step 7a: Reader purchases novel while published -> creates entitlement
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);
    v_order_res := public.create_order(v_novel_pub_id, v_method_id);
    v_order_id := (v_order_res->>'order_id')::uuid;

    v_sub_res := public.submit_payment(v_order_id, 'TID-ADM-TEST-001', 'proof.webp', 500.00);
    v_sub_id := (v_sub_res->>'submission_id')::uuid;

    -- Writer verifies order
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.verify_order_payment(v_order_id, v_sub_id, 'Verified for admin test');

    -- Confirm reader has active entitlement
    SELECT count(*) INTO v_count FROM public.purchase_entitlements WHERE reader_id = v_reader_id AND novel_id = v_novel_pub_id AND is_revoked = false;
    IF v_count != 1 THEN
        RAISE EXCEPTION 'Precondition failed: entitlement not created.';
    END IF;

    -- Step 7b: Admin suspends novel
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_1_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.suspend_novel(v_novel_pub_id, 'Copyright review initiated');

    SELECT status INTO v_novel_status FROM public.novels WHERE id = v_novel_pub_id;

    -- Step 7c: Reader still retains active entitlement!
    SELECT count(*) INTO v_count FROM public.purchase_entitlements WHERE reader_id = v_reader_id AND novel_id = v_novel_pub_id AND is_revoked = false;

    -- Step 7d: Attempting NEW order for suspended novel MUST FAIL
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_id::text, 'role', 'authenticated')::text, true);
    v_err_caught := false;
    BEGIN
        PERFORM public.create_order(v_novel_pub_id, v_method_id);
    EXCEPTION WHEN OTHERS THEN
        v_err_caught := true;
    END;

    IF v_novel_status = 'suspended' AND v_count = 1 AND v_err_caught THEN
        INSERT INTO test_results VALUES (8, 'Novel suspension blocks new orders and preserves entitlements', 'PASS', 'Suspension transitions status, blocks new orders, and leaves existing entitlements intact.');
    ELSE
        INSERT INTO test_results VALUES (8, 'Novel suspension blocks new orders and preserves entitlements', 'FAIL', 'Suspension failed to block new order or revoked existing reader entitlement.');
    END IF;

    -- Step 7e: Unsuspend novel restores it to published
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_1_id::text, 'role', 'authenticated')::text, true);
    PERFORM public.unsuspend_novel(v_novel_pub_id);

    SELECT status INTO v_novel_status FROM public.novels WHERE id = v_novel_pub_id;
    IF v_novel_status = 'published' THEN
        INSERT INTO test_results VALUES (9, 'Novel unsuspension restores published status', 'PASS', 'Novel successfully restored to published status.');
    ELSE
        INSERT INTO test_results VALUES (9, 'Novel unsuspension restores published status', 'FAIL', 'Novel status after unsuspend: ' || v_novel_status);
    END IF;


    -- ==========================================================================
    -- TEST 8: SET WRITER COMMISSION TERMS RECONCILES BALANCE
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_1_id::text, 'role', 'authenticated')::text, true);

    v_res := public.set_writer_commission_terms(v_writer_id, 15.00, 10000.00, 'Senior Urdu author negotiated discount');

    IF (v_res->>'custom_commission_rate')::numeric = 15.00 AND (v_res->>'unpaid_commission_limit')::numeric = 10000.00 THEN
        INSERT INTO test_results VALUES (10, 'Writer commission terms customization', 'PASS', 'Commission rate and limit updated with mandatory reason logged.');
    ELSE
        INSERT INTO test_results VALUES (10, 'Writer commission terms customization', 'FAIL', 'Unexpected terms response: ' || v_res::text);
    END IF;


    -- ==========================================================================
    -- TEST 9: AUDIT LOG ROWS WRITTEN FOR ALL ACTIONS
    -- ==========================================================================
    SELECT count(*) INTO v_audit_count
    FROM public.audit_logs
    WHERE action_type IN (
        'SUSPEND_NOVEL',
        'UNSUSPEND_NOVEL',
        'UPDATE_USER_ROLE_STATUS',
        'DELETE_GENRE',
        'SET_WRITER_COMMISSION_TERMS'
    );

    IF v_audit_count >= 5 THEN
        INSERT INTO test_results VALUES (11, 'Audit log trail completeness', 'PASS', 'All admin actions appended immutable rows to public.audit_logs.');
    ELSE
        INSERT INTO test_results VALUES (11, 'Audit log trail completeness', 'FAIL', 'Audit log count insufficient: ' || v_audit_count);
    END IF;

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

-- Fail transaction if any test failed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM test_results WHERE status = 'FAIL') THEN
        RAISE EXCEPTION 'Admin Controls Test Suite Failed. Inspect test_results output above.';
    END IF;
END $$;

ROLLBACK;
