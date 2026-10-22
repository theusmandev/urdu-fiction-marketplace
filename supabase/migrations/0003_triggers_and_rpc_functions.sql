-- ==============================================================================
-- UNB Premium — Migration 0003: Triggers and Atomic RPC Functions
-- Description: Creates secure triggers for user profile syncing, fraud TID detection,
--              order numbers, and atomic transactional RPC functions for verification,
--              rejection, and platform commission settlement.
-- ==============================================================================

-- 1. AUTH TRIGGER: Automatic Profile Provisioning on User Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role public.user_role;
    v_full_name text;
    v_username text;
BEGIN
    -- Determine role from metadata or default to reader
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'reader'::public.user_role);
    v_full_name := NEW.raw_user_meta_data->>'full_name';
    v_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        split_part(NEW.email, '@', 1) || '_' || substring(replace(NEW.id::text, '-', ''), 1, 4)
    );

    -- Insert into public.profiles
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
        v_role,
        true,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = now();

    -- If registered as writer, also provision default writer profile
    IF v_role = 'writer' THEN
        INSERT INTO public.writer_profiles (
            id,
            pen_name_urdu,
            pen_name_english,
            bio_urdu,
            bio_english,
            status,
            unpaid_commission_limit,
            current_unpaid_commission,
            is_orders_paused_for_commission,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'pen_name_urdu', v_full_name, 'مصنف'),
            COALESCE(NEW.raw_user_meta_data->>'pen_name_english', v_full_name, 'Writer'),
            NEW.raw_user_meta_data->>'bio_urdu',
            NEW.raw_user_meta_data->>'bio_english',
            'pending_approval'::public.writer_status,
            5000.00,
            0.00,
            false,
            now(),
            now()
        )
        ON CONFLICT (id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. ORDER NUMBER GENERATION TRIGGER
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := 'UNB-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_number ON public.orders;
CREATE TRIGGER trg_set_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_order_number();


-- 3. FRAUD DETECTION TRIGGER: Duplicate TID Cross-Check
CREATE OR REPLACE FUNCTION public.check_duplicate_tid_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_norm_tid text;
    v_existing_id uuid;
BEGIN
    v_norm_tid := upper(regexp_replace(NEW.transaction_reference_tid, '[^a-zA-Z0-9]', '', 'g'));

    -- Check if normalized TID was ever previously submitted
    SELECT id INTO v_existing_id
    FROM public.payment_submissions
    WHERE normalized_tid = v_norm_tid
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        NEW.is_duplicate_tid_flagged := true;
        NEW.duplicate_of_submission_id := v_existing_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_duplicate_tid ON public.payment_submissions;
CREATE TRIGGER trg_check_duplicate_tid
    BEFORE INSERT ON public.payment_submissions
    FOR EACH ROW EXECUTE FUNCTION public.check_duplicate_tid_before_insert();


-- 4. ATOMIC RPC: Writer Verifies Payment & Grants Entitlement
CREATE OR REPLACE FUNCTION public.verify_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_writer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role public.user_role;
    v_order record;
    v_submission record;
    v_new_commission numeric(12,2);
    v_paused boolean := false;
    v_entitlement_id uuid;
    v_ledger_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to verify payment.';
    END IF;

    -- Get caller role
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

    -- Fetch order with row-lock to prevent race conditions
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Authorization: Caller must be the owning writer or an admin
    IF v_order.writer_id != v_caller_id AND v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only the novel writer or administrator can verify receipt.';
    END IF;

    -- Check order status
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

    -- 1. Update Payment Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'verified',
        reviewer_note = p_writer_note,
        reviewed_by = v_caller_id,
        reviewed_at = now()
    WHERE id = p_submission_id;

    -- 2. Update Order
    UPDATE public.orders
    SET status = 'verified',
        verified_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    -- 3. Grant Purchase Entitlement (Idempotent upsert)
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
        now(),
        false,
        NULL
    )
    ON CONFLICT (reader_id, novel_id) DO UPDATE SET
        order_id = EXCLUDED.order_id,
        is_revoked = false,
        revoked_reason = NULL,
        granted_at = now()
    RETURNING id INTO v_entitlement_id;

    -- 4. Record Immutable Entry in Sales Ledger
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
        v_order.applied_commission_rate,
        v_order.calculated_commission_pkr,
        v_order.calculated_writer_share_pkr,
        COALESCE(p_writer_note, 'Direct reader payment confirmed by writer.'),
        now()
    )
    RETURNING id INTO v_ledger_id;

    -- 5. Accrue Commission on Writer Profile & Check Threshold
    UPDATE public.writer_profiles
    SET current_unpaid_commission = current_unpaid_commission + v_order.calculated_commission_pkr,
        is_orders_paused_for_commission = CASE 
            WHEN (current_unpaid_commission + v_order.calculated_commission_pkr) >= unpaid_commission_limit 
            THEN true 
            ELSE is_orders_paused_for_commission 
        END,
        updated_at = now()
    WHERE id = v_order.writer_id
    RETURNING current_unpaid_commission, is_orders_paused_for_commission 
    INTO v_new_commission, v_paused;

    -- 6. Send Notification to Reader
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'ادائیگی کی تصدیق ہو گئی! (Payment Verified)',
        'مصنف نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ ناول آپ کی لائبریری میں دستیاب ہے۔',
        '/library',
        false,
        now()
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
        v_caller_role::text,
        'VERIFY_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        jsonb_build_object('status', v_order.status),
        jsonb_build_object(
            'status', 'verified',
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_commission,
            'is_orders_paused_for_commission', v_paused
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'entitlement_id', v_entitlement_id,
        'ledger_id', v_ledger_id,
        'current_unpaid_commission', v_new_commission,
        'is_orders_paused_for_commission', v_paused
    );
END;
$$;


-- 5. ATOMIC RPC: Writer Rejects Payment Submission
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id uuid,
    p_submission_id uuid,
    p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role public.user_role;
    v_order record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
        RAISE EXCEPTION 'A clear rejection reason is required.';
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.writer_id != v_caller_id AND v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    -- Update Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'rejected',
        reviewer_note = p_rejection_reason,
        reviewed_by = v_caller_id,
        reviewed_at = now()
    WHERE id = p_submission_id;

    -- Update Order
    UPDATE public.orders
    SET status = 'rejected',
        rejected_reason = p_rejection_reason,
        updated_at = now()
    WHERE id = p_order_id;

    -- Notify Reader
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'ادائیگی تصدیق مسترد ہو گئی (Payment Verification Rejected)',
        'مصنف نے آپ کی بھیجی گئی رسید کو مسترد کیا ہے۔ وجہ: ' || p_rejection_reason,
        '/library/orders',
        false,
        now()
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
        v_caller_role::text,
        'REJECT_ORDER_PAYMENT',
        'orders',
        p_order_id::text,
        jsonb_build_object('status', v_order.status),
        jsonb_build_object('status', 'rejected', 'reason', p_rejection_reason),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected'
    );
END;
$$;


-- 6. ATOMIC RPC: Admin Confirms Commission Settlement
CREATE OR REPLACE FUNCTION public.confirm_commission_settlement(
    p_invoice_id uuid,
    p_amount_pkr numeric,
    p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role public.user_role;
    v_invoice record;
    v_new_unpaid numeric(12,2);
    v_unpaused boolean;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can confirm commission settlement.';
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
        settled_at = now()
    WHERE id = p_invoice_id;

    -- 2. Record Commission Payment
    INSERT INTO public.commission_payments (
        invoice_id,
        writer_id,
        amount_pkr,
        transaction_reference,
        confirmed_by_admin_id,
        confirmed_at,
        notes,
        created_at
    ) VALUES (
        p_invoice_id,
        v_invoice.writer_id,
        p_amount_pkr,
        COALESCE(v_invoice.writer_reported_tid, 'ADMIN-SETTLED'),
        v_caller_id,
        now(),
        p_admin_note,
        now()
    );

    -- 3. Reduce Writer's Accrued Unpaid Commission & Unpause Orders if Under Limit
    UPDATE public.writer_profiles
    SET current_unpaid_commission = GREATEST(0, current_unpaid_commission - p_amount_pkr),
        is_orders_paused_for_commission = CASE 
            WHEN GREATEST(0, current_unpaid_commission - p_amount_pkr) < unpaid_commission_limit 
            THEN false 
            ELSE is_orders_paused_for_commission 
        END,
        updated_at = now()
    WHERE id = v_invoice.writer_id
    RETURNING current_unpaid_commission, is_orders_paused_for_commission
    INTO v_new_unpaid, v_unpaused;

    -- 4. Notify Writer
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_invoice.writer_id,
        'کمیشن کلیئرنس کی تصدیق (Commission Cleared)',
        'پلیٹ فارم کی جانب سے آپ کے واجب الادا کمیشن کی ادائیگی قبول کر لی گئی ہے۔',
        '/writer/commission',
        false,
        now()
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
        jsonb_build_object('status', v_invoice.status, 'amount_settled_pkr', v_invoice.amount_settled_pkr),
        jsonb_build_object(
            'amount_paid', p_amount_pkr,
            'writer_unpaid_balance', v_new_unpaid,
            'is_orders_paused_for_commission', v_unpaused
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'amount_settled', p_amount_pkr,
        'writer_unpaid_balance', v_new_unpaid,
        'is_orders_paused_for_commission', v_unpaused
    );
END;
$$;
