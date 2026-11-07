-- ==============================================================================
-- UNB Premium — Migration 0048: Fix Order Verification Commission Column Regression
-- Description: Recreates public.verify_order_payment() with canonical column
--              names on public.orders (applied_commission_rate, calculated_commission_pkr,
--              calculated_writer_share_pkr) and public.sales_ledger (commission_rate).
--              Aligns partial unique index predicate on public.purchase_entitlements,
--              preserves transactional email outbox enqueue, in-app notifications,
--              reconciles platform fee balance, and records audit logs.
-- ==============================================================================

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

    -- 4. Determine platform fee rate
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);
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

