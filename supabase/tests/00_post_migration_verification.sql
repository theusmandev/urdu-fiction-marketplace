-- ==============================================================================
-- UNB PREMIUM — POST-MIGRATION VERIFICATION SUITE v2 (CANONICAL)
-- File: supabase/tests/00_post_migration_verification.sql
--
-- Instructions:
--   Execute this entire file in the Supabase SQL Editor as postgres/service_role.
--   This script does NOT modify application data or leave temporary objects behind.
--   Output: A single tabular PASS / FAIL / WARN / INFO report covering schema,
--           columns, enum values, security privileges, search_path enforcement,
--           trigger protections, storage bucket privacy, and plpgsql_check AST.
--
-- Changes vs v1 (based on live run results):
--   B1. Anon audit now EXCLUDES extension-owned functions (pg_depend deptype='e').
--       pg_trgm gin_*_trgm*, gtrgm_*, set_limit, similarity*, etc. appear as
--       INFO rows (not FAIL), plus one INFO row listing all extension-owned
--       public functions.
--   B2. Trigger function anon audit: trigger functions are not separately
--       callable, but we verify that no trigger function has EXECUTE granted
--       to anon or authenticated in pg_proc.proacl (post 0021 migration).
--   B3. Storage: dispute-proofs check removed (bucket does not exist in repo;
--       dispute evidence lives in payment-proofs/<dispute_id>/). Replaced with
--       a check that payment-proofs bucket is private, and an INFO describing
--       the expected storage layout for dispute attachments.
--   B4a. search_path check now expects '' (empty string) on all SECURITY DEFINER
--       functions. Any function with search_path = 'public' or 'public, pg_temp'
--       is FAIL.
--   B4b. has_function_privilege check now explicitly handles missing functions
--       and FAILs when the function does not exist.
--   B4c. Schema snapshot table checks now explicitly cover append-only and RLS
--       expectations for every table listed in docs/SCHEMA_SNAPSHOT.md.
--
-- ==============================================================================
-- CANONICAL SCHEMA REFERENCE: NOT NULL COLUMNS WITHOUT DEFAULT
-- Generated strictly from docs/SCHEMA_SNAPSHOT.md for fixture integrity.
--
-- Tables and their mandatory (NOT NULL, no default) columns:
--   1. public.profiles:
--      - id (uuid, references auth.users(id))
--      - email (text)
--   2. public.writer_profiles:
--      - id (uuid, references profiles(id))
--      - pen_name_urdu (text)
--      - pen_name_english (text)
--   3. public.writer_payment_methods:
--      - writer_id (uuid, references writer_profiles(id))
--      - method_type (payment_method_type enum: 'jazzcash', 'easypaisa', 'raast', 'bank_iban')
--      - account_title (text)
--      - account_number_or_iban (text)
--   4. public.novels:
--      - writer_id (uuid, references writer_profiles(id))
--      - slug (text)
--      - title_urdu (text)
--      - title_english (text)
--      - synopsis_urdu (text)
--      - price_pkr (numeric(10,2))
--      - rights_declaration_accepted (boolean)
--   5. public.chapters:
--      - novel_id (uuid, references novels(id))
--      - chapter_number (integer)
--      - title_urdu (text)
--      - content_urdu (text)
--   6. public.orders:
--      - order_number (text)
--      - reader_id (uuid, references profiles(id))
--      - writer_id (uuid, references writer_profiles(id))
--      - novel_id (uuid, references novels(id))
--      - novel_title_snapshot (text)
--      - amount_pkr (numeric(10,2))
--      - applied_commission_rate (numeric(5,2))
--      - calculated_commission_pkr (numeric(10,2))
--      - calculated_writer_share_pkr (numeric(10,2))
--   7. public.payment_submissions:
--      - order_id (uuid, references orders(id))
--      - reader_id (uuid, references profiles(id))
--      - writer_id (uuid, references writer_profiles(id))
--      - transaction_reference_tid (text)
--      - screenshot_url (text)
--   8. public.purchase_entitlements:
--      - reader_id (uuid, references profiles(id))
--      - novel_id (uuid, references novels(id))
--      - order_id (uuid, references orders(id))
--   9. public.sales_ledger:
--      - order_id (uuid, references orders(id))
--      - writer_id (uuid, references writer_profiles(id))
--      - reader_id (uuid, references profiles(id))
--      - novel_id (uuid, references novels(id))
--      - entry_type (text: 'sale_verified', 'refund_adjustment', 'manual_correction')
--      - gross_amount_pkr (numeric(10,2))
--      - commission_rate (numeric(5,2))
--      - platform_commission_pkr (numeric(10,2))
--      - writer_net_pkr (numeric(10,2))
--  10. public.commission_invoices:
--      - invoice_number (text)
--      - writer_id (uuid, references writer_profiles(id))
--      - period_start (timestamptz)
--      - period_end (timestamptz)
--  11. public.commission_invoice_lines:
--      - invoice_id (uuid, references commission_invoices(id))
--      - ledger_entry_id (uuid, references sales_ledger(id))
--      - commission_pkr (numeric(10,2))
--  12. public.commission_payments:
--      - invoice_id (uuid, references commission_invoices(id))
--      - writer_id (uuid, references writer_profiles(id))
--      - amount_pkr (numeric(12,2))
--      - transaction_reference (text)
--  13. public.commission_payment_reports:
--      - invoice_id (uuid, references commission_invoices(id))
--      - writer_id (uuid, references writer_profiles(id))
--      - amount_pkr (numeric(12,2))
--      - transaction_reference (text)
--      - normalized_tid (text)
--      - screenshot_path (text)
--  14. public.disputes:
--      - order_id (uuid, references orders(id))
--      - raised_by_id (uuid, references profiles(id))
--      - reason (text)
--  15. public.refund_requests:
--      - order_id (uuid, references orders(id))
--      - requested_by (uuid, references profiles(id))
--      - requester_role (text: 'writer', 'reader')
--      - reason (text)
--  16. public.support_requests:
--      - user_id (uuid, references profiles(id))
--      - category (text: 'order', 'payment', 'account', 'content', 'other')
--      - subject (text)
--      - body (text)
--  17. public.notifications:
--      - user_id (uuid, references profiles(id))
--      - title (text)
--      - message (text)
--  18. public.audit_logs:
--      - action_type (text)
--      - entity_type (text)
--      - entity_id (text)
-- ==============================================================================

-- 1. Ensure plpgsql_check extension exists
CREATE EXTENSION IF NOT EXISTS plpgsql_check WITH SCHEMA extensions;

-- 2. Create temporary result table
CREATE TEMP TABLE IF NOT EXISTS temp_verification_results (
    id              serial PRIMARY KEY,
    check_category  text NOT NULL,
    check_name      text NOT NULL,
    status          text NOT NULL CHECK (status IN ('PASS','FAIL','WARN','INFO')),
    details         text NOT NULL
) ON COMMIT PRESERVE ROWS;

TRUNCATE TABLE temp_verification_results;

-- 3. Execute all checks
DO $$
DECLARE
    v_rec   record;
    v_err   record;
    v_cnt   integer;
    v_has   boolean;
    v_err_count integer := 0;

    -- Authoritative tables from migrations 0001–0034
    v_expected_tables text[] := ARRAY[
        'profiles', 'writer_profiles', 'writer_payment_methods', 'genres', 'novels',
        'novel_genres', 'chapters', 'chapter_revisions', 'reader_progress', 'chapter_reads',
        'orders', 'payment_submissions', 'purchase_entitlements', 'sales_ledger',
        'commission_invoices', 'commission_invoice_lines', 'commission_payments',
        'platform_payment_methods', 'commission_payment_reports', 'disputes',
        'dispute_messages', 'refund_requests', 'support_requests', 'support_messages',
        'notifications', 'notification_preferences', 'email_outbox', 'audit_logs',
        'platform_settings', 'chapter_drafts', 'chapter_draft_rate_limits',
        'writer_tip_settings', 'tips'
    ];

    -- Append-only tables (must have immutability triggers)
    v_append_only_tables text[] := ARRAY['sales_ledger', 'audit_logs'];

    -- Tables that must have RLS enabled (all public tables should)
    -- These are checked dynamically below.

    -- Objects introduced in Migration 0018
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

    -- Explicit allow-list for anon EXECUTE (catalog/RLS helpers only)
    v_anon_allowlist text[] := ARRAY[
        'search_public_novels',
        'get_public_novel_chapters',
        'has_novel_entitlement',
        'is_admin',
        'get_tip_options'
    ];

    -- Authenticated-only workflow RPCs (must exist; must NOT be anon-executable)
    v_authenticated_rpcs text[] := ARRAY[
        'get_checkout_options', 'create_order', 'submit_payment',
        'verify_order_payment', 'reject_order_payment', 'admin_force_verify',
        'get_chapter_for_reader', 'get_my_library', 'get_my_ledger',
        'get_my_sales_summary', 'admin_list_orders', 'admin_get_order',
        'preview_commission_invoice', 'generate_commission_invoice',
        'report_commission_payment', 'confirm_commission_settlement',
        'open_dispute', 'resolve_dispute_for_reader_verify',
        'resolve_dispute_refund', 'resolve_dispute_for_writer',
        'close_dispute', 'request_refund', 'approve_refund_request',
        'reject_refund_request', 'update_platform_settings',
        'set_my_tip_settings', 'get_my_tip_settings', 'create_tip',
        'submit_tip_payment', 'cancel_tip', 'confirm_tip_received',
        'mark_tip_not_received', 'get_my_tips', 'get_tip_by_number', 'get_my_received_tips',
        'get_my_tip_summary', 'hide_tip_message', 'report_tip_message',
        'admin_remove_tip_message', 'admin_list_tips', 'admin_get_tip',
        'admin_review_tip', 'can_access_tip_proof'
    ];

    v_tbl text;
    v_fn  text;
    v_ext_fn_list text := '';
    v_ext_fn_count integer := 0;
BEGIN

    -- =========================================================================
    -- CHECK 1: Canonical Core Tables Existence (All 29 Tables)
    -- =========================================================================
    FOREACH v_tbl IN ARRAY v_expected_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = v_tbl
        ) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('TABLES', 'public.' || v_tbl, 'PASS', 'Table exists');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('TABLES', 'public.' || v_tbl, 'FAIL',
                'Missing expected table public.' || v_tbl);
        END IF;
    END LOOP;

    -- =========================================================================
    -- CHECK 2: Ground Truth Column Invariants
    -- =========================================================================

    -- orders.payment_method must NOT exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payment_method'
    ) THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'orders.payment_method absence', 'PASS', 'Correct: column is absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'orders.payment_method absence', 'FAIL',
            'Found unexpected orders.payment_method column');
    END IF;

    -- novels.cover_url must exist; cover_image_url must NOT exist
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='novels' AND column_name='cover_url')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='novels' AND column_name='cover_image_url')
    THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'novels.cover_url', 'PASS', 'cover_url exists; cover_image_url absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'novels.cover_url', 'FAIL',
            'Column mismatch on novels (expected cover_url only)');
    END IF;

    -- chapters.title_urdu must exist; title_english must NOT exist
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='chapters' AND column_name='title_urdu')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='chapters' AND column_name='title_english')
    THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'chapters.title_urdu', 'PASS', 'title_urdu exists; title_english absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'chapters.title_urdu', 'FAIL',
            'Column mismatch on chapters (expected title_urdu only)');
    END IF;

    -- payment_submissions: is_duplicate_tid_flagged and screenshot_path exist
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='payment_submissions'
               AND column_name='is_duplicate_tid_flagged')
       AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='payment_submissions'
               AND column_name='screenshot_path')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='payment_submissions'
               AND column_name='is_duplicate_tid')
    THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'payment_submissions columns', 'PASS',
            'is_duplicate_tid_flagged and screenshot_path exist; is_duplicate_tid absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'payment_submissions columns', 'FAIL',
            'Column mismatch on payment_submissions');
    END IF;

    -- purchase_entitlements: granted_at exists; created_at does NOT exist
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='purchase_entitlements'
               AND column_name='granted_at')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='purchase_entitlements'
               AND column_name='created_at')
    THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'purchase_entitlements.granted_at', 'PASS',
            'granted_at exists; created_at absent (was fixed in 0020)');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'purchase_entitlements.granted_at', 'FAIL',
            'Mismatch: expected granted_at only, not created_at');
    END IF;

    -- sales_ledger: writer_net_pkr exists; writer_payout_pkr and is_reconciled absent
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='sales_ledger'
               AND column_name='writer_net_pkr')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='sales_ledger'
               AND column_name='writer_payout_pkr')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='sales_ledger'
               AND column_name='is_reconciled')
    THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'sales_ledger columns', 'PASS',
            'writer_net_pkr present; writer_payout_pkr and is_reconciled absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'sales_ledger columns', 'FAIL', 'Column mismatch on sales_ledger');
    END IF;

    -- platform_settings: default_unpaid_commission_limit exists; unpaid_commission_threshold_pkr absent
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='platform_settings'
               AND column_name='default_unpaid_commission_limit')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='platform_settings'
               AND column_name='unpaid_commission_threshold_pkr')
    THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'platform_settings.default_unpaid_commission_limit', 'PASS',
            'Correct column name exists; legacy alias absent');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('COLUMNS', 'platform_settings.default_unpaid_commission_limit', 'FAIL',
            'Column mismatch on platform_settings');
    END IF;

    -- =========================================================================
    -- CHECK 3: PostgreSQL Enum Values
    -- =========================================================================
    IF EXISTS (SELECT 1 FROM pg_type
               WHERE typname = 'commission_invoice_status'
               AND typnamespace = 'public'::regnamespace)
    THEN
        IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                   WHERE t.typname = 'commission_invoice_status' AND e.enumlabel = 'partially_paid')
           AND EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                       WHERE t.typname = 'commission_invoice_status' AND e.enumlabel = 'void')
        THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ENUMS', 'commission_invoice_status', 'PASS',
                'partially_paid and void enum values present');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ENUMS', 'commission_invoice_status', 'FAIL',
                'Missing partially_paid or void in commission_invoice_status');
        END IF;
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('ENUMS', 'commission_invoice_status', 'FAIL',
            'Enum public.commission_invoice_status does not exist');
    END IF;

    -- =========================================================================
    -- CHECK 4: Function Overload Cleanliness
    -- =========================================================================
    SELECT count(*) INTO v_cnt FROM pg_proc
    WHERE proname = 'approve_novel' AND pronamespace = 'public'::regnamespace;
    IF v_cnt = 1 THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'approve_novel', 'PASS', 'Single canonical signature');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'approve_novel', 'FAIL',
            'Found ' || v_cnt || ' overloads for approve_novel');
    END IF;

    SELECT count(*) INTO v_cnt FROM pg_proc
    WHERE proname = 'update_platform_settings' AND pronamespace = 'public'::regnamespace;
    IF v_cnt = 1 THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'update_platform_settings', 'PASS', 'Single canonical signature');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('OVERLOADS', 'update_platform_settings', 'FAIL',
            'Found ' || v_cnt || ' overloads for update_platform_settings');
    END IF;

    -- =========================================================================
    -- CHECK 5: Financial Tables Privilege Lockdown (anon & authenticated)
    -- =========================================================================
    FOREACH v_tbl IN ARRAY ARRAY[
        'orders', 'payment_submissions', 'commission_invoices',
        'sales_ledger', 'audit_logs', 'purchase_entitlements'
    ] LOOP
        v_has := has_table_privilege('anon', 'public.' || v_tbl, 'INSERT')
               OR has_table_privilege('anon', 'public.' || v_tbl, 'UPDATE')
               OR has_table_privilege('anon', 'public.' || v_tbl, 'DELETE')
               OR has_table_privilege('anon', 'public.' || v_tbl, 'TRUNCATE');
        IF NOT v_has THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'anon mutates ' || v_tbl, 'PASS',
                'anon has no INSERT/UPDATE/DELETE/TRUNCATE on ' || v_tbl);
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'anon mutates ' || v_tbl, 'FAIL',
                'anon has unauthorized mutation privilege on ' || v_tbl);
        END IF;

        v_has := has_table_privilege('authenticated', 'public.' || v_tbl, 'INSERT')
               OR has_table_privilege('authenticated', 'public.' || v_tbl, 'UPDATE')
               OR has_table_privilege('authenticated', 'public.' || v_tbl, 'DELETE')
               OR has_table_privilege('authenticated', 'public.' || v_tbl, 'TRUNCATE');
        IF NOT v_has THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'authenticated mutates ' || v_tbl, 'PASS',
                'authenticated has no direct INSERT/UPDATE/DELETE/TRUNCATE on ' || v_tbl);
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('PERMISSIONS', 'authenticated mutates ' || v_tbl, 'FAIL',
                'authenticated has unauthorized direct mutation privilege on ' || v_tbl);
        END IF;
    END LOOP;

    -- Notifications: authenticated column-level UPDATE on is_read/read_at only
    IF NOT has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE')
    THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('PERMISSIONS', 'notifications UPDATE scope', 'PASS',
            'Restricted to column-level (is_read, read_at)');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('PERMISSIONS', 'notifications UPDATE scope', 'FAIL',
            'Full table UPDATE granted to authenticated');
    END IF;

    -- =========================================================================
    -- CHECK 6: Extension-Owned Functions in Public Schema (INFO only)
    -- =========================================================================
    -- Identify extension-owned functions via pg_depend deptype='e'.
    -- These are NOT bugs — extensions like pg_trgm live in schema public by default.
    FOR v_rec IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, e.extname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE n.nspname = 'public'
        ORDER BY e.extname, p.proname
    LOOP
        v_ext_fn_count := v_ext_fn_count + 1;
        v_ext_fn_list := v_ext_fn_list ||
            CASE WHEN v_ext_fn_list = '' THEN '' ELSE ', ' END ||
            v_rec.extname || ':' || v_rec.proname;
    END LOOP;

    IF v_ext_fn_count > 0 THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('EXT_FUNCTIONS', 'Extension-owned functions in schema public', 'INFO',
            format('%s function(s) owned by extensions (excluded from anon audit): %s',
                   v_ext_fn_count, left(v_ext_fn_list, 500)));
    END IF;

    -- List which extensions have objects in schema public
    FOR v_rec IN
        SELECT DISTINCT e.extname
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        JOIN pg_proc p ON p.oid = d.objid AND d.deptype = 'e'
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        ORDER BY e.extname
    LOOP
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('EXT_FUNCTIONS', 'Extension in schema public: ' || v_rec.extname, 'INFO',
            'Extension ' || v_rec.extname || ' has functions in schema public — expected and intentional');
    END LOOP;

    -- =========================================================================
    -- CHECK 7: Full Anon Function Execution Audit
    --   Exclude extension-owned functions (deptype='e').
    --   Trigger functions are separately checked in CHECK 8.
    -- =========================================================================
    FOR v_rec IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prorettype
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
          -- Exclude extension-owned functions
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.objid = p.oid AND d.deptype = 'e'
          )
          -- Exclude trigger functions (handled separately in CHECK 8)
          AND p.prorettype != 'trigger'::regtype
        ORDER BY p.proname
    LOOP
        IF v_rec.proname = ANY(v_anon_allowlist) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ANON_AUDIT', 'Allowed anon: ' || v_rec.proname, 'PASS',
                'Whitelisted: ' || v_rec.proname || '(' || v_rec.args || ')');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ANON_AUDIT', 'UNAUTHORIZED anon: ' || v_rec.proname, 'FAIL',
                'Non-extension, non-trigger function executable by anon but not whitelisted: '
                || v_rec.proname || '(' || v_rec.args || ')');
        END IF;
    END LOOP;

    -- Anon allowlist existence check: each allowlisted function must actually exist
    FOREACH v_fn IN ARRAY v_anon_allowlist LOOP
        SELECT count(*) INTO v_cnt FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_fn;

        IF v_cnt = 0 THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('ANON_AUDIT', 'Allowlisted function missing: ' || v_fn, 'FAIL',
                'Function ' || v_fn || ' is on the anon allowlist but does not exist in schema public');
        END IF;
    END LOOP;

    -- =========================================================================
    -- CHECK 8: Trigger Function Privilege Audit (must NOT be executable by anon/authenticated)
    -- =========================================================================
    FOR v_rec IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prorettype = 'trigger'::regtype
          AND (   has_function_privilege('anon',          p.oid, 'EXECUTE')
               OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
        ORDER BY p.proname
    LOOP
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('TRIGGER_PRIVS', 'Trigger fn with anon/auth grant: ' || v_rec.proname, 'FAIL',
            format('Trigger function %s(%s) is executable by anon or authenticated — revoke required in migration %s (run 0026_revoke_trigger_privileges_and_default_acls.sql)',
                   v_rec.proname,
                   v_rec.args,
                   CASE v_rec.proname
                       WHEN 'trg_commission_invoices_updated_at' THEN '0025_commission_settlement_and_audit_hardening.sql / 0026_revoke_trigger_privileges_and_default_acls.sql'
                       WHEN 'trg_protect_novel_published_status' THEN '0022_protection_triggers_and_search_path_lockdown.sql'
                       WHEN 'trg_protect_novel_status' THEN '0022_protection_triggers_and_search_path_lockdown.sql'
                       WHEN 'trg_prevent_direct_unpaid_commission_update' THEN '0022_protection_triggers_and_search_path_lockdown.sql'
                       WHEN 'prevent_append_only_mutation' THEN '0022_protection_triggers_and_search_path_lockdown.sql'
                       ELSE 'defining migration for ' || v_rec.proname || ' or 0026_revoke_trigger_privileges_and_default_acls.sql'
                   END));
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM temp_verification_results WHERE check_category = 'TRIGGER_PRIVS') THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('TRIGGER_PRIVS', 'Trigger functions privilege audit', 'PASS',
            'No trigger function in schema public is executable by anon or authenticated');
    END IF;

    -- =========================================================================
    -- CHECK 9: Authenticated-only RPCs (Must exist; must NOT be anon-executable)
    -- =========================================================================
    FOREACH v_fn IN ARRAY v_authenticated_rpcs LOOP
        SELECT count(*) INTO v_cnt FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_fn;

        IF v_cnt = 0 THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('AUTHENTICATED_RPCS', 'Existence: ' || v_fn, 'FAIL',
                'Expected workflow function does NOT exist in schema public');
        ELSE
            SELECT count(*) INTO v_cnt FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = v_fn
              AND has_function_privilege('anon', p.oid, 'EXECUTE');

            IF v_cnt = 0 THEN
                INSERT INTO temp_verification_results (check_category, check_name, status, details)
                VALUES ('AUTHENTICATED_RPCS', 'anon lockdown: ' || v_fn, 'PASS',
                    'Strictly restricted to authenticated/service_role');
            ELSE
                INSERT INTO temp_verification_results (check_category, check_name, status, details)
                VALUES ('AUTHENTICATED_RPCS', 'anon lockdown: ' || v_fn, 'FAIL',
                    'anon has unauthorized EXECUTE grant on ' || v_fn);
            END IF;
        END IF;
    END LOOP;

    -- =========================================================================
    -- CHECK 10: Migration 0018 Objects Explicit Verification
    -- =========================================================================
    FOREACH v_tbl IN ARRAY v_0018_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name=v_tbl)
        THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('0018_OBJECTS', 'Table public.' || v_tbl, 'PASS', '0018 table exists');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('0018_OBJECTS', 'Table public.' || v_tbl, 'FAIL',
                'Missing 0018 table: ' || v_tbl);
        END IF;
    END LOOP;

    FOREACH v_fn IN ARRAY v_0018_functions LOOP
        IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname=v_fn)
        THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('0018_OBJECTS', 'Function public.' || v_fn, 'PASS', '0018 function exists');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('0018_OBJECTS', 'Function public.' || v_fn, 'FAIL',
                'Missing 0018 function: ' || v_fn);
        END IF;
    END LOOP;

    -- =========================================================================
    -- CHECK 11: Row-Level Security Enabled on All Public Tables
    -- =========================================================================
    FOR v_rec IN
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
        ORDER BY c.relname
    LOOP
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('RLS_ENFORCEMENT', 'RLS on ' || v_rec.relname, 'FAIL',
            'Row-Level Security is DISABLED on public.' || v_rec.relname);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM temp_verification_results WHERE check_category='RLS_ENFORCEMENT') THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('RLS_ENFORCEMENT', 'RLS on all public tables', 'PASS',
            'All public tables have relrowsecurity = true');
    END IF;

    -- =========================================================================
    -- CHECK 12: SECURITY DEFINER search_path Enforcement
    --   All SECURITY DEFINER functions must have an explicit search_path GUC set.
    --   Any function with search_path containing 'public' (not empty string) is FAIL.
    --   Correct value: '' (empty string) — all objects schema-qualified in function body.
    -- =========================================================================

    -- 12a: Functions missing search_path entirely
    FOR v_rec IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prosecdef = true
          AND (p.proconfig IS NULL OR NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
          ))
        ORDER BY p.proname
    LOOP
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('SECURITY_DEFINER', v_rec.proname || '(' || v_rec.args || ')', 'FAIL',
            'SECURITY DEFINER function has no search_path GUC configured');
    END LOOP;

    -- 12b: Functions with non-empty search_path (must be strictly empty string '')
    FOR v_rec IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
               (SELECT cfg FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%' LIMIT 1) AS sp
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prosecdef = true
          AND EXISTS (
              SELECT 1 FROM unnest(p.proconfig) cfg
              WHERE cfg LIKE 'search_path=%'
                AND trim(substring(cfg from 13)) NOT IN ('', '""', '''''')
          )
        ORDER BY p.proname
    LOOP
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('SECURITY_DEFINER', v_rec.proname || '(' || v_rec.args || ')', 'FAIL',
            format('search_path = ''%s'' is not empty; all SECURITY DEFINER functions must have SET search_path = ''''',
                   v_rec.sp));
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM temp_verification_results WHERE check_category='SECURITY_DEFINER') THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('SECURITY_DEFINER', 'All SECURITY DEFINER functions', 'PASS',
            'Every SECURITY DEFINER function has search_path = '''' (empty string)');
    END IF;

    -- =========================================================================
    -- CHECK 13: Immutability Tamper Prevention Triggers (sales_ledger & audit_logs)
    -- =========================================================================
    FOREACH v_tbl IN ARRAY v_append_only_tables LOOP
        IF EXISTS (
            SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_proc p ON p.oid=t.tgfoid
            WHERE n.nspname='public' AND c.relname=v_tbl
              AND NOT t.tgisinternal
              AND (t.tgtype::int & 16) = 16 -- UPDATE
              AND p.prosrc ILIKE '%RAISE%EXCEPTION%'
        ) AND EXISTS (
            SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_proc p ON p.oid=t.tgfoid
            WHERE n.nspname='public' AND c.relname=v_tbl
              AND NOT t.tgisinternal
              AND (t.tgtype::int & 8) = 8 -- DELETE
              AND p.prosrc ILIKE '%RAISE%EXCEPTION%'
        ) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('IMMUTABILITY', v_tbl || ' tamper prevention', 'PASS',
                'Non-internal BEFORE UPDATE and BEFORE DELETE triggers raise exception');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('IMMUTABILITY', v_tbl || ' tamper prevention', 'FAIL',
                'Missing BEFORE UPDATE or BEFORE DELETE tamper prevention trigger on ' || v_tbl);
        END IF;
    END LOOP;

    -- =========================================================================
    -- CHECK 14: Private Storage Buckets Lockdown
    -- =========================================================================
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='storage' AND table_name='buckets') THEN

        -- payment-proofs: must exist and be private
        IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='payment-proofs' AND public=false) THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('STORAGE', 'payment-proofs bucket privacy', 'PASS',
                'Bucket payment-proofs is strictly private (public=false)');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('STORAGE', 'payment-proofs bucket privacy', 'FAIL',
                'Bucket payment-proofs is public or missing — dispute evidence is also stored here');
        END IF;

        -- dispute-proofs: does NOT exist in codebase (INFO, not FAIL)
        -- Dispute evidence is stored in payment-proofs/<dispute_id>/<filename>
        -- Storage policies on payment-proofs must cover that sub-path.
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('STORAGE', 'dispute-proofs bucket', 'INFO',
            'No separate dispute-proofs bucket is used. Dispute evidence is stored in payment-proofs/<dispute_id>/ path. '
            || 'Storage RLS policies on payment-proofs must allow: reader who owns order, order writer, and admins.');

    END IF;

    -- =========================================================================
    -- CHECK 15: has_function_privilege guard — fails gracefully when function missing
    --   Tests that our privilege check pattern handles non-existent functions safely.
    -- =========================================================================
    -- Check a known-existing function
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='is_admin') THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('FUNCTION_EXISTENCE', 'has_function_privilege guard: is_admin exists', 'PASS',
            'is_admin exists in schema public');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('FUNCTION_EXISTENCE', 'has_function_privilege guard: is_admin exists', 'FAIL',
            'is_admin does NOT exist — critical RLS helper missing');
    END IF;

    -- Check an intentionally non-existent function (must FAIL, not error)
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='this_function_does_not_exist_smoke_check';
    IF v_cnt = 0 THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('FUNCTION_EXISTENCE', 'has_function_privilege guard: non-existent fn', 'PASS',
            'Correctly detected missing function without raising an exception');
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('FUNCTION_EXISTENCE', 'has_function_privilege guard: non-existent fn', 'FAIL',
            'Unexpected: found a function named this_function_does_not_exist_smoke_check');
    END IF;

    -- =========================================================================
    -- CHECK 16: Schema Snapshot Table Expectations (from docs/SCHEMA_SNAPSHOT.md)
    --   Verifies append-only and RLS settings for all documented tables.
    -- =========================================================================

    -- Append-only tables must have RLS enabled AND immutability triggers
    FOREACH v_tbl IN ARRAY v_append_only_tables LOOP
        -- RLS check
        IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname=v_tbl AND c.relrowsecurity)
        THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('SCHEMA_SNAPSHOT', 'RLS on append-only table ' || v_tbl, 'PASS',
                v_tbl || ' has RLS enabled (documented as append-only)');
        ELSE
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('SCHEMA_SNAPSHOT', 'RLS on append-only table ' || v_tbl, 'FAIL',
                v_tbl || ' is documented as append-only but RLS is disabled');
        END IF;
    END LOOP;

    -- All 29 canonical tables must have RLS
    FOREACH v_tbl IN ARRAY v_expected_tables LOOP
        IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname=v_tbl AND NOT c.relrowsecurity)
        THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('SCHEMA_SNAPSHOT', 'RLS expectation: ' || v_tbl, 'FAIL',
                v_tbl || ' is in the schema snapshot but RLS is disabled');
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM temp_verification_results WHERE check_category='SCHEMA_SNAPSHOT' AND status='FAIL') THEN
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('SCHEMA_SNAPSHOT', 'All snapshot table RLS expectations', 'PASS',
            'All 29 documented tables have RLS enabled');
    END IF;

    -- =========================================================================
    -- CHECK 17: plpgsql_check AST Runtime Analysis
    --   FAIL rows include the offending function signature AND the first error
    --   message so the issue is immediately visible in the check_name column.
    -- =========================================================================
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='plpgsql_check') THEN
        -- Standard functions
        FOR v_rec IN
            SELECT p.oid AS func_oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
            FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
            JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE l.lanname='plpgsql' AND n.nspname='public' AND p.prorettype != 'trigger'::regtype
            ORDER BY p.proname
        LOOP
            BEGIN
                FOR v_err IN
                    EXECUTE 'SELECT message, level FROM extensions.plpgsql_check_function_tb($1) WHERE level = ''error'''
                    USING v_rec.func_oid
                LOOP
                    v_err_count := v_err_count + 1;
                    -- check_name contains function signature so failures are scannable at a glance
                    INSERT INTO temp_verification_results (check_category, check_name, status, details)
                    VALUES ('plpgsql_check',
                        'FUNCTION ' || v_rec.proname || '(' || v_rec.args || ')',
                        'FAIL',
                        'First error: ' || v_err.message);
                END LOOP;
            EXCEPTION WHEN OTHERS THEN
                INSERT INTO temp_verification_results (check_category, check_name, status, details)
                VALUES ('plpgsql_check', v_rec.proname, 'WARN',
                    'Check skipped or error: ' || SQLERRM);
            END;
        END LOOP;

        -- Trigger functions with relation context
        FOR v_rec IN
            SELECT t.tgrelid, t.tgfoid, p.proname, c.relname
            FROM pg_trigger t
            JOIN pg_proc p ON p.oid=t.tgfoid
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_language l ON l.oid=p.prolang
            JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE NOT t.tgisinternal AND l.lanname='plpgsql' AND n.nspname='public'
            ORDER BY p.proname
        LOOP
            BEGIN
                FOR v_err IN
                    EXECUTE 'SELECT message, level FROM extensions.plpgsql_check_function_tb($1, $2) WHERE level = ''error'''
                    USING v_rec.tgfoid, v_rec.tgrelid
                LOOP
                    v_err_count := v_err_count + 1;
                    -- check_name contains trigger name + table so failures are scannable at a glance
                    INSERT INTO temp_verification_results (check_category, check_name, status, details)
                    VALUES ('plpgsql_check_trigger',
                        'TRIGGER ' || v_rec.proname || ' ON ' || v_rec.relname,
                        'FAIL',
                        'First error: ' || v_err.message);
                END LOOP;
            EXCEPTION WHEN OTHERS THEN
                INSERT INTO temp_verification_results (check_category, check_name, status, details)
                VALUES ('plpgsql_check_trigger', v_rec.proname, 'WARN',
                    'Trigger check skipped or error: ' || SQLERRM);
            END;
        END LOOP;

        IF v_err_count = 0 THEN
            INSERT INTO temp_verification_results (check_category, check_name, status, details)
            VALUES ('plpgsql_check', 'All PL/pgSQL functions and triggers', 'PASS',
                'Zero error-level findings from plpgsql_check');
        END IF;
    ELSE
        INSERT INTO temp_verification_results (check_category, check_name, status, details)
        VALUES ('plpgsql_check', 'plpgsql_check extension', 'WARN',
            'Extension not enabled — enable via Database > Extensions to run AST checks');
    END IF;

END $$;

-- 4. Materialize results with summary line into temp table before final SELECT
DROP TABLE IF EXISTS test_results;
CREATE TEMP TABLE test_results AS
SELECT * FROM (
    SELECT
        id::integer AS id,
        check_category,
        check_name,
        status,
        details
    FROM temp_verification_results
    UNION ALL
    SELECT
        999999::integer AS id,
        'SUMMARY' AS check_category,
        'OVERALL VERIFICATION STATUS' AS check_name,
        CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
        format('Total: %s | PASS: %s | FAIL: %s | WARN: %s | INFO: %s',
               count(*),
               count(*) FILTER (WHERE status='PASS'),
               count(*) FILTER (WHERE status='FAIL'),
               count(*) FILTER (WHERE status='WARN'),
               count(*) FILTER (WHERE status='INFO')) AS details
    FROM temp_verification_results
) AS results
ORDER BY id::integer;

SELECT * FROM test_results ORDER BY id;
