-- =============================================================================
-- Migration 0017: Commission Invoices, Settlement, Ledger Hardening & Statements
-- Step 5.1 Architecture & Security Definer Hardening
-- =============================================================================

-- Note: Enum extensions ('partially_paid', 'void') are migrated separately in
-- 0017_a_commission_enum_values.sql so that new enum values are committed
-- before being referenced in table definitions, RPCs, or policies (PostgreSQL 55P04).

-- 2. SCHEMA ADDITIONS ON EXISTING TABLES

-- 2a. platform_settings: Invoice due window and overdue grace days
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'invoice_due_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD COLUMN invoice_due_days integer NOT NULL DEFAULT 7
            CHECK (invoice_due_days >= 1 AND invoice_due_days <= 90);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'overdue_grace_days'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD COLUMN overdue_grace_days integer NOT NULL DEFAULT 3
            CHECK (overdue_grace_days >= 0 AND overdue_grace_days <= 60);
    END IF;
END $$;

-- 2b. commission_invoices: Due date, void audit trail
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commission_invoices' AND column_name = 'due_date'
    ) THEN
        ALTER TABLE public.commission_invoices
            ADD COLUMN due_date timestamptz;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commission_invoices' AND column_name = 'voided_at'
    ) THEN
        ALTER TABLE public.commission_invoices
            ADD COLUMN voided_at timestamptz,
            ADD COLUMN voided_by uuid REFERENCES public.profiles(id),
            ADD COLUMN void_reason text;
    END IF;
END $$;

-- 3. NEW RELATIONAL TABLES

-- 3a. commission_invoice_lines: Relational mapping between invoices and sales ledger rows
-- Replaces writing to sales_ledger.commission_invoice_id (which violates append-only trigger)
CREATE TABLE IF NOT EXISTS public.commission_invoice_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.commission_invoices(id) ON DELETE RESTRICT,
    ledger_entry_id uuid NOT NULL REFERENCES public.sales_ledger(id) ON DELETE RESTRICT,
    commission_pkr numeric(12,2) NOT NULL,
    is_voided boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique index: A sales ledger entry can be linked to at most ONE active (non-voided) invoice
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_invoice_lines_active_ledger
    ON public.commission_invoice_lines (ledger_entry_id)
    WHERE (is_voided = false);

CREATE INDEX IF NOT EXISTS idx_commission_invoice_lines_invoice
    ON public.commission_invoice_lines (invoice_id);

ALTER TABLE public.commission_invoice_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_invoice_lines FROM PUBLIC, anon, authenticated;

-- 3b. platform_payment_methods: Official marketplace bank / wallet accounts for writer settlements
CREATE TABLE IF NOT EXISTS public.platform_payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    method_type text NOT NULL CHECK (method_type IN ('jazzcash', 'easypaisa', 'raast', 'bank_transfer')),
    account_title text NOT NULL,
    account_number_or_iban text NOT NULL,
    bank_name text,
    instructions_note text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_payment_methods_active
    ON public.platform_payment_methods (is_active);

ALTER TABLE public.platform_payment_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_payment_methods FROM PUBLIC, anon, authenticated;

-- 3c. commission_payment_reports: Writer-submitted payment claims against an invoice
CREATE TABLE IF NOT EXISTS public.commission_payment_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.commission_invoices(id) ON DELETE CASCADE,
    writer_id uuid NOT NULL REFERENCES public.writer_profiles(id) ON DELETE RESTRICT,
    amount_pkr numeric(12,2) NOT NULL CHECK (amount_pkr > 0),
    transaction_reference text NOT NULL,
    normalized_tid text NOT NULL,
    screenshot_path text NOT NULL,
    writer_note text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    is_duplicate_tid boolean NOT NULL DEFAULT false,
    admin_note text,
    reviewed_by uuid REFERENCES public.profiles(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_payment_reports_invoice
    ON public.commission_payment_reports (invoice_id);

CREATE INDEX IF NOT EXISTS idx_commission_payment_reports_writer
    ON public.commission_payment_reports (writer_id);

CREATE INDEX IF NOT EXISTS idx_commission_payment_reports_normalized_tid
    ON public.commission_payment_reports (normalized_tid);

ALTER TABLE public.commission_payment_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_payment_reports FROM PUBLIC, anon, authenticated;


-- 4. HARDENED RECONCILIATION & BALANCE AUDIT FUNCTION

-- Restricted recalculation of writer accrued unpaid commission
CREATE OR REPLACE FUNCTION public.get_writer_unpaid_commission(p_writer_id uuid)
RETURNS numeric(12,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_total_ledger_comm numeric(12,2);
    v_total_paid numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL THEN
        IF v_caller_id != p_writer_id AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Access denied: You can only inspect your own commission balance.';
        END IF;
    END IF;

    SELECT coalesce(sum(platform_commission_pkr), 0.00)
    INTO v_total_ledger_comm
    FROM public.sales_ledger
    WHERE writer_id = p_writer_id;

    SELECT coalesce(sum(amount_pkr), 0.00)
    INTO v_total_paid
    FROM public.commission_payments
    WHERE writer_id = p_writer_id;

    RETURN greatest(0.00, v_total_ledger_comm - v_total_paid);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_writer_unpaid_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_writer_unpaid_commission(uuid) TO authenticated;


-- Hardened reconcile_writer_unpaid_commission with threshold notifications (80% and 100%)
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
    IF v_caller_id IS NOT NULL THEN
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

    UPDATE public.writer_profiles
    SET current_unpaid_commission = v_actual_unpaid,
        is_orders_paused_for_commission = v_is_paused,
        updated_at = now()
    WHERE id = p_writer_id;

    -- De-duplicated threshold notifications (anchored since last confirmed payment settlement)
    SELECT max(confirmed_at) INTO v_last_settlement
    FROM public.commission_payments
    WHERE writer_id = p_writer_id;

    IF v_last_settlement IS NULL THEN
        v_last_settlement := '2000-01-01 00:00:00+00'::timestamptz;
    END IF;

    -- 80% Threshold Warning
    IF v_actual_unpaid >= (0.80 * v_limit) AND v_actual_unpaid < v_limit THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE user_id = p_writer_id
              AND type = 'commission_threshold_80'
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
                'commission_threshold_80',
                'کمیشن حد کا انتباہ (Commission Limit Warning - 80%)',
                'آپ کا غیر ادا شدہ کمیشن اپنی حد کے 80 فیصد (PKR ' || v_actual_unpaid || ') تک پہنچ گیا ہے۔ نئے آرڈرز معطلی سے بچنے کے لیے براہ کرم جلد از جلد ادائیگی کریں۔',
                'آپ کا غیر ادا شدہ کمیشن اپنی حد کے 80 فیصد تک پہنچ گیا ہے۔',
                '/writer/commission',
                jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                now()
            );
        END IF;
    -- 100% Threshold Limit Reached (Orders Paused)
    ELSIF v_actual_unpaid >= v_limit THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
            WHERE user_id = p_writer_id
              AND type = 'commission_threshold_100'
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
                'commission_threshold_100',
                'کمیشن حد مکمل: نئے آرڈرز روک دیے گئے (Orders Paused - Limit Reached)',
                'آپ کا غیر ادا شدہ کمیشن زیادہ سے زیادہ حد (PKR ' || v_limit || ') تک پہنچ چکا ہے۔ جب تک پچھلا کمیشن ادا نہیں ہوتا، قارئین آپ کے ناولز کے نئے آرڈرز جمع نہیں کرا سکیں گے۔',
                'آپ کا غیر ادا شدہ کمیشن زیادہ سے زیادہ حد تک پہنچ چکا ہے۔ نئے آرڈرز معطل کر دیے گئے ہیں۔',
                '/writer/commission',
                jsonb_build_object('unpaid', v_actual_unpaid, 'limit', v_limit),
                false,
                now()
            );
        END IF;
    END IF;

    RETURN v_actual_unpaid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_writer_unpaid_commission(uuid) TO authenticated;


-- 5. OVERLOADED update_platform_settings (11 Parameters)
CREATE OR REPLACE FUNCTION public.update_platform_settings(
    p_default_commission_rate numeric,
    p_default_unpaid_commission_limit numeric,
    p_dispute_window_days integer,
    p_min_novel_price_pkr integer,
    p_max_novel_price_pkr numeric,
    p_support_email text,
    p_max_orders_per_hour integer DEFAULT 5,
    p_max_chapter_reads_per_window integer DEFAULT 20,
    p_chapter_read_window_minutes integer DEFAULT 10,
    p_invoice_due_days integer DEFAULT 7,
    p_overdue_grace_days integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_old record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can update platform settings.';
    END IF;

    IF p_default_commission_rate < 0 OR p_default_commission_rate > 100 THEN
        RAISE EXCEPTION 'Commission rate must be between 0%% and 100%%. Provided: %', p_default_commission_rate;
    END IF;

    IF p_default_unpaid_commission_limit < 0 THEN
        RAISE EXCEPTION 'Default unpaid commission limit cannot be negative. Provided: %', p_default_unpaid_commission_limit;
    END IF;

    IF p_dispute_window_days < 1 OR p_dispute_window_days > 365 THEN
        RAISE EXCEPTION 'Dispute window must be between 1 and 365 days. Provided: %', p_dispute_window_days;
    END IF;

    IF p_min_novel_price_pkr < 1 THEN
        RAISE EXCEPTION 'Minimum novel price must be at least 1 PKR. Provided: %', p_min_novel_price_pkr;
    END IF;

    IF p_max_novel_price_pkr <= 0 THEN
        RAISE EXCEPTION 'Maximum novel price must be greater than 0 PKR. Provided: %', p_max_novel_price_pkr;
    END IF;

    IF p_min_novel_price_pkr > p_max_novel_price_pkr THEN
        RAISE EXCEPTION 'Minimum novel price (%) cannot exceed maximum novel price (%).', p_min_novel_price_pkr, p_max_novel_price_pkr;
    END IF;

    IF p_support_email IS NULL OR trim(p_support_email) = '' OR p_support_email NOT LIKE '%@%.%' THEN
        RAISE EXCEPTION 'A valid support email address is required.';
    END IF;

    IF p_max_orders_per_hour < 1 OR p_max_orders_per_hour > 100 THEN
        RAISE EXCEPTION 'Max orders per hour must be between 1 and 100. Provided: %', p_max_orders_per_hour;
    END IF;

    IF p_max_chapter_reads_per_window < 1 OR p_max_chapter_reads_per_window > 1000 THEN
        RAISE EXCEPTION 'Max chapter reads per window must be between 1 and 1000. Provided: %', p_max_chapter_reads_per_window;
    END IF;

    IF p_chapter_read_window_minutes < 1 OR p_chapter_read_window_minutes > 1440 THEN
        RAISE EXCEPTION 'Chapter read window minutes must be between 1 and 1440. Provided: %', p_chapter_read_window_minutes;
    END IF;

    IF p_invoice_due_days < 1 OR p_invoice_due_days > 90 THEN
        RAISE EXCEPTION 'Invoice due days must be between 1 and 90. Provided: %', p_invoice_due_days;
    END IF;

    IF p_overdue_grace_days < 0 OR p_overdue_grace_days > 60 THEN
        RAISE EXCEPTION 'Overdue grace days must be between 0 and 60. Provided: %', p_overdue_grace_days;
    END IF;

    SELECT * INTO v_old FROM public.platform_settings WHERE id = 1;

    UPDATE public.platform_settings
    SET default_commission_rate = p_default_commission_rate,
        default_unpaid_commission_limit = p_default_unpaid_commission_limit,
        dispute_window_days = p_dispute_window_days,
        min_novel_price_pkr = p_min_novel_price_pkr,
        max_novel_price_pkr = p_max_novel_price_pkr,
        support_email = trim(p_support_email),
        max_orders_per_hour = p_max_orders_per_hour,
        max_chapter_reads_per_window = p_max_chapter_reads_per_window,
        chapter_read_window_minutes = p_chapter_read_window_minutes,
        invoice_due_days = p_invoice_due_days,
        overdue_grace_days = p_overdue_grace_days,
        updated_at = now()
    WHERE id = 1;

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
        'UPDATE_PLATFORM_SETTINGS',
        'platform_settings',
        '1',
        jsonb_build_object(
            'default_commission_rate', v_old.default_commission_rate,
            'default_unpaid_commission_limit', v_old.default_unpaid_commission_limit,
            'dispute_window_days', v_old.dispute_window_days,
            'min_novel_price_pkr', v_old.min_novel_price_pkr,
            'max_novel_price_pkr', v_old.max_novel_price_pkr,
            'support_email', v_old.support_email,
            'max_orders_per_hour', v_old.max_orders_per_hour,
            'max_chapter_reads_per_window', v_old.max_chapter_reads_per_window,
            'chapter_read_window_minutes', v_old.chapter_read_window_minutes,
            'invoice_due_days', v_old.invoice_due_days,
            'overdue_grace_days', v_old.overdue_grace_days
        ),
        jsonb_build_object(
            'default_commission_rate', p_default_commission_rate,
            'default_unpaid_commission_limit', p_default_unpaid_commission_limit,
            'dispute_window_days', p_dispute_window_days,
            'min_novel_price_pkr', p_min_novel_price_pkr,
            'max_novel_price_pkr', p_max_novel_price_pkr,
            'support_email', trim(p_support_email),
            'max_orders_per_hour', p_max_orders_per_hour,
            'max_chapter_reads_per_window', p_max_chapter_reads_per_window,
            'chapter_read_window_minutes', p_chapter_read_window_minutes,
            'invoice_due_days', p_invoice_due_days,
            'overdue_grace_days', p_overdue_grace_days
        ),
        now()
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, integer, numeric, text, integer, integer, integer, integer, integer) TO authenticated;


-- 6. PLATFORM PAYMENT METHODS RPCs (Admin CRUD & Reader/Writer Instructions)

CREATE OR REPLACE FUNCTION public.upsert_platform_payment_method(
    p_id uuid,
    p_method_type text,
    p_account_title text,
    p_account_number_or_iban text,
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
    v_method_id uuid;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can manage platform payment methods.';
    END IF;

    IF p_method_type NOT IN ('jazzcash', 'easypaisa', 'raast', 'bank_transfer') THEN
        RAISE EXCEPTION 'Invalid payment method type: %', p_method_type;
    END IF;

    IF p_account_title IS NULL OR trim(p_account_title) = '' THEN
        RAISE EXCEPTION 'Account title is required.';
    END IF;

    IF p_account_number_or_iban IS NULL OR trim(p_account_number_or_iban) = '' THEN
        RAISE EXCEPTION 'Account number or IBAN is required.';
    END IF;

    IF p_id IS NOT NULL THEN
        UPDATE public.platform_payment_methods
        SET method_type = p_method_type,
            account_title = trim(p_account_title),
            account_number_or_iban = trim(p_account_number_or_iban),
            bank_name = nullif(trim(p_bank_name), ''),
            instructions_note = nullif(trim(p_instructions_note), ''),
            updated_at = now()
        WHERE id = p_id
        RETURNING id INTO v_method_id;

        IF v_method_id IS NULL THEN
            RAISE EXCEPTION 'Platform payment method not found: %', p_id;
        END IF;
    ELSE
        INSERT INTO public.platform_payment_methods (
            method_type,
            account_title,
            account_number_or_iban,
            bank_name,
            instructions_note,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            p_method_type,
            trim(p_account_title),
            trim(p_account_number_or_iban),
            nullif(trim(p_bank_name), ''),
            nullif(trim(p_instructions_note), ''),
            true,
            now(),
            now()
        )
        RETURNING id INTO v_method_id;
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
        'UPSERT_PLATFORM_PAYMENT_METHOD',
        'platform_payment_methods',
        v_method_id::text,
        NULL,
        jsonb_build_object(
            'method_type', p_method_type,
            'account_title', p_account_title,
            'bank_name', p_bank_name
        ),
        now()
    );

    RETURN jsonb_build_object('success', true, 'id', v_method_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_platform_payment_method(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_platform_payment_method(uuid, text, text, text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.deactivate_platform_payment_method(p_id uuid)
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
        RAISE EXCEPTION 'Restricted: Only platform administrators can deactivate platform payment methods.';
    END IF;

    UPDATE public.platform_payment_methods
    SET is_active = false,
        updated_at = now()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Platform payment method not found: %', p_id;
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
        'DEACTIVATE_PLATFORM_PAYMENT_METHOD',
        'platform_payment_methods',
        p_id::text,
        jsonb_build_object('is_active', true),
        jsonb_build_object('is_active', false),
        now()
    );

    RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_platform_payment_method(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_platform_payment_method(uuid) TO authenticated;


-- Gated retrieval of platform payment instructions (Only writers with active invoices or admins)
CREATE OR REPLACE FUNCTION public.get_platform_payment_instructions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_has_open_invoice boolean;
    v_methods jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF public.is_admin() THEN
        v_has_open_invoice := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.commission_invoices
            WHERE writer_id = v_caller_id
              AND status IN ('invoiced', 'open', 'payment_reported', 'partially_paid')
        ) INTO v_has_open_invoice;
    END IF;

    IF NOT v_has_open_invoice THEN
        RAISE EXCEPTION 'Platform payment instructions are accessible only to writers with an active commission invoice.';
    END IF;

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'method_type', method_type,
                'account_title', account_title,
                'account_number_or_iban', account_number_or_iban,
                'bank_name', bank_name,
                'instructions_note', instructions_note
            )
            ORDER BY created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_methods
    FROM public.platform_payment_methods
    WHERE is_active = true;

    RETURN v_methods;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_payment_instructions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_payment_instructions() TO authenticated;


-- 7. COMMISSION INVOICING RPCs (Preview, Generate, Void)

-- 7a. preview_commission_invoice: Admin inspects uninvoiced ledger entries before generation
CREATE OR REPLACE FUNCTION public.preview_commission_invoice(
    p_writer_id uuid,
    p_period_start timestamptz,
    p_period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_lines jsonb;
    v_sales_count integer := 0;
    v_refunds_count integer := 0;
    v_total_gross numeric(12,2) := 0.00;
    v_total_commission numeric(12,2) := 0.00;
    v_total_net numeric(12,2) := 0.00;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can preview commission invoices.';
    END IF;

    IF p_period_end <= p_period_start THEN
        RAISE EXCEPTION 'Period end date must be after period start date.';
    END IF;

    -- Aggregate uninvoiced ledger rows (not present in any non-voided invoice line)
    SELECT
        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'ledger_entry_id', l.id,
                    'order_id', l.order_id,
                    'order_number', o.order_number,
                    'novel_title', coalesce(o.novel_title_snapshot, n.title_english, n.title_urdu, 'Manual Adjustment'),
                    'entry_type', l.entry_type,
                    'gross_amount_pkr', l.gross_amount_pkr,
                    'commission_rate', l.commission_rate,
                    'platform_commission_pkr', l.platform_commission_pkr,
                    'writer_net_pkr', l.writer_net_pkr,
                    'created_at', l.created_at
                )
                ORDER BY l.created_at ASC
            ),
            '[]'::jsonb
        ),
        count(CASE WHEN l.entry_type = 'sale_verified' THEN 1 END),
        count(CASE WHEN l.entry_type IN ('refund_adjustment', 'manual_correction') THEN 1 END),
        coalesce(sum(l.gross_amount_pkr), 0.00),
        coalesce(sum(l.platform_commission_pkr), 0.00),
        coalesce(sum(l.writer_net_pkr), 0.00)
    INTO v_lines, v_sales_count, v_refunds_count, v_total_gross, v_total_commission, v_total_net
    FROM public.sales_ledger l
    LEFT JOIN public.orders o ON o.id = l.order_id
    LEFT JOIN public.novels n ON n.id = l.novel_id
    WHERE l.writer_id = p_writer_id
      AND l.created_at >= p_period_start
      AND l.created_at <= p_period_end
      AND NOT EXISTS (
          SELECT 1
          FROM public.commission_invoice_lines cil
          WHERE cil.ledger_entry_id = l.id
            AND cil.is_voided = false
      );

    RETURN jsonb_build_object(
        'writer_id', p_writer_id,
        'period_start', p_period_start,
        'period_end', p_period_end,
        'sales_count', v_sales_count,
        'refunds_count', v_refunds_count,
        'total_entries_count', v_sales_count + v_refunds_count,
        'total_gross_pkr', v_total_gross,
        'total_commission_owed_pkr', v_total_commission,
        'total_writer_net_pkr', v_total_net,
        'can_generate_invoice', (v_total_commission > 0),
        'lines', v_lines
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_commission_invoice(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_commission_invoice(uuid, timestamptz, timestamptz) TO authenticated;


-- 7b. generate_commission_invoice: Atomic lines creation without mutating sales_ledger
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
    v_invoice_id uuid;
    v_invoice_num text;
    v_due_days integer;
    v_due_date timestamptz;
    v_total_gross numeric(12,2) := 0.00;
    v_total_comm numeric(12,2) := 0.00;
    v_sales_count integer := 0;
    v_entries_count integer := 0;
    r_entry record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can generate commission invoices.';
    END IF;

    IF p_period_end <= p_period_start THEN
        RAISE EXCEPTION 'Period end date must be after period start date.';
    END IF;

    SELECT coalesce(invoice_due_days, 7) INTO v_due_days
    FROM public.platform_settings
    WHERE id = 1;

    v_due_date := now() + (v_due_days || ' days')::interval;

    -- Aggregate eligible ledger entries that are uninvoiced
    SELECT
        count(*),
        count(CASE WHEN entry_type = 'sale_verified' THEN 1 END),
        coalesce(sum(gross_amount_pkr), 0.00),
        coalesce(sum(platform_commission_pkr), 0.00)
    INTO v_entries_count, v_sales_count, v_total_gross, v_total_comm
    FROM public.sales_ledger l
    WHERE l.writer_id = p_writer_id
      AND l.created_at >= p_period_start
      AND l.created_at <= p_period_end
      AND NOT EXISTS (
          SELECT 1 FROM public.commission_invoice_lines cil
          WHERE cil.ledger_entry_id = l.id
            AND cil.is_voided = false
      );

    IF v_entries_count = 0 THEN
        RAISE EXCEPTION 'No uninvoiced ledger entries found for this author in the chosen period.';
    END IF;

    IF v_total_comm <= 0 THEN
        RAISE EXCEPTION 'Net commission for this billing period is PKR % (must be strictly positive to bill author; refunds/adjustments offset sales).', v_total_comm;
    END IF;

    -- Generate invoice number: INV-YYYYMM-XXXXXX
    v_invoice_num := 'INV-' || to_char(p_period_end AT TIME ZONE 'Asia/Karachi', 'YYYYMM') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

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
        now()
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
            now()
        );
    END LOOP;

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
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا کمیشن: PKR ' || v_total_comm || '۔ آخری تاریخ: ' || to_char(v_due_date AT TIME ZONE 'Asia/Karachi', 'DD-MM-YYYY') || '۔',
        'انوائس نمبر ' || v_invoice_num || ' جاری ہو چکی ہے۔ واجب الادا کمیشن: PKR ' || v_total_comm || '۔',
        '/writer/commission/' || v_invoice_id,
        jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_num, 'amount_pkr', v_total_comm),
        false,
        now()
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
        jsonb_build_object(
            'invoice_number', v_invoice_num,
            'writer_id', p_writer_id,
            'total_commission_owed_pkr', v_total_comm,
            'total_entries_count', v_entries_count,
            'due_date', v_due_date
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'total_sales_count', v_sales_count,
        'total_commission_owed_pkr', v_total_comm,
        'due_date', v_due_date
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz) TO authenticated;


-- 7c. void_commission_invoice: Admin voids invoice without confirmed settlements
CREATE OR REPLACE FUNCTION public.void_commission_invoice(
    p_invoice_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoice record;
    v_payments_count integer := 0;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can void commission invoices.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to void an invoice.';
    END IF;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF v_invoice.id IS NULL THEN
        RAISE EXCEPTION 'Commission invoice not found: %', p_invoice_id;
    END IF;

    IF v_invoice.status = 'void' THEN
        RAISE EXCEPTION 'Invoice is already voided.';
    END IF;

    SELECT count(*) INTO v_payments_count
    FROM public.commission_payments
    WHERE invoice_id = p_invoice_id;

    IF v_payments_count > 0 OR v_invoice.amount_settled_pkr > 0 THEN
        RAISE EXCEPTION 'Cannot void invoice: Confirmed payment settlements (PKR %) already exist against this invoice. Issue a manual correction instead.', v_invoice.amount_settled_pkr;
    END IF;

    -- Update invoice to void
    UPDATE public.commission_invoices
    SET status = 'void',
        voided_at = now(),
        voided_by = v_caller_id,
        void_reason = trim(p_reason)
    WHERE id = p_invoice_id;

    -- Mark lines voided so the underlying sales ledger entries can be re-invoiced
    UPDATE public.commission_invoice_lines
    SET is_voided = true
    WHERE invoice_id = p_invoice_id;

    -- Reject any pending writer reports on this voided invoice
    UPDATE public.commission_payment_reports
    SET status = 'rejected',
        admin_note = 'Invoice voided: ' || trim(p_reason),
        reviewed_by = v_caller_id,
        reviewed_at = now()
    WHERE invoice_id = p_invoice_id
      AND status = 'pending';

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
        'VOID_COMMISSION_INVOICE',
        'commission_invoices',
        p_invoice_id::text,
        jsonb_build_object('status', v_invoice.status),
        jsonb_build_object('status', 'void', 'reason', trim(p_reason)),
        now()
    );

    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.void_commission_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_commission_invoice(uuid, text) TO authenticated;


-- 8. SETTLEMENT & PAYMENT REPORTING RPCs

-- 8a. report_commission_payment: Writer reports settlement claim into commission_payment_reports
CREATE OR REPLACE FUNCTION public.report_commission_payment(
    p_invoice_id uuid,
    p_amount_pkr numeric,
    p_tid text,
    p_screenshot_path text,
    p_writer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoice record;
    v_clean_tid text;
    v_norm_tid text;
    v_is_dup boolean := false;
    v_report_id uuid;
    v_prefix text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_amount_pkr <= 0 THEN
        RAISE EXCEPTION 'Settlement payment amount must be positive. Provided: %', p_amount_pkr;
    END IF;

    -- Path traversal and invoice-folder isolation
    v_prefix := p_invoice_id::text || '/';
    IF p_screenshot_path IS NULL OR NOT (p_screenshot_path LIKE v_prefix || '%') OR p_screenshot_path LIKE '%..%' THEN
        RAISE EXCEPTION 'Invalid screenshot path: Must start with % and contain no path traversal.', v_prefix;
    END IF;

    -- TID Format Validation (6 - 40 characters)
    v_clean_tid := trim(p_tid);
    IF v_clean_tid IS NULL OR length(v_clean_tid) < 6 OR length(v_clean_tid) > 40 OR v_clean_tid !~ '^[a-zA-Z0-9_\-]+$' THEN
        RAISE EXCEPTION 'Invalid transaction reference (TID): Must be 6 to 40 alphanumeric characters, hyphens or underscores.';
    END IF;

    v_norm_tid := upper(regexp_replace(v_clean_tid, '[^a-zA-Z0-9]', '', 'g'));

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

    IF v_invoice.status NOT IN ('invoiced', 'open', 'payment_reported', 'partially_paid') THEN
        RAISE EXCEPTION 'Payment cannot be reported for invoice in status: %', v_invoice.status;
    END IF;

    -- Check for duplicate TID across past commission reports
    SELECT EXISTS (
        SELECT 1 FROM public.commission_payment_reports
        WHERE normalized_tid = v_norm_tid
          AND invoice_id != p_invoice_id
    ) INTO v_is_dup;

    -- Insert into commission_payment_reports
    INSERT INTO public.commission_payment_reports (
        invoice_id,
        writer_id,
        amount_pkr,
        transaction_reference,
        normalized_tid,
        screenshot_path,
        writer_note,
        status,
        is_duplicate_tid,
        created_at
    ) VALUES (
        p_invoice_id,
        v_invoice.writer_id,
        p_amount_pkr,
        v_clean_tid,
        v_norm_tid,
        p_screenshot_path,
        nullif(trim(p_writer_note), ''),
        'pending',
        v_is_dup,
        now()
    )
    RETURNING id INTO v_report_id;

    -- Transition invoice status to payment_reported (balances unchanged until admin confirms)
    UPDATE public.commission_invoices
    SET status = 'payment_reported'
    WHERE id = p_invoice_id;

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
        'writer',
        'REPORT_COMMISSION_PAYMENT',
        'commission_payment_reports',
        v_report_id::text,
        jsonb_build_object('invoice_status', v_invoice.status),
        jsonb_build_object(
            'invoice_id', p_invoice_id,
            'amount_pkr', p_amount_pkr,
            'tid', v_clean_tid,
            'is_duplicate_tid', v_is_dup
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'report_id', v_report_id,
        'status', 'pending',
        'is_duplicate_tid', v_is_dup
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_commission_payment(uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_commission_payment(uuid, numeric, text, text, text) TO authenticated;


-- 8b. confirm_commission_settlement: Admin verifies funds in bank and records payment
CREATE OR REPLACE FUNCTION public.confirm_commission_settlement(
    p_invoice_id uuid,
    p_amount_pkr numeric,
    p_report_id uuid DEFAULT NULL,
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
    v_report record;
    v_payment_id uuid;
    v_remaining numeric(12,2);
    v_new_settled numeric(12,2);
    v_new_status public.commission_invoice_status;
    v_new_unpaid numeric(12,2);
    v_is_paused boolean;
    v_tid text := 'ADMIN-CONFIRMED';
    v_proof text := NULL;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can confirm commission settlements.';
    END IF;

    IF p_amount_pkr <= 0 THEN
        RAISE EXCEPTION 'Settlement confirmation amount must be positive. Provided: %', p_amount_pkr;
    END IF;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF v_invoice.id IS NULL THEN
        RAISE EXCEPTION 'Commission invoice not found: %', p_invoice_id;
    END IF;

    IF v_invoice.status = 'void' THEN
        RAISE EXCEPTION 'Cannot confirm settlement on a voided invoice.';
    END IF;

    IF v_invoice.status = 'settled' OR v_invoice.amount_settled_pkr >= v_invoice.total_commission_owed_pkr THEN
        RAISE EXCEPTION 'Invoice % is already fully settled.', v_invoice.invoice_number;
    END IF;

    v_remaining := v_invoice.total_commission_owed_pkr - v_invoice.amount_settled_pkr;
    IF p_amount_pkr > v_remaining THEN
        RAISE EXCEPTION 'Settlement amount (PKR %) exceeds remaining unpaid invoice balance of PKR %.', p_amount_pkr, v_remaining;
    END IF;

    -- If a specific report is referenced, validate and link it
    IF p_report_id IS NOT NULL THEN
        SELECT * INTO v_report
        FROM public.commission_payment_reports
        WHERE id = p_report_id AND invoice_id = p_invoice_id
        FOR UPDATE;

        IF v_report.id IS NOT NULL THEN
            v_tid := v_report.transaction_reference;
            v_proof := v_report.screenshot_path;

            UPDATE public.commission_payment_reports
            SET status = 'confirmed',
                admin_note = nullif(trim(p_admin_note), ''),
                reviewed_by = v_caller_id,
                reviewed_at = now()
            WHERE id = p_report_id;
        END IF;
    END IF;

    v_new_settled := v_invoice.amount_settled_pkr + p_amount_pkr;
    IF v_new_settled >= v_invoice.total_commission_owed_pkr THEN
        v_new_status := 'settled'::public.commission_invoice_status;
    ELSE
        v_new_status := 'partially_paid'::public.commission_invoice_status;
    END IF;

    -- Update invoice settlement figures
    UPDATE public.commission_invoices
    SET amount_settled_pkr = v_new_settled,
        status = v_new_status,
        settled_by_admin_id = v_caller_id,
        settled_at = now()
    WHERE id = p_invoice_id;

    -- Insert into immutable commission_payments
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
        v_tid,
        v_proof,
        v_caller_id,
        now(),
        nullif(trim(p_admin_note), ''),
        now()
    )
    RETURNING id INTO v_payment_id;

    -- Recalculate balance and unpause orders if below limit
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_invoice.writer_id);

    SELECT is_orders_paused_for_commission INTO v_is_paused
    FROM public.writer_profiles
    WHERE id = v_invoice.writer_id;

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
        v_invoice.writer_id,
        'commission_settled',
        'کمیشن کلیئرنس کی تصدیق (Commission Cleared)',
        'پلیٹ فارم کی جانب سے انوائس ' || v_invoice.invoice_number || ' کی مد میں PKR ' || p_amount_pkr || ' کی ادائیگی قبول کر لی گئی ہے۔ نیا غیر ادا شدہ بیلنس: PKR ' || v_new_unpaid || '۔',
        'کمیشن کلیئرنس کی تصدیق ہو چکی ہے۔ نیا بیلنس: PKR ' || v_new_unpaid || '۔',
        '/writer/commission/' || p_invoice_id,
        jsonb_build_object('invoice_id', p_invoice_id, 'payment_id', v_payment_id, 'amount_settled', p_amount_pkr),
        false,
        now()
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
        'CONFIRM_COMMISSION_SETTLEMENT',
        'commission_invoices',
        p_invoice_id::text,
        jsonb_build_object('status', v_invoice.status, 'amount_settled_pkr', v_invoice.amount_settled_pkr),
        jsonb_build_object(
            'new_status', v_new_status,
            'amount_confirmed', p_amount_pkr,
            'total_settled_pkr', v_new_settled,
            'writer_unpaid_balance', v_new_unpaid,
            'is_orders_paused', v_is_paused
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'payment_id', v_payment_id,
        'amount_confirmed_pkr', p_amount_pkr,
        'total_settled_pkr', v_new_settled,
        'invoice_status', v_new_status,
        'writer_unpaid_balance_pkr', v_new_unpaid,
        'is_orders_paused', v_is_paused
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_commission_settlement(uuid, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_commission_settlement(uuid, numeric, uuid, text) TO authenticated;


-- 8c. reject_commission_report: Admin rejects an unverified or invalid payment report
CREATE OR REPLACE FUNCTION public.reject_commission_report(
    p_report_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_report record;
    v_invoice record;
    v_has_pending boolean;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can reject commission payment reports.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required to reject a payment report.';
    END IF;

    SELECT * INTO v_report
    FROM public.commission_payment_reports
    WHERE id = p_report_id
    FOR UPDATE;

    IF v_report.id IS NULL THEN
        RAISE EXCEPTION 'Commission payment report not found: %', p_report_id;
    END IF;

    IF v_report.status != 'pending' THEN
        RAISE EXCEPTION 'Only pending payment reports can be rejected (current status: %).', v_report.status;
    END IF;

    UPDATE public.commission_payment_reports
    SET status = 'rejected',
        admin_note = trim(p_reason),
        reviewed_by = v_caller_id,
        reviewed_at = now()
    WHERE id = p_report_id;

    -- Check if any other pending reports exist for this invoice
    SELECT EXISTS (
        SELECT 1 FROM public.commission_payment_reports
        WHERE invoice_id = v_report.invoice_id
          AND status = 'pending'
    ) INTO v_has_pending;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = v_report.invoice_id;

    -- If no more pending reports, revert invoice status back to invoiced (or partially_paid)
    IF NOT v_has_pending AND v_invoice.status = 'payment_reported' THEN
        UPDATE public.commission_invoices
        SET status = CASE
            WHEN amount_settled_pkr > 0 THEN 'partially_paid'::public.commission_invoice_status
            ELSE 'invoiced'::public.commission_invoice_status
        END
        WHERE id = v_report.invoice_id;
    END IF;

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
        v_report.writer_id,
        'commission_report_rejected',
        'کمیشن رپورٹ مسترد (Commission Payment Report Rejected)',
        'انوائس کے لیے آپ کی جمع کردہ کمیشن رسید مسترد کر دی گئی ہے۔ وجہ: ' || trim(p_reason),
        'کمیشن رسید مسترد کر دی گئی ہے۔ وجہ: ' || trim(p_reason),
        '/writer/commission/' || v_report.invoice_id,
        jsonb_build_object('report_id', p_report_id, 'invoice_id', v_report.invoice_id, 'reason', trim(p_reason)),
        false,
        now()
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
        'REJECT_COMMISSION_REPORT',
        'commission_payment_reports',
        p_report_id::text,
        jsonb_build_object('status', 'pending'),
        jsonb_build_object('status', 'rejected', 'reason', trim(p_reason)),
        now()
    );

    RETURN jsonb_build_object('success', true, 'report_id', p_report_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_commission_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_commission_report(uuid, text) TO authenticated;


-- 9. MANUAL COMMISSION ADJUSTMENT (Zero-Gross Ledger Correction)

CREATE OR REPLACE FUNCTION public.record_commission_adjustment(
    p_writer_id uuid,
    p_amount_pkr numeric,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_adjustment_id uuid;
    v_new_unpaid numeric(12,2);
    v_is_paused boolean;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can record commission adjustments.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A justification reason is required for commission adjustments.';
    END IF;

    IF p_amount_pkr = 0 THEN
        RAISE EXCEPTION 'Adjustment amount cannot be zero.';
    END IF;

    -- Insert append-only ledger row maintaining: gross = platform_commission + writer_net
    -- For non-order adjustments: gross = 0.00, comm = +amount, net = -amount
    INSERT INTO public.sales_ledger (
        writer_id,
        entry_type,
        gross_amount_pkr,
        commission_rate,
        platform_commission_pkr,
        writer_net_pkr,
        notes,
        created_at
    ) VALUES (
        p_writer_id,
        'manual_correction',
        0.00,
        0.00,
        p_amount_pkr,
        -1.00 * p_amount_pkr,
        'Manual Commission Adjustment: ' || trim(p_reason),
        now()
    )
    RETURNING id INTO v_adjustment_id;

    -- Reconcile author profile
    v_new_unpaid := public.reconcile_writer_unpaid_commission(p_writer_id);

    SELECT is_orders_paused_for_commission INTO v_is_paused
    FROM public.writer_profiles
    WHERE id = p_writer_id;

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
        'RECORD_COMMISSION_ADJUSTMENT',
        'sales_ledger',
        v_adjustment_id::text,
        NULL,
        jsonb_build_object(
            'writer_id', p_writer_id,
            'adjustment_amount_pkr', p_amount_pkr,
            'reason', trim(p_reason),
            'new_unpaid_balance_pkr', v_new_unpaid,
            'is_orders_paused', v_is_paused
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', v_adjustment_id,
        'adjustment_amount_pkr', p_amount_pkr,
        'new_unpaid_balance_pkr', v_new_unpaid,
        'is_orders_paused', v_is_paused
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_commission_adjustment(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_commission_adjustment(uuid, numeric, text) TO authenticated;


-- 10. APPLY OVERDUE RULES (Admin Review & Execution)

CREATE OR REPLACE FUNCTION public.apply_overdue_rules(p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_grace_days integer;
    v_overdue_list jsonb;
    v_affected_writers jsonb;
    r_writer record;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can inspect or apply overdue rules.';
    END IF;

    SELECT coalesce(overdue_grace_days, 3) INTO v_grace_days
    FROM public.platform_settings
    WHERE id = 1;

    -- Find non-voided, unsettled invoices past due_date + grace days
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'invoice_id', ci.id,
                'invoice_number', ci.invoice_number,
                'writer_id', ci.writer_id,
                'writer_pen_name', wp.pen_name_english,
                'total_commission_owed_pkr', ci.total_commission_owed_pkr,
                'amount_settled_pkr', ci.amount_settled_pkr,
                'remaining_owed_pkr', ci.total_commission_owed_pkr - ci.amount_settled_pkr,
                'due_date', ci.due_date,
                'grace_cutoff', ci.due_date + (v_grace_days || ' days')::interval,
                'days_past_grace', extract(day from (now() - (ci.due_date + (v_grace_days || ' days')::interval)))::integer,
                'status', ci.status
            )
            ORDER BY ci.due_date ASC
        ),
        '[]'::jsonb
    )
    INTO v_overdue_list
    FROM public.commission_invoices ci
    JOIN public.writer_profiles wp ON wp.id = ci.writer_id
    WHERE ci.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid')
      AND ci.due_date IS NOT NULL
      AND now() > (ci.due_date + (v_grace_days || ' days')::interval);

    -- If admin confirms application, pause new orders for all writers with overdue invoices
    IF p_apply THEN
        FOR r_writer IN (
            SELECT DISTINCT ci.writer_id
            FROM public.commission_invoices ci
            WHERE ci.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid')
              AND ci.due_date IS NOT NULL
              AND now() > (ci.due_date + (v_grace_days || ' days')::interval)
        ) LOOP
            UPDATE public.writer_profiles
            SET is_orders_paused_for_commission = true,
                updated_at = now()
            WHERE id = r_writer.writer_id;

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
                r_writer.writer_id,
                'invoice_overdue_orders_paused',
                'انوائس کی عدم ادائیگی: نئے آرڈرز روک دیے گئے (Orders Paused - Overdue Invoice)',
                'آپ کی کمیشن انوائس مہلت کی مدت ختم ہونے کے بعد بھی واجب الادا ہے۔ نئے آرڈرز عارضی طور پر روک دیے گئے ہیں۔',
                'انوائس کی مدت ختم ہونے پر نئے آرڈرز معطل کر دیے گئے ہیں۔',
                '/writer/commission',
                jsonb_build_object('reason', 'overdue_invoice'),
                false,
                now()
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
                'APPLY_OVERDUE_RULES_PAUSE',
                'writer_profiles',
                r_writer.writer_id::text,
                jsonb_build_object('is_orders_paused_for_commission', false),
                jsonb_build_object('is_orders_paused_for_commission', true, 'reason', 'overdue_grace_exceeded'),
                now()
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'applied', p_apply,
        'grace_days', v_grace_days,
        'overdue_invoices_count', jsonb_array_length(v_overdue_list),
        'overdue_invoices', v_overdue_list
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_overdue_rules(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_overdue_rules(boolean) TO authenticated;


-- 11. WRITER READ RPCs (Isolated to auth.uid())

-- 11a. get_my_sales_summary: Writer earnings dashboard overview
CREATE OR REPLACE FUNCTION public.get_my_sales_summary(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_writer record;
    v_sales_count integer := 0;
    v_total_gross numeric(12,2) := 0.00;
    v_total_commission numeric(12,2) := 0.00;
    v_total_net numeric(12,2) := 0.00;
    v_refunds_count integer := 0;
    v_refunds_amount numeric(12,2) := 0.00;
    v_unpaid_balance numeric(12,2) := 0.00;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_writer
    FROM public.writer_profiles
    WHERE id = v_caller_id;

    IF v_writer.id IS NULL THEN
        RAISE EXCEPTION 'Writer profile not found.';
    END IF;

    SELECT
        count(CASE WHEN entry_type = 'sale_verified' THEN 1 END),
        coalesce(sum(CASE WHEN entry_type = 'sale_verified' THEN gross_amount_pkr ELSE 0.00 END), 0.00),
        coalesce(sum(platform_commission_pkr), 0.00),
        coalesce(sum(writer_net_pkr), 0.00),
        count(CASE WHEN entry_type = 'refund_adjustment' THEN 1 END),
        coalesce(sum(CASE WHEN entry_type = 'refund_adjustment' THEN gross_amount_pkr ELSE 0.00 END), 0.00)
    INTO v_sales_count, v_total_gross, v_total_commission, v_total_net, v_refunds_count, v_refunds_amount
    FROM public.sales_ledger
    WHERE writer_id = v_caller_id
      AND (p_from IS NULL OR created_at >= p_from)
      AND (p_to IS NULL OR created_at <= p_to);

    v_unpaid_balance := public.get_writer_unpaid_commission(v_caller_id);

    RETURN jsonb_build_object(
        'writer_id', v_caller_id,
        'pen_name_english', v_writer.pen_name_english,
        'pen_name_urdu', v_writer.pen_name_urdu,
        'sales_count', v_sales_count,
        'total_gross_pkr', v_total_gross,
        'total_commission_pkr', v_total_commission,
        'total_net_pkr', v_total_net,
        'refunds_count', v_refunds_count,
        'refunds_amount_pkr', v_refunds_amount,
        'unpaid_commission_balance_pkr', v_unpaid_balance,
        'unpaid_commission_limit_pkr', coalesce(v_writer.unpaid_commission_limit, 5000.00),
        'is_orders_paused', coalesce(v_writer.is_orders_paused_for_commission, false)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_sales_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_sales_summary(timestamptz, timestamptz) TO authenticated;


-- 11b. get_my_ledger: Paginated ledger lines with reader privacy protection
CREATE OR REPLACE FUNCTION public.get_my_ledger(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_entry_type text DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_entries jsonb;
    v_total integer := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT count(*)
    INTO v_total
    FROM public.sales_ledger l
    WHERE l.writer_id = v_caller_id
      AND (p_from IS NULL OR l.created_at >= p_from)
      AND (p_to IS NULL OR l.created_at <= p_to)
      AND (p_entry_type IS NULL OR l.entry_type = p_entry_type);

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', l.id,
                'order_id', l.order_id,
                'order_number', o.order_number,
                'novel_title', coalesce(o.novel_title_snapshot, n.title_english, n.title_urdu, 'Correction'),
                'reader_display_name', coalesce(p.full_name, 'Reader'),
                'entry_type', l.entry_type,
                'gross_amount_pkr', l.gross_amount_pkr,
                'commission_rate', l.commission_rate,
                'platform_commission_pkr', l.platform_commission_pkr,
                'writer_net_pkr', l.writer_net_pkr,
                'invoice_number', ci.invoice_number,
                'notes', l.notes,
                'created_at', l.created_at
            )
            ORDER BY l.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_entries
    FROM (
        SELECT * FROM public.sales_ledger
        WHERE writer_id = v_caller_id
          AND (p_from IS NULL OR created_at >= p_from)
          AND (p_to IS NULL OR created_at <= p_to)
          AND (p_entry_type IS NULL OR entry_type = p_entry_type)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) l
    LEFT JOIN public.orders o ON o.id = l.order_id
    LEFT JOIN public.profiles p ON p.id = l.reader_id
    LEFT JOIN public.novels n ON n.id = l.novel_id
    LEFT JOIN public.commission_invoice_lines cil ON cil.ledger_entry_id = l.id AND cil.is_voided = false
    LEFT JOIN public.commission_invoices ci ON ci.id = cil.invoice_id AND ci.status != 'void';

    RETURN jsonb_build_object(
        'total_count', v_total,
        'entries', v_entries
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_ledger(timestamptz, timestamptz, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ledger(timestamptz, timestamptz, text, integer, integer) TO authenticated;


-- 11c. get_my_invoices: Author statements list
CREATE OR REPLACE FUNCTION public.get_my_invoices()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoices jsonb;
    v_grace_days integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT coalesce(overdue_grace_days, 3) INTO v_grace_days
    FROM public.platform_settings
    WHERE id = 1;

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', ci.id,
                'invoice_number', ci.invoice_number,
                'period_start', ci.period_start,
                'period_end', ci.period_end,
                'total_sales_count', ci.total_sales_count,
                'total_gross_pkr', ci.total_gross_pkr,
                'total_commission_owed_pkr', ci.total_commission_owed_pkr,
                'amount_settled_pkr', ci.amount_settled_pkr,
                'remaining_owed_pkr', ci.total_commission_owed_pkr - ci.amount_settled_pkr,
                'status', ci.status,
                'due_date', ci.due_date,
                'is_overdue', (ci.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid') AND ci.due_date IS NOT NULL AND now() > (ci.due_date + (v_grace_days || ' days')::interval)),
                'created_at', ci.created_at
            )
            ORDER BY ci.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_invoices
    FROM public.commission_invoices ci
    WHERE ci.writer_id = v_caller_id;

    RETURN v_invoices;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_invoices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_invoices() TO authenticated;


-- 11d. get_my_invoice: Detailed statement view with lines, confirmed payments and reports
CREATE OR REPLACE FUNCTION public.get_my_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_invoice record;
    v_lines jsonb;
    v_payments jsonb;
    v_reports jsonb;
    v_grace_days integer;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT coalesce(overdue_grace_days, 3) INTO v_grace_days
    FROM public.platform_settings
    WHERE id = 1;

    SELECT * INTO v_invoice
    FROM public.commission_invoices
    WHERE id = p_invoice_id;

    IF v_invoice.id IS NULL THEN
        RAISE EXCEPTION 'Commission invoice not found: %', p_invoice_id;
    END IF;

    IF v_invoice.writer_id != v_caller_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: You can only view your own commission invoices.';
    END IF;

    -- Lines (Sales ledger details)
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', cil.id,
                'ledger_entry_id', l.id,
                'order_number', o.order_number,
                'novel_title', coalesce(o.novel_title_snapshot, n.title_english, n.title_urdu, 'Correction'),
                'entry_type', l.entry_type,
                'gross_amount_pkr', l.gross_amount_pkr,
                'commission_rate', l.commission_rate,
                'commission_pkr', cil.commission_pkr,
                'writer_net_pkr', l.writer_net_pkr,
                'created_at', l.created_at
            )
            ORDER BY l.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_lines
    FROM public.commission_invoice_lines cil
    JOIN public.sales_ledger l ON l.id = cil.ledger_entry_id
    LEFT JOIN public.orders o ON o.id = l.order_id
    LEFT JOIN public.novels n ON n.id = l.novel_id
    WHERE cil.invoice_id = p_invoice_id;

    -- Confirmed Payments
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'amount_pkr', amount_pkr,
                'transaction_reference', transaction_reference,
                'confirmed_at', confirmed_at,
                'notes', notes
            )
            ORDER BY confirmed_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_payments
    FROM public.commission_payments
    WHERE invoice_id = p_invoice_id;

    -- Writer Submitted Payment Reports
    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'amount_pkr', amount_pkr,
                'transaction_reference', transaction_reference,
                'screenshot_path', screenshot_path,
                'writer_note', writer_note,
                'status', status,
                'is_duplicate_tid', is_duplicate_tid,
                'admin_note', admin_note,
                'created_at', created_at,
                'reviewed_at', reviewed_at
            )
            ORDER BY created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_reports
    FROM public.commission_payment_reports
    WHERE invoice_id = p_invoice_id;

    RETURN jsonb_build_object(
        'id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'writer_id', v_invoice.writer_id,
        'period_start', v_invoice.period_start,
        'period_end', v_invoice.period_end,
        'total_sales_count', v_invoice.total_sales_count,
        'total_gross_pkr', v_invoice.total_gross_pkr,
        'total_commission_owed_pkr', v_invoice.total_commission_owed_pkr,
        'amount_settled_pkr', v_invoice.amount_settled_pkr,
        'remaining_owed_pkr', v_invoice.total_commission_owed_pkr - v_invoice.amount_settled_pkr,
        'status', v_invoice.status,
        'due_date', v_invoice.due_date,
        'is_overdue', (v_invoice.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid') AND v_invoice.due_date IS NOT NULL AND now() > (v_invoice.due_date + (v_grace_days || ' days')::interval)),
        'voided_at', v_invoice.voided_at,
        'void_reason', v_invoice.void_reason,
        'created_at', v_invoice.created_at,
        'lines', v_lines,
        'payments', v_payments,
        'reports', v_reports
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_invoice(uuid) TO authenticated;


-- 12. ADMIN COMMISSION INSPECTION RPCs

-- 12a. admin_commission_overview: High-level financial standing across all approved authors
CREATE OR REPLACE FUNCTION public.admin_commission_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_writers jsonb;
    v_grace_days integer;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can inspect commission overview.';
    END IF;

    SELECT coalesce(overdue_grace_days, 3) INTO v_grace_days
    FROM public.platform_settings
    WHERE id = 1;

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'writer_id', wp.id,
                'pen_name_english', wp.pen_name_english,
                'pen_name_urdu', wp.pen_name_urdu,
                'username', p.username,
                'custom_commission_rate', wp.custom_commission_rate,
                'unpaid_commission_balance_pkr', coalesce(wp.current_unpaid_commission, 0.00),
                'unpaid_commission_limit_pkr', coalesce(wp.unpaid_commission_limit, 5000.00),
                'percent_of_limit', round((coalesce(wp.current_unpaid_commission, 0.00) / coalesce(wp.unpaid_commission_limit, 5000.00)) * 100, 1),
                'is_orders_paused', coalesce(wp.is_orders_paused_for_commission, false),
                'total_accrued_pkr', (
                    SELECT coalesce(sum(l.platform_commission_pkr), 0.00)
                    FROM public.sales_ledger l
                    WHERE l.writer_id = wp.id
                ),
                'total_settled_pkr', (
                    SELECT coalesce(sum(cp.amount_pkr), 0.00)
                    FROM public.commission_payments cp
                    WHERE cp.writer_id = wp.id
                ),
                'pending_reports_count', (
                    SELECT count(*)
                    FROM public.commission_payment_reports cpr
                    WHERE cpr.writer_id = wp.id AND cpr.status = 'pending'
                ),
                'overdue_invoices_count', (
                    SELECT count(*)
                    FROM public.commission_invoices ci
                    WHERE ci.writer_id = wp.id
                      AND ci.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid')
                      AND ci.due_date IS NOT NULL
                      AND now() > (ci.due_date + (v_grace_days || ' days')::interval)
                )
            )
            ORDER BY wp.current_unpaid_commission DESC
        ),
        '[]'::jsonb
    )
    INTO v_writers
    FROM public.writer_profiles wp
    JOIN public.profiles p ON p.id = wp.id
    WHERE wp.status = 'approved';

    RETURN v_writers;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_commission_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_commission_overview() TO authenticated;


-- 12b. admin_list_invoices: Paginated admin listing
CREATE OR REPLACE FUNCTION public.admin_list_invoices(
    p_status text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_only_overdue boolean DEFAULT false,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_total integer := 0;
    v_invoices jsonb;
    v_grace_days integer;
    v_search text;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can list commission invoices.';
    END IF;

    SELECT coalesce(overdue_grace_days, 3) INTO v_grace_days
    FROM public.platform_settings
    WHERE id = 1;

    v_search := nullif(trim(p_search), '');

    SELECT count(*)
    INTO v_total
    FROM public.commission_invoices ci
    JOIN public.writer_profiles wp ON wp.id = ci.writer_id
    WHERE (p_status IS NULL OR ci.status::text = p_status)
      AND (v_search IS NULL OR (ci.invoice_number ILIKE '%' || v_search || '%' OR wp.pen_name_english ILIKE '%' || v_search || '%'))
      AND (NOT p_only_overdue OR (
          ci.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid')
          AND ci.due_date IS NOT NULL
          AND now() > (ci.due_date + (v_grace_days || ' days')::interval)
      ));

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', ci.id,
                'invoice_number', ci.invoice_number,
                'writer_id', ci.writer_id,
                'writer_pen_name', wp.pen_name_english,
                'writer_pen_name_urdu', wp.pen_name_urdu,
                'period_start', ci.period_start,
                'period_end', ci.period_end,
                'total_sales_count', ci.total_sales_count,
                'total_gross_pkr', ci.total_gross_pkr,
                'total_commission_owed_pkr', ci.total_commission_owed_pkr,
                'amount_settled_pkr', ci.amount_settled_pkr,
                'remaining_owed_pkr', ci.total_commission_owed_pkr - ci.amount_settled_pkr,
                'status', ci.status,
                'due_date', ci.due_date,
                'is_overdue', (
                    ci.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid')
                    AND ci.due_date IS NOT NULL
                    AND now() > (ci.due_date + (v_grace_days || ' days')::interval)
                ),
                'created_at', ci.created_at
            )
            ORDER BY ci.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_invoices
    FROM (
        SELECT ci.*, wp.pen_name_english, wp.pen_name_urdu
        FROM public.commission_invoices ci
        JOIN public.writer_profiles wp ON wp.id = ci.writer_id
        WHERE (p_status IS NULL OR ci.status::text = p_status)
          AND (v_search IS NULL OR (ci.invoice_number ILIKE '%' || v_search || '%' OR wp.pen_name_english ILIKE '%' || v_search || '%'))
          AND (NOT p_only_overdue OR (
              ci.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid')
              AND ci.due_date IS NOT NULL
              AND now() > (ci.due_date + (v_grace_days || ' days')::interval)
          ))
        ORDER BY ci.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) ci
    JOIN public.writer_profiles wp ON wp.id = ci.writer_id;

    RETURN jsonb_build_object(
        'total_count', v_total,
        'invoices', v_invoices
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_invoices(text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_invoices(text, text, boolean, integer, integer) TO authenticated;


-- 12c. admin_list_commission_reports: Inspection queue of writer settlement claims
CREATE OR REPLACE FUNCTION public.admin_list_commission_reports(
    p_status text DEFAULT 'pending',
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_total integer := 0;
    v_reports jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can inspect commission payment reports.';
    END IF;

    SELECT count(*)
    INTO v_total
    FROM public.commission_payment_reports cpr
    WHERE (p_status IS NULL OR p_status = 'all' OR cpr.status = p_status);

    SELECT coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', cpr.id,
                'invoice_id', cpr.invoice_id,
                'invoice_number', ci.invoice_number,
                'writer_id', cpr.writer_id,
                'writer_pen_name', wp.pen_name_english,
                'writer_username', p.username,
                'amount_pkr', cpr.amount_pkr,
                'transaction_reference', cpr.transaction_reference,
                'screenshot_path', cpr.screenshot_path,
                'writer_note', cpr.writer_note,
                'status', cpr.status,
                'is_duplicate_tid', cpr.is_duplicate_tid,
                'admin_note', cpr.admin_note,
                'created_at', cpr.created_at,
                'reviewed_at', cpr.reviewed_at
            )
            ORDER BY cpr.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_reports
    FROM (
        SELECT * FROM public.commission_payment_reports
        WHERE (p_status IS NULL OR p_status = 'all' OR status = p_status)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) cpr
    JOIN public.commission_invoices ci ON ci.id = cpr.invoice_id
    JOIN public.writer_profiles wp ON wp.id = cpr.writer_id
    JOIN public.profiles p ON p.id = cpr.writer_id;

    RETURN jsonb_build_object(
        'total_count', v_total,
        'reports', v_reports
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_commission_reports(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_commission_reports(text, integer, integer) TO authenticated;


-- 13. STORAGE POLICIES UPDATE FOR COMMISSION PROOFS
-- Allow writers with partially_paid invoices to continue uploading settlement proofs
DO $$
BEGIN
    DROP POLICY IF EXISTS "payment_proofs_reader_insert" ON storage.objects;

    CREATE POLICY "payment_proofs_reader_insert"
        ON storage.objects FOR INSERT
        WITH CHECK (
            bucket_id = 'payment-proofs' AND (
                public.is_admin() OR
                EXISTS (
                    SELECT 1 FROM public.orders o
                    WHERE o.id::text = (storage.foldername(name))[1]
                      AND o.reader_id = auth.uid()
                      AND o.status IN ('pending_payment', 'rejected')
                ) OR
                EXISTS (
                    SELECT 1 FROM public.commission_invoices ci
                    WHERE ci.id::text = (storage.foldername(name))[1]
                      AND ci.writer_id = auth.uid()
                      AND ci.status IN ('invoiced', 'open', 'payment_reported', 'partially_paid')
                )
            )
        );
END $$;
