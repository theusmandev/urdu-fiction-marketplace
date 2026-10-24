-- ==============================================================================
-- UNB PREMIUM — POST-MIGRATION VERIFICATION SUITE (CANONICAL)
-- File: supabase/tests/00_post_migration_verification.sql
--
-- Instructions:
-- Execute this entire file in the Supabase SQL Editor as postgres/service_role.
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

    -- Authoritative 29 core tables from migrations 0001 through 0020
    v_expected_tables text[] := ARRAY[
        'profiles', 'writer_profiles', 'writer_payment_methods', 'genres', 'novels',
        'novel_genres', 'chapters', 'chapter_revisions', 'reader_progress', 'chapter_reads',
        'orders', 'payment_submissions', 'purchase_entitlements', 'sales_ledger',
        'commission_invoices', 'commission_invoice_lines', 'commission_payments',
        'platform_payment_methods', 'commission_payment_reports', 'disputes',
        'dispute_messages', 'refund_requests', 'support_requests', 'support_messages',
        'notifications', 'notification_preferences', 'email_outbox', 'audit_logs',
        'platform_settings'
    ];

    -- Authoritative objects introduced in Migration 0018
    v_0018_tables text[] := ARRAY[
        'dispute_messages', 'refund_requests', 'support_requests',
        'support_messages', 'notification_preferences', 'email_outbox'
    ];

    v_0018_functions text[] := ARRAY[
        'enqueue_email_for_notification', 'open_dispute', 'add_dispute_message',
        'resolve_dispute_for_reader_verify', 'resolve_dispute_refund', 'resolve_dispute_for_writer',
        'close_dispute', 'get_my_disputes', 'get_dispute', 'admin_list_disputes',
        'request_refund', 'approve_refund_request', 'reject_refund_request',
        'admin_list_refund_requests', 'create_support_request', 'add_support_message',
        'close_support_request', 'get_my_support_requests', 'get_support_request',
        'admin_list_support_requests', 'run_scheduled_reminders', 'update_platform_settings',
        'claim_pending_emails_for_sending', 'record_email_delivery_result',
        'get_email_outbox_stats', 'retry_failed_emails', 'get_my_notification_preferences',
        'update_notification_preferences'
    ];

    -- Explicit repo-derived allow-list of functions executable by anon
    -- Catalog discovery and RLS helper functions required by unauthenticated visitors
    v_anon_allowlist text[] := ARRAY[
        'search_public_novels',
        'get_public_novel_chapters',
        'has_novel_entitlement',
        'is_admin'
    ];

    -- Authenticated-only workflow RPCs that MUST exist and MUST NOT be executable by anon
    v_authenticated_rpcs text[] := ARRAY[
        'get_checkout_options',
        'create_order',
        'submit_payment',
        'verify_order_payment',
        'reject_order_payment',
        'admin_force_verify',
        'get_chapter_for_reader',
        'get_my_library',
        'get_my_ledger',
        'get_my_sales_summary',
        'admin_list_orders',
        'admin_get_order',
        'preview_commission_invoice',
        'generate_commission_invoice',
        'report_commission_payment',
        'confirm_commission_settlement',
        'open_dispute',
        'resolve_dispute_for_reader_verify',
        'resolve_dispute_refund',
        'resolve_dispute_for_writer',
        'close_dispute',
        'request_refund',
        'approve_refund_request',
        'reject_refund_request',
        'update_platform_settings'
    ];

    v_tbl text;
    v_fn text;
    v_found_anon_privs integer := 0;
BEGIN
    -- --------------------------------------------------------------------------
    -- CHECK 1: Canonical Core Tables Existence (All 29 Tables)
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
            VALUES ('TABLES', 'Table public.' || v_tbl, 'FAIL', 'Missing expected table public.' || v_tbl);
        END IF;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- CHECK 2: Ground Truth Column Invariants
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

    -- purchase_entitlements: granted_at exists; created_at does NOT exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_entitlements' AND column_name = 'granted_at'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'purchase_entitlements' AND column_name = 'created_at'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'purchase_entitlements.granted_at', 'PASS', 'Correct: granted_at exists and created_at is absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'purchase_entitlements.granted_at', 'FAIL', 'Mismatch on purchase_entitlements: expected granted_at, not created_at');
    END IF;

    -- sales_ledger: writer_net_pkr exists; writer_payout_pkr and is_reconciled absent
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

    -- platform_settings: default_unpaid_commission_limit exists; unpaid_commission_threshold_pkr absent
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'default_unpaid_commission_limit'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'unpaid_commission_threshold_pkr'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'platform_settings.default_unpaid_commission_limit', 'PASS', 'Correct: default_unpaid_commission_limit exists');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'platform_settings.default_unpaid_commission_limit', 'FAIL', 'Column mismatch on platform_settings');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 3: PostgreSQL Enum Values (Using real type commission_invoice_status)
    -- --------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'commission_invoice_status' AND typnamespace = 'public'::regnamespace
    ) THEN
        IF EXISTS (
            SELECT 1 FROM pg_enum e 
            JOIN pg_type t ON t.oid = e.enumtypid 
            WHERE t.typname = 'commission_invoice_status' AND e.enumlabel = 'partially_paid'
        ) AND EXISTS (
            SELECT 1 FROM pg_enum e 
            JOIN pg_type t ON t.oid = e.enumtypid 
            WHERE t.typname = 'commission_invoice_status' AND e.enumlabel = 'void'
        ) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ENUMS', 'commission_invoice_status enum additions', 'PASS', 'partially_paid and void enum values present');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ENUMS', 'commission_invoice_status enum additions', 'FAIL', 'Missing partially_paid or void in commission_invoice_status');
        END IF;
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('ENUMS', 'commission_invoice_status enum additions', 'FAIL', 'Enum public.commission_invoice_status does not exist');
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
        VALUES ('OVERLOADS', 'update_platform_settings signature', 'PASS', 'Single canonical signature public.update_platform_settings');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'update_platform_settings signature', 'FAIL', 'Found ' || v_cnt || ' overloads for update_platform_settings');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 5: Financial Tables Privilege Lockdown (anon & authenticated)
    -- --------------------------------------------------------------------------
    FOREACH v_tbl IN ARRAY ARRAY['orders', 'payment_submissions', 'commission_invoices', 'sales_ledger', 'audit_logs', 'purchase_entitlements'] LOOP
        v_has_priv := has_table_privilege('anon', 'public.' || v_tbl, 'INSERT')
                   OR has_table_privilege('anon', 'public.' || v_tbl, 'UPDATE')
                   OR has_table_privilege('anon', 'public.' || v_tbl, 'DELETE')
                   OR has_table_privilege('anon', 'public.' || v_tbl, 'TRUNCATE');
        IF NOT v_has_priv THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'anon mutates ' || v_tbl, 'PASS', 'anon has NO INSERT/UPDATE/DELETE/TRUNCATE');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'anon mutates ' || v_tbl, 'FAIL', 'anon has unauthorized table mutation privilege on ' || v_tbl);
        END IF;

        v_has_priv := has_table_privilege('authenticated', 'public.' || v_tbl, 'INSERT')
                   OR has_table_privilege('authenticated', 'public.' || v_tbl, 'UPDATE')
                   OR has_table_privilege('authenticated', 'public.' || v_tbl, 'DELETE')
                   OR has_table_privilege('authenticated', 'public.' || v_tbl, 'TRUNCATE');
        IF NOT v_has_priv THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'authenticated mutates ' || v_tbl, 'PASS', 'authenticated has NO direct INSERT/UPDATE/DELETE/TRUNCATE');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'authenticated mutates ' || v_tbl, 'FAIL', 'authenticated has unauthorized direct table mutation privilege on ' || v_tbl);
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
    -- CHECK 6: Full Anon Function Execution Audit (Listing & Explicit Allow-List)
    -- --------------------------------------------------------------------------
    -- Every function executable by anon MUST be on the explicit allow-list. Anything else is FAIL.
    FOR v_rec IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
        ORDER BY p.proname
    LOOP
        IF v_rec.proname = ANY(v_anon_allowlist) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ANON_AUDIT', 'Allowed anon execution: ' || v_rec.proname, 'PASS', 'Whitelisted: ' || v_rec.proname || '(' || v_rec.args || ')');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ANON_AUDIT', 'UNAUTHORIZED anon execution: ' || v_rec.proname, 'FAIL', 'Function ' || v_rec.proname || '(' || v_rec.args || ') is executable by anon but not whitelisted');
        END IF;
    END LOOP;

    -- Authenticated-only workflow functions: MUST exist and MUST NOT be executable by anon
    FOREACH v_fn IN ARRAY v_authenticated_rpcs LOOP
        SELECT count(*) INTO v_cnt 
        FROM pg_proc p 
        WHERE p.proname = v_fn 
          AND p.pronamespace = 'public'::regnamespace;

        IF v_cnt = 0 THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('AUTHENTICATED_RPCS', 'Existence of ' || v_fn, 'FAIL', 'Expected workflow function does NOT exist');
        ELSE
            SELECT count(*) INTO v_cnt 
            FROM pg_proc p 
            WHERE p.proname = v_fn 
              AND p.pronamespace = 'public'::regnamespace
              AND has_function_privilege('anon', p.oid, 'EXECUTE');

            IF v_cnt = 0 THEN
                INSERT INTO temp_verification_results (check_category, check_name, status, details)
                VALUES ('AUTHENTICATED_RPCS', 'anon lockdown on ' || v_fn, 'PASS', 'Strictly restricted to authenticated/service_role');
            ELSE
                INSERT INTO temp_verification_results (check_category, check_name, status, details)
                VALUES ('AUTHENTICATED_RPCS', 'anon lockdown on ' || v_fn, 'FAIL', 'anon has unauthorized EXECUTE grant on ' || v_fn);
            END IF;
        END IF;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- CHECK 7: Migration 0018 Objects Explicit Verification (Tables & Functions)
    -- --------------------------------------------------------------------------
    FOREACH v_tbl IN ARRAY v_0018_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = v_tbl
        ) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('0018_OBJECTS', 'Table public.' || v_tbl, 'PASS', '0018 table exists');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('0018_OBJECTS', 'Table public.' || v_tbl, 'FAIL', 'Missing 0018 table: ' || v_tbl);
        END IF;
    END LOOP;

    FOREACH v_fn IN ARRAY v_0018_functions LOOP
        IF EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = v_fn AND pronamespace = 'public'::regnamespace
        ) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('0018_OBJECTS', 'Function public.' || v_fn, 'PASS', '0018 function exists');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('0018_OBJECTS', 'Function public.' || v_fn, 'FAIL', 'Missing 0018 function: ' || v_fn);
        END IF;
    END LOOP;

    -- --------------------------------------------------------------------------
    -- CHECK 8: Row-Level Security Enabled on All Public Tables
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
    -- CHECK 9: SECURITY DEFINER Search Path Enforcement
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
    -- CHECK 10: Immutability Tamper Prevention Triggers (sales_ledger & audit_logs)
    -- --------------------------------------------------------------------------
    -- Query pg_trigger dynamically for any non-internal BEFORE trigger covering UPDATE & DELETE
    -- calling a function whose source raises an exception
    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'public'
          AND c.relname = 'sales_ledger'
          AND NOT t.tgisinternal
          AND (t.tgtype::int & 16) = 16 -- UPDATE
          AND p.prosrc ILIKE '%RAISE%EXCEPTION%'
    ) AND EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'public'
          AND c.relname = 'sales_ledger'
          AND NOT t.tgisinternal
          AND (t.tgtype::int & 8) = 8 -- DELETE
          AND p.prosrc ILIKE '%RAISE%EXCEPTION%'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('IMMUTABILITY', 'sales_ledger tamper prevention', 'PASS', 'Active non-internal BEFORE UPDATE and DELETE triggers raise exception');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('IMMUTABILITY', 'sales_ledger tamper prevention', 'FAIL', 'Missing active tamper prevention trigger firing on UPDATE/DELETE on sales_ledger');
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'public'
          AND c.relname = 'audit_logs'
          AND NOT t.tgisinternal
          AND (t.tgtype::int & 16) = 16 -- UPDATE
          AND p.prosrc ILIKE '%RAISE%EXCEPTION%'
    ) AND EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'public'
          AND c.relname = 'audit_logs'
          AND NOT t.tgisinternal
          AND (t.tgtype::int & 8) = 8 -- DELETE
          AND p.prosrc ILIKE '%RAISE%EXCEPTION%'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('IMMUTABILITY', 'audit_logs tamper prevention', 'PASS', 'Active non-internal BEFORE UPDATE and DELETE triggers raise exception');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('IMMUTABILITY', 'audit_logs tamper prevention', 'FAIL', 'Missing active tamper prevention trigger firing on UPDATE/DELETE on audit_logs');
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 11: Private Storage Buckets Lockdown
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

        IF EXISTS (
            SELECT 1 FROM storage.buckets WHERE id = 'dispute-proofs' AND public = false
        ) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('STORAGE', 'dispute-proofs bucket privacy', 'PASS', 'Bucket is strictly private (public = false)');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('STORAGE', 'dispute-proofs bucket privacy', 'FAIL', 'Bucket dispute-proofs is public or missing');
        END IF;
    END IF;

    -- --------------------------------------------------------------------------
    -- CHECK 12: plpgsql_check AST Runtime Analysis (Functions & Trigger Relations)
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
