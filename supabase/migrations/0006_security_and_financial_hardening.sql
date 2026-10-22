-- ==============================================================================
-- UNB Premium — Migration 0006: Security & Financial Hardening Patch
-- Description: Fixes privilege escalation vulnerabilities, locks orders to server-side
--              creation, enforces sales ledger & audit append-only immutability,
--              implements private screenshot storage with RLS, configures all
--              missing atomic transactional RPCs, and updates triggers.
-- Idempotency: All DDL statements are guarded with IF EXISTS / IF NOT EXISTS.
-- Compatibility: Supabase CLI (supabase db push) and Supabase SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: SCHEMA ADJUSTMENTS, CONSTRAINTS & PARTIAL UNIQUE INDEXES
-- ------------------------------------------------------------------------------

-- 1.1 sales_ledger: Drop old unique constraint on order_id to support adjustments
ALTER TABLE public.sales_ledger DROP CONSTRAINT IF EXISTS sales_ledger_order_id_key;

-- Create partial unique index on (order_id) WHERE entry_type = 'sale_verified'
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_ledger_order_sale_verified
    ON public.sales_ledger (order_id)
    WHERE entry_type = 'sale_verified';

-- Add original ledger entry reference column for negative adjustments / corrections
ALTER TABLE public.sales_ledger
    ADD COLUMN IF NOT EXISTS original_ledger_entry_id uuid REFERENCES public.sales_ledger(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_sales_ledger_original_entry
    ON public.sales_ledger (original_ledger_entry_id);

-- Relax gross_amount_pkr >= 0 check to allow negative refund adjustments, and enforce balancing CHECK
ALTER TABLE public.sales_ledger DROP CONSTRAINT IF EXISTS sales_ledger_gross_amount_pkr_check;
ALTER TABLE public.sales_ledger DROP CONSTRAINT IF EXISTS sales_ledger_platform_commission_pkr_check;
ALTER TABLE public.sales_ledger DROP CONSTRAINT IF EXISTS sales_ledger_writer_net_pkr_check;
ALTER TABLE public.sales_ledger DROP CONSTRAINT IF EXISTS chk_sales_ledger_verified_positive;
ALTER TABLE public.sales_ledger DROP CONSTRAINT IF EXISTS chk_sales_ledger_sum_balance;

ALTER TABLE public.sales_ledger ADD CONSTRAINT chk_sales_ledger_verified_positive
    CHECK (
        (entry_type = 'sale_verified' AND gross_amount_pkr >= 0 AND platform_commission_pkr >= 0 AND writer_net_pkr >= 0) OR
        (entry_type IN ('refund_adjustment', 'manual_correction'))
    );

ALTER TABLE public.sales_ledger ADD CONSTRAINT chk_sales_ledger_sum_balance
    CHECK (platform_commission_pkr + writer_net_pkr = gross_amount_pkr);

-- 1.2 purchase_entitlements: Replace strict unique constraint with partial unique index
ALTER TABLE public.purchase_entitlements DROP CONSTRAINT IF EXISTS uq_reader_novel_entitlement;

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_purchase_entitlement
    ON public.purchase_entitlements (reader_id, novel_id)
    WHERE is_revoked = false;

-- 1.3 orders: Enforce single open order per reader per novel
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_reader_novel_active
    ON public.orders (reader_id, novel_id)
    WHERE status IN ('pending_payment', 'payment_submitted');

-- 1.4 disputes: Add missing canonical columns
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS opened_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS resolution_note text;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id);

UPDATE public.disputes SET opened_by = raised_by_id WHERE opened_by IS NULL;
UPDATE public.disputes SET resolution_note = admin_resolution_notes WHERE resolution_note IS NULL;
UPDATE public.disputes SET resolved_by = resolved_by_id WHERE resolved_by IS NULL;

-- 1.5 notifications: Add missing canonical columns
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'order_update';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_refs jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

UPDATE public.notifications SET body = message WHERE body IS NULL;

-- 1.6 payment_submissions: Add screenshot_path column for private storage references
ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS screenshot_path text;


-- ------------------------------------------------------------------------------
-- SECTION 2: PRIVILEGE ESCALATION TRIGGERS & HARDENED AUTH TRIGGER
-- ------------------------------------------------------------------------------

-- 2.1 Recreate is_admin helper with hardened search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- 2.2 Recreate has_novel_entitlement helper with hardened search_path
CREATE OR REPLACE FUNCTION public.has_novel_entitlement(p_novel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE novel_id = p_novel_id
          AND reader_id = auth.uid()
          AND is_revoked = false
    );
$$;

-- 2.3 profiles: Trigger blocking user changes to role, is_active, id, and email
CREATE OR REPLACE FUNCTION public.trg_protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Block modifications to privileged columns unless caller is platform administrator
    IF NOT public.is_admin() THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Privilege escalation rejected: Users cannot modify their own role.';
        END IF;
        IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            RAISE EXCEPTION 'Unauthorized: Account active status can only be modified by administrators.';
        END IF;
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Unauthorized: User identifier is immutable.';
        END IF;
        IF NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'Unauthorized: Email is synchronized with authentication credentials.';
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_protect_profile_columns();

-- 2.4 writer_profiles: Trigger blocking writer changes to status, commission rates, and balances
CREATE OR REPLACE FUNCTION public.trg_protect_writer_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'Unauthorized: Writer approval status can only be modified by administrators.';
        END IF;
        IF NEW.custom_commission_rate IS DISTINCT FROM OLD.custom_commission_rate THEN
            RAISE EXCEPTION 'Unauthorized: Writer custom commission rate is managed by administrators.';
        END IF;
        IF NEW.unpaid_commission_limit IS DISTINCT FROM OLD.unpaid_commission_limit THEN
            RAISE EXCEPTION 'Unauthorized: Unpaid commission limit is managed by administrators.';
        END IF;
        IF NEW.current_unpaid_commission IS DISTINCT FROM OLD.current_unpaid_commission THEN
            RAISE EXCEPTION 'Unauthorized: Unpaid commission balance is managed exclusively by ledger reconciliation.';
        END IF;
        IF NEW.is_orders_paused_for_commission IS DISTINCT FROM OLD.is_orders_paused_for_commission THEN
            RAISE EXCEPTION 'Unauthorized: Order pause state is automated based on accrued commission threshold.';
        END IF;
        IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
            RAISE EXCEPTION 'Unauthorized: Approver reference is managed by administrators.';
        END IF;
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Unauthorized: Writer profile identifier is immutable.';
        END IF;
    END IF;

    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_writer_profile_columns ON public.writer_profiles;
CREATE TRIGGER trg_protect_writer_profile_columns
    BEFORE UPDATE ON public.writer_profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_protect_writer_profile_columns();

-- 2.5 Hardened handle_new_user: ALWAYS assign role 'reader', never trust raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_full_name text;
    v_username text;
BEGIN
    -- Strict security hardening: All signups default unconditionally to 'reader'
    -- Never read role from raw_user_meta_data to prevent self-declared admin or writer privilege escalation.
    v_full_name := NEW.raw_user_meta_data->>'full_name';
    v_username := coalesce(
        NEW.raw_user_meta_data->>'username',
        pg_catalog.split_part(NEW.email, '@', 1) || '_' || pg_catalog.substring(pg_catalog.replace(NEW.id::text, '-', ''), 1, 4)
    );

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        username,
        avatar_url,
        role,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NEW.email,
        v_full_name,
        v_username,
        NEW.raw_user_meta_data->>'avatar_url',
        'reader'::public.user_role,
        true,
        pg_catalog.now(),
        pg_catalog.now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = pg_catalog.now();

    RETURN NEW;
END;
$$;

-- 2.6 Append-Only Trigger on sales_ledger and audit_logs
CREATE OR REPLACE FUNCTION public.prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Append-only violation: Direct UPDATE and DELETE operations are strictly prohibited on %.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_ledger_prevent_mutation ON public.sales_ledger;
CREATE TRIGGER trg_sales_ledger_prevent_mutation
    BEFORE UPDATE OR DELETE ON public.sales_ledger
    FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_prevent_mutation ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_prevent_mutation
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

REVOKE UPDATE, DELETE ON public.sales_ledger FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, anon, authenticated;

-- 2.7 Hardened check_duplicate_tid_before_insert: Flag duplicate only across OTHER orders
CREATE OR REPLACE FUNCTION public.check_duplicate_tid_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_norm_tid text;
    v_existing_id uuid;
BEGIN
    v_norm_tid := pg_catalog.upper(pg_catalog.regexp_replace(NEW.transaction_reference_tid, '[^a-zA-Z0-9]', '', 'g'));

    -- Resubmissions for the same order after rejection are permitted and NOT flagged as duplicates
    SELECT id INTO v_existing_id
    FROM public.payment_submissions
    WHERE normalized_tid = v_norm_tid
      AND order_id != NEW.order_id
      AND id != coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        NEW.is_duplicate_tid_flagged := true;
        NEW.duplicate_of_submission_id := v_existing_id;
    ELSE
        NEW.is_duplicate_tid_flagged := false;
        NEW.duplicate_of_submission_id := NULL;
    END IF;

    RETURN NEW;
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 3: RLS POLICY HARDENING (REMOVE CLIENT DIRECT INSERTS / UPDATES)
-- ------------------------------------------------------------------------------

-- 3.1 Drop dangerous direct client write policies
DROP POLICY IF EXISTS "Readers create orders for published novels" ON public.orders;
DROP POLICY IF EXISTS "Readers cancel unpaid orders" ON public.orders;
DROP POLICY IF EXISTS "Readers insert payment submissions for own orders" ON public.payment_submissions;
DROP POLICY IF EXISTS "Writers submit invoice payment proof" ON public.commission_invoices;
DROP POLICY IF EXISTS "Writers update own profile metadata" ON public.writer_profiles;

-- 3.2 Add safe update policy on writer_profiles (enforced by BEFORE UPDATE trigger)
CREATE POLICY "Writers update own profile safe fields"
    ON public.writer_profiles FOR UPDATE
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (id = auth.uid() OR public.is_admin());


-- ------------------------------------------------------------------------------
-- SECTION 4: UNPAID COMMISSION CALCULATION & RECONCILIATION
-- ------------------------------------------------------------------------------

-- 4.1 Compute exact unpaid commission for a writer from sales ledger minus confirmed payments
CREATE OR REPLACE FUNCTION public.get_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT greatest(
        0.00,
        (
            SELECT coalesce(pg_catalog.sum(platform_commission_pkr), 0.00)
            FROM public.sales_ledger
            WHERE writer_id = p_writer_id
        ) - (
            SELECT coalesce(pg_catalog.sum(amount_pkr), 0.00)
            FROM public.commission_payments
            WHERE writer_id = p_writer_id
        )
    );
$$;

-- 4.2 Reconcile writer profile balance with ledger
CREATE OR REPLACE FUNCTION public.reconcile_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actual_unpaid numeric(12,2);
    v_limit numeric(12,2);
BEGIN
    v_actual_unpaid := public.get_writer_unpaid_commission(p_writer_id);

    SELECT unpaid_commission_limit INTO v_limit
    FROM public.writer_profiles
    WHERE id = p_writer_id;

    IF v_limit IS NULL THEN
        v_limit := 5000.00;
    END IF;

    UPDATE public.writer_profiles
    SET current_unpaid_commission = v_actual_unpaid,
        is_orders_paused_for_commission = (v_actual_unpaid >= v_limit),
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    RETURN v_actual_unpaid;
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 5: ATOMIC TRANSACTIONAL RPC FUNCTIONS
-- ------------------------------------------------------------------------------

-- 5.1 create_order: Server-side pricing, commission estimate snapshot, and validations
CREATE OR REPLACE FUNCTION public.create_order(
    p_novel_id uuid,
    p_payment_method_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
    v_writer record;
    v_method record;
    v_default_rate numeric(5,2);
    v_applied_rate numeric(5,2);
    v_commission_pkr numeric(10,2);
    v_writer_share_pkr numeric(10,2);
    v_order_number text;
    v_order_id uuid;
    v_instructions jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create an order.';
    END IF;

    -- Fetch novel
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.status != 'published' THEN
        RAISE EXCEPTION 'Novel is not available for purchase (status: %).', v_novel.status;
    END IF;

    -- Self-purchase check: Writer cannot purchase their own novel
    IF v_novel.writer_id = v_caller_id THEN
        RAISE EXCEPTION 'Authors cannot purchase their own novels.';
    END IF;

    -- Fetch writer profile
    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_novel.writer_id;

    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RAISE EXCEPTION 'Writer is currently not eligible to receive orders.';
    END IF;

    IF v_writer.is_orders_paused_for_commission THEN
        RAISE EXCEPTION 'Orders for this author are currently paused due to accrued commission limit.';
    END IF;

    -- Check if reader already owns an active entitlement
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND is_revoked = false
    ) THEN
        RAISE EXCEPTION 'You already hold an active purchase entitlement for this novel.';
    END IF;

    -- Check if reader already has an open order for this novel
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND status IN ('pending_payment', 'payment_submitted')
    ) THEN
        RAISE EXCEPTION 'An open order for this novel already exists in your account.';
    END IF;

    -- Fetch and validate writer payment method
    SELECT * INTO v_method
    FROM public.writer_payment_methods
    WHERE id = p_payment_method_id
      AND writer_id = v_novel.writer_id
      AND is_active = true;

    IF v_method.id IS NULL THEN
        RAISE EXCEPTION 'Selected payment method is invalid or inactive.';
    END IF;

    -- Snapshot payment instructions
    v_instructions := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Fetch default commission rate from platform_settings
    SELECT default_commission_rate INTO v_default_rate
    FROM public.platform_settings
    WHERE id = 1;

    v_default_rate := coalesce(v_default_rate, 20.00);
    v_applied_rate := coalesce(v_writer.custom_commission_rate, v_default_rate);

    -- Calculate financial amounts server-side
    v_commission_pkr := pg_catalog.round((v_novel.price_pkr * v_applied_rate / 100.0), 2);
    v_writer_share_pkr := v_novel.price_pkr - v_commission_pkr;

    -- Generate order number: UNB-YYYY-XXXXXX
    v_order_number := 'UNB-' || pg_catalog.to_char(pg_catalog.now(), 'YYYY') || '-' || pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    -- Insert order
    INSERT INTO public.orders (
        order_number,
        reader_id,
        writer_id,
        novel_id,
        novel_title_snapshot,
        amount_pkr,
        currency,
        applied_commission_rate,
        calculated_commission_pkr,
        calculated_writer_share_pkr,
        selected_payment_method_id,
        payment_instructions_snapshot,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_order_number,
        v_caller_id,
        v_novel.writer_id,
        v_novel.id,
        v_novel.title_urdu,
        v_novel.price_pkr,
        'PKR',
        v_applied_rate,
        v_commission_pkr,
        v_writer_share_pkr,
        v_method.id,
        v_instructions,
        'pending_payment',
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING id INTO v_order_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'reader',
        'CREATE_ORDER',
        'orders',
        v_order_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'order_number', v_order_number,
            'amount_pkr', v_novel.price_pkr,
            'novel_id', v_novel.id,
            'writer_id', v_novel.writer_id
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'amount_pkr', v_novel.price_pkr,
        'currency', 'PKR',
        'payment_instructions', v_instructions
    );
END;
$$;

-- 5.2 submit_payment: Reader submits TID and payment receipt screenshot
CREATE OR REPLACE FUNCTION public.submit_payment(
    p_order_id uuid,
    p_tid text,
    p_screenshot_path text,
    p_claimed_amount numeric DEFAULT NULL,
    p_sender_name text DEFAULT NULL,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_submission_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit payment.';
    END IF;

    IF p_tid IS NULL OR trim(p_tid) = '' THEN
        RAISE EXCEPTION 'Transaction reference (TID) is required.';
    END IF;

    IF p_screenshot_path IS NULL OR trim(p_screenshot_path) = '' THEN
        RAISE EXCEPTION 'Screenshot proof storage path is required.';
    END IF;

    -- Lock and inspect order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.reader_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the reader who created this order can submit payment.';
    END IF;

    IF v_order.status NOT IN ('pending_payment', 'rejected') THEN
        RAISE EXCEPTION 'Payment cannot be submitted for order in status: %', v_order.status;
    END IF;

    -- Insert payment submission record
    INSERT INTO public.payment_submissions (
        order_id,
        reader_id,
        writer_id,
        transaction_reference_tid,
        screenshot_url,
        screenshot_path,
        paid_amount_claimed_pkr,
        sender_account_name,
        reader_note,
        reviewer_status,
        created_at
    ) VALUES (
        p_order_id,
        v_order.reader_id,
        v_order.writer_id,
        trim(p_tid),
        p_screenshot_path,
        p_screenshot_path,
        coalesce(p_claimed_amount, v_order.amount_pkr),
        p_sender_name,
        p_note,
        'pending',
        pg_catalog.now()
    )
    RETURNING id INTO v_submission_id;

    -- Update order status to payment_submitted
    UPDATE public.orders
    SET status = 'payment_submitted',
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- Notify writer
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_order.writer_id,
        'payment_submitted',
        'نئی ادائیگی کی رسید موصول ہوئی (New Payment Received)',
        'قارئین کی طرف سے آرڈر نمبر ' || v_order.order_number || ' کی رسید موصول ہو گئی ہے۔ برائے مہربانی تصدیق کریں۔',
        'قارئین کی طرف سے آرڈر نمبر ' || v_order.order_number || ' کی رسید موصول ہو گئی ہے۔ برائے مہربانی تصدیق کریں۔',
        '/writer/orders',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'submission_id', v_submission_id),
        false,
        pg_catalog.now()
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'reader',
        'SUBMIT_PAYMENT',
        'payment_submissions',
        v_submission_id::text,
        pg_catalog.jsonb_build_object('order_status', v_order.status),
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'tid', p_tid, 'status', 'payment_submitted'),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'submission_id', v_submission_id,
        'status', 'payment_submitted'
    );
END;
$$;

-- 5.3 verify_order_payment: Writer confirms bank deposit; locks commission at verification
CREATE OR REPLACE FUNCTION public.verify_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_writer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_submission record;
    v_writer record;
    v_settings record;
    v_rate numeric(5,2);
    v_commission_pkr numeric(10,2);
    v_writer_share_pkr numeric(10,2);
    v_entitlement_id uuid;
    v_ledger_id uuid;
    v_new_unpaid numeric(12,2);
    v_paused boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to verify payment.';
    END IF;

    -- Fetch order with row-lock
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Authorization check
    IF v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the receiving author or platform administrator can verify receipt.';
    END IF;

    IF v_order.status NOT IN ('payment_submitted', 'pending_payment') THEN
        RAISE EXCEPTION 'Order cannot be verified in current status: %', v_order.status;
    END IF;

    -- Fetch submission
    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE id = p_submission_id AND order_id = p_order_id
    FOR UPDATE;

    IF v_submission.id IS NULL THEN
        RAISE EXCEPTION 'Payment submission not found for order: %', p_order_id;
    END IF;

    -- Determine authoritative commission rate at VERIFICATION TIME
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);
    v_commission_pkr := pg_catalog.round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update Payment Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'verified',
        reviewer_note = p_writer_note,
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_submission_id;

    -- 2. Update Order
    UPDATE public.orders
    SET status = 'verified',
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 3. Grant Purchase Entitlement (Safe conditional insert respecting partial index)
    SELECT id INTO v_entitlement_id
    FROM public.purchase_entitlements
    WHERE reader_id = v_order.reader_id
      AND novel_id = v_order.novel_id
      AND is_revoked = false;

    IF v_entitlement_id IS NULL THEN
        INSERT INTO public.purchase_entitlements (
            reader_id,
            novel_id,
            order_id,
            granted_at,
            is_revoked,
            revoked_reason
        ) VALUES (
            v_order.reader_id,
            v_order.novel_id,
            v_order.id,
            pg_catalog.now(),
            false,
            NULL
        )
        RETURNING id INTO v_entitlement_id;
    END IF;

    -- 4. Record Immutable Entry in Sales Ledger (Idempotent: checked via partial index)
    SELECT id INTO v_ledger_id
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified';

    IF v_ledger_id IS NULL THEN
        INSERT INTO public.sales_ledger (
            order_id,
            writer_id,
            reader_id,
            novel_id,
            entry_type,
            gross_amount_pkr,
            commission_rate,
            platform_commission_pkr,
            writer_net_pkr,
            notes,
            created_at
        ) VALUES (
            v_order.id,
            v_order.writer_id,
            v_order.reader_id,
            v_order.novel_id,
            'sale_verified',
            v_order.amount_pkr,
            v_rate,
            v_commission_pkr,
            v_writer_share_pkr,
            coalesce(p_writer_note, 'Direct reader payment verified by author.'),
            pg_catalog.now()
        )
        RETURNING id INTO v_ledger_id;
    END IF;

    -- 5. Reconcile Writer Accrued Unpaid Commission from Ledger
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 6. Send Notification to Reader
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'order_verified',
        'ادائیگی کی تصدیق ہو گئی! (Payment Verified)',
        'مصنف نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ ناول آپ کی لائبریری میں دستیاب ہے۔',
        'مصنف نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ ناول آپ کی لائبریری میں دستیاب ہے۔',
        '/library',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'novel_id', v_order.novel_id),
        false,
        pg_catalog.now()
    );

    -- 7. Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'writer',
        'VERIFY_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object(
            'status', 'verified',
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id,
        'current_unpaid_commission', v_new_unpaid,
        'is_orders_paused_for_commission', v_paused
    );
END;
$$;

-- 5.4 reject_order_payment: Writer rejects receipt submission
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
        RAISE EXCEPTION 'A clear rejection reason is required.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    -- Update Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'rejected',
        reviewer_note = p_rejection_reason,
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_submission_id;

    -- Update Order
    UPDATE public.orders
    SET status = 'rejected',
        rejected_reason = p_rejection_reason,
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- Notify Reader
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'order_rejected',
        'ادائیگی تصدیق مسترد ہو گئی (Payment Verification Rejected)',
        'مصنف نے آپ کی بھیجی گئی رسید کو مسترد کیا ہے۔ وجہ: ' || p_rejection_reason,
        'مصنف نے آپ کی بھیجی گئی رسید کو مسترد کیا ہے۔ وجہ: ' || p_rejection_reason,
        '/library/orders',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'reason', p_rejection_reason),
        false,
        pg_catalog.now()
    );

    -- Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'writer',
        'REJECT_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object('status', 'rejected', 'reason', p_rejection_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected'
    );
END;
$$;

-- 5.5 record_refund_adjustment: Admin issues negative ledger reversal and revokes entitlement
CREATE OR REPLACE FUNCTION public.record_refund_adjustment(
    p_order_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_orig_ledger record;
    v_adjustment_id uuid;
    v_new_unpaid numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can record refund adjustments.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required for refund adjustments.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.status != 'verified' THEN
        RAISE EXCEPTION 'Only verified orders can be refunded (current status: %).', v_order.status;
    END IF;

    -- Fetch original verified ledger line
    SELECT * INTO v_orig_ledger
    FROM public.sales_ledger
    WHERE order_id = p_order_id AND entry_type = 'sale_verified';

    IF v_orig_ledger.id IS NULL THEN
        RAISE EXCEPTION 'Original verified ledger entry not found for order: %', p_order_id;
    END IF;

    -- 1. Insert negative reversal ledger entry
    INSERT INTO public.sales_ledger (
        order_id,
        writer_id,
        reader_id,
        novel_id,
        entry_type,
        gross_amount_pkr,
        commission_rate,
        platform_commission_pkr,
        writer_net_pkr,
        original_ledger_entry_id,
        notes,
        created_at
    ) VALUES (
        v_order.id,
        v_order.writer_id,
        v_order.reader_id,
        v_order.novel_id,
        'refund_adjustment',
        -1 * v_orig_ledger.gross_amount_pkr,
        v_orig_ledger.commission_rate,
        -1 * v_orig_ledger.platform_commission_pkr,
        -1 * v_orig_ledger.writer_net_pkr,
        v_orig_ledger.id,
        'Refund adjustment: ' || p_reason,
        pg_catalog.now()
    )
    RETURNING id INTO v_adjustment_id;

    -- 2. Revoke active purchase entitlement
    UPDATE public.purchase_entitlements
    SET is_revoked = true,
        revoked_reason = p_reason
    WHERE order_id = p_order_id;

    -- 3. Update order status
    UPDATE public.orders
    SET status = 'refunded_adjusted',
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 4. Reconcile writer unpaid balance
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    -- 5. Notifications
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'order_refunded',
        'آرڈر ریفنڈ ہو گیا (Order Refunded)',
        'آرڈر نمبر ' || v_order.order_number || ' کا ریفنڈ درج کر لیا گیا ہے۔',
        'آرڈر نمبر ' || v_order.order_number || ' کا ریفنڈ درج کر لیا گیا ہے۔',
        '/library/orders',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'reason', p_reason),
        false,
        pg_catalog.now()
    );

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_order.writer_id,
        'order_refunded',
        'آرڈر ریفنڈ ایڈجسٹمنٹ (Order Refund Adjustment)',
        'ایڈمن نے آرڈر نمبر ' || v_order.order_number || ' کی ریفنڈ ایڈجسٹمنٹ کی ہے۔',
        'ایڈمن نے آرڈر نمبر ' || v_order.order_number || ' کی ریفنڈ ایڈجسٹمنٹ کی ہے۔',
        '/writer/commission',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'reason', p_reason),
        false,
        pg_catalog.now()
    );

    -- 6. Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'RECORD_REFUND_ADJUSTMENT',
        'sales_ledger',
        v_adjustment_id::text,
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'status', v_order.status),
        pg_catalog.jsonb_build_object(
            'adjustment_ledger_id', v_adjustment_id,
            'reversed_gross', -1 * v_orig_ledger.gross_amount_pkr,
            'reason', p_reason
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'adjustment_ledger_id', v_adjustment_id,
        'writer_unpaid_balance', v_new_unpaid
    );
END;
$$;

-- 5.6 generate_commission_invoice: Admin links unsettled ledger rows to periodic invoice
CREATE OR REPLACE FUNCTION public.generate_commission_invoice(
    p_writer_id uuid,
    p_period_start timestamptz,
    p_period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_count integer;
    v_gross numeric(12,2);
    v_comm numeric(12,2);
    v_invoice_num text;
    v_invoice_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can generate commission invoices.';
    END IF;

    -- Aggregate unbilled verified ledger lines within the target period
    SELECT 
        pg_catalog.count(*),
        coalesce(pg_catalog.sum(gross_amount_pkr), 0.00),
        coalesce(pg_catalog.sum(platform_commission_pkr), 0.00)
    INTO v_count, v_gross, v_comm
    FROM public.sales_ledger
    WHERE writer_id = p_writer_id
      AND commission_invoice_id IS NULL
      AND created_at >= p_period_start
      AND created_at <= p_period_end;

    IF v_count = 0 OR v_comm <= 0 THEN
        RAISE EXCEPTION 'No unsettled commission transactions found for this writer in the given period.';
    END IF;

    v_invoice_num := 'INV-' || pg_catalog.to_char(p_period_end, 'YYYYMM') || '-' || pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    -- Create invoice
    INSERT INTO public.commission_invoices (
        invoice_number,
        writer_id,
        period_start,
        period_end,
        total_sales_count,
        total_gross_pkr,
        total_commission_owed_pkr,
        amount_settled_pkr,
        status,
        created_at
    ) VALUES (
        v_invoice_num,
        p_writer_id,
        p_period_start,
        p_period_end,
        v_count,
        v_gross,
        v_comm,
        0.00,
        'invoiced',
        pg_catalog.now()
    )
    RETURNING id INTO v_invoice_id;

    -- Link unsettled ledger rows to this invoice
    UPDATE public.sales_ledger
    SET commission_invoice_id = v_invoice_id
    WHERE writer_id = p_writer_id
      AND commission_invoice_id IS NULL
      AND created_at >= p_period_start
      AND created_at <= p_period_end;

    -- Notify writer
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        p_writer_id,
        'invoice_generated',
        'کمیشن انوائس جاری ہو گئی (Commission Invoice Issued)',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا کمیشن: ' || v_comm || ' روپے۔',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا کمیشن: ' || v_comm || ' روپے۔',
        '/writer/commission',
        pg_catalog.jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_num),
        false,
        pg_catalog.now()
    );

    -- Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'GENERATE_COMMISSION_INVOICE',
        'commission_invoices',
        v_invoice_id::text,
        NULL,
        pg_catalog.jsonb_build_object('invoice_number', v_invoice_num, 'total_commission_owed', v_comm),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'total_sales_count', v_count,
        'total_commission_owed_pkr', v_comm
    );
END;
$$;

-- 5.7 report_commission_payment: Writer reports TID for commission settlement (status -> payment_reported)
CREATE OR REPLACE FUNCTION public.report_commission_payment(
    p_invoice_id uuid,
    p_tid text,
    p_screenshot_path text,
    p_amount_pkr numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoice record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_tid IS NULL OR trim(p_tid) = '' THEN
        RAISE EXCEPTION 'Transaction reference (TID) is required.';
    END IF;

    IF p_amount_pkr <= 0 THEN
        RAISE EXCEPTION 'Reported amount must be positive.';
    END IF;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF v_invoice.id IS NULL THEN
        RAISE EXCEPTION 'Commission invoice not found: %', p_invoice_id;
    END IF;

    IF v_invoice.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the invoiced author can report settlement.';
    END IF;

    IF v_invoice.status NOT IN ('invoiced', 'open', 'payment_reported') THEN
        RAISE EXCEPTION 'Payment cannot be reported for invoice in status: %', v_invoice.status;
    END IF;

    -- Update invoice to payment_reported (NOT settled)
    UPDATE public.commission_invoices
    SET status = 'payment_reported',
        writer_reported_tid = p_tid,
        writer_reported_screenshot_url = p_screenshot_path,
        created_at = created_at
    WHERE id = p_invoice_id;

    -- Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'writer',
        'REPORT_COMMISSION_PAYMENT',
        'commission_invoices',
        p_invoice_id::text,
        pg_catalog.jsonb_build_object('status', v_invoice.status),
        pg_catalog.jsonb_build_object('status', 'payment_reported', 'tid', p_tid, 'amount_pkr', p_amount_pkr),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'status', 'payment_reported'
    );
END;
$$;

-- 5.8 confirm_commission_settlement: Admin verifies payment and reconciles writer pause state
CREATE OR REPLACE FUNCTION public.confirm_commission_settlement(
    p_invoice_id uuid,
    p_amount_pkr numeric,
    p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoice record;
    v_payment_id uuid;
    v_new_unpaid numeric(12,2);
    v_paused boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can confirm commission settlements.';
    END IF;

    IF p_amount_pkr <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be positive.';
    END IF;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF v_invoice.id IS NULL THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
    END IF;

    -- 1. Update Invoice status & settled amounts
    UPDATE public.commission_invoices
    SET amount_settled_pkr = amount_settled_pkr + p_amount_pkr,
        status = CASE 
            WHEN (amount_settled_pkr + p_amount_pkr) >= total_commission_owed_pkr 
            THEN 'settled'::public.commission_invoice_status 
            ELSE 'payment_reported'::public.commission_invoice_status 
        END,
        settled_by_admin_id = v_caller_id,
        settled_at = pg_catalog.now()
    WHERE id = p_invoice_id;

    -- 2. Record Commission Payment
    INSERT INTO public.commission_payments (
        invoice_id,
        writer_id,
        amount_pkr,
        transaction_reference,
        screenshot_url,
        confirmed_by_admin_id,
        confirmed_at,
        notes,
        created_at
    ) VALUES (
        p_invoice_id,
        v_invoice.writer_id,
        p_amount_pkr,
        coalesce(v_invoice.writer_reported_tid, 'ADMIN-SETTLED'),
        v_invoice.writer_reported_screenshot_url,
        v_caller_id,
        pg_catalog.now(),
        p_admin_note,
        pg_catalog.now()
    )
    RETURNING id INTO v_payment_id;

    -- 3. Reconcile Writer Accrued Unpaid Commission from Ledger
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_invoice.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_invoice.writer_id;

    -- 4. Notify Writer
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_invoice.writer_id,
        'commission_settled',
        'کمیشن کلیئرنس کی تصدیق (Commission Cleared)',
        'پلیٹ فارم کی جانب سے آپ کے واجب الادا کمیشن کی ادائیگی قبول کر لی گئی ہے۔ نیا بیلنس: ' || v_new_unpaid || ' روپے۔',
        'پلیٹ فارم کی جانب سے آپ کے واجب الادا کمیشن کی ادائیگی قبول کر لی گئی ہے۔ نیا بیلنس: ' || v_new_unpaid || ' روپے۔',
        '/writer/commission',
        pg_catalog.jsonb_build_object('invoice_id', p_invoice_id, 'payment_id', v_payment_id),
        false,
        pg_catalog.now()
    );

    -- 5. Audit Log
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'CONFIRM_COMMISSION_SETTLEMENT',
        'commission_invoices',
        p_invoice_id::text,
        pg_catalog.jsonb_build_object('status', v_invoice.status, 'amount_settled_pkr', v_invoice.amount_settled_pkr),
        pg_catalog.jsonb_build_object(
            'amount_paid', p_amount_pkr,
            'writer_unpaid_balance', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'amount_settled', p_amount_pkr,
        'writer_unpaid_balance', v_new_unpaid,
        'is_orders_paused_for_commission', v_paused
    );
END;
$$;

-- 5.9 open_dispute: Reader or writer opens formal dispute
CREATE OR REPLACE FUNCTION public.open_dispute(
    p_order_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_order record;
    v_dispute_id uuid;
    v_notify_target uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A clear dispute reason is required.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.reader_id != v_caller_id AND v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only participants in this transaction can open a dispute.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.disputes WHERE order_id = p_order_id AND status IN ('open', 'under_review')) THEN
        RAISE EXCEPTION 'An open dispute already exists for this order.';
    END IF;

    INSERT INTO public.disputes (
        order_id,
        raised_by_id,
        opened_by,
        reason,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        v_caller_id,
        v_caller_id,
        p_reason,
        'open',
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING id INTO v_dispute_id;

    UPDATE public.orders
    SET status = 'disputed',
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    v_notify_target := CASE WHEN v_caller_id = v_order.reader_id THEN v_order.writer_id ELSE v_order.reader_id END;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_notify_target,
        'dispute_opened',
        'تنازعہ درج کیا گیا (Dispute Raised)',
        'آرڈر نمبر ' || v_order.order_number || ' پر تنازعہ کھولا گیا ہے۔',
        'آرڈر نمبر ' || v_order.order_number || ' پر تنازعہ کھولا گیا ہے۔ وجہ: ' || p_reason,
        '/library/orders',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'dispute_id', v_dispute_id),
        false,
        pg_catalog.now()
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'user',
        'OPEN_DISPUTE',
        'disputes',
        v_dispute_id::text,
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'prior_status', v_order.status),
        pg_catalog.jsonb_build_object('dispute_id', v_dispute_id, 'reason', p_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispute_id', v_dispute_id,
        'status', 'open'
    );
END;
$$;

-- 5.10 resolve_dispute: Admin resolves dispute
CREATE OR REPLACE FUNCTION public.resolve_dispute(
    p_dispute_id uuid,
    p_resolution text,
    p_resolution_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_dispute record;
    v_order record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can resolve disputes.';
    END IF;

    IF p_resolution NOT IN ('resolved_for_reader', 'resolved_for_writer', 'closed') THEN
        RAISE EXCEPTION 'Invalid dispute resolution option: %', p_resolution;
    END IF;

    SELECT * INTO v_dispute
    FROM public.disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found: %', p_dispute_id;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_dispute.order_id
    FOR UPDATE;

    -- Update dispute
    UPDATE public.disputes
    SET status = p_resolution::public.dispute_status,
        resolution_note = p_resolution_note,
        admin_resolution_notes = p_resolution_note,
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_dispute_id;

    -- If resolved for reader on verified order, execute refund adjustment
    IF p_resolution = 'resolved_for_reader' AND v_order.status = 'verified' THEN
        PERFORM public.record_refund_adjustment(v_order.id, 'Dispute resolved in favor of reader: ' || p_resolution_note);
    ELSIF p_resolution = 'resolved_for_reader' THEN
        UPDATE public.orders SET status = 'cancelled', updated_at = pg_catalog.now() WHERE id = v_order.id;
    ELSIF p_resolution = 'resolved_for_writer' AND v_order.verified_at IS NOT NULL THEN
        UPDATE public.orders SET status = 'verified', updated_at = pg_catalog.now() WHERE id = v_order.id;
    END IF;

    -- Notify reader and writer
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES 
    (
        v_order.reader_id,
        'dispute_resolved',
        'تنازعہ حل ہو گیا (Dispute Resolved)',
        'آرڈر نمبر ' || v_order.order_number || ' پر تنازعہ حل کر دیا گیا ہے۔ نتیجہ: ' || p_resolution,
        p_resolution_note,
        '/library/orders',
        pg_catalog.jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id),
        false,
        pg_catalog.now()
    ),
    (
        v_order.writer_id,
        'dispute_resolved',
        'تنازعہ حل ہو گیا (Dispute Resolved)',
        'آرڈر نمبر ' || v_order.order_number || ' پر تنازعہ حل کر دیا گیا ہے۔ نتیجہ: ' || p_resolution,
        p_resolution_note,
        '/writer/orders',
        pg_catalog.jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id),
        false,
        pg_catalog.now()
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'RESOLVE_DISPUTE',
        'disputes',
        p_dispute_id::text,
        pg_catalog.jsonb_build_object('status', v_dispute.status),
        pg_catalog.jsonb_build_object('resolution', p_resolution, 'note', p_resolution_note),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'dispute_id', p_dispute_id,
        'resolution', p_resolution
    );
END;
$$;

-- 5.11 Writer Moderation RPCs: approve_writer, reject_writer, suspend_writer
CREATE OR REPLACE FUNCTION public.approve_writer(p_writer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can approve writers.';
    END IF;

    UPDATE public.writer_profiles
    SET status = 'approved',
        approved_by = v_caller_id,
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    -- Ensure base profile role is writer
    UPDATE public.profiles
    SET role = 'writer',
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        p_writer_id,
        'writer_approved',
        'مصنف اکاؤنٹ منظور ہو گیا! (Writer Account Approved)',
        'مبارک ہو! آپ کا رائٹر پروفائل منظور ہو چکا ہے۔ اب آپ ناولز شائع کر سکتے ہیں۔',
        'مبارک ہو! آپ کا رائٹر پروفائل منظور ہو چکا ہے۔ اب آپ ناولز شائع کر سکتے ہیں۔',
        '/writer/dashboard',
        pg_catalog.jsonb_build_object('writer_id', p_writer_id),
        false,
        pg_catalog.now()
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'APPROVE_WRITER',
        'writer_profiles',
        p_writer_id::text,
        NULL,
        pg_catalog.jsonb_build_object('status', 'approved'),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'writer_id', p_writer_id, 'status', 'approved');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_writer(
    p_writer_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can reject writers.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to reject a writer.';
    END IF;

    UPDATE public.writer_profiles
    SET status = 'rejected',
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        p_writer_id,
        'writer_rejected',
        'مصنف درخواست مسترد (Writer Application Rejected)',
        'آپ کی مصنف درخواست مسترد کر دی گئی ہے۔ وجہ: ' || p_reason,
        p_reason,
        '/contact',
        pg_catalog.jsonb_build_object('writer_id', p_writer_id, 'reason', p_reason),
        false,
        pg_catalog.now()
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'REJECT_WRITER',
        'writer_profiles',
        p_writer_id::text,
        NULL,
        pg_catalog.jsonb_build_object('status', 'rejected', 'reason', p_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'writer_id', p_writer_id, 'status', 'rejected');
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_writer(
    p_writer_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can suspend writers.';
    END IF;

    UPDATE public.writer_profiles
    SET status = 'suspended',
        is_orders_paused_for_commission = true,
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        p_writer_id,
        'writer_suspended',
        'اکاؤنٹ معطل کر دیا گیا (Writer Account Suspended)',
        'پلیٹ فارم قواعد کی خلاف ورزی کی بنا پر آپ کا مصنف اکاؤنٹ معطل کر دیا گیا ہے۔ وجہ: ' || p_reason,
        p_reason,
        '/contact',
        pg_catalog.jsonb_build_object('writer_id', p_writer_id, 'reason', p_reason),
        false,
        pg_catalog.now()
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'SUSPEND_WRITER',
        'writer_profiles',
        p_writer_id::text,
        NULL,
        pg_catalog.jsonb_build_object('status', 'suspended', 'reason', p_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'writer_id', p_writer_id, 'status', 'suspended');
END;
$$;

-- 5.12 Novel Moderation RPCs: approve_novel, reject_novel
CREATE OR REPLACE FUNCTION public.approve_novel(p_novel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can approve novels.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    UPDATE public.novels
    SET status = 'published',
        published_at = coalesce(published_at, pg_catalog.now()),
        moderation_reason = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_novel.writer_id,
        'novel_published',
        'ناول شائع ہو گیا! (Novel Published)',
        'آپ کا ناول "' || v_novel.title_urdu || '" اب مارکیٹ پلیس پر لائیو اور خریداری کے لیے دستیاب ہے۔',
        'آپ کا ناول "' || v_novel.title_urdu || '" اب مارکیٹ پلیس پر لائیو اور خریداری کے لیے دستیاب ہے۔',
        '/novels/' || v_novel.slug,
        pg_catalog.jsonb_build_object('novel_id', p_novel_id),
        false,
        pg_catalog.now()
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'APPROVE_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', v_novel.status),
        pg_catalog.jsonb_build_object('status', 'published'),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'novel_id', p_novel_id, 'status', 'published');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_novel(
    p_novel_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can reject novels.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A rejection reason is required.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    UPDATE public.novels
    SET status = 'rejected',
        moderation_reason = p_reason,
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        body,
        link,
        entity_refs,
        is_read,
        created_at
    ) VALUES (
        v_novel.writer_id,
        'novel_rejected',
        'ناول اشاعت مسترد (Novel Moderation Rejected)',
        'آپ کے ناول "' || v_novel.title_urdu || '" کی اشاعت مسترد کر دی گئی ہے۔ وجہ: ' || p_reason,
        p_reason,
        '/writer/novels',
        pg_catalog.jsonb_build_object('novel_id', p_novel_id, 'reason', p_reason),
        false,
        pg_catalog.now()
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'REJECT_NOVEL',
        'novels',
        p_novel_id::text,
        pg_catalog.jsonb_build_object('status', v_novel.status),
        pg_catalog.jsonb_build_object('status', 'rejected', 'reason', p_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'novel_id', p_novel_id, 'status', 'rejected');
END;
$$;

-- 5.13 User Management RPC: admin_update_user_role_status
CREATE OR REPLACE FUNCTION public.admin_update_user_role_status(
    p_user_id uuid,
    p_new_role public.user_role,
    p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_prev record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can change user roles and account statuses.';
    END IF;

    SELECT role, is_active INTO v_prev
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_prev.role IS NULL THEN
        RAISE EXCEPTION 'User profile not found: %', p_user_id;
    END IF;

    UPDATE public.profiles
    SET role = p_new_role,
        is_active = p_is_active,
        updated_at = pg_catalog.now()
    WHERE id = p_user_id;

    -- If assigned writer role, provision default writer profile if missing
    IF p_new_role = 'writer' AND NOT EXISTS (SELECT 1 FROM public.writer_profiles WHERE id = p_user_id) THEN
        INSERT INTO public.writer_profiles (
            id,
            pen_name_urdu,
            pen_name_english,
            status,
            unpaid_commission_limit,
            current_unpaid_commission,
            is_orders_paused_for_commission,
            approved_by,
            created_at,
            updated_at
        ) VALUES (
            p_user_id,
            'مصنف',
            'Author',
            'approved',
            5000.00,
            0.00,
            false,
            v_caller_id,
            pg_catalog.now(),
            pg_catalog.now()
        );
    END IF;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        previous_state,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        'admin',
        'UPDATE_USER_ROLE_STATUS',
        'profiles',
        p_user_id::text,
        pg_catalog.jsonb_build_object('role', v_prev.role, 'is_active', v_prev.is_active),
        pg_catalog.jsonb_build_object('role', p_new_role, 'is_active', p_is_active),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'user_id', p_user_id, 'role', p_new_role, 'is_active', p_is_active);
END;
$$;

-- 5.14 Screenshot Retention Purge: Removes screenshots older than retention window for closed/verified orders
CREATE OR REPLACE FUNCTION public.purge_old_payment_screenshots(
    p_retention_days integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_purged_count integer := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can trigger screenshot retention purging.';
    END IF;

    -- Clear storage reference pointers while strictly preserving the sales ledger and audit lines
    WITH old_submissions AS (
        SELECT ps.id
        FROM public.payment_submissions ps
        JOIN public.orders o ON o.id = ps.order_id
        WHERE o.status IN ('verified', 'cancelled', 'refunded_adjusted')
          AND ps.created_at < (pg_catalog.now() - (p_retention_days || ' days')::interval)
          AND (ps.screenshot_path IS NOT NULL OR ps.screenshot_url IS NOT NULL)
    )
    UPDATE public.payment_submissions ps
    SET screenshot_path = NULL,
        screenshot_url = '[PURGED_AFTER_RETENTION_PERIOD]'
    FROM old_submissions os
    WHERE ps.id = os.id;

    GET DIAGNOSTICS v_purged_count = ROW_COUNT;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'retention_days', p_retention_days,
        'purged_screenshot_references', v_purged_count
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 6: FUNCTION PERMISSION HARMONIZATION
-- ------------------------------------------------------------------------------

-- Revoke execute from public and grant explicitly to authenticated users
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_novel_entitlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_novel_entitlement(uuid) TO authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.get_writer_unpaid_commission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_writer_unpaid_commission(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_order(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_payment(uuid, text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment(uuid, text, text, numeric, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_order_payment(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_order_payment(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_order_payment(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_refund_adjustment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_refund_adjustment(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.report_commission_payment(uuid, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_commission_payment(uuid, text, text, numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.confirm_commission_settlement(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_commission_settlement(uuid, numeric, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.open_dispute(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_writer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_writer(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_writer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_writer(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.suspend_writer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_writer(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_novel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_novel(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_novel(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_novel(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_update_user_role_status(uuid, public.user_role, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role_status(uuid, public.user_role, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.purge_old_payment_screenshots(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_payment_screenshots(integer) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 7: STORAGE BUCKETS & STORAGE ROW-LEVEL SECURITY
-- ------------------------------------------------------------------------------

-- Ensure storage schema buckets are provisioned
DO $$
BEGIN
    -- 1. Private bucket for payment screenshots and commission proofs
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'payment-proofs',
        'payment-proofs',
        false,
        2097152, -- 2 MB
        ARRAY['image/webp', 'image/jpeg', 'image/png']
    )
    ON CONFLICT (id) DO UPDATE SET
        public = false,
        file_size_limit = 2097152,
        allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

    -- 2. Public bucket for book covers and author avatars
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
        'novel-assets',
        'novel-assets',
        true,
        5242880, -- 5 MB
        ARRAY['image/webp', 'image/jpeg', 'image/png']
    )
    ON CONFLICT (id) DO UPDATE SET
        public = true,
        file_size_limit = 5242880,
        allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];
EXCEPTION
    WHEN undefined_table THEN
        -- Handles environments where Supabase storage schema is initialized separately
        NULL;
END $$;

-- Note: In Supabase, storage.objects is owned by supabase_storage_admin and has Row Level Security (RLS)
-- enabled by default. Attempting ALTER TABLE storage.objects raises ERROR 42501 (must be owner of table objects).
-- Policies are defined directly on storage.objects below.

-- Drop prior storage policies if any
DO $$
BEGIN
    DROP POLICY IF EXISTS "Private payment proof read access" ON storage.objects;
    DROP POLICY IF EXISTS "Reader upload payment proof" ON storage.objects;
    DROP POLICY IF EXISTS "Public view novel assets" ON storage.objects;
    DROP POLICY IF EXISTS "Writer and admin manage novel assets" ON storage.objects;
EXCEPTION
    WHEN undefined_table THEN
        NULL;
END $$;

-- Storage Policy: Read payment receipts (order reader, order writer, or admin only)
DO $$
BEGIN
    CREATE POLICY "Private payment proof read access"
        ON storage.objects FOR SELECT
        USING (
            bucket_id = 'payment-proofs' AND (
                public.is_admin() OR
                EXISTS (
                    SELECT 1 FROM public.orders o
                    WHERE o.id::text = (storage.foldername(name))[1]
                      AND (o.reader_id = auth.uid() OR o.writer_id = auth.uid())
                ) OR
                EXISTS (
                    SELECT 1 FROM public.commission_invoices ci
                    WHERE ci.id::text = (storage.foldername(name))[1]
                      AND ci.writer_id = auth.uid()
                )
            )
        );

    -- Storage Policy: Reader upload payment receipts for own order
    CREATE POLICY "Reader upload payment proof"
        ON storage.objects FOR INSERT
        WITH CHECK (
            bucket_id = 'payment-proofs' AND (
                public.is_admin() OR
                EXISTS (
                    SELECT 1 FROM public.orders o
                    WHERE o.id::text = (storage.foldername(name))[1]
                      AND o.reader_id = auth.uid()
                ) OR
                EXISTS (
                    SELECT 1 FROM public.commission_invoices ci
                    WHERE ci.id::text = (storage.foldername(name))[1]
                      AND ci.writer_id = auth.uid()
                )
            )
        );

    -- Storage Policy: Public view book covers and avatars
    CREATE POLICY "Public view novel assets"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'novel-assets');

    -- Storage Policy: Writers and admins upload/manage novel covers
    CREATE POLICY "Writer and admin manage novel assets"
        ON storage.objects FOR ALL
        USING (
            bucket_id = 'novel-assets' AND (
                public.is_admin() OR
                EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = auth.uid() AND p.role IN ('writer', 'admin')
                )
            )
        )
        WITH CHECK (
            bucket_id = 'novel-assets' AND (
                public.is_admin() OR
                EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = auth.uid() AND p.role IN ('writer', 'admin')
                )
            )
        );
EXCEPTION
    WHEN undefined_table THEN
        NULL;
END $$;
