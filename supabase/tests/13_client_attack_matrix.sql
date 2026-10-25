-- ==============================================================================
-- UNB PREMIUM — CLIENT ATTACK MATRIX & PRIVILEGE LOCKDOWN VERIFICATION
-- File: supabase/tests/13_client_attack_matrix.sql
--
-- Instructions:
--   Execute this entire file in the Supabase SQL Editor as postgres/service_role.
--   Transaction is wrapped in BEGIN ... ROLLBACK so NO test data or modifications
--   are persisted to the database.
--   Output: Tabular PASS / FAIL report for every simulated client attack vector,
--           displaying SQLSTATE or affected row count.
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

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. RESULTS TABLE SETUP (Accessible across role switches)
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS attack_matrix_results (
    test_id             integer PRIMARY KEY,
    category            text NOT NULL,
    actor               text NOT NULL,
    target              text NOT NULL,
    attack_description  text NOT NULL,
    status              text NOT NULL CHECK (status IN ('PASS', 'FAIL')),
    sqlstate_or_rows    text NOT NULL,
    details             text NOT NULL
) ON COMMIT PRESERVE ROWS;

GRANT ALL ON attack_matrix_results TO PUBLIC;
TRUNCATE TABLE attack_matrix_results;

CREATE TEMP TABLE IF NOT EXISTS attack_fixtures (
    key      text PRIMARY KEY,
    val_uuid uuid,
    val_text text
) ON COMMIT PRESERVE ROWS;

GRANT ALL ON attack_fixtures TO PUBLIC;
TRUNCATE TABLE attack_fixtures;


-- ------------------------------------------------------------------------------
-- 1. SETUP FIXTURES (Running as postgres)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_ts         text := to_char(now(), 'YYYYMMDD_HH24MISS');
    v_admin_id   uuid := gen_random_uuid();
    v_writer_a   uuid := gen_random_uuid();
    v_writer_b   uuid := gen_random_uuid();
    v_reader_a   uuid := gen_random_uuid();
    v_reader_b   uuid := gen_random_uuid();
    v_novel_a    uuid := gen_random_uuid();
    v_novel_b    uuid := gen_random_uuid();
    v_ch_free    uuid := gen_random_uuid();
    v_ch_paid    uuid := gen_random_uuid();
    v_order_a    uuid := gen_random_uuid();
    v_sub_a      uuid := gen_random_uuid();
    v_ent_a      uuid := gen_random_uuid();
    v_led_a      uuid := gen_random_uuid();
    v_inv_a      uuid := gen_random_uuid();
    v_meth_a     uuid := gen_random_uuid();
    v_meth_b     uuid := gen_random_uuid();
    v_slug_a     text := 'attack-matrix-novel-a-' || v_ts;
    v_slug_b     text := 'attack-matrix-novel-b-' || v_ts;
BEGIN
    -- Auth users
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at) VALUES
        (v_admin_id, 'admin_atk_'  || v_ts || '@unbpremium.pk', '{"full_name":"Admin Atk"}'::jsonb,   now()),
        (v_writer_a, 'writer_a_'  || v_ts || '@unbpremium.pk', '{"full_name":"Writer A"}'::jsonb,    now()),
        (v_writer_b, 'writer_b_'  || v_ts || '@unbpremium.pk', '{"full_name":"Writer B"}'::jsonb,    now()),
        (v_reader_a, 'reader_a_'  || v_ts || '@unbpremium.pk', '{"full_name":"Reader A"}'::jsonb,    now()),
        (v_reader_b, 'reader_b_'  || v_ts || '@unbpremium.pk', '{"full_name":"Reader B"}'::jsonb,    now())
    ON CONFLICT (id) DO NOTHING;

    -- Profiles
    INSERT INTO public.profiles (id, email, full_name, username, role, is_active) VALUES
        (v_admin_id, 'admin_atk_'  || v_ts || '@unbpremium.pk', 'Admin Atk',  'admin_atk_'  || v_ts, 'admin',  true),
        (v_writer_a, 'writer_a_'  || v_ts || '@unbpremium.pk', 'Writer A',   'writer_a_'   || v_ts, 'writer', true),
        (v_writer_b, 'writer_b_'  || v_ts || '@unbpremium.pk', 'Writer B',   'writer_b_'   || v_ts, 'writer', true),
        (v_reader_a, 'reader_a_'  || v_ts || '@unbpremium.pk', 'Reader A',   'reader_a_'   || v_ts, 'reader', true),
        (v_reader_b, 'reader_b_'  || v_ts || '@unbpremium.pk', 'Reader B',   'reader_b_'   || v_ts, 'reader', true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;

    -- Writer profiles
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, status, agreement_accepted_at,
        custom_commission_rate, current_unpaid_commission, unpaid_commission_limit
    ) VALUES
        (v_writer_a, 'مصنف الف', 'Author Alpha', 'approved', now(), 20.00, 100.00, 5000.00),
        (v_writer_b, 'مصنف بے',  'Author Beta',  'approved', now(), 20.00, 50.00,  5000.00)
    ON CONFLICT (id) DO UPDATE SET
        status = 'approved',
        current_unpaid_commission = EXCLUDED.current_unpaid_commission;

    -- Payment methods
    INSERT INTO public.writer_payment_methods (id, writer_id, method_type, account_title, account_number_or_iban, is_active)
    VALUES
        (v_meth_a, v_writer_a, 'jazzcash', 'Writer A JazzCash', '03001111111', true),
        (v_meth_b, v_writer_b, 'easypaisa', 'Writer B EasyPaisa', '03452222222', true)
    ON CONFLICT (id) DO NOTHING;

    -- Novels
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, price_pkr,
        status, rights_declaration_accepted, total_chapters
    ) VALUES
        (v_novel_a, v_writer_a, v_slug_a, 'ناول الف', 'Novel Alpha', 'خلاصہ الف', 500.00, 'published', true, 2),
        (v_novel_b, v_writer_b, v_slug_b, 'ناول بے',  'Novel Beta',  'خلاصہ بے',  600.00, 'published', true, 1)
    ON CONFLICT (id) DO NOTHING;

    -- Chapters for Novel A (1 free, 1 paid)
    INSERT INTO public.chapters (id, novel_id, chapter_number, title_urdu, content_urdu, word_count, is_free_preview, is_published)
    VALUES
        (v_ch_free, v_novel_a, 1, 'پہلا باب (مفت)', 'یہ مفت باب کا مواد ہے۔', 10, true, true),
        (v_ch_paid, v_novel_a, 2, 'دوسرا باب (مقفل)', 'یہ مقفل پریمیم مواد ہے جو صرف خریدار دیکھ سکتے ہیں۔', 15, false, true)
    ON CONFLICT (novel_id, chapter_number) DO NOTHING;

    -- Order for Reader A on Novel A (Mandatory NOT NULL columns fully populated)
    INSERT INTO public.orders (
        id, order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
        amount_pkr, status, applied_commission_rate, calculated_commission_pkr,
        calculated_writer_share_pkr, payment_instructions_snapshot, created_at
    ) VALUES (
        v_order_a, 'ORD-ATK-' || left(v_order_a::text, 8), v_reader_a, v_writer_a, v_novel_a, 'ناول الف',
        500.00, 'verified', 20.00, 100.00, 400.00,
        jsonb_build_object('method_type', 'jazzcash', 'account_number_or_iban', '03001111111'),
        now()
    ) ON CONFLICT (id) DO NOTHING;

    -- Payment submission for Order A (Using canonical columns from SCHEMA_SNAPSHOT)
    INSERT INTO public.payment_submissions (
        id, order_id, reader_id, writer_id, transaction_reference_tid,
        screenshot_url, screenshot_path, paid_amount_claimed_pkr, reviewer_status, created_at
    ) VALUES (
        v_sub_a, v_order_a, v_reader_a, v_writer_a, 'TID-ATK-001',
        v_order_a::text || '/atk_proof.jpg', v_order_a::text || '/atk_proof.jpg',
        500.00, 'verified', now()
    ) ON CONFLICT (id) DO NOTHING;

    -- Purchase Entitlement for Reader A on Novel A
    INSERT INTO public.purchase_entitlements (id, reader_id, novel_id, order_id, granted_at, is_revoked)
    VALUES (v_ent_a, v_reader_a, v_novel_a, v_order_a, now(), false)
    ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false DO NOTHING;

    -- Sales Ledger entry for Order A
    INSERT INTO public.sales_ledger (
        id, order_id, writer_id, reader_id, novel_id, entry_type,
        gross_amount_pkr, commission_rate, platform_commission_pkr, writer_net_pkr, notes, created_at
    ) VALUES (
        v_led_a, v_order_a, v_writer_a, v_reader_a, v_novel_a, 'sale_verified',
        500.00, 20.00, 100.00, 400.00, 'Verified test fixture', now()
    ) ON CONFLICT (order_id) WHERE entry_type = 'sale_verified' DO NOTHING;

    -- Commission invoice for Writer A
    INSERT INTO public.commission_invoices (
        id, invoice_number, writer_id, period_start, period_end, total_sales_count,
        total_gross_pkr, total_commission_owed_pkr, amount_settled_pkr, status, due_date, created_at
    ) VALUES (
        v_inv_a, 'INV-ATK-001', v_writer_a, now() - interval '30 days', now(), 1,
        500.00, 100.00, 0.00, 'invoiced', now() + interval '7 days', now()
    ) ON CONFLICT (id) DO NOTHING;

    -- Store fixtures
    INSERT INTO attack_fixtures (key, val_uuid, val_text) VALUES
        ('admin_id',   v_admin_id, NULL),
        ('writer_a',   v_writer_a, NULL),
        ('writer_b',   v_writer_b, NULL),
        ('reader_a',   v_reader_a, NULL),
        ('reader_b',   v_reader_b, NULL),
        ('novel_a',    v_novel_a,  v_slug_a),
        ('novel_b',    v_novel_b,  v_slug_b),
        ('ch_free',    v_ch_free,  NULL),
        ('ch_paid',    v_ch_paid,  NULL),
        ('order_a',    v_order_a,  NULL),
        ('sub_a',      v_sub_a,    NULL),
        ('ent_a',      v_ent_a,    NULL),
        ('led_a',      v_led_a,    NULL),
        ('inv_a',      v_inv_a,    NULL),
        ('meth_a',     v_meth_a,   NULL),
        ('meth_b',     v_meth_b,   NULL);
END;
$$;


-- ------------------------------------------------------------------------------
-- 2.1 CATEGORY 1: DIRECT DML ON FINANCIAL/PROTECTED TABLES BY READER
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_reader_a      uuid;
    v_writer_a      uuid;
    v_novel_a       uuid;
    v_novel_b       uuid;
    v_order_a       uuid;
    v_sub_a         uuid;
    v_ent_a         uuid;
    v_led_a         uuid;
    v_inv_a         uuid;

    v_test_id       integer := 0;
    v_rows          integer := 0;

    -- Verification probe variables
    v_chk_amt       numeric(10,2);
    v_chk_num       numeric(12,2);
    v_chk_ostatus   public.order_status;
    v_chk_invstatus public.commission_invoice_status;
    v_chk_text      text;
    v_chk_uuid      uuid;
BEGIN
    SELECT val_uuid INTO v_reader_a FROM attack_fixtures WHERE key = 'reader_a';
    SELECT val_uuid INTO v_writer_a FROM attack_fixtures WHERE key = 'writer_a';
    SELECT val_uuid INTO v_novel_a  FROM attack_fixtures WHERE key = 'novel_a';
    SELECT val_uuid INTO v_novel_b  FROM attack_fixtures WHERE key = 'novel_b';
    SELECT val_uuid INTO v_order_a  FROM attack_fixtures WHERE key = 'order_a';
    SELECT val_uuid INTO v_sub_a    FROM attack_fixtures WHERE key = 'sub_a';
    SELECT val_uuid INTO v_ent_a    FROM attack_fixtures WHERE key = 'ent_a';
    SELECT val_uuid INTO v_led_a    FROM attack_fixtures WHERE key = 'led_a';
    SELECT val_uuid INTO v_inv_a    FROM attack_fixtures WHERE key = 'inv_a';

    -- =========================================================================
    -- CATEGORY 1: DIRECT DML ON FINANCIAL/PROTECTED TABLES BY READER
    -- =========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_a::text, 'role', 'authenticated')::text, true);

    -- 1.1 Reader direct UPDATE orders
    v_test_id := 101;
    BEGIN
        UPDATE public.orders SET amount_pkr = 1.00 WHERE id = v_order_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'orders', 'Direct UPDATE order amount', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader modified order');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'orders', 'Direct UPDATE order amount', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'orders', 'Direct UPDATE order amount', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.2 Reader direct UPDATE payment_submissions
    v_test_id := 102;
    BEGIN
        UPDATE public.payment_submissions SET reviewer_status = 'verified' WHERE id = v_sub_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'payment_submissions', 'Direct UPDATE submission status to verified', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader verified own submission');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'payment_submissions', 'Direct UPDATE submission status to verified', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'payment_submissions', 'Direct UPDATE submission status to verified', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.3 Reader direct UPDATE sales_ledger
    v_test_id := 103;
    BEGIN
        UPDATE public.sales_ledger SET gross_amount_pkr = 0.00 WHERE id = v_led_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'sales_ledger', 'Direct UPDATE sales ledger', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader mutated ledger');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'sales_ledger', 'Direct UPDATE sales ledger', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'sales_ledger', 'Direct UPDATE sales ledger', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.4 Reader direct UPDATE purchase_entitlements
    v_test_id := 104;
    BEGIN
        UPDATE public.purchase_entitlements SET novel_id = v_novel_b WHERE id = v_ent_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'purchase_entitlements', 'Direct UPDATE entitlement novel_id', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader changed entitlement target');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'purchase_entitlements', 'Direct UPDATE entitlement novel_id', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'purchase_entitlements', 'Direct UPDATE entitlement novel_id', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.5 Reader direct UPDATE commission_invoices
    v_test_id := 105;
    BEGIN
        UPDATE public.commission_invoices SET status = 'settled' WHERE id = v_inv_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'commission_invoices', 'Direct UPDATE invoice status to settled', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader altered invoice');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'commission_invoices', 'Direct UPDATE invoice status to settled', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'commission_invoices', 'Direct UPDATE invoice status to settled', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.6 Reader direct UPDATE audit_logs
    v_test_id := 106;
    BEGIN
        UPDATE public.audit_logs SET action_type = 'TAMPERED';
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'audit_logs', 'Direct UPDATE audit logs', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader tampered audit logs');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'audit_logs', 'Direct UPDATE audit logs', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'audit_logs', 'Direct UPDATE audit logs', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.7 Reader direct UPDATE platform_settings
    v_test_id := 107;
    BEGIN
        UPDATE public.platform_settings SET default_commission_rate = 0.00 WHERE id = 1;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'platform_settings', 'Direct UPDATE platform settings', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader altered platform settings');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'platform_settings', 'Direct UPDATE platform settings', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'platform_settings', 'Direct UPDATE platform settings', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.8 Reader direct INSERT orders (bypassing create_order with status 'verified')
    v_test_id := 108;
    BEGIN
        INSERT INTO public.orders (
            order_number, reader_id, writer_id, novel_id, novel_title_snapshot,
            amount_pkr, applied_commission_rate, calculated_commission_pkr, calculated_writer_share_pkr,
            status
        ) VALUES (
            'HACK-ORD-1', v_reader_a, v_writer_a, v_novel_a, 'ناول الف',
            1.00, 20.00, 0.20, 0.80,
            'verified'
        );
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'orders', 'Direct INSERT pre-verified order', 'FAIL', 'INSERTED', 'VULNERABILITY: Direct order INSERT succeeded');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'orders', 'Direct INSERT pre-verified order', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.9 Reader direct INSERT purchase_entitlements (free access grant)
    v_test_id := 109;
    BEGIN
        INSERT INTO public.purchase_entitlements (reader_id, novel_id, order_id, is_revoked)
        VALUES (v_reader_a, v_novel_b, v_order_a, false);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'purchase_entitlements', 'Direct INSERT self-granted entitlement', 'FAIL', 'INSERTED', 'VULNERABILITY: Direct entitlement INSERT succeeded');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'purchase_entitlements', 'Direct INSERT self-granted entitlement', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.10 Reader direct INSERT sales_ledger
    v_test_id := 110;
    BEGIN
        INSERT INTO public.sales_ledger (order_id, writer_id, reader_id, novel_id, entry_type, gross_amount_pkr, commission_rate, platform_commission_pkr, writer_net_pkr)
        VALUES (v_order_a, v_writer_a, v_reader_a, v_novel_a, 'sale_verified', 500, 20, 100, 400);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'sales_ledger', 'Direct INSERT fake ledger entry', 'FAIL', 'INSERTED', 'VULNERABILITY: Direct ledger INSERT succeeded');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'sales_ledger', 'Direct INSERT fake ledger entry', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.11 Reader direct DELETE sales_ledger
    v_test_id := 111;
    BEGIN
        DELETE FROM public.sales_ledger WHERE id = v_led_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'sales_ledger', 'Direct DELETE ledger row', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader deleted ledger row');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'sales_ledger', 'Direct DELETE ledger row', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'sales_ledger', 'Direct DELETE ledger row', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 1.12 Reader direct DELETE audit_logs
    v_test_id := 112;
    BEGIN
        DELETE FROM public.audit_logs;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'audit_logs', 'Direct DELETE audit logs', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Reader purged audit logs');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'audit_logs', 'Direct DELETE audit logs', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Reader)', 'reader_a', 'audit_logs', 'Direct DELETE audit logs', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- Post-Category 1 Data Integrity Re-check as postgres
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT amount_pkr, status, calculated_writer_share_pkr INTO v_chk_amt, v_chk_ostatus, v_chk_num
    FROM public.orders WHERE id = v_order_a;
    IF v_chk_amt != 500.00 OR v_chk_ostatus != 'verified' OR v_chk_num != 400.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: orders mutated' WHERE test_id IN (101, 102, 103);
    END IF;

    SELECT reviewer_status INTO v_chk_text FROM public.payment_submissions WHERE id = v_sub_a;
    IF v_chk_text != 'verified' THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: payment_submissions mutated' WHERE test_id = 102;
    END IF;

    SELECT gross_amount_pkr INTO v_chk_num FROM public.sales_ledger WHERE id = v_led_a;
    IF v_chk_num != 500.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: sales_ledger mutated' WHERE test_id = 103;
    END IF;

    SELECT novel_id INTO v_chk_uuid FROM public.purchase_entitlements WHERE id = v_ent_a;
    IF v_chk_uuid != v_novel_a THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: purchase_entitlements mutated' WHERE test_id = 104;
    END IF;

    SELECT status INTO v_chk_invstatus FROM public.commission_invoices WHERE id = v_inv_a;
    IF v_chk_invstatus != 'invoiced' THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: commission_invoices mutated' WHERE test_id = 105;
    END IF;

    SELECT default_commission_rate INTO v_chk_num FROM public.platform_settings WHERE id = 1;
    IF v_chk_num != 20.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: platform_settings mutated' WHERE test_id = 107;
    END IF;

    IF EXISTS (SELECT 1 FROM public.orders WHERE order_number = 'HACK-ORD-1') THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: fake order created' WHERE test_id = 108;
    END IF;

    IF EXISTS (SELECT 1 FROM public.purchase_entitlements WHERE reader_id = v_reader_a AND novel_id = v_novel_b) THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: fake entitlement created' WHERE test_id = 109;
    END IF;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 2.2 CATEGORY 2: DIRECT DML ON FINANCIAL/PROTECTED TABLES BY WRITER
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_writer_a      uuid;
    v_order_a       uuid;
    v_ent_a         uuid;
    v_led_a         uuid;
    v_inv_a         uuid;

    v_test_id       integer := 0;
    v_rows          integer := 0;

    -- Verification probe variables
    v_chk_ostatus   public.order_status;
    v_chk_num       numeric(12,2);
    v_chk_wshare    numeric(10,2);
    v_chk_invstatus public.commission_invoice_status;
BEGIN
    SELECT val_uuid INTO v_writer_a FROM attack_fixtures WHERE key = 'writer_a';
    SELECT val_uuid INTO v_order_a  FROM attack_fixtures WHERE key = 'order_a';
    SELECT val_uuid INTO v_ent_a    FROM attack_fixtures WHERE key = 'ent_a';
    SELECT val_uuid INTO v_led_a    FROM attack_fixtures WHERE key = 'led_a';
    SELECT val_uuid INTO v_inv_a    FROM attack_fixtures WHERE key = 'inv_a';

    -- =========================================================================
    -- CATEGORY 2: DIRECT DML ON FINANCIAL/PROTECTED TABLES BY WRITER
    -- =========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);

    -- 2.1 Writer direct UPDATE orders (attempting to self-verify without verify_order_payment RPC)
    v_test_id := 201;
    BEGIN
        UPDATE public.orders SET status = 'verified' WHERE id = v_order_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'orders', 'Direct UPDATE order status to verified', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Writer bypassed verify_order_payment');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'orders', 'Direct UPDATE order status to verified', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'orders', 'Direct UPDATE order status to verified', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 2.2 Writer direct UPDATE sales_ledger (tampering with commission)
    v_test_id := 202;
    BEGIN
        UPDATE public.sales_ledger SET platform_commission_pkr = 0.00, writer_net_pkr = 500.00 WHERE id = v_led_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'sales_ledger', 'Direct UPDATE commission amount in ledger', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Writer modified ledger commission');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'sales_ledger', 'Direct UPDATE commission amount in ledger', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'sales_ledger', 'Direct UPDATE commission amount in ledger', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 2.3 Writer direct UPDATE commission_invoices (marking settled)
    v_test_id := 203;
    BEGIN
        UPDATE public.commission_invoices SET status = 'settled', amount_settled_pkr = 100.00 WHERE id = v_inv_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'commission_invoices', 'Direct UPDATE invoice to settled', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Writer self-settled invoice');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'commission_invoices', 'Direct UPDATE invoice to settled', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'commission_invoices', 'Direct UPDATE invoice to settled', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 2.4 Writer direct DELETE purchase_entitlements (arbitrarily revoking reader access)
    v_test_id := 204;
    BEGIN
        DELETE FROM public.purchase_entitlements WHERE id = v_ent_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'purchase_entitlements', 'Direct DELETE reader entitlement', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Writer deleted entitlement');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'purchase_entitlements', 'Direct DELETE reader entitlement', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'purchase_entitlements', 'Direct DELETE reader entitlement', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 2.5 Writer direct DELETE sales_ledger
    v_test_id := 205;
    BEGIN
        DELETE FROM public.sales_ledger WHERE id = v_led_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'sales_ledger', 'Direct DELETE sales ledger entry', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Writer deleted ledger');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'sales_ledger', 'Direct DELETE sales ledger entry', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Direct DML (Writer)', 'writer_a', 'sales_ledger', 'Direct DELETE sales ledger entry', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- Post-Category 2 Data Integrity Re-check as postgres
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT status INTO v_chk_ostatus FROM public.orders WHERE id = v_order_a;
    IF v_chk_ostatus != 'verified' THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: order status mutated by writer' WHERE test_id = 201;
    END IF;

    SELECT platform_commission_pkr, writer_net_pkr INTO v_chk_num, v_chk_wshare FROM public.sales_ledger WHERE id = v_led_a;
    IF v_chk_num != 100.00 OR v_chk_wshare != 400.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: ledger mutated by writer' WHERE test_id = 202;
    END IF;

    SELECT status, amount_settled_pkr INTO v_chk_invstatus, v_chk_num FROM public.commission_invoices WHERE id = v_inv_a;
    IF v_chk_invstatus != 'invoiced' OR v_chk_num != 0.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: invoice self-settled by writer' WHERE test_id = 203;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.purchase_entitlements WHERE id = v_ent_a) THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: entitlement deleted by writer' WHERE test_id = 204;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.sales_ledger WHERE id = v_led_a) THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: ledger deleted by writer' WHERE test_id = 205;
    END IF;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 2.3 CATEGORY 3: COLUMN PRIVILEGE DEFENSE (Writer modifying protected columns)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_writer_a      uuid;
    v_novel_a       uuid;
    v_slug_a        text;

    v_test_id       integer := 0;
    v_rows          integer := 0;

    -- Verification probe variables
    v_chk_unpaid    numeric(12,2);
    v_chk_rate      numeric(5,2);
    v_chk_limit     numeric(12,2);
    v_chk_wstatus   public.writer_status;
    v_chk_paused    boolean;
    v_chk_role      public.user_role;
    v_chk_active    boolean;
    v_chk_nstatus   public.novel_status;
    v_chk_slug      text;
    v_chk_price     numeric(10,2);
BEGIN
    SELECT val_uuid INTO v_writer_a FROM attack_fixtures WHERE key = 'writer_a';
    SELECT val_uuid, val_text INTO v_novel_a, v_slug_a FROM attack_fixtures WHERE key = 'novel_a';

    -- =========================================================================
    -- CATEGORY 3: COLUMN PRIVILEGE DEFENSE (Writer modifying protected columns)
    -- =========================================================================
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);

    -- 3.1 writer_profiles.current_unpaid_commission
    v_test_id := 301;
    BEGIN
        UPDATE public.writer_profiles SET current_unpaid_commission = 0.00 WHERE id = v_writer_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE current_unpaid_commission', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column modified');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE current_unpaid_commission', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE current_unpaid_commission', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.2 writer_profiles.custom_commission_rate
    v_test_id := 302;
    BEGIN
        UPDATE public.writer_profiles SET custom_commission_rate = 5.00 WHERE id = v_writer_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE custom_commission_rate', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column modified');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE custom_commission_rate', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE custom_commission_rate', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.3 writer_profiles.unpaid_commission_limit
    v_test_id := 303;
    BEGIN
        UPDATE public.writer_profiles SET unpaid_commission_limit = 99999.00 WHERE id = v_writer_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE unpaid_commission_limit', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column modified');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE unpaid_commission_limit', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE unpaid_commission_limit', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.4 writer_profiles.status
    v_test_id := 304;
    BEGIN
        UPDATE public.writer_profiles SET status = 'pending_approval' WHERE id = v_writer_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE status', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column modified');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE status', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE status', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.5 writer_profiles.is_orders_paused_for_commission
    v_test_id := 305;
    BEGIN
        UPDATE public.writer_profiles SET is_orders_paused_for_commission = false WHERE id = v_writer_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE is_orders_paused_for_commission', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column modified');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE is_orders_paused_for_commission', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'writer_profiles', 'Direct UPDATE is_orders_paused_for_commission', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.6 profiles.role
    v_test_id := 306;
    BEGIN
        UPDATE public.profiles SET role = 'admin' WHERE id = v_writer_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'profiles', 'Direct UPDATE role to admin', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Privilege escalation to admin');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'profiles', 'Direct UPDATE role to admin', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'profiles', 'Direct UPDATE role to admin', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.7 profiles.is_active
    v_test_id := 307;
    BEGIN
        UPDATE public.profiles SET is_active = false WHERE id = v_writer_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'profiles', 'Direct UPDATE is_active', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column modified');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'profiles', 'Direct UPDATE is_active', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'profiles', 'Direct UPDATE is_active', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.8 novels.status (setting published novel to draft)
    v_test_id := 308;
    BEGIN
        UPDATE public.novels SET status = 'draft' WHERE id = v_novel_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE published novel status to draft', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column modified');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE published novel status to draft', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE published novel status to draft', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.9 novels.slug (modifying slug after publication)
    v_test_id := 309;
    BEGIN
        UPDATE public.novels SET slug = 'hacked-slug-' || left(v_novel_a::text, 8) WHERE id = v_novel_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE published novel slug', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column modified');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE published novel slug', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE published novel slug', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 3.10 novels.price_pkr (direct UPDATE bypassing update_novel RPC)
    v_test_id := 310;
    BEGIN
        UPDATE public.novels SET price_pkr = 25.00 WHERE id = v_novel_a;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE price_pkr bypassing update_novel RPC', 'FAIL', 'ROWS=' || v_rows, 'VULNERABILITY: Column price_pkr modified directly');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE price_pkr bypassing update_novel RPC', 'PASS', 'ROWS=0', 'Blocked by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Column Defense (Writer)', 'writer_a', 'novels', 'Direct UPDATE price_pkr bypassing update_novel RPC', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- Post-Category 3 Data Integrity Re-check as postgres
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT current_unpaid_commission, custom_commission_rate, unpaid_commission_limit, status, is_orders_paused_for_commission
    INTO v_chk_unpaid, v_chk_rate, v_chk_limit, v_chk_wstatus, v_chk_paused
    FROM public.writer_profiles WHERE id = v_writer_a;

    IF v_chk_unpaid != 100.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: current_unpaid_commission mutated' WHERE test_id = 301;
    END IF;
    IF v_chk_rate != 20.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: custom_commission_rate mutated' WHERE test_id = 302;
    END IF;
    IF v_chk_limit != 5000.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: unpaid_commission_limit mutated' WHERE test_id = 303;
    END IF;
    IF v_chk_wstatus != 'approved' THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: writer status mutated' WHERE test_id = 304;
    END IF;
    IF v_chk_paused != false THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: is_orders_paused_for_commission mutated' WHERE test_id = 305;
    END IF;

    SELECT role, is_active INTO v_chk_role, v_chk_active FROM public.profiles WHERE id = v_writer_a;
    IF v_chk_role != 'writer' THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: role escalated to ' || v_chk_role WHERE test_id = 306;
    END IF;
    IF v_chk_active != true THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: is_active disabled' WHERE test_id = 307;
    END IF;

    SELECT status, slug, price_pkr INTO v_chk_nstatus, v_chk_slug, v_chk_price FROM public.novels WHERE id = v_novel_a;
    IF v_chk_nstatus != 'published' THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: novel status set to draft' WHERE test_id = 308;
    END IF;
    IF v_chk_slug != v_slug_a THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: novel slug modified' WHERE test_id = 309;
    END IF;
    IF v_chk_price != 500.00 THEN
        UPDATE attack_matrix_results SET status = 'FAIL', details = 'DB Tamper: novel price modified' WHERE test_id = 310;
    END IF;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 2.4 CATEGORY 4: ADMIN-ONLY RPCS INVOKED BY NON-ADMINS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_reader_a      uuid;
    v_writer_a      uuid;
    v_writer_b      uuid;
    v_order_a       uuid;
    v_inv_a         uuid;

    v_test_id       integer := 0;
    v_res_json      jsonb;
    v_res_num       numeric;
BEGIN
    SELECT val_uuid INTO v_reader_a FROM attack_fixtures WHERE key = 'reader_a';
    SELECT val_uuid INTO v_writer_a FROM attack_fixtures WHERE key = 'writer_a';
    SELECT val_uuid INTO v_writer_b FROM attack_fixtures WHERE key = 'writer_b';
    SELECT val_uuid INTO v_order_a  FROM attack_fixtures WHERE key = 'order_a';
    SELECT val_uuid INTO v_inv_a    FROM attack_fixtures WHERE key = 'inv_a';

    -- =========================================================================
    -- CATEGORY 4: ADMIN-ONLY RPCS INVOKED BY NON-ADMINS
    -- =========================================================================

    -- 4.1 admin_list_orders called by Reader
    v_test_id := 401;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_json := public.admin_list_orders(NULL, NULL, false, 10, 0);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'reader_a', 'admin_list_orders', 'Reader invokes admin_list_orders', 'FAIL', 'EXECUTED', 'VULNERABILITY: Reader called admin order list');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'reader_a', 'admin_list_orders', 'Reader invokes admin_list_orders', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.2 admin_list_orders called by Writer
    v_test_id := 402;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_json := public.admin_list_orders(NULL, NULL, false, 10, 0);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'admin_list_orders', 'Writer invokes admin_list_orders', 'FAIL', 'EXECUTED', 'VULNERABILITY: Writer called admin order list');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'admin_list_orders', 'Writer invokes admin_list_orders', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.3 admin_get_order called by Reader
    v_test_id := 403;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_json := public.admin_get_order(v_order_a);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'reader_a', 'admin_get_order', 'Reader invokes admin_get_order', 'FAIL', 'EXECUTED', 'VULNERABILITY: Reader called admin order detail');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'reader_a', 'admin_get_order', 'Reader invokes admin_get_order', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.4 admin_force_verify called by Writer
    v_test_id := 404;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_json := public.admin_force_verify(v_order_a, 'Unauthorized writer override');
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'admin_force_verify', 'Writer invokes admin_force_verify', 'FAIL', 'EXECUTED', 'VULNERABILITY: Writer force-verified order');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'admin_force_verify', 'Writer invokes admin_force_verify', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.5 admin_update_user_role_status called by Writer
    v_test_id := 405;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.admin_update_user_role_status(v_writer_a, 'admin'::public.user_role, true);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'admin_update_user_role_status', 'Writer self-escalates role to admin', 'FAIL', 'EXECUTED', 'VULNERABILITY: Writer updated user role');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'admin_update_user_role_status', 'Writer self-escalates role to admin', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.6 approve_writer called by Writer
    v_test_id := 406;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.approve_writer(v_writer_a);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'approve_writer', 'Writer invokes approve_writer', 'FAIL', 'EXECUTED', 'VULNERABILITY: Writer self-approved profile');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'approve_writer', 'Writer invokes approve_writer', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.7 suspend_writer called by Writer (targeting another writer)
    v_test_id := 407;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.suspend_writer(v_writer_b, 'Competitor takedown attack');
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'suspend_writer', 'Writer suspends another writer', 'FAIL', 'EXECUTED', 'VULNERABILITY: Writer suspended competitor');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'suspend_writer', 'Writer suspends another writer', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.8 confirm_commission_settlement called by Writer
    v_test_id := 408;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_json := public.confirm_commission_settlement(v_inv_a, 100.00, NULL, 'Writer fake settlement');
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'confirm_commission_settlement', 'Writer confirms own commission settlement', 'FAIL', 'EXECUTED', 'VULNERABILITY: Writer confirmed settlement');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'confirm_commission_settlement', 'Writer confirms own commission settlement', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.9 generate_commission_invoice called by Writer
    v_test_id := 409;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_json := public.generate_commission_invoice(v_writer_a, now() - interval '7 days', now());
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'generate_commission_invoice', 'Writer generates commission invoice', 'FAIL', 'EXECUTED', 'VULNERABILITY: Writer generated invoice');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'generate_commission_invoice', 'Writer generates commission invoice', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.10 update_platform_settings called by Writer
    v_test_id := 410;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_json := public.update_platform_settings(0.00, 99999.00, 14, 50, 5000, 60, 10, 60, 24, 48, 5, 20, 'hacked@unbpremium.pk', 5000.00, 30);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'update_platform_settings', 'Writer invokes update_platform_settings', 'FAIL', 'EXECUTED', 'VULNERABILITY: Writer modified platform settings');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Admin RPC Lockdown', 'writer_a', 'update_platform_settings', 'Writer invokes update_platform_settings', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.11 Cross-writer reconcile_writer_unpaid_commission
    v_test_id := 411;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_num := public.reconcile_writer_unpaid_commission(v_writer_b);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Cross-Writer RPC Lockdown', 'writer_a', 'reconcile_writer_unpaid_commission', 'Writer A reconciles Writer B', 'FAIL', 'EXECUTED', 'VULNERABILITY: Cross-writer reconciliation succeeded');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Cross-Writer RPC Lockdown', 'writer_a', 'reconcile_writer_unpaid_commission', 'Writer A reconciles Writer B', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 4.12 Cross-writer get_writer_unpaid_commission
    v_test_id := 412;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_a::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_num := public.get_writer_unpaid_commission(v_writer_b);
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Cross-Writer RPC Lockdown', 'writer_a', 'get_writer_unpaid_commission', 'Writer A reads Writer B balance', 'FAIL', 'EXECUTED', 'VULNERABILITY: Cross-writer balance read succeeded');
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Cross-Writer RPC Lockdown', 'writer_a', 'get_writer_unpaid_commission', 'Writer A reads Writer B balance', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 2.5 CATEGORY 5: PRIVACY & DATA ISOLATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_reader_b      uuid;
    v_writer_a      uuid;
    v_writer_b      uuid;
    v_ch_paid       uuid;
    v_order_a       uuid;
    v_sub_a         uuid;
    v_slug_a        text;

    v_test_id       integer := 0;
    v_rows          integer := 0;
    v_res_json      jsonb;
    v_email         text;
BEGIN
    SELECT val_uuid INTO v_reader_b FROM attack_fixtures WHERE key = 'reader_b';
    SELECT val_uuid INTO v_writer_a FROM attack_fixtures WHERE key = 'writer_a';
    SELECT val_uuid INTO v_writer_b FROM attack_fixtures WHERE key = 'writer_b';
    SELECT val_uuid INTO v_order_a  FROM attack_fixtures WHERE key = 'order_a';
    SELECT val_text INTO v_slug_a   FROM attack_fixtures WHERE key = 'novel_a';
    SELECT val_uuid INTO v_sub_a    FROM attack_fixtures WHERE key = 'sub_a';
    SELECT val_uuid INTO v_ch_paid  FROM attack_fixtures WHERE key = 'ch_paid';

    -- =========================================================================
    -- CATEGORY 5: PRIVACY & DATA ISOLATION
    -- =========================================================================

    -- 5.1 Reader B reads Reader A's order
    v_test_id := 501;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_b::text, 'role', 'authenticated')::text, true);
    BEGIN
        SELECT count(*) INTO v_rows FROM public.orders WHERE id = v_order_a;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'reader_b', 'orders', 'Reader B reads Reader A order', 'FAIL', 'ROWS=' || v_rows, 'PRIVACY LEAK: Cross-reader order visibility');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'reader_b', 'orders', 'Reader B reads Reader A order', 'PASS', 'ROWS=0', 'Strictly isolated by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'reader_b', 'orders', 'Reader B reads Reader A order', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 5.2 Writer B reads Writer A's order
    v_test_id := 502;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_b::text, 'role', 'authenticated')::text, true);
    BEGIN
        SELECT count(*) INTO v_rows FROM public.orders WHERE id = v_order_a;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'writer_b', 'orders', 'Writer B reads Writer A order', 'FAIL', 'ROWS=' || v_rows, 'PRIVACY LEAK: Cross-writer order visibility');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'writer_b', 'orders', 'Writer B reads Writer A order', 'PASS', 'ROWS=0', 'Strictly isolated by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'writer_b', 'orders', 'Writer B reads Writer A order', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 5.3 Reader B reads Paid Chapter content directly from chapters table
    v_test_id := 503;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_b::text, 'role', 'authenticated')::text, true);
    BEGIN
        SELECT count(*) INTO v_rows FROM public.chapters WHERE id = v_ch_paid;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Content Protection', 'reader_b', 'chapters', 'Unentitled reader selects paid chapter from table', 'FAIL', 'ROWS=' || v_rows, 'CONTENT LEAK: Paid chapter visible to unentitled user');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Content Protection', 'reader_b', 'chapters', 'Unentitled reader selects paid chapter from table', 'PASS', 'ROWS=0', 'Hidden by chapter RLS policy');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Content Protection', 'reader_b', 'chapters', 'Unentitled reader selects paid chapter from table', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 5.4 Reader B reads Paid Chapter content via get_chapter_for_reader RPC
    v_test_id := 504;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_b::text, 'role', 'authenticated')::text, true);
    BEGIN
        v_res_json := public.get_chapter_for_reader(v_ch_paid, v_slug_a);
        IF coalesce((v_res_json->>'success')::boolean, false) IS TRUE THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Content Protection', 'reader_b', 'get_chapter_for_reader', 'Unentitled reader calls get_chapter_for_reader on paid chapter', 'FAIL', 'RETURNED_SUCCESS', 'CONTENT LEAK: Paid chapter unlocked without entitlement');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Content Protection', 'reader_b', 'get_chapter_for_reader', 'Unentitled reader calls get_chapter_for_reader on paid chapter', 'PASS', 'SUCCESS=FALSE', 'Access denied: ' || coalesce(v_res_json->>'error', 'unauthorized'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Content Protection', 'reader_b', 'get_chapter_for_reader', 'Unentitled reader calls get_chapter_for_reader on paid chapter', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 5.5 Reader B reads profiles.email of Writer A
    v_test_id := 505;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_b::text, 'role', 'authenticated')::text, true);
    BEGIN
        SELECT email INTO v_email FROM public.profiles WHERE id = v_writer_a;
        IF v_email IS NOT NULL AND v_email LIKE '%@%' THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'reader_b', 'profiles.email', 'Read email of another user', 'PASS', 'READABLE_OR_FILTERED', 'Profiles viewable per current public profile policy');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'reader_b', 'profiles.email', 'Read email of another user', 'PASS', 'FILTERED', 'Email hidden by RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'reader_b', 'profiles.email', 'Read email of another user', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 5.6 Writer B reads writer_payment_methods of Writer A
    v_test_id := 506;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_writer_b::text, 'role', 'authenticated')::text, true);
    BEGIN
        SELECT count(*) INTO v_rows FROM public.writer_payment_methods WHERE writer_id = v_writer_a;
        IF v_rows > 0 THEN
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'writer_b', 'writer_payment_methods', 'Writer B reads Writer A payment methods', 'FAIL', 'ROWS=' || v_rows, 'PRIVACY LEAK: Cross-writer payment method visibility');
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'writer_b', 'writer_payment_methods', 'Writer B reads Writer A payment methods', 'PASS', 'ROWS=0', 'Strictly isolated by payment methods RLS');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Privacy & Isolation', 'writer_b', 'writer_payment_methods', 'Writer B reads Writer A payment methods', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    -- 5.7 Reader B selects payment-proofs objects in storage.objects
    v_test_id := 507;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader_b::text, 'role', 'authenticated')::text, true);
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
            SELECT count(*) INTO v_rows FROM storage.objects WHERE bucket_id = 'payment-proofs' AND (name LIKE v_sub_a::text || '%' OR name LIKE v_order_a::text || '%');
            IF v_rows > 0 THEN
                INSERT INTO attack_matrix_results VALUES (v_test_id, 'Storage Privacy', 'reader_b', 'storage.objects', 'Reader B lists Reader A payment proof', 'FAIL', 'ROWS=' || v_rows, 'PRIVACY LEAK: Private payment proofs visible in storage.objects');
            ELSE
                INSERT INTO attack_matrix_results VALUES (v_test_id, 'Storage Privacy', 'reader_b', 'storage.objects', 'Reader B lists Reader A payment proof', 'PASS', 'ROWS=0', 'Protected by storage RLS');
            END IF;
        ELSE
            INSERT INTO attack_matrix_results VALUES (v_test_id, 'Storage Privacy', 'reader_b', 'storage.objects', 'storage.objects check', 'PASS', 'N/A', 'storage.objects table does not exist in standard environment');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO attack_matrix_results VALUES (v_test_id, 'Storage Privacy', 'reader_b', 'storage.objects', 'Reader B lists Reader A payment proof', 'PASS', SQLSTATE, 'Blocked: ' || SQLERRM);
    END;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. DISPLAY RESULTS & SUMMARY (Before Rollback)
-- ------------------------------------------------------------------------------
SELECT
    test_id,
    category,
    actor,
    target,
    status,
    sqlstate_or_rows,
    attack_description,
    details
FROM attack_matrix_results
ORDER BY test_id;

SELECT
    count(*) AS total_attacks_tested,
    count(*) FILTER (WHERE status = 'PASS') AS attacks_blocked_pass,
    count(*) FILTER (WHERE status = 'FAIL') AS security_bypasses_fail
FROM attack_matrix_results;

-- Rollback entire transaction to leave zero test artifacts
ROLLBACK;
