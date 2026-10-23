-- ==============================================================================
-- Migration 0015: Checkout, Abuse Protection & Payment Submission Hardening
-- Step 4.1: Reader Checkout, Order Submission, Unread Notifications & RLS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: PLATFORM SETTINGS (max_orders_per_hour)
-- ------------------------------------------------------------------------------

-- 1.1 Add max_orders_per_hour to platform_settings (default: 5 orders per hour)
ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS max_orders_per_hour integer NOT NULL DEFAULT 5;

-- 1.2 Add check constraint ensuring max_orders_per_hour is between 1 and 100
DO $$
BEGIN
    IF NOT EXISTS (np
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_max_orders_per_hour'
    ) THEN
        ALTER TABLE public.platform_settings
        ADD CONSTRAINT chk_platform_settings_max_orders_per_hour
        CHECK (max_orders_per_hour >= 1 AND max_orders_per_hour <= 100);
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 2: RPC get_checkout_options(p_novel_id)
-- ------------------------------------------------------------------------------
-- Returns the novel summary needed for checkout and the writer's active payment
-- methods with masked account numbers only (e.g. '•••• 1234').
-- Full account numbers and IBANs are strictly NOT accessible to readers before
-- creating an order (they are stored only in orders.payment_instructions_snapshot).
-- Fails for unpublished/suspended novels, author's own novel, and already owned novels.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_checkout_options(p_novel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_novel record;
    v_writer record;
    v_pen_name text;
    v_methods jsonb;
    v_open_order_number text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to initiate checkout.';
    END IF;

    -- Fetch novel
    SELECT * INTO v_novel
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found.';
    END IF;

    IF v_novel.status != 'published' THEN
        RAISE EXCEPTION 'Novel is not available for purchase (status: %).', v_novel.status;
    END IF;

    -- Writer cannot purchase their own novel
    IF v_novel.writer_id = v_caller_id THEN
        RAISE EXCEPTION 'Authors cannot purchase their own novels.';
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

    -- Fetch writer profile
    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_novel.writer_id;

    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RAISE EXCEPTION 'This author is currently not eligible to receive orders.';
    END IF;

    IF v_writer.is_orders_paused_for_commission THEN
        RAISE EXCEPTION 'Orders for this author are currently paused due to platform commission limits.';
    END IF;

    v_pen_name := coalesce(v_writer.pen_name_urdu, v_writer.pen_name_english, 'Author');

    -- Check if reader has an existing open order for this novel
    SELECT order_number INTO v_open_order_number
    FROM public.orders
    WHERE reader_id = v_caller_id
      AND novel_id = p_novel_id
      AND status IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Collect active payment methods with strictly masked accounts
    -- Only id, method_type, bank_name, account_title, and masked_account are returned
    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', wpm.id,
                'method_type', wpm.method_type,
                'bank_name', wpm.bank_name,
                'account_title', wpm.account_title,
                'masked_account', CASE
                    WHEN length(wpm.account_number_or_iban) <= 4 THEN '•••• ' || wpm.account_number_or_iban
                    ELSE '•••• ' || substr(wpm.account_number_or_iban, length(wpm.account_number_or_iban) - 3)
                END,
                'instructions_note', wpm.instructions_note
            )
            ORDER BY wpm.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_methods
    FROM public.writer_payment_methods wpm
    WHERE wpm.writer_id = v_novel.writer_id
      AND wpm.is_active = true;

    IF v_methods = '[]'::jsonb THEN
        RAISE EXCEPTION 'This author does not have any active payment methods configured. Orders cannot be placed at this time.';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'novel', pg_catalog.jsonb_build_object(
            'id', v_novel.id,
            'title_english', v_novel.title_english,
            'title_urdu', v_novel.title_urdu,
            'slug', v_novel.slug,
            'price_pkr', v_novel.price_pkr,
            'cover_image_url', v_novel.cover_image_url,
            'writer_id', v_novel.writer_id,
            'writer_pen_name', v_pen_name
        ),
        'payment_methods', v_methods,
        'existing_order_number', v_open_order_number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_checkout_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_options(uuid) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 3: RATE LIMIT ABUSE PROTECTION IN create_order
-- ------------------------------------------------------------------------------
-- Enhances create_order with hourly rate limiting per reader to prevent mass
-- order scraping of writer account details.
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
        coalesce(default_commission_rate, 20.00)
    INTO
        v_min_price,
        v_max_price,
        v_max_orders_per_hour,
        v_default_rate
    FROM public.platform_settings
    WHERE id = 1;

    v_min_price := coalesce(v_min_price, 50);
    v_max_price := coalesce(v_max_price, 5000.00);
    v_max_orders_per_hour := coalesce(v_max_orders_per_hour, 5);
    v_default_rate := coalesce(v_default_rate, 20.00);

    -- Abuse protection: Check order creation rate for this reader in the past hour
    SELECT count(*) INTO v_recent_order_count
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

    IF v_novel.status != 'published' THEN
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

    -- Check if reader already has an open, rejected, or disputed order for this novel
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE reader_id = v_caller_id
          AND novel_id = p_novel_id
          AND status IN ('pending_payment', 'payment_submitted', 'rejected', 'disputed')
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

    -- Snapshot payment instructions
    v_instructions := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Authoritative rate calculation
    v_applied_rate := coalesce(v_writer.custom_commission_rate, v_default_rate);

    -- Round commission and writer share
    v_commission_pkr := round((v_novel.price_pkr * v_applied_rate / 100.0), 2);
    v_writer_share_pkr := v_novel.price_pkr - v_commission_pkr;

    -- Generate unique human-readable order number
    v_order_number := 'ORD-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || pg_catalog.upper(substr(pg_catalog.gen_random_uuid()::text, 1, 8));

    -- Insert order
    INSERT INTO public.orders (
        order_number,
        reader_id,
        writer_id,
        novel_id,
        novel_title_snapshot,
        amount_pkr,
        currency,
        payment_method,
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
        v_method.method_type,
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
-- SECTION 4: submit_payment HARDENING & IDEMPOTENT RETRIES
-- ------------------------------------------------------------------------------
-- Hardens payment submission:
-- 1. Screenshot storage path must strictly start with '<order_id>/' (no path traversal).
-- 2. TID must be 6 to 40 characters of letters, digits, dashes, and underscores.
-- 3. Claimed amount must be positive and <= 10x order amount.
-- 4. Sender name max 100 chars, reader note max 500 chars.
-- 5. Exactly one pending submission at a time per order.
-- 6. Idempotent retry: resubmitting with same TID within 60s returns existing submission.
-- 7. Retains duplicate-TID flag trigger (flags across other orders, never blocks).
-- ------------------------------------------------------------------------------

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
    v_clean_tid text;
    v_clean_path text;
    v_norm_tid text;
    v_claimed_amount numeric(10,2);
    v_clean_sender text;
    v_clean_note text;
    v_existing_recent_id uuid;
    v_submission_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit payment.';
    END IF;

    -- 1. TID validation: 6 to 40 characters of letters, digits, dash, underscore
    IF p_tid IS NULL OR trim(p_tid) = '' THEN
        RAISE EXCEPTION 'Transaction reference (TID) is required.';
    END IF;

    v_clean_tid := trim(p_tid);
    IF v_clean_tid !~ '^[a-zA-Z0-9_-]{6,40}$' THEN
        RAISE EXCEPTION 'Transaction reference (TID) must be 6 to 40 characters containing only letters, numbers, hyphens, and underscores.';
    END IF;

    -- 2. Screenshot storage path validation: must start with '<order_id>/', no path traversal
    IF p_screenshot_path IS NULL OR trim(p_screenshot_path) = '' THEN
        RAISE EXCEPTION 'Screenshot proof storage path is required.';
    END IF;

    v_clean_path := trim(p_screenshot_path);

    -- Strict path traversal check
    IF v_clean_path LIKE '%..%' OR v_clean_path LIKE '%/%/%' THEN
        RAISE EXCEPTION 'Invalid screenshot path format. Path traversal is strictly prohibited.';
    END IF;

    -- Must match '<p_order_id>/<filename.ext>'
    IF v_clean_path !~ ('^' || p_order_id::text || '/[a-zA-Z0-9._-]+$') THEN
        RAISE EXCEPTION 'Screenshot path must be scoped to the order folder (%/<filename>).', p_order_id;
    END IF;

    -- 3. Lock and inspect order
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

    -- 4. Claimed amount validation: positive, <= 10x order amount
    v_claimed_amount := coalesce(p_claimed_amount, v_order.amount_pkr);
    IF v_claimed_amount <= 0 OR v_claimed_amount > (v_order.amount_pkr * 10) THEN
        RAISE EXCEPTION 'Claimed payment amount must be positive and cannot exceed 10x the order amount.';
    END IF;

    -- 5. Field length boundaries
    IF p_sender_name IS NOT NULL THEN
        v_clean_sender := trim(p_sender_name);
        IF length(v_clean_sender) > 100 THEN
            RAISE EXCEPTION 'Sender account name cannot exceed 100 characters.';
        END IF;
    ELSE
        v_clean_sender := NULL;
    END IF;

    IF p_note IS NOT NULL THEN
        v_clean_note := trim(p_note);
        IF length(v_clean_note) > 500 THEN
            RAISE EXCEPTION 'Reader note cannot exceed 500 characters.';
        END IF;
    ELSE
        v_clean_note := NULL;
    END IF;

    -- 6. Normalized TID for idempotency and duplicate checking
    v_norm_tid := pg_catalog.upper(pg_catalog.regexp_replace(v_clean_tid, '[^a-zA-Z0-9]', '', 'g'));

    -- Idempotent retry check: same order, same normalized TID within last 60 seconds
    SELECT id INTO v_existing_recent_id
    FROM public.payment_submissions
    WHERE order_id = p_order_id
      AND normalized_tid = v_norm_tid
      AND created_at >= (pg_catalog.now() - interval '60 seconds')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_recent_id IS NOT NULL THEN
        -- Return existing submission gracefully without creating duplicate row
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'submission_id', v_existing_recent_id,
            'is_retry', true
        );
    END IF;

    -- 7. Ensure at most one pending submission per order
    IF EXISTS (
        SELECT 1 FROM public.payment_submissions
        WHERE order_id = p_order_id
          AND reviewer_status = 'pending'
    ) THEN
        RAISE EXCEPTION 'A payment submission is already pending verification for this order. Please wait for the author to review your submission.';
    END IF;

    -- 8. Insert payment submission
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
        v_clean_tid,
        v_clean_path,
        v_clean_path,
        v_claimed_amount,
        v_clean_sender,
        v_clean_note,
        'pending',
        pg_catalog.now()
    )
    RETURNING id INTO v_submission_id;

    -- 9. Update order status to payment_submitted
    UPDATE public.orders
    SET status = 'payment_submitted',
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 10. Notify author
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
        'order_payment_submitted',
        'New Payment Proof Received',
        'Reader submitted TID ' || v_clean_tid || ' for order ' || v_order.order_number,
        'Please verify receipt of PKR ' || v_claimed_amount || ' in your account and confirm access for order ' || v_order.order_number || '.',
        '/writer/orders',
        pg_catalog.jsonb_build_object(
            'order_id', p_order_id,
            'order_number', v_order.order_number,
            'submission_id', v_submission_id
        ),
        false,
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'submission_id', v_submission_id,
        'is_retry', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_payment(uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_payment(uuid, text, text, numeric, text, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 5: NOTIFICATIONS RPCS (unread count & mark read)
-- ------------------------------------------------------------------------------

-- 5.1 get_my_unread_notification_count()
CREATE OR REPLACE FUNCTION public.get_my_unread_notification_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_count integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.notifications
    WHERE user_id = v_caller_id
      AND is_read = false;

    RETURN coalesce(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_unread_notification_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_unread_notification_count() TO authenticated;


-- 5.2 mark_notifications_as_read(p_notification_ids uuid[] DEFAULT NULL)
-- Marks specified notifications (or all if NULL) as read for the calling user
CREATE OR REPLACE FUNCTION public.mark_notifications_as_read(
    p_notification_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_updated_count integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_notification_ids IS NULL OR array_length(p_notification_ids, 1) IS NULL THEN
        UPDATE public.notifications
        SET is_read = true,
            read_at = pg_catalog.now()
        WHERE user_id = v_caller_id
          AND is_read = false;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    ELSE
        UPDATE public.notifications
        SET is_read = true,
            read_at = pg_catalog.now()
        WHERE user_id = v_caller_id
          AND id = ANY(p_notification_ids)
          AND is_read = false;
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    END IF;

    RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notifications_as_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_as_read(uuid[]) TO authenticated;
