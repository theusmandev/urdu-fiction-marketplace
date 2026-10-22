-- ==============================================================================
-- UNB Premium — Migration 0009: Order Flow Gap Fixes & Payment Hardening
-- Description:
--   1. verify_order_payment: Strictly requires order status 'payment_submitted'
--      (removes 'pending_payment') and payment submission reviewer_status = 'pending'.
--   2. reject_order_payment: Strictly requires order status 'payment_submitted'
--      and payment submission reviewer_status = 'pending'.
--   3. Rejected order edge case: Includes 'rejected' in open-order check in create_order
--      and updates partial unique index uq_orders_reader_novel_active to cover 'rejected'.
--   4. cancel_order: Adds atomic transactional RPC allowing ordering reader (or admin)
--      to cancel pending_payment or rejected orders, writing an audit log.
--   5. apply_as_writer: Adds atomic transactional RPC for readers to apply as writer
--      with status 'pending_approval' and agreement timestamp; allows reapplication
--      for rejected writers; updates trigger trg_protect_writer_profile_columns.
--   6. upsert_writer_payment_method / deactivate_writer_payment_method: Restricts
--      payment method management to the writer owner (approved or pending), closes
--      public/reader read access on writer_payment_methods (readers view only via
--      orders.payment_instructions_snapshot).
--   7. Security hardening: Revokes EXECUTE from PUBLIC and anon on public schema functions
--      (preserving anon EXECUTE on has_novel_entitlement and is_admin for RLS evaluation).
-- Idempotency: All DDL statements are guarded with IF EXISTS / IF NOT EXISTS.
-- Compatibility: Supabase CLI (supabase db push) and Supabase SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: PARTIAL UNIQUE INDEX ON ACTIVE & REJECTED ORDERS
-- ------------------------------------------------------------------------------

-- Include 'rejected' in partial unique index so readers cannot open a second order
-- for a novel while an existing rejected order can still be resubmitted or cancelled.
DROP INDEX IF EXISTS public.uq_orders_reader_novel_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_reader_novel_active
    ON public.orders (reader_id, novel_id)
    WHERE status IN ('pending_payment', 'payment_submitted', 'rejected');


-- ------------------------------------------------------------------------------
-- SECTION 2: CREATE ORDER RPC (UPDATED WITH REJECTED ORDER CHECK)
-- ------------------------------------------------------------------------------

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

    -- Check if reader already has an open or rejected order for this novel
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND status IN ('pending_payment', 'payment_submitted', 'rejected')
    ) THEN
        RAISE EXCEPTION 'An active or rejected order for this novel already exists in your account. Please resubmit payment for your existing order or cancel it before placing a new one.';
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
        'instructions', v_instructions
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 3: VERIFY ORDER PAYMENT RPC (STRICT SUBMITTED & PENDING CHECK)
-- ------------------------------------------------------------------------------

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

    -- Authorization check: Receiving writer or platform administrator only
    IF v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the receiving author or platform administrator can verify receipt.';
    END IF;

    -- Strict order status check: ONLY 'payment_submitted' allowed (removes 'pending_payment')
    IF v_order.status != 'payment_submitted' THEN
        RAISE EXCEPTION 'Order cannot be verified in current status: %. Only orders in status payment_submitted can be verified.', v_order.status;
    END IF;

    -- Fetch submission with row-lock: Must belong to this order
    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE id = p_submission_id AND order_id = p_order_id
    FOR UPDATE;

    IF v_submission.id IS NULL THEN
        RAISE EXCEPTION 'Payment submission not found for order: %', p_order_id;
    END IF;

    -- Strict submission status check: reviewer_status must be 'pending'
    IF v_submission.reviewer_status != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be verified: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
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

    -- 4. Record Immutable Entry in Sales Ledger (Idempotent: guarded via partial unique index)
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
        'ادائیگی کی تصدیق ہو گئی (Payment Verified)',
        'آپ کی کتاب تک رسائی بحال کر دی گئی ہے۔ (Novel access granted)',
        'آپ کی کتاب تک رسائی بحال کر دی گئی ہے۔ (Novel access granted)',
        '/novels/' || v_order.novel_id,
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
        CASE WHEN public.is_admin() THEN 'admin' ELSE 'writer' END,
        'VERIFY_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object(
            'status', 'verified',
            'submission_id', p_submission_id,
            'rate', v_rate,
            'commission_pkr', v_commission_pkr,
            'writer_share_pkr', v_writer_share_pkr,
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id,
        'current_unpaid_commission', v_new_unpaid,
        'is_orders_paused_for_commission', coalesce(v_paused, false)
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 4: REJECT ORDER PAYMENT RPC (STRICT SUBMITTED & PENDING CHECK)
-- ------------------------------------------------------------------------------

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
    v_submission record;
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

    -- Strict order status check: ONLY 'payment_submitted' allowed
    IF v_order.status != 'payment_submitted' THEN
        RAISE EXCEPTION 'Order cannot be rejected in current status: %. Only orders in status payment_submitted can be rejected.', v_order.status;
    END IF;

    -- Fetch and validate submission: Must belong to this order
    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE id = p_submission_id AND order_id = p_order_id
    FOR UPDATE;

    IF v_submission.id IS NULL THEN
        RAISE EXCEPTION 'Payment submission not found for order: %', p_order_id;
    END IF;

    -- Strict submission status check: reviewer_status must be 'pending'
    IF v_submission.reviewer_status != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be rejected: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    -- Update Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'rejected',
        reviewer_note = trim(p_rejection_reason),
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_submission_id;

    -- Update Order
    UPDATE public.orders
    SET status = 'rejected',
        rejected_reason = trim(p_rejection_reason),
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
        'مصنف نے آپ کی بھیجی گئی رسید کو مسترد کیا ہے۔ وجہ: ' || trim(p_rejection_reason),
        'مصنف نے آپ کی بھیجی گئی رسید کو مسترد کیا ہے۔ وجہ: ' || trim(p_rejection_reason),
        '/library/orders',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'reason', trim(p_rejection_reason)),
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
        CASE WHEN public.is_admin() THEN 'admin' ELSE 'writer' END,
        'REJECT_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object(
            'status', 'rejected',
            'submission_id', p_submission_id,
            'reason', trim(p_rejection_reason)
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected'
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 5: CANCEL ORDER RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id uuid,
    p_reason text DEFAULT NULL
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

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Only ordering reader or platform admin can cancel
    IF v_order.reader_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the ordering reader or platform administrator can cancel this order.';
    END IF;

    -- Only allowed from pending_payment or rejected
    IF v_order.status NOT IN ('pending_payment', 'rejected') THEN
        RAISE EXCEPTION 'Order cannot be cancelled in status: %. Only orders in status pending_payment or rejected can be cancelled.', v_order.status;
    END IF;

    UPDATE public.orders
    SET status = 'cancelled',
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

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
        CASE WHEN public.is_admin() THEN 'admin' ELSE 'reader' END,
        'CANCEL_ORDER',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object('status', 'cancelled', 'reason', p_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'cancelled'
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 6: WRITER APPLICATION RPC & TRIGGER UPDATE
-- ------------------------------------------------------------------------------

-- Update trigger function so rejected writers can transition back to pending_approval upon reapplication
CREATE OR REPLACE FUNCTION public.trg_protect_writer_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_db_admin boolean;
BEGIN
    v_is_db_admin := (auth.uid() IS NULL AND pg_catalog.current_setting('role', true) NOT IN ('authenticated', 'anon'));

    IF NOT v_is_db_admin AND NOT public.is_admin() THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            -- Allow a rejected writer to transition back to pending_approval upon reapplication
            IF NOT (OLD.status = 'rejected' AND NEW.status = 'pending_approval' AND OLD.id = auth.uid()) THEN
                RAISE EXCEPTION 'Unauthorized: Writer approval status can only be modified by administrators.';
            END IF;
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

-- apply_as_writer RPC
CREATE OR REPLACE FUNCTION public.apply_as_writer(
    p_pen_name_urdu text,
    p_pen_name_english text,
    p_bio_urdu text DEFAULT NULL,
    p_bio_english text DEFAULT NULL,
    p_accept_agreement boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_existing record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_accept_agreement IS NOT TRUE THEN
        RAISE EXCEPTION 'You must accept the writer platform agreement to apply.';
    END IF;

    IF p_pen_name_urdu IS NULL OR trim(p_pen_name_urdu) = '' THEN
        RAISE EXCEPTION 'Urdu pen name is required.';
    END IF;

    IF p_pen_name_english IS NULL OR trim(p_pen_name_english) = '' THEN
        RAISE EXCEPTION 'English pen name is required.';
    END IF;

    SELECT * INTO v_existing
    FROM public.writer_profiles
    WHERE id = v_caller_id;

    IF v_existing.id IS NOT NULL THEN
        IF v_existing.status != 'rejected' THEN
            RAISE EXCEPTION 'A writer application already exists for your account with status: %', v_existing.status;
        END IF;

        -- Reapplication for rejected writer
        UPDATE public.writer_profiles
        SET pen_name_urdu = trim(p_pen_name_urdu),
            pen_name_english = trim(p_pen_name_english),
            bio_urdu = trim(p_bio_urdu),
            bio_english = trim(p_bio_english),
            status = 'pending_approval',
            agreement_accepted_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_caller_id;
    ELSE
        -- Fresh application
        INSERT INTO public.writer_profiles (
            id,
            pen_name_urdu,
            pen_name_english,
            bio_urdu,
            bio_english,
            status,
            agreement_accepted_at,
            created_at,
            updated_at
        ) VALUES (
            v_caller_id,
            trim(p_pen_name_urdu),
            trim(p_pen_name_english),
            trim(p_bio_urdu),
            trim(p_bio_english),
            'pending_approval',
            pg_catalog.now(),
            pg_catalog.now(),
            pg_catalog.now()
        );
    END IF;

    -- Audit Log (never modifies profiles.role; approve_writer handles role upgrade)
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
        'APPLY_AS_WRITER',
        'writer_profiles',
        v_caller_id::text,
        CASE WHEN v_existing.id IS NOT NULL THEN pg_catalog.jsonb_build_object('status', v_existing.status) ELSE NULL END,
        pg_catalog.jsonb_build_object(
            'status', 'pending_approval',
            'pen_name_urdu', trim(p_pen_name_urdu),
            'pen_name_english', trim(p_pen_name_english)
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'writer_id', v_caller_id,
        'status', 'pending_approval'
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 7: WRITER PAYMENT METHODS RPCs & ISOLATED RLS
-- ------------------------------------------------------------------------------

-- Strict RLS on writer_payment_methods: Owner & Admin only.
-- Readers never query this table directly; reader sees snapshot in orders.payment_instructions_snapshot.
ALTER TABLE public.writer_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readers view active payment methods of approved writers during checkout" ON public.writer_payment_methods;
DROP POLICY IF EXISTS "Writers view own payment methods" ON public.writer_payment_methods;
DROP POLICY IF EXISTS "Writers manage own payment methods" ON public.writer_payment_methods;
DROP POLICY IF EXISTS "Admin manage payment methods" ON public.writer_payment_methods;
DROP POLICY IF EXISTS "writer_payment_methods_select" ON public.writer_payment_methods;
DROP POLICY IF EXISTS "writer_payment_methods_insert" ON public.writer_payment_methods;
DROP POLICY IF EXISTS "writer_payment_methods_update" ON public.writer_payment_methods;
DROP POLICY IF EXISTS "writer_payment_methods_delete" ON public.writer_payment_methods;

CREATE POLICY "writer_payment_methods_select"
    ON public.writer_payment_methods FOR SELECT
    USING (writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "writer_payment_methods_insert"
    ON public.writer_payment_methods FOR INSERT
    WITH CHECK (
        (writer_id = auth.uid() AND EXISTS (
            SELECT 1 FROM public.writer_profiles wp
            WHERE wp.id = auth.uid() AND wp.status IN ('approved', 'pending_approval')
        ))
        OR public.is_admin()
    );

CREATE POLICY "writer_payment_methods_update"
    ON public.writer_payment_methods FOR UPDATE
    USING (writer_id = auth.uid() OR public.is_admin())
    WITH CHECK (
        (writer_id = auth.uid() AND EXISTS (
            SELECT 1 FROM public.writer_profiles wp
            WHERE wp.id = auth.uid() AND wp.status IN ('approved', 'pending_approval')
        ))
        OR public.is_admin()
    );

CREATE POLICY "writer_payment_methods_delete"
    ON public.writer_payment_methods FOR DELETE
    USING (writer_id = auth.uid() OR public.is_admin());

-- RPC upsert_writer_payment_method
CREATE OR REPLACE FUNCTION public.upsert_writer_payment_method(
    p_method_type public.payment_method_type,
    p_account_title text,
    p_account_number_or_iban text,
    p_method_id uuid DEFAULT NULL,
    p_bank_name text DEFAULT NULL,
    p_instructions_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_writer record;
    v_existing record;
    v_result_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_caller_id;

    IF v_writer.id IS NULL OR v_writer.status NOT IN ('approved', 'pending_approval') THEN
        RAISE EXCEPTION 'Unauthorized: Only approved or pending writers can manage payment methods.';
    END IF;

    IF p_account_title IS NULL OR trim(p_account_title) = '' THEN
        RAISE EXCEPTION 'Account title is required.';
    END IF;

    IF p_account_number_or_iban IS NULL OR trim(p_account_number_or_iban) = '' THEN
        RAISE EXCEPTION 'Account number or IBAN is required.';
    END IF;

    IF p_method_id IS NOT NULL THEN
        SELECT * INTO v_existing
        FROM public.writer_payment_methods
        WHERE id = p_method_id AND writer_id = v_caller_id;

        IF v_existing.id IS NULL THEN
            RAISE EXCEPTION 'Payment method not found or unauthorized: %', p_method_id;
        END IF;

        UPDATE public.writer_payment_methods
        SET method_type = p_method_type,
            account_title = trim(p_account_title),
            account_number_or_iban = trim(p_account_number_or_iban),
            bank_name = trim(p_bank_name),
            instructions_note = trim(p_instructions_note),
            is_active = true
        WHERE id = p_method_id
        RETURNING id INTO v_result_id;
    ELSE
        INSERT INTO public.writer_payment_methods (
            writer_id,
            method_type,
            account_title,
            account_number_or_iban,
            bank_name,
            instructions_note,
            is_active,
            created_at
        ) VALUES (
            v_caller_id,
            p_method_type,
            trim(p_account_title),
            trim(p_account_number_or_iban),
            trim(p_bank_name),
            trim(p_instructions_note),
            true,
            pg_catalog.now()
        )
        RETURNING id INTO v_result_id;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'payment_method_id', v_result_id
    );
END;
$$;

-- RPC deactivate_writer_payment_method
CREATE OR REPLACE FUNCTION public.deactivate_writer_payment_method(
    p_method_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_writer record;
    v_existing record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_caller_id;

    IF v_writer.id IS NULL OR v_writer.status NOT IN ('approved', 'pending_approval') THEN
        RAISE EXCEPTION 'Unauthorized: Only approved or pending writers can manage payment methods.';
    END IF;

    SELECT * INTO v_existing
    FROM public.writer_payment_methods
    WHERE id = p_method_id AND writer_id = v_caller_id;

    IF v_existing.id IS NULL THEN
        RAISE EXCEPTION 'Payment method not found or unauthorized: %', p_method_id;
    END IF;

    UPDATE public.writer_payment_methods
    SET is_active = false
    WHERE id = p_method_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'payment_method_id', p_method_id,
        'is_active', false
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- SECTION 8: REVOKE EXECUTE FROM PUBLIC & ANON / GRANT TO AUTHENTICATED
-- ------------------------------------------------------------------------------

-- Revoke execute from PUBLIC and anon on all public functions
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Grant execute on all functions to authenticated users
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Maintain anon EXECUTE on has_novel_entitlement and is_admin:
-- 1. has_novel_entitlement(uuid): The RLS policy "Readers read paid chapters if purchased"
--    on public.chapters evaluates: (is_free = true OR public.has_novel_entitlement(novel_id)).
--    When anonymous (unauthenticated) users view free chapters, PostgreSQL parses and evaluates
--    the RLS expression. Granting EXECUTE to anon avoids permission denied errors while returning
--    false (auth.uid() is NULL).
-- 2. is_admin(): Referenced across multiple RLS policies on public tables.
GRANT EXECUTE ON FUNCTION public.has_novel_entitlement(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Alter default privileges for future functions in schema public
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
