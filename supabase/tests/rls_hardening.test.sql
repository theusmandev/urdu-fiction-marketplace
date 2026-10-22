-- ==============================================================================
-- UNB Premium — pgTAP Test Suite: RLS & Financial Hardening
-- ==============================================================================

BEGIN;
SELECT plan(10);

-- Test 1: Platform settings singleton check
SELECT ok(
    (SELECT count(*) = 1 FROM public.platform_settings WHERE id = 1),
    'platform_settings has singleton row with id = 1'
);

-- Test 2: Sales ledger partial unique index exists
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'sales_ledger' 
          AND indexname = 'idx_sales_ledger_order_sale_verified'
    ),
    'idx_sales_ledger_order_sale_verified partial unique index exists'
);

-- Test 3: Purchase entitlements partial unique index exists
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'purchase_entitlements' 
          AND indexname = 'idx_active_purchase_entitlement'
    ),
    'idx_active_purchase_entitlement partial unique index exists'
);

-- Test 4: Orders single active order per reader/novel exists
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'orders' 
          AND indexname = 'uq_orders_reader_novel_active'
    ),
    'uq_orders_reader_novel_active partial unique index exists'
);

-- Test 5: Sales ledger original_ledger_entry_id exists
SELECT has_column(
    'public', 'sales_ledger', 'original_ledger_entry_id',
    'sales_ledger has original_ledger_entry_id column'
);

-- Test 6: Sales ledger balancing check constraint exists
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_sales_ledger_sum_balance'
    ),
    'chk_sales_ledger_sum_balance constraint ensures net + commission = gross'
);

-- Test 7: Prevent append-only mutation triggers exist
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_sales_ledger_prevent_mutation'
    ) AND EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_audit_logs_prevent_mutation'
    ),
    'Append-only mutation triggers exist on sales_ledger and audit_logs'
);

-- Test 8: Privilege protection triggers exist
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_protect_profile_columns'
    ) AND EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_protect_writer_profile_columns'
    ),
    'Column protection triggers exist on profiles and writer_profiles'
);

-- Test 9: Core server-side RPC functions exist with SECURITY DEFINER
SELECT ok(
    (
        SELECT count(*) FROM pg_proc 
        WHERE proname IN (
            'create_order',
            'submit_payment',
            'verify_order_payment',
            'reject_order_payment',
            'record_refund_adjustment',
            'confirm_commission_settlement'
        ) AND prosecdef = true
    ) = 6,
    'Core transactional RPCs exist with SECURITY DEFINER'
);

-- Test 10: Private storage bucket exists
SELECT ok(
    EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'payment-proofs' AND public = false
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets'
    ),
    'payment-proofs bucket is configured as private'
);

SELECT * FROM finish();
ROLLBACK;
