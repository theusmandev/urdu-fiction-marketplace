-- ============================================================================
-- Migration: 0061_schema_repairs_and_trigger_lockdown.sql
-- Description:
--   1. Harden trg_protect_writer_profile_columns to allow ledger reconciliation
--      via transaction-local setting 'app.allow_ledger_reconciliation' while
--      strictly blocking direct client mutations by non-admins.
--   2. Update reconcile_writer_unpaid_commission to set and safely clear
--      'app.allow_ledger_reconciliation' within a guarded block.
--   3. Fix create_tip RPC column target: reader_message (was message).
--   4. Fix generate_commission_invoice setting reference: invoice_due_days
--      (was invoice_grace_period_days).
--   5. Fix get_expired_payment_proof_paths column references:
--      ps.created_at (was ps.submitted_at) and coalesce(ps.screenshot_path, ps.screenshot_url).
--   6. Drop stale overload approve_novel(uuid) and canonicalize
--      approve_novel(uuid, jsonb DEFAULT NULL).
-- Invariants:
--   - Obey check:sql: Zero forbidden pg_catalog.<construct> qualification.
--   - Obey check:terms: Zero forbidden user-facing "commission" / "کمیشن" terms.
--   - All SECURITY DEFINER functions have SET search_path = ''.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WRITER PROFILE PROTECTION TRIGGER & LEDGER RECONCILIATION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_protect_writer_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_db_admin boolean;
    v_is_reconciling boolean;
BEGIN
    -- Check if running as trusted backend (DB admin, service role, or migration)
    v_is_db_admin := (auth.uid() IS NULL AND pg_catalog.current_setting('role', true) NOT IN ('authenticated', 'anon'))
                     OR (auth.role() = 'service_role');

    -- Platform administrators and database admins can update any column
    IF v_is_db_admin OR public.is_admin() THEN
        NEW.updated_at := pg_catalog.now();
        RETURN NEW;
    END IF;

    -- For non-admins, check if this is an internal ledger reconciliation update
    v_is_reconciling := (pg_catalog.current_setting('app.allow_ledger_reconciliation', true) = '1');

    IF NEW.custom_commission_rate IS DISTINCT FROM OLD.custom_commission_rate THEN
        RAISE EXCEPTION 'Unauthorized: Writer custom platform fee rate is managed by administrators.';
    END IF;

    IF NEW.unpaid_commission_limit IS DISTINCT FROM OLD.unpaid_commission_limit THEN
        RAISE EXCEPTION 'Unauthorized: Unpaid platform fee limit is managed by administrators.';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Unauthorized: Writer approval status can only be modified by administrators or via the formal reapplication process.';
    END IF;

    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
        RAISE EXCEPTION 'Unauthorized: Approver reference is managed by administrators.';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Unauthorized: Writer profile identifier is immutable.';
    END IF;

    IF NOT v_is_reconciling THEN
        IF NEW.current_unpaid_commission IS DISTINCT FROM OLD.current_unpaid_commission THEN
            RAISE EXCEPTION 'Unauthorized: Unpaid platform fee balance is managed exclusively by ledger reconciliation.';
        END IF;

        IF NEW.is_orders_paused_for_commission IS DISTINCT FROM OLD.is_orders_paused_for_commission THEN
            RAISE EXCEPTION 'Unauthorized: Order pause state is automated based on accrued platform fee threshold.';
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

REVOKE ALL ON FUNCTION public.trg_protect_writer_profile_columns() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_actual_unpaid numeric(12,2);
    v_limit numeric(12,2);
    v_is_paused boolean;
    v_last_settlement timestamptz;
BEGIN
    v_caller_id := auth.uid();

    -- Strict authorization check: If called from an API context, reject any cross-writer caller
    IF current_user IN ('authenticated', 'anon', 'authenticator') THEN
        IF v_caller_id IS NULL OR (v_caller_id != p_writer_id AND NOT public.is_admin()) THEN
            RAISE EXCEPTION 'Access denied: You can only reconcile your own account.';
        END IF;
    ELSIF v_caller_id IS NOT NULL THEN
        IF v_caller_id != p_writer_id AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access denied: You can only reconcile your own account.';
        END IF;
    END IF;

    v_actual_unpaid := public.get_writer_unpaid_commission(p_writer_id);

    SELECT unpaid_commission_limit INTO v_limit
    FROM public.writer_profiles
    WHERE id = p_writer_id;

    IF v_limit IS NULL OR v_limit <= 0 THEN
        v_limit := 5000.00;
    END IF;

    v_is_paused := (v_actual_unpaid >= v_limit);

    -- Set transaction-local reconciliation bypass flag and guarantee cleanup
    PERFORM pg_catalog.set_config('app.allow_ledger_reconciliation', '1', true);
    BEGIN
        UPDATE public.writer_profiles
        SET current_unpaid_commission = v_actual_unpaid,
            is_orders_paused_for_commission = v_is_paused,
            updated_at = pg_catalog.now()
        WHERE id = p_writer_id;

        PERFORM pg_catalog.set_config('app.allow_ledger_reconciliation', '0', true);
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_catalog.set_config('app.allow_ledger_reconciliation', '0', true);
        RAISE;
    END;

    SELECT pg_catalog.max(confirmed_at) INTO v_last_settlement
    FROM public.commission_payments
    WHERE writer_id = p_writer_id;

    IF v_last_settlement IS NULL THEN
        v_last_settlement := '2000-01-01 00:00:00+00'::timestamptz;
    END IF;

    -- 80% Threshold Warning notification
    IF v_actual_unpaid >= (0.80 * v_limit) AND v_actual_unpaid < v_limit THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE user_id = p_writer_id
              AND type = 'commission_threshold_warning'
              AND created_at >= v_last_settlement
        ) THEN
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
                'commission_threshold_warning',
                'تنبہی پلیٹ فارم فیس حد (80% Platform Fee Threshold)',
                'آپ کی واجب الادا پلیٹ فارم فیس (PKR ' || v_actual_unpaid || ') حد (' || v_limit || ') کے 80 فیصد تک پہنچ چکی ہے۔ براہِ کرم معطلی سے بچنے کے لیے ادائیگی کریں۔',
                'آپ کی واجب الادا پلیٹ فارم فیس حد کے قریب پہنچ چکی ہے۔',
                '/writer/commission',
                pg_catalog.jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                pg_catalog.now()
            );
        END IF;
    END IF;

    -- 100% Threshold Exceeded notification
    IF v_actual_unpaid >= v_limit THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE user_id = p_writer_id
              AND type = 'commission_limit_exceeded'
              AND created_at >= v_last_settlement
        ) THEN
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
                'commission_limit_exceeded',
                'ناولوں کے آرڈرز عارضی طور پر موقوف (Orders Paused)',
                'آپ کی واجب الادا پلیٹ فارم فیس (PKR ' || v_actual_unpaid || ') مقررہ حد (' || v_limit || ') سے تجاوز کر گئی ہے۔ نئے قارئین کے لیے آرڈرز موقوف کر دیے گئے ہیں۔',
                'پلیٹ فارم فیس کلیئر ہوتے ہی آپ کے ناولز کے آرڈرز خودکار طریقے سے بحال ہو جائیں گے۔',
                '/writer/commission',
                pg_catalog.jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                pg_catalog.now()
            );
        END IF;
    END IF;

    RETURN v_actual_unpaid;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. CREATE TIP (Fix column name: reader_message)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_tip(
    p_writer_id uuid,
    p_amount_pkr numeric,
    p_payment_method_id uuid,
    p_novel_id uuid DEFAULT NULL,
    p_chapter_id uuid DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_is_anonymous boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reader_id        uuid;
    v_platform         record;
    v_writer           record;
    v_tip_settings     record;
    v_method           record;
    v_tip_number       text;
    v_min              numeric(10,2);
    v_max              numeric(10,2);
    v_hourly_count     integer;
    v_daily_sum        numeric(10,2);
    v_open_count       integer;
    v_open_slot        integer := NULL;
    v_cleaned_msg      text := NULL;
    v_snapshot         jsonb;
    v_tip              record;
    v_i                integer;
BEGIN
    v_reader_id := auth.uid();
    IF v_reader_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to send a tip.';
    END IF;

    -- Self-tip blocked
    IF v_reader_id = p_writer_id THEN
        RAISE EXCEPTION 'Authors cannot tip themselves.';
    END IF;

    -- Platform settings & kill switch
    SELECT * INTO v_platform FROM public.platform_settings WHERE id = 1;
    IF v_platform.id IS NULL OR coalesce(v_platform.tips_enabled, true) = false THEN
        RAISE EXCEPTION 'Tips are currently disabled on the platform.';
    END IF;

    -- Writer check
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = p_writer_id;
    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RAISE EXCEPTION 'Author is not eligible to receive tips.';
    END IF;

    -- Require active base profile
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_writer_id AND p.is_active = true
    ) THEN
        RAISE EXCEPTION 'Author is not eligible to receive tips.';
    END IF;

    -- Writer tip settings check (defaults to true if row not created yet)
    SELECT * INTO v_tip_settings FROM public.writer_tip_settings WHERE writer_id = p_writer_id;
    IF coalesce(v_tip_settings.enabled, true) = false THEN
        RAISE EXCEPTION 'Author has not enabled tips.';
    END IF;

    -- Amount validations
    v_min := coalesce(v_tip_settings.min_amount, v_platform.tip_min_pkr, 20)::numeric(10,2);
    v_max := coalesce(v_tip_settings.max_amount, v_platform.tip_max_pkr, 5000)::numeric(10,2);

    IF p_amount_pkr IS NULL OR p_amount_pkr < v_min THEN
        RAISE EXCEPTION 'Tip amount must be at least PKR %s.', v_min;
    END IF;

    IF p_amount_pkr > v_max THEN
        RAISE EXCEPTION 'Tip amount cannot exceed PKR %s.', v_max;
    END IF;

    -- Optional novel validity check if tip attached to a novel
    IF p_novel_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = p_novel_id AND n.status = 'published' AND n.writer_id = p_writer_id
        ) THEN
            RAISE EXCEPTION 'Novel is not available.';
        END IF;
    END IF;

    -- Hourly rate limit per reader
    SELECT pg_catalog.count(*) INTO v_hourly_count
    FROM public.tips
    WHERE reader_id = v_reader_id
      AND created_at >= pg_catalog.now() - interval '1 hour';

    IF v_hourly_count >= coalesce(v_platform.max_tips_per_hour, 5) THEN
        RAISE EXCEPTION 'Hourly tip limit reached. Please wait before sending another tip.';
    END IF;

    -- Daily cap per reader
    SELECT coalesce(pg_catalog.sum(amount_pkr), 0) INTO v_daily_sum
    FROM public.tips
    WHERE reader_id = v_reader_id
      AND status IN ('pending_payment', 'payment_submitted', 'confirmed')
      AND created_at >= pg_catalog.now() - interval '24 hours';

    IF (v_daily_sum + p_amount_pkr) > coalesce(v_platform.tip_daily_cap_pkr_per_reader, 10000) THEN
        RAISE EXCEPTION 'Daily tipping cap of PKR %s exceeded for this reader.', v_platform.tip_daily_cap_pkr_per_reader;
    END IF;

    -- Open tip limit: At most 3 open tips between this reader and this writer
    SELECT pg_catalog.count(*) INTO v_open_count
    FROM public.tips
    WHERE reader_id = v_reader_id
      AND writer_id = p_writer_id
      AND status IN ('pending_payment', 'payment_submitted');

    IF v_open_count >= 3 THEN
        RAISE EXCEPTION 'You already have 3 open tips awaiting payment or confirmation for this author. Please complete or cancel existing tips before creating a new one.';
    END IF;

    -- Find lowest available open_slot (1, 2, or 3)
    FOR v_i IN 1..3 LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.tips
            WHERE reader_id = v_reader_id
              AND writer_id = p_writer_id
              AND status IN ('pending_payment', 'payment_submitted')
              AND open_slot = v_i
        ) THEN
            v_open_slot := v_i;
            EXIT;
        END IF;
    END LOOP;

    -- Validate payment method
    SELECT * INTO v_method
    FROM public.writer_payment_methods
    WHERE id = p_payment_method_id
      AND writer_id = p_writer_id
      AND is_active = true;

    IF v_method.id IS NULL THEN
        RAISE EXCEPTION 'Selected payment method is invalid or inactive.';
    END IF;

    -- Clean message
    IF p_message IS NOT NULL AND trim(p_message) <> '' THEN
        IF pg_catalog.length(trim(p_message)) > 280 THEN
            RAISE EXCEPTION 'Tip message cannot exceed 280 characters.';
        END IF;
        v_cleaned_msg := trim(p_message);
    END IF;

    -- Build payment instructions snapshot
    v_snapshot := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note
    );

    -- Generate human-readable tip number
    v_tip_number := 'TIP-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' ||
                    pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 8));

    -- Insert tip (using reader_message column)
    INSERT INTO public.tips (
        tip_number,
        reader_id,
        writer_id,
        novel_id,
        chapter_id,
        amount_pkr,
        payment_method_id,
        payment_instructions_snapshot,
        reader_message,
        is_anonymous,
        status,
        open_slot,
        created_at,
        updated_at
    ) VALUES (
        v_tip_number,
        v_reader_id,
        p_writer_id,
        p_novel_id,
        p_chapter_id,
        p_amount_pkr,
        v_method.id,
        v_snapshot,
        v_cleaned_msg,
        p_is_anonymous,
        'pending_payment',
        v_open_slot,
        pg_catalog.now(),
        pg_catalog.now()
    )
    RETURNING * INTO v_tip;

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
        v_reader_id,
        'reader',
        'CREATE_TIP',
        'tips',
        v_tip.id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'tip_number', v_tip_number,
            'writer_id', p_writer_id,
            'amount_pkr', p_amount_pkr
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'tip_id', v_tip.id,
        'tip_number', v_tip.tip_number,
        'status', v_tip.status,
        'amount_pkr', v_tip.amount_pkr,
        'instructions', v_snapshot,
        'open_slot', v_open_slot
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tip(uuid, numeric, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tip(uuid, numeric, uuid, uuid, uuid, text, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. GENERATE COMMISSION INVOICE (Fix setting column: invoice_due_days)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_commission_invoice(
    p_writer_id uuid,
    p_period_start timestamptz,
    p_period_end timestamptz,
    p_due_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_writer record;
    v_settings record;
    v_due_date timestamptz;
    v_sales_count integer := 0;
    v_total_gross numeric(12,2) := 0.00;
    v_total_comm numeric(12,2) := 0.00;
    v_invoice_num text;
    v_invoice_id uuid;
    r_entry record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can generate platform fee invoices.';
    END IF;

    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = p_writer_id;
    IF v_writer.id IS NULL THEN
        RAISE EXCEPTION 'Author profile not found: %', p_writer_id;
    END IF;

    IF p_period_start >= p_period_end THEN
        RAISE EXCEPTION 'Invalid billing period: start time must precede end time.';
    END IF;

    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
    v_due_date := coalesce(p_due_date, pg_catalog.now() + (coalesce(v_settings.invoice_due_days, 7) || ' days')::interval);

    -- Calculate net platform fee totals
    SELECT
        coalesce(pg_catalog.count(*), 0),
        coalesce(pg_catalog.sum(gross_amount_pkr), 0.00),
        coalesce(pg_catalog.sum(platform_commission_pkr), 0.00)
    INTO v_sales_count, v_total_gross, v_total_comm
    FROM public.sales_ledger l
    WHERE l.writer_id = p_writer_id
      AND l.created_at >= p_period_start
      AND l.created_at <= p_period_end
      AND NOT EXISTS (
          SELECT 1 FROM public.commission_invoice_lines cil
          WHERE cil.ledger_entry_id = l.id
            AND cil.is_voided = false
      );

    IF v_total_comm <= 0 THEN
        RAISE EXCEPTION 'Net platform fee for this billing period is PKR % (must be strictly positive to bill author; refunds/adjustments offset sales).', v_total_comm;
    END IF;

    -- Generate invoice number: INV-YYYYMM-XXXXXX
    v_invoice_num := 'INV-' || pg_catalog.to_char(p_period_end AT TIME ZONE 'Asia/Karachi', 'YYYYMM') || '-' || pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    -- Insert commission invoice
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
        due_date,
        created_at
    ) VALUES (
        v_invoice_num,
        p_writer_id,
        p_period_start,
        p_period_end,
        v_sales_count,
        v_total_gross,
        v_total_comm,
        0.00,
        'invoiced',
        v_due_date,
        pg_catalog.now()
    )
    RETURNING id INTO v_invoice_id;

    -- Insert invoice lines mapping each eligible ledger entry to this invoice
    FOR r_entry IN (
        SELECT l.id AS ledger_id, l.platform_commission_pkr
        FROM public.sales_ledger l
        WHERE l.writer_id = p_writer_id
          AND l.created_at >= p_period_start
          AND l.created_at <= p_period_end
          AND NOT EXISTS (
              SELECT 1 FROM public.commission_invoice_lines cil
              WHERE cil.ledger_entry_id = l.id
                AND cil.is_voided = false
          )
    ) LOOP
        INSERT INTO public.commission_invoice_lines (
            invoice_id,
            ledger_entry_id,
            commission_pkr,
            is_voided,
            created_at
        ) VALUES (
            v_invoice_id,
            r_entry.ledger_id,
            r_entry.platform_commission_pkr,
            false,
            pg_catalog.now()
        );
    END LOOP;

    -- In-app notification for writer
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
        'پلیٹ فارم فیس انوائس جاری ہو گئی (Platform Fee Invoice Issued)',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا پلیٹ فارم فیس: PKR ' || v_total_comm || '۔ آخری تاریخ: ' || pg_catalog.to_char(v_due_date AT TIME ZONE 'Asia/Karachi', 'DD-MM-YYYY') || '۔',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا پلیٹ فارم فیس: PKR ' || v_total_comm || '۔',
        '/writer/commission/' || v_invoice_id,
        pg_catalog.jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_num, 'amount_pkr', v_total_comm),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for writer (critical event)
    PERFORM public.enqueue_email_for_notification(
        p_writer_id,
        'invoice_issued',
        'Platform Fee Invoice Issued — ' || v_invoice_num || ' | UNB Premium',
        'Your monthly platform fee invoice ' || v_invoice_num || ' has been generated.' || E'\n\nTotal platform fee due: PKR ' || v_total_comm || E'\nDue Date: ' || pg_catalog.to_char(v_due_date AT TIME ZONE 'Asia/Karachi', 'DD-MM-YYYY') || E'\n\nPlease view your invoice and submit payment verification via your Writer Studio.',
        'invoice_issued:' || v_invoice_id::text
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
        'admin',
        'GENERATE_COMMISSION_INVOICE',
        'commission_invoices',
        v_invoice_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'invoice_id', v_invoice_id,
            'invoice_number', v_invoice_num,
            'writer_id', p_writer_id,
            'total_gross_pkr', v_total_gross,
            'total_commission_owed_pkr', v_total_comm,
            'sales_count', v_sales_count,
            'due_date', v_due_date
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'total_commission_owed_pkr', v_total_comm,
        'sales_count', v_sales_count,
        'due_date', v_due_date
    );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz, timestamptz) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. RETENTION STORAGE HELPERS (Fix ps.created_at & ps.screenshot_path)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_expired_payment_proof_paths(p_days integer)
RETURNS TABLE(proof_path text, source_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.role() != 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted access.';
    END IF;

    IF p_days <= 0 THEN
        RETURN; -- Unlimited / Never delete
    END IF;

    -- 1. Order payment submissions where order is verified, rejected, or cancelled older than p_days
    RETURN QUERY
    SELECT coalesce(ps.screenshot_path, ps.screenshot_url), 'order_payment'::text
    FROM public.payment_submissions ps
    JOIN public.orders o ON o.id = ps.order_id
    WHERE coalesce(ps.screenshot_path, ps.screenshot_url) IS NOT NULL
      AND coalesce(ps.screenshot_path, ps.screenshot_url) NOT LIKE '[PRUNED%'
      AND o.status IN ('verified', 'rejected', 'cancelled')
      AND coalesce(o.verified_at, o.updated_at, ps.created_at) < pg_catalog.now() - (p_days || ' days')::interval
    LIMIT 100;

    -- 2. Settled platform fee payment reports
    RETURN QUERY
    SELECT cpr.screenshot_path, 'fee_settlement'::text
    FROM public.commission_payment_reports cpr
    WHERE cpr.screenshot_path IS NOT NULL
      AND cpr.screenshot_path NOT LIKE '[PRUNED%'
      AND cpr.status IN ('confirmed', 'rejected')
      AND cpr.reviewed_at < pg_catalog.now() - (p_days || ' days')::interval
    LIMIT 100;

    -- 3. Settled reader tips older than p_days
    RETURN QUERY
    SELECT t.screenshot_path, 'tip_payment'::text
    FROM public.tips t
    WHERE t.screenshot_path IS NOT NULL
      AND t.screenshot_path NOT LIKE '[PRUNED%'
      AND t.status IN ('confirmed', 'not_received', 'cancelled')
      AND coalesce(t.confirmed_at, t.not_received_at, t.updated_at, t.created_at) < pg_catalog.now() - (p_days || ' days')::interval
    LIMIT 100;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_expired_payment_proof_paths(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expired_payment_proof_paths(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_payment_proofs_pruned(p_paths text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    IF auth.role() != 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted access.';
    END IF;

    IF p_paths IS NULL OR pg_catalog.cardinality(p_paths) = 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.payment_submissions
    SET screenshot_url = '[PRUNED_BY_RETENTION_POLICY]',
        screenshot_path = '[PRUNED_BY_RETENTION_POLICY]'
    WHERE screenshot_url = ANY(p_paths) OR screenshot_path = ANY(p_paths);

    UPDATE public.commission_payment_reports
    SET screenshot_path = '[PRUNED_BY_RETENTION_POLICY]'
    WHERE screenshot_path = ANY(p_paths);

    UPDATE public.tips
    SET screenshot_path = '[PRUNED_BY_RETENTION_POLICY]'
    WHERE screenshot_path = ANY(p_paths);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_payment_proofs_pruned(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payment_proofs_pruned(text[]) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. NOVEL APPROVAL (Drop stale overload, canonicalize approve_novel(uuid, jsonb))
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.approve_novel(uuid);

CREATE OR REPLACE FUNCTION public.approve_novel(
    p_novel_id uuid,
    p_checklist jsonb DEFAULT NULL
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
        RAISE EXCEPTION 'Restricted: Only platform administrators can approve novels.';
    END IF;

    SELECT * INTO v_novel FROM public.novels WHERE id = p_novel_id;
    IF v_novel.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found: %', p_novel_id;
    END IF;

    PERFORM pg_catalog.set_config('app.novel_status_change', '1', true);

    UPDATE public.novels
    SET status = 'published',
        published_at = coalesce(published_at, pg_catalog.now()),
        moderation_reason = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_novel_id;

    -- In-app notification for author
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

    -- Transactional email outbox for author (critical event)
    PERFORM public.enqueue_email_for_notification(
        v_novel.writer_id,
        'novel_approved',
        'Novel Approved & Published — ' || v_novel.title_urdu || ' | UNB Premium',
        'Congratulations! Your novel "' || v_novel.title_urdu || '" has been approved by our editorial team and is now live on the marketplace for readers to purchase and enjoy.',
        'novel_approved:' || p_novel_id::text
    );

    -- Audit log with checklist
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
        pg_catalog.jsonb_build_object('status', 'published', 'checklist', p_checklist),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('success', true, 'novel_id', p_novel_id, 'status', 'published');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_novel(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_novel(uuid, jsonb) TO authenticated;
