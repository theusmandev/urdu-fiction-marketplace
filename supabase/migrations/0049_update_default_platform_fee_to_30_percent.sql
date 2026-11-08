-- ==============================================================================
-- UNB Premium — Migration 0049: Update Default Platform Fee from 20% to 30%
-- Description:
--   1. Updates default_commission_rate column default on public.platform_settings to 30.00.
--   2. Updates row id = 1 in public.platform_settings to 30.00 (if currently 20.00).
--   3. Updates the defensive fallback rate from 20.00 to 30.00 in the active definitions of:
--      - public.create_order(uuid, uuid)
--      - public.verify_order_payment(uuid, uuid, text)
--      - public.admin_force_verify(uuid, text)
--   4. Historical orders and ledger rows maintain their locked snapshot rates.
-- ==============================================================================

-- 1. Alter column default on public.platform_settings
ALTER TABLE public.platform_settings
    ALTER COLUMN default_commission_rate SET DEFAULT 30.00;

-- 2. Update singleton settings row if it was on the previous 20.00 default
UPDATE public.platform_settings
SET default_commission_rate = 30.00,
    updated_at = pg_catalog.now()
WHERE id = 1 AND default_commission_rate = 20.00;


-- ------------------------------------------------------------------------------
-- 3. public.create_order
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
    v_min_price integer;
    v_max_price numeric(10,2);
    v_max_orders_per_hour integer;
    v_recent_order_count integer;
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

    -- Fetch platform settings
    SELECT
        coalesce(min_novel_price_pkr, 50),
        coalesce(max_novel_price_pkr, 5000.00),
        coalesce(max_orders_per_hour, 5),
        coalesce(default_commission_rate, 30.00)
    INTO
        v_min_price,
        v_max_price,
        v_max_orders_per_hour,
        v_default_rate
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price           := coalesce(v_min_price, 50);
    v_max_price           := coalesce(v_max_price, 5000.00);
    v_max_orders_per_hour := coalesce(v_max_orders_per_hour, 5);
    v_default_rate        := coalesce(v_default_rate, 30.00);

    -- Abuse protection: Check order creation rate for this reader in the past hour
    SELECT pg_catalog.count(*) INTO v_recent_order_count
    FROM public.orders
    WHERE reader_id = v_caller_id
      AND created_at >= (pg_catalog.now() - interval '1 hour');

    IF v_recent_order_count >= v_max_orders_per_hour THEN
        RAISE EXCEPTION 'Order rate limit exceeded. You can create at most % orders per hour. Please complete or cancel your existing orders before placing new ones.', v_max_orders_per_hour;
    END IF;

    -- Fetch novel
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    IF v_novel.status::text != 'published' THEN
        RAISE EXCEPTION 'Novel is not available for purchase (status: %).', v_novel.status;
    END IF;

    -- Defensive price validation: whole rupees, > 0, within [min, max]
    IF v_novel.price_pkr <= 0 OR v_novel.price_pkr < v_min_price OR v_novel.price_pkr > v_max_price THEN
        RAISE EXCEPTION 'Novel price (PKR %) is invalid or outside allowable limits (PKR % to PKR %). Orders cannot be created.',
            v_novel.price_pkr, v_min_price, v_max_price;
    END IF;

    -- Self-purchase check: Writer cannot purchase their own novel
    IF v_novel.writer_id = v_caller_id THEN
        RAISE EXCEPTION 'Authors cannot purchase their own novels.';
    END IF;

    -- Fetch writer profile
    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_novel.writer_id;

    IF v_writer.id IS NULL OR v_writer.status::text != 'approved' THEN
        RAISE EXCEPTION 'Writer is currently not eligible to receive orders.';
    END IF;

    IF v_writer.is_orders_paused_for_commission THEN
        RAISE EXCEPTION 'Orders for this author are currently paused due to accrued platform fee limit.';
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

    -- Check if reader already has an open, rejected, or disputed order for this novel
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND status::text IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed')
    ) THEN
        RAISE EXCEPTION 'An active, rejected, or disputed order for this novel already exists in your account. Please resolve your existing order before placing a new one.';
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

    -- Snapshot recipient instructions
    v_instructions := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Authoritative rate calculation: writer custom rate override, or platform default
    v_applied_rate := coalesce(v_writer.custom_commission_rate, v_default_rate);

    -- Round platform fee and writer share
    v_commission_pkr   := pg_catalog.round((v_novel.price_pkr * v_applied_rate / 100.0), 2);
    v_writer_share_pkr := v_novel.price_pkr - v_commission_pkr;

    -- Generate unique human-readable order number
    v_order_number := 'ORD-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));

    -- Insert order
    INSERT INTO public.orders (
        order_number,
        reader_id,
        writer_id,
        novel_id,
        novel_title_snapshot,
        amount_pkr,
        currency,
        selected_payment_method_id,
        payment_instructions_snapshot,
        applied_commission_rate,
        calculated_commission_pkr,
        calculated_writer_share_pkr,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_order_number,
        v_caller_id,
        v_novel.writer_id,
        p_novel_id,
        coalesce(v_novel.title_urdu, v_novel.title_english),
        v_novel.price_pkr,
        'PKR',
        v_method.id,
        v_instructions,
        v_applied_rate,
        v_commission_pkr,
        v_writer_share_pkr,
        'pending_payment',
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING id INTO v_order_id;

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
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', 'pending_payment',
        'amount_pkr', v_novel.price_pkr,
        'instructions', v_instructions
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, uuid) TO authenticated;


-- ------------------------------------------------------------------------------
-- 4. public.verify_order_payment
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

    -- 1. Fetch order with row-lock
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF v_order.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the receiving author or platform administrator can verify receipt.';
    END IF;

    -- 2. Idempotency check: If order is ALREADY verified, return existing details safely without duplicate records
    IF v_order.status::text = 'verified' THEN
        SELECT id INTO v_entitlement_id
        FROM public.purchase_entitlements
        WHERE order_id = v_order.id
        LIMIT 1;

        IF v_entitlement_id IS NULL THEN
            SELECT id INTO v_entitlement_id
            FROM public.purchase_entitlements
            WHERE reader_id = v_order.reader_id
              AND novel_id = v_order.novel_id
              AND is_revoked = false
            LIMIT 1;
        END IF;

        SELECT id INTO v_ledger_id
        FROM public.sales_ledger
        WHERE order_id = v_order.id
          AND entry_type = 'sale_verified'
        LIMIT 1;

        SELECT current_unpaid_commission, is_orders_paused_for_commission
        INTO v_new_unpaid, v_paused
        FROM public.writer_profiles
        WHERE id = v_order.writer_id;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused,
            'message', 'Order payment is already verified.'
        );
    END IF;

    IF v_order.status::text != 'payment_submitted' THEN
        RAISE EXCEPTION 'Order cannot be verified in current status: %. Only orders in status payment_submitted can be verified.', v_order.status;
    END IF;

    -- 3. Fetch payment submission with row-lock
    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE id = p_submission_id AND order_id = p_order_id
    FOR UPDATE;

    IF v_submission.id IS NULL THEN
        RAISE EXCEPTION 'Payment submission not found for order: %', p_order_id;
    END IF;

    IF v_submission.reviewer_status::text != 'pending' THEN
        RAISE EXCEPTION 'Payment submission cannot be verified: submission reviewer_status is %, expected pending.', v_submission.reviewer_status;
    END IF;

    -- 4. Determine platform fee rate (writer custom rate, settings default, or 30.00 fallback)
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 30.00);
    v_commission_pkr := pg_catalog.round((v_order.amount_pkr * (v_rate / 100.00)), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 5. Update Payment Submission
    UPDATE public.payment_submissions
    SET reviewer_status = 'verified',
        reviewer_note = nullif(pg_catalog.btrim(p_writer_note), ''),
        reviewed_by = v_caller_id,
        reviewed_at = pg_catalog.now()
    WHERE id = p_submission_id;

    -- 6. Update Order with canonical schema columns
    UPDATE public.orders
    SET status = 'verified',
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 7. Upsert Purchase Entitlement matching partial unique index predicate
    SELECT id INTO v_entitlement_id
    FROM public.purchase_entitlements
    WHERE order_id = v_order.id
    LIMIT 1;

    IF v_entitlement_id IS NOT NULL THEN
        UPDATE public.purchase_entitlements
        SET is_revoked = false,
            revoked_reason = NULL,
            granted_at = pg_catalog.now()
        WHERE id = v_entitlement_id;
    ELSE
        SELECT id INTO v_entitlement_id
        FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id
          AND novel_id = v_order.novel_id
          AND is_revoked = false
        LIMIT 1;

        IF v_entitlement_id IS NOT NULL THEN
            UPDATE public.purchase_entitlements
            SET granted_at = pg_catalog.now()
            WHERE id = v_entitlement_id;
        ELSE
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
            ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false DO UPDATE SET
                order_id = EXCLUDED.order_id,
                granted_at = pg_catalog.now(),
                revoked_reason = NULL
            RETURNING id INTO v_entitlement_id;
        END IF;
    END IF;

    IF v_entitlement_id IS NULL THEN
        SELECT id INTO v_entitlement_id
        FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id
          AND novel_id = v_order.novel_id
          AND is_revoked = false
        LIMIT 1;
    END IF;

    -- 8. Record Immutable Entry in Sales Ledger (using canonical column commission_rate)
    SELECT id INTO v_ledger_id
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified'
    LIMIT 1;

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
            coalesce(nullif(pg_catalog.btrim(p_writer_note), ''), 'Direct reader payment confirmed by writer.'),
            pg_catalog.now()
        )
        ON CONFLICT (order_id) WHERE entry_type = 'sale_verified' DO NOTHING
        RETURNING id INTO v_ledger_id;

        IF v_ledger_id IS NULL THEN
            SELECT id INTO v_ledger_id
            FROM public.sales_ledger
            WHERE order_id = v_order.id AND entry_type = 'sale_verified';
        END IF;
    END IF;

    -- 9. Reconcile platform fee balance
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 10. In-app notification for Reader
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
        pg_catalog.now()
    );

    -- 11. Transactional email outbox for Reader (critical event)
    PERFORM public.enqueue_email_for_notification(
        v_order.reader_id,
        'payment_verified',
        'Novel Unlocked: Order #' || v_order.order_number || ' Verified | UNB Premium',
        'Great news! Your payment for Order #' || v_order.order_number || E' has been confirmed by the author.\n\nYour novel is now unlocked and available in your personal library. Happy reading!',
        'payment_verified:' || v_order.id::text
    );

    -- 12. Audit Log
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

COMMENT ON FUNCTION public.verify_order_payment(uuid, uuid, text) IS
    'Verifies an order payment proof submission, calculates platform fee share, creates reader entitlement, creates sales ledger entry, reconciles platform fee balance, sends in-app notification, queues transactional email, and logs audit record.';

REVOKE ALL ON FUNCTION public.verify_order_payment(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_order_payment(uuid, uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- 5. public.admin_force_verify
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_force_verify(
    p_order_id uuid,
    p_admin_note text
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
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can force-verify orders.';
    END IF;

    IF p_admin_note IS NULL OR pg_catalog.btrim(p_admin_note) = '' THEN
        RAISE EXCEPTION 'An admin note is required to force-verify an order.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Idempotency check: If already verified, return existing details safely
    IF v_order.status::text = 'verified' THEN
        SELECT id INTO v_entitlement_id
        FROM public.purchase_entitlements
        WHERE order_id = v_order.id
        LIMIT 1;

        IF v_entitlement_id IS NULL THEN
            SELECT id INTO v_entitlement_id
            FROM public.purchase_entitlements
            WHERE reader_id = v_order.reader_id
              AND novel_id = v_order.novel_id
              AND is_revoked = false
            LIMIT 1;
        END IF;

        SELECT id INTO v_ledger_id
        FROM public.sales_ledger
        WHERE order_id = v_order.id
          AND entry_type = 'sale_verified'
        LIMIT 1;

        SELECT current_unpaid_commission, is_orders_paused_for_commission
        INTO v_new_unpaid, v_paused
        FROM public.writer_profiles
        WHERE id = v_order.writer_id;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'current_unpaid_commission', v_new_unpaid,
            'is_orders_paused_for_commission', v_paused,
            'message', 'Order is already verified.'
        );
    END IF;

    -- Only allow orders in payment_submitted, rejected, or disputed
    IF v_order.status::text NOT IN ('payment_submitted', 'rejected', 'disputed') THEN
        RAISE EXCEPTION 'Order is not in a force-verifiable state (current status: %).', v_order.status;
    END IF;

    -- Invariant: Reader must not already hold an active entitlement for this novel
    IF EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE reader_id = v_order.reader_id
          AND novel_id = v_order.novel_id
          AND is_revoked = false
          AND order_id != v_order.id
    ) THEN
        RAISE EXCEPTION 'Reader already holds an active entitlement for this novel.';
    END IF;

    -- Invariant: A sale_verified ledger entry must not already exist for this order
    IF EXISTS (
        SELECT 1 FROM public.sales_ledger
        WHERE order_id = v_order.id
          AND entry_type = 'sale_verified'
    ) THEN
        RAISE EXCEPTION 'A sale_verified ledger entry already exists for this order.';
    END IF;

    -- Fetch latest payment submission
    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Determine authoritative commission rate at verification time (custom rate, settings default, or 30.00 fallback)
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 30.00);
    v_commission_pkr := pg_catalog.round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update submission if present
    IF v_submission.id IS NOT NULL THEN
        UPDATE public.payment_submissions
        SET reviewer_status = 'verified',
            reviewer_note = 'Admin force-verified: ' || pg_catalog.btrim(p_admin_note),
            reviewed_by = v_caller_id,
            reviewed_at = pg_catalog.now()
        WHERE id = v_submission.id;
    END IF;

    -- 2. Update any related dispute
    UPDATE public.disputes
    SET status = 'resolved_for_reader',
        resolution_note = pg_catalog.btrim(p_admin_note),
        admin_resolution_notes = pg_catalog.btrim(p_admin_note),
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE order_id = p_order_id AND status::text IN ('open', 'under_review');

    -- 3. Update Order
    UPDATE public.orders
    SET status = 'verified',
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 4. Grant Purchase Entitlement with partial unique index conflict matching
    SELECT id INTO v_entitlement_id
    FROM public.purchase_entitlements
    WHERE order_id = v_order.id
    LIMIT 1;

    IF v_entitlement_id IS NOT NULL THEN
        UPDATE public.purchase_entitlements
        SET is_revoked = false,
            revoked_reason = NULL,
            granted_at = pg_catalog.now()
        WHERE id = v_entitlement_id;
    ELSE
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
        ON CONFLICT (reader_id, novel_id) WHERE is_revoked = false DO UPDATE SET
            order_id = EXCLUDED.order_id,
            granted_at = pg_catalog.now(),
            revoked_reason = NULL
        RETURNING id INTO v_entitlement_id;
    END IF;

    -- 5. Record Immutable Entry in Sales Ledger (Partial index matching)
    SELECT id INTO v_ledger_id
    FROM public.sales_ledger
    WHERE order_id = v_order.id AND entry_type = 'sale_verified'
    LIMIT 1;

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
            'Admin force-verified: ' || pg_catalog.btrim(p_admin_note),
            pg_catalog.now()
        )
        ON CONFLICT (order_id) WHERE entry_type = 'sale_verified' DO NOTHING
        RETURNING id INTO v_ledger_id;

        IF v_ledger_id IS NULL THEN
            SELECT id INTO v_ledger_id
            FROM public.sales_ledger
            WHERE order_id = v_order.id AND entry_type = 'sale_verified';
        END IF;
    END IF;

    -- 6. Reconcile commission balance
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 7. Notifications
    INSERT INTO public.notifications (
        user_id,
        title,
        message,
        link,
        is_read,
        created_at
    ) VALUES (
        v_order.reader_id,
        'ادائیگی کی تصدیق ہو گئی! (Admin Force-Verified)',
        'انتظامیہ نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ ناول آپ کی لائبریری میں دستیاب ہے۔',
        '/library',
        false,
        pg_catalog.now()
    );

    -- 8. Audit Log
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
        'ADMIN_FORCE_VERIFY',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object(
            'status', 'verified',
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'note', p_admin_note,
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

COMMENT ON FUNCTION public.admin_force_verify(uuid, text) IS
'Administrative force-verification with partial unique index conflict matching, canonical column alignment, and idempotent safe retries.';

REVOKE ALL ON FUNCTION public.admin_force_verify(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_force_verify(uuid, text) TO authenticated;

