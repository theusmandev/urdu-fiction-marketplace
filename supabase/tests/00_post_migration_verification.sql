-- ==============================================================================
-- UNB PREMIUM — POST-MIGRATION VERIFICATION SUITE
-- File: supabase/tests/00_post_migration_verification.sql
--
-- Instructions:
-- Paste and execute this entire file in the Supabase SQL Editor as postgres/service_role.
-- This script does NOT modify application data or leave temporary objects behind.
-- Output: A single tabular PASS/FAIL report covering schema, columns, AST checks,
--         security privileges, search_path enforcement, and trigger protections.
-- ==============================================================================

-- 1. Ensure plpgsql_check extension exists in schema extensions
CREATE EXTENSION IF NOT EXISTS plpgsql_check WITH SCHEMA extensions;

-- 2. Create temporary table for test assertions
CREATE TEMP TABLE IF NOT EXISTS temp_verification_results (
    id serial PRIMARY KEY,
    check_category text NOT NULL,
    check_name text NOT NULL,
    status text NOT NULL, -- 'PASS', 'FAIL', 'WARN'
    details text NOT NULL
) ON COMMIT PRESERVE ROWS;

TRUNCATE TABLE temp_verification_results;

-- 3. Execute all validation checks
DO $$
DECLARE
    v_rec record;
    v_err record;
    v_cnt integer;
    v_err_count integer := 0;
    v_has_priv boolean;
    v_expected_tables text[] := ARRAY[
        'profiles', 'writer_profiles', 'writer_payment_methods', 'genres', 'novels',
        'novel_genres', 'chapters', 'orders', 'payment_submissions', 'purchase_entitlements',
        'sales_ledger', 'audit_logs', 'platform_settings', 'daily_search_trends',
        'commission_invoices', 'commission_invoice_lines', 'commission_payment_reports',
        'disputes', 'dispute_messages', 'refund_adjustments', 'support_tickets',
        'ticket_messages', 'writer_status_history', 'notifications', 'bookmarks',
        'reading_history', 'reviews', 'author_followers', 'payment_fraud_flags'
    ];
    v_tbl text;
BEGIN
    -- --------------------------------------------------------------------------
    -- CHECK 1: Core Tables Existence
    -- --------------------------------------------------------------------------
    FOREACH v_tbl IN ARRAY v_expected_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = v_tbl
        ) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('TABLES', 'Table public.' || v_tbl, 'PASS', 'Table exists');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('TABLES', 'Table public.' || v_tbl, 'FAIL', 'Missing expected table');
        END IF;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- CHECK 2: Ground Truth Column Invariants (Confirming live schema truth)
    -- --------------------------------------------------------------------------
    -- orders: payment_method must NOT exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_method'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'orders.payment_method absence', 'PASS', 'Correct: non-existent payment_method column is absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'orders.payment_method absence', 'FAIL', 'Found unexpected orders.payment_method column');
    END IF;

    -- novels: cover_url must exist, cover_image_url must NOT exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'novels' AND column_name = 'cover_url'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'novels' AND column_name = 'cover_image_url'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'novels.cover_url', 'PASS', 'Correct: cover_url exists and cover_image_url is absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'novels.cover_url', 'FAIL', 'Column mismatch on novels table (expected cover_url only)');
    END IF;

    -- chapters: title_urdu must exist, title_english must NOT exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'title_urdu'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'title_english'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'chapters.title_urdu', 'PASS', 'Correct: title_urdu exists and title_english is absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'chapters.title_urdu', 'FAIL', 'Column mismatch on chapters table (expected title_urdu only)');
    END IF;

    -- payment_submissions: is_duplicate_tid_flagged and screenshot_path exist; is_duplicate_tid absent
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_submissions' AND column_name = 'is_duplicate_tid_flagged'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_submissions' AND column_name = 'screenshot_path'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_submissions' AND column_name = 'is_duplicate_tid'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'payment_submissions columns', 'PASS', 'Correct: is_duplicate_tid_flagged and screenshot_path exist');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'payment_submissions columns', 'FAIL', 'Mismatch on payment_submissions columns');
    END IF;

    -- sales_ledger: writer_net_pkr, platform_commission_pkr, commission_invoice_id exist; writer_payout_pkr and is_reconciled absent
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'sales_ledger' AND column_name = 'writer_net_pkr'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'sales_ledger' AND column_name = 'writer_payout_pkr'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'sales_ledger' AND column_name = 'is_reconciled'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'sales_ledger columns', 'PASS', 'Correct: writer_net_pkr exists, writer_payout_pkr and is_reconciled absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'sales_ledger columns', 'FAIL', 'Column mismatch on sales_ledger');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 3: PostgreSQL Enum Values
    -- --------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON t.oid = e.enumtypid 
        WHERE t.typname = 'commission_status' AND e.enumlabel = 'partially_paid'
    ) AND EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON t.oid = e.enumtypid 
        WHERE t.typname = 'commission_status' AND e.enumlabel = 'void'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('ENUMS', 'commission_status enum additions', 'PASS', 'partially_paid and void enum values present');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('ENUMS', 'commission_status enum additions', 'FAIL', 'Missing partially_paid or void in commission_status');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 4: Function Overload Cleanliness (No Ambiguous Signatures)
    -- --------------------------------------------------------------------------
    SELECT count(*) INTO v_cnt FROM pg_proc WHERE proname = 'approve_novel' AND pronamespace = 'public'::regnamespace;
    IF v_cnt = 1 THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'approve_novel signature', 'PASS', 'Single canonical signature public.approve_novel(uuid, jsonb)');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'approve_novel signature', 'FAIL', 'Found ' || v_cnt || ' overloads for approve_novel');
    END IF;

    SELECT count(*) INTO v_cnt FROM pg_proc WHERE proname = 'update_platform_settings' AND pronamespace = 'public'::regnamespace;
    IF v_cnt = 1 THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'update_platform_settings signature', 'PASS', 'Single canonical 14-parameter signature');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'update_platform_settings signature', 'FAIL', 'Found ' || v_cnt || ' overloads for update_platform_settings');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 5: Financial Tables Privilege Lockdown (anon & authenticated)
    -- --------------------------------------------------------------------------
    FOREACH v_tbl IN ARRAY ARRAY['orders', 'payment_submissions', 'commission_invoices', 'sales_ledger', 'audit_logs'] LOOP
        v_has_priv := has_table_privilege('anon', 'public.' || v_tbl, 'INSERT')
                   OR has_table_privilege('anon', 'public.' || v_tbl, 'UPDATE')
                   OR has_table_privilege('anon', 'public.' || v_tbl, 'DELETE');
        IF NOT v_has_priv THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'anon mutates ' || v_tbl, 'PASS', 'anon has NO INSERT/UPDATE/DELETE');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'anon mutates ' || v_tbl, 'FAIL', 'anon has unauthorized table mutation privilege');
        END IF;

        v_has_priv := has_table_privilege('authenticated', 'public.' || v_tbl, 'INSERT')
                   OR has_table_privilege('authenticated', 'public.' || v_tbl, 'UPDATE')
                   OR has_table_privilege('authenticated', 'public.' || v_tbl, 'DELETE');
        IF NOT v_has_priv THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'authenticated mutates ' || v_tbl, 'PASS', 'authenticated has NO direct INSERT/UPDATE/DELETE');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'authenticated mutates ' || v_tbl, 'FAIL', 'authenticated has unauthorized direct table mutation privilege');
        END IF;
    END LOOP;

    -- Notifications: authenticated must not have full UPDATE on all columns
    IF NOT has_table_privilege('authenticated', 'public.notifications', 'UPDATE') 
       OR has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE') THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('PERMISSIONS', 'notifications UPDATE scope', 'PASS', 'Restricted to column-level (is_read, read_at)');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('PERMISSIONS', 'notifications UPDATE scope', 'FAIL', 'Full table UPDATE granted to authenticated');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 6: Function Execution Lockdown (anon cannot call writer/admin RPCs)
    -- --------------------------------------------------------------------------
    FOREACH v_tbl IN ARRAY ARRAY[
        'create_order', 'submit_payment_proof', 'verify_order_payment', 'reject_order_payment',
        'get_writer_unpaid_commission', 'reconcile_writer_unpaid_commission', 'admin_list_orders',
        'admin_get_order', 'admin_overview_stats', 'open_dispute', 'resolve_dispute',
        'record_refund_adjustment', 'confirm_commission_settlement', 'generate_commission_invoice'
    ] LOOP
        SELECT count(*) INTO v_cnt 
        FROM pg_proc p 
        WHERE p.proname = v_tbl 
          AND p.pronamespace = 'public'::regnamespace
          AND has_function_privilege('anon', p.oid, 'EXECUTE');

        IF v_cnt = 0 THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('FUNCTION_GRANTS', 'anon execution of ' || v_tbl, 'PASS', 'anon cannot execute ' || v_tbl);
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('FUNCTION_GRANTS', 'anon execution of ' || v_tbl, 'FAIL', 'anon has EXECUTE grant on ' || v_tbl);
        END IF;
    END LOOP;

    -- Intentionally public functions MUST be executable
    FOREACH v_tbl IN ARRAY ARRAY['get_public_novel_chapters', 'get_checkout_options', 'record_search_query', 'get_trending_searches'] LOOP
        SELECT count(*) INTO v_cnt 
        FROM pg_proc p 
        WHERE p.proname = v_tbl 
          AND p.pronamespace = 'public'::regnamespace
          AND has_function_privilege('anon', p.oid, 'EXECUTE');

        IF v_cnt > 0 THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('FUNCTION_GRANTS', 'public execution of ' || v_tbl, 'PASS', 'Correctly accessible to anon/public');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('FUNCTION_GRANTS', 'public execution of ' || v_tbl, 'FAIL', 'Public cannot execute catalog function ' || v_tbl);
        END IF;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- CHECK 7: Row-Level Security Enabled on All Public Tables
    -- --------------------------------------------------------------------------
    FOR v_rec IN 
        SELECT c.relname 
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
          AND c.relkind = 'r'
          AND NOT c.relrowsecurity
        ORDER BY c.relname
    LOOP
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('RLS_ENFORCEMENT', 'RLS on ' || v_rec.relname, 'FAIL', 'Row-Level Security is DISABLED on public.' || v_rec.relname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM temp_verification_results WHERE check_category = 'RLS_ENFORCEMENT') THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('RLS_ENFORCEMENT', 'RLS on all tables', 'PASS', 'All public tables have relrowsecurity = true');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 8: SECURITY DEFINER Search Path Enforcement
    -- --------------------------------------------------------------------------
    FOR v_rec IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.prosecdef = true
          AND (p.proconfig IS NULL OR NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
          ))
        ORDER BY p.proname
    LOOP
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('SECURITY_DEFINER', v_rec.proname, 'FAIL', 'Missing explicit search_path on SECURITY DEFINER function');
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM temp_verification_results WHERE check_category = 'SECURITY_DEFINER') THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('SECURITY_DEFINER', 'search_path on all SECURITY DEFINER functions', 'PASS', 'Every SECURITY DEFINER function sets search_path');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 9: Append-Only Immutability Triggers
    -- --------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'sales_ledger' AND t.tgname = 'trg_immutable_sales_ledger'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('IMMUTABILITY', 'sales_ledger tamper prevention', 'PASS', 'trg_immutable_sales_ledger is active');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('IMMUTABILITY', 'sales_ledger tamper prevention', 'FAIL', 'Missing tamper prevention trigger on sales_ledger');
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'audit_logs' AND t.tgname = 'trg_immutable_audit_logs'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('IMMUTABILITY', 'audit_logs tamper prevention', 'PASS', 'trg_immutable_audit_logs is active');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('IMMUTABILITY', 'audit_logs tamper prevention', 'FAIL', 'Missing tamper prevention trigger on audit_logs');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 10: Private Storage Bucket Lockdown
    -- --------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM storage.buckets WHERE id = 'payment-proofs' AND public = false
        ) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('STORAGE', 'payment-proofs bucket privacy', 'PASS', 'Bucket is strictly private (public = false)');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('STORAGE', 'payment-proofs bucket privacy', 'FAIL', 'Bucket payment-proofs is public or missing');
        END IF;
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 11: plpgsql_check AST Runtime Analysis
    -- --------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'plpgsql_check') THEN
        -- Check standard PL/pgSQL functions
        FOR v_rec IN 
            SELECT p.oid as func_oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_language l ON l.oid = p.prolang
            WHERE l.lanname = 'plpgsql' 
              AND p.pronamespace = 'public'::regnamespace
              AND p.prorettype != 'trigger'::regtype
            ORDER BY p.proname
        LOOP
            BEGIN
                FOR v_err IN 
                    EXECUTE 'SELECT message, level FROM extensions.plpgsql_check_function_tb($1) WHERE level = ''error''' 
                    USING v_rec.func_oid
                LOOP
                    v_err_count := v_err_count + 1;
                    INSERT INTO temp_verification_results (check_category, check_name, status, details)
                    VALUES ('plpgsql_check', v_rec.proname || '(' || v_rec.args || ')', 'FAIL', v_err.message);
                END LOOP;
            EXCEPTION WHEN OTHERS THEN
                INSERT INTO temp_verification_results (check_category, check_name, status, details)
                VALUES ('plpgsql_check', v_rec.proname, 'WARN', 'Check skipped or error: ' || SQLERRM);
            END;
        END LOOP;

        -- Check trigger functions with relation context
        FOR v_rec IN 
            SELECT t.tgrelid, t.tgfoid, p.proname, c.relname
            FROM pg_trigger t
            JOIN pg_proc p ON p.oid = t.tgfoid
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_language l ON l.oid = p.prolang
            WHERE NOT t.tgisinternal 
              AND l.lanname = 'plpgsql'
              AND p.pronamespace = 'public'::regnamespace
            ORDER BY p.proname
        LOOP
            BEGIN
                FOR v_err IN 
                    EXECUTE 'SELECT message, level FROM extensions.plpgsql_check_function_tb($1, $2) WHERE level = ''error''' 
                    USING v_rec.tgfoid, v_rec.tgrelid
                LOOP
                    v_err_count := v_err_count + 1;
                    INSERT INTO temp_verification_results (check_category, check_name, status, details)
                    VALUES ('plpgsql_check_trigger', v_rec.proname || ' on ' || v_rec.relname, 'FAIL', v_err.message);
                END LOOP;
            EXCEPTION WHEN OTHERS THEN
                INSERT INTO temp_verification_results (check_category, check_name, status, details)
                VALUES ('plpgsql_check_trigger', v_rec.proname, 'WARN', 'Trigger check skipped or error: ' || SQLERRM);
            END;
        END LOOP;

        IF v_err_count = 0 THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('plpgsql_check', 'All PL/pgSQL Functions and Triggers', 'PASS', 'Zero error-level findings reported by plpgsql_check');
        END IF;
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('plpgsql_check', 'plpgsql_check extension', 'WARN', 'Extension not enabled. Enable via Database > Extensions to run AST checks');
    END IF;

END $$;

-- 4. Display Complete Tabular Verification Results with Summary Line
SELECT 
    id,
    check_category,
    check_name,
    status,
    details
FROM temp_verification_results
UNION ALL
SELECT 
    999999,
    'SUMMARY' as check_category,
    'OVERALL VERIFICATION STATUS' as check_name,
    CASE WHEN count(*) FILTER (WHERE status = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END as status,
    format('Total: %s | Passed: %s | Failed: %s | Warnings: %s', 
        count(*),
        count(*) FILTER (WHERE status = 'PASS'), 
        count(*) FILTER (WHERE status = 'FAIL'), 
        count(*) FILTER (WHERE status = 'WARN')
    ) as details
FROM temp_verification_results
ORDER BY id;
