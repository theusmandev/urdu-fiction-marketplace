-- ==============================================================================
-- UNB Premium — Migration 0034: "Tip Jar" / Reader Appreciation (Phase 1)
-- Description:
--   1. platform_settings:
--      - tips_enabled (kill switch, default true)
--      - tip_min_pkr (default 20, check >= 1 and <= 5000)
--      - tip_max_pkr (default 5000, check >= 1 and <= 50000)
--      - max_tips_per_hour (default 5, check >= 1 and <= 100)
--      - tip_daily_cap_pkr_per_reader (default 10000, check >= 100)
--      - tip_confirm_reminder_hours (default 48, check >= 1 and <= 168)
--   2. writer_payment_methods:
--      - use_for_tips (boolean not null default true)
--   3. writer_tip_settings:
--      - Per-writer opt-in, thank-you message, presets, custom bounds
--   4. tips:
--      - Isolated direct-payment tip ledger (TIP-YYYYMMDD-XXXXXXXX)
--      - 0% platform commission; never touches sales_ledger, commission, or entitlements
--      - At most 3 open tips per (reader_id, writer_id) via partial unique index
--   5. RPCs:
--      - get_tip_options: masked options, eligibility check
--      - set_my_tip_settings & get_my_tip_settings: writer configuration
--      - create_tip: rate-limited, capped, snapshots payment instructions
--      - submit_tip_payment: TID format check, duplicate TID detection, review flags
--      - cancel_tip: reader cancellation before submission
--      - confirm_tip_received: writer/admin confirmation with thank-you reply
--      - mark_tip_not_received: writer/admin rejection note
--      - get_my_tips: reader history
--      - get_my_received_tips: writer queue with privacy protection
--      - get_my_tip_summary: writer-only confirmed tips analytics
--      - hide_tip_message, report_tip_message, admin_remove_tip_message
--      - admin_list_tips & admin_get_tip
--      - admin_review_tip: records review outcome in audit log
--      - update_platform_settings: extended for tip controls
--      - run_scheduled_reminders: extended for tip reminders & 7-day expiry
--   6. Storage:
--      - Extends payment-proofs policies for '<tip_id>/' paths
--   7. Security & Hardening:
--      - Strict search_path = '' lockdown
--      - No qualified SQL syntax constructs (btrim, coalesce, now, greatest, least)
--      - Direct table permissions REVOKED from anon and authenticated
--      - Trigger execution REVOKED
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: EXTEND PLATFORM_SETTINGS & WRITER_PAYMENT_METHODS
-- ------------------------------------------------------------------------------

ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS tips_enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS tip_min_pkr integer NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS tip_max_pkr integer NOT NULL DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS max_tips_per_hour integer NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS tip_daily_cap_pkr_per_reader integer NOT NULL DEFAULT 10000,
    ADD COLUMN IF NOT EXISTS tip_confirm_reminder_hours integer NOT NULL DEFAULT 48;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_tip_min_pkr') THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_tip_min_pkr CHECK (tip_min_pkr >= 1 AND tip_min_pkr <= 5000);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_tip_max_pkr') THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_tip_max_pkr CHECK (tip_max_pkr >= 1 AND tip_max_pkr <= 50000);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_tip_min_max') THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_tip_min_max CHECK (tip_min_pkr <= tip_max_pkr);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_max_tips_per_hour') THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_max_tips_per_hour CHECK (max_tips_per_hour >= 1 AND max_tips_per_hour <= 100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_tip_daily_cap') THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_tip_daily_cap CHECK (tip_daily_cap_pkr_per_reader >= 100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_settings_tip_confirm_reminder') THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_tip_confirm_reminder CHECK (tip_confirm_reminder_hours >= 1 AND tip_confirm_reminder_hours <= 168);
    END IF;
END $$;

ALTER TABLE public.writer_payment_methods
    ADD COLUMN IF NOT EXISTS use_for_tips boolean NOT NULL DEFAULT true;

-- ------------------------------------------------------------------------------
-- SECTION 2: TABLES (writer_tip_settings & tips)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.writer_tip_settings (
    writer_id uuid PRIMARY KEY REFERENCES public.writer_profiles(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    thank_you_message text NOT NULL DEFAULT 'شکریہ! آپ کی پزیرائی اور سپورٹ کا بہت شکریہ۔ یہ میرے لیے لکھنے کا سب سے بڑا حوصلہ ہے۔',
    preset_amounts integer[] NOT NULL DEFAULT '{100,250,500}'::integer[],
    min_amount integer NULL,
    max_amount integer NULL,
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT chk_writer_tip_settings_thank_you_length CHECK (char_length(thank_you_message) <= 500),
    CONSTRAINT chk_writer_tip_settings_min_amount CHECK (min_amount IS NULL OR (min_amount >= 1 AND min_amount <= 50000)),
    CONSTRAINT chk_writer_tip_settings_max_amount CHECK (max_amount IS NULL OR (max_amount >= 1 AND max_amount <= 50000)),
    CONSTRAINT chk_writer_tip_settings_min_max CHECK ((min_amount IS NULL OR max_amount IS NULL) OR min_amount <= max_amount)
);

CREATE TABLE IF NOT EXISTS public.tips (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    tip_number text NOT NULL UNIQUE,
    reader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    writer_id uuid NOT NULL REFERENCES public.writer_profiles(id) ON DELETE RESTRICT,
    novel_id uuid NULL REFERENCES public.novels(id) ON DELETE SET NULL,
    chapter_id uuid NULL REFERENCES public.chapters(id) ON DELETE SET NULL,
    amount_pkr numeric(10,2) NOT NULL,
    currency text NOT NULL DEFAULT 'PKR',
    status text NOT NULL DEFAULT 'pending_payment',
    payment_instructions_snapshot jsonb NOT NULL,
    payment_method_id uuid NULL REFERENCES public.writer_payment_methods(id) ON DELETE SET NULL,
    transaction_reference_tid text NULL,
    normalized_tid text GENERATED ALWAYS AS (upper(regexp_replace(transaction_reference_tid, '[^a-zA-Z0-9]', '', 'g'))) STORED,
    is_duplicate_tid_flagged boolean NOT NULL DEFAULT false,
    screenshot_path text NULL,
    sender_account_name text NULL,
    reader_message text NULL,
    is_anonymous boolean NOT NULL DEFAULT false,
    message_status text NOT NULL DEFAULT 'visible',
    writer_reply text NULL,
    review_flag text NULL,
    open_slot integer NULL,
    confirmed_at timestamptz NULL,
    not_received_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT chk_tips_amount_positive CHECK (amount_pkr > 0),
    CONSTRAINT chk_tips_currency CHECK (currency = 'PKR'),
    CONSTRAINT chk_tips_status CHECK (status IN ('pending_payment','payment_submitted','confirmed','not_received','cancelled','expired')),
    CONSTRAINT chk_tips_message_status CHECK (message_status IN ('visible','hidden_by_writer','removed_by_admin')),
    CONSTRAINT chk_tips_sender_name_length CHECK (sender_account_name IS NULL OR char_length(sender_account_name) <= 100),
    CONSTRAINT chk_tips_reader_message_length CHECK (reader_message IS NULL OR char_length(reader_message) <= 300),
    CONSTRAINT chk_tips_writer_reply_length CHECK (writer_reply IS NULL OR char_length(writer_reply) <= 500),
    CONSTRAINT chk_tips_no_self_tip CHECK (reader_id != writer_id),
    CONSTRAINT chk_tips_open_slot CHECK (open_slot IS NULL OR (open_slot >= 1 AND open_slot <= 3))
);

-- Partial unique index strictly enforcing at most 3 open tips per (reader_id, writer_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tips_reader_writer_open_slot
    ON public.tips (reader_id, writer_id, open_slot)
    WHERE status IN ('pending_payment', 'payment_submitted');

CREATE INDEX IF NOT EXISTS idx_tips_reader ON public.tips (reader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_writer ON public.tips (writer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_writer_status ON public.tips (writer_id, status);
CREATE INDEX IF NOT EXISTS idx_tips_normalized_tid ON public.tips (normalized_tid) WHERE normalized_tid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tips_review_flag ON public.tips (review_flag) WHERE review_flag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tips_created_at ON public.tips (created_at DESC);

-- ------------------------------------------------------------------------------
-- SECTION 3: TRIGGERS FOR UPDATED_AT
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_tips_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tips_updated_at ON public.tips;
CREATE TRIGGER trg_tips_updated_at
    BEFORE UPDATE ON public.tips
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_tips_set_updated_at();

DROP TRIGGER IF EXISTS trg_writer_tip_settings_updated_at ON public.writer_tip_settings;
CREATE TRIGGER trg_writer_tip_settings_updated_at
    BEFORE UPDATE ON public.writer_tip_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_tips_set_updated_at();

-- Revoke execute on trigger function (Guard 4 compliance)
REVOKE ALL ON FUNCTION public.trg_tips_set_updated_at() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 4: ROW LEVEL SECURITY & DIRECT PRIVILEGE REVOCATIONS
-- ------------------------------------------------------------------------------

ALTER TABLE public.writer_tip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.writer_tip_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tips FROM PUBLIC, anon, authenticated;

-- Direct client select policies for defense-in-depth
DROP POLICY IF EXISTS "writer_tip_settings_select_policy" ON public.writer_tip_settings;
CREATE POLICY "writer_tip_settings_select_policy" ON public.writer_tip_settings
    FOR SELECT
    TO authenticated
    USING (writer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "tips_select_policy" ON public.tips;
CREATE POLICY "tips_select_policy" ON public.tips
    FOR SELECT
    TO authenticated
    USING (reader_id = auth.uid() OR writer_id = auth.uid() OR public.is_admin());

-- ------------------------------------------------------------------------------
-- ------------------------------------------------------------------------------
-- SECTION 5: STORAGE HELPER & POLICIES FOR PAYMENT-PROOFS (TIP PROOFS)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_tip_proof(p_folder_name text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tip_id uuid;
    v_allowed boolean;
BEGIN
    IF p_folder_name IS NULL OR p_folder_name = '' THEN
        RETURN false;
    END IF;

    BEGIN
        v_tip_id := p_folder_name::uuid;
    EXCEPTION WHEN others THEN
        RETURN false;
    END;

    IF public.is_admin() THEN
        RETURN true;
    END IF;

    IF p_action = 'upload' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.tips t
            WHERE t.id = v_tip_id
              AND t.reader_id = auth.uid()
              AND t.status = 'pending_payment'
        ) INTO v_allowed;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.tips t
            WHERE t.id = v_tip_id
              AND (t.reader_id = auth.uid() OR t.writer_id = auth.uid())
        ) INTO v_allowed;
    END IF;

    RETURN coalesce(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_tip_proof(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_tip_proof(text, text) TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        DROP POLICY IF EXISTS "authenticated_tip_proofs_upload" ON storage.objects;
        CREATE POLICY "authenticated_tip_proofs_upload" ON storage.objects
            FOR INSERT
            TO authenticated
            WITH CHECK (
                bucket_id = 'payment-proofs' AND
                public.can_access_tip_proof((storage.foldername(name))[1], 'upload')
            );

        DROP POLICY IF EXISTS "authenticated_tip_proofs_select" ON storage.objects;
        CREATE POLICY "authenticated_tip_proofs_select" ON storage.objects
            FOR SELECT
            TO authenticated
            USING (
                bucket_id = 'payment-proofs' AND
                public.can_access_tip_proof((storage.foldername(name))[1], 'select')
            );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- SECTION 6: RPC FUNCTIONS
-- ------------------------------------------------------------------------------

-- 6.1 get_tip_options: Fetches publicly visible tip configuration with masked labels
CREATE OR REPLACE FUNCTION public.get_tip_options(
    p_writer_id uuid DEFAULT NULL,
    p_novel_id uuid DEFAULT NULL,
    p_chapter_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_writer_id uuid := p_writer_id;
    v_caller_id        uuid;
    v_settings         record;
    v_writer           record;
    v_tip_settings     record;
    v_methods          jsonb;
    v_can_tip          boolean := true;
    v_reason           text := NULL;
    v_pen_name         text;
    v_pen_name_urdu    text;
    v_min              integer;
    v_max              integer;
    v_presets          integer[];
    v_thank_you        text;
BEGIN
    v_caller_id := auth.uid();

    -- Resolve writer_id from novel_id if omitted
    IF v_target_writer_id IS NULL AND p_novel_id IS NOT NULL THEN
        SELECT writer_id INTO v_target_writer_id
        FROM public.novels
        WHERE id = p_novel_id;
    END IF;

    IF v_target_writer_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'tips_enabled', false,
            'can_tip', false,
            'reason', 'Writer not found'
        );
    END IF;

    -- 1. Check platform kill-switch
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
    IF v_settings.id IS NULL OR coalesce(v_settings.tips_enabled, true) = false THEN
        RETURN pg_catalog.jsonb_build_object(
            'tips_enabled', false,
            'can_tip', false,
            'reason', 'Tips are currently disabled on the platform'
        );
    END IF;

    -- 2. Check writer profile exists and is approved / not suspended
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_target_writer_id;
    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RETURN pg_catalog.jsonb_build_object(
            'tips_enabled', true,
            'can_tip', false,
            'reason', 'Author is currently not eligible to receive tips'
        );
    END IF;

    -- 3. Check writer tip settings
    SELECT * INTO v_tip_settings FROM public.writer_tip_settings WHERE writer_id = v_target_writer_id;
    IF v_tip_settings.writer_id IS NULL OR coalesce(v_tip_settings.enabled, false) = false THEN
        RETURN pg_catalog.jsonb_build_object(
            'tips_enabled', true,
            'writer_enabled', false,
            'can_tip', false,
            'reason', 'Author has not enabled tips'
        );
    END IF;

    -- 4. Check caller conditions
    IF v_caller_id IS NULL THEN
        v_can_tip := false;
        v_reason := 'Sign in required to say thanks';
    ELSIF v_caller_id = v_target_writer_id THEN
        v_can_tip := false;
        v_reason := 'Authors cannot tip themselves';
    END IF;

    -- 5. Calculate effective min, max, presets
    v_min := coalesce(v_tip_settings.min_amount, v_settings.tip_min_pkr, 20);
    v_max := coalesce(v_tip_settings.max_amount, v_settings.tip_max_pkr, 5000);
    v_presets := coalesce(v_tip_settings.preset_amounts, '{100,250,500}'::integer[]);
    v_thank_you := coalesce(v_tip_settings.thank_you_message, 'شکریہ! آپ کی پزیرائی کا بہت شکریہ۔');
    v_pen_name := coalesce(v_writer.pen_name_english, v_writer.pen_name_urdu, 'Author');
    v_pen_name_urdu := coalesce(v_writer.pen_name_urdu, v_writer.pen_name_english, 'مصنف');

    -- 6. Collect masked payment methods (NO full account numbers)
    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', m.id,
                'method_type', m.method_type,
                'bank_name', m.bank_name,
                'masked_label', m.method_type || ' (•••• ' || pg_catalog.right(m.account_number_or_iban, 4) || ')',
                'instructions_note', m.instructions_note
            ) ORDER BY m.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_methods
    FROM public.writer_payment_methods m
    WHERE m.writer_id = v_target_writer_id
      AND m.is_active = true
      AND m.use_for_tips = true;

    IF jsonb_array_length(v_methods) = 0 THEN
        v_can_tip := false;
        v_reason := 'Author has no active payment accounts configured for tips';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'tips_enabled', true,
        'writer_enabled', true,
        'writer_id', v_target_writer_id,
        'writer_pen_name', v_pen_name,
        'writer_pen_name_urdu', v_pen_name_urdu,
        'thank_you_message', v_thank_you,
        'preset_amounts', v_presets,
        'min_amount_pkr', v_min,
        'max_amount_pkr', v_max,
        'can_tip', v_can_tip,
        'reason', v_reason,
        'payment_methods', v_methods
    );
END;
$$;

-- 6.2 set_my_tip_settings: Writer configures own tip settings
CREATE OR REPLACE FUNCTION public.set_my_tip_settings(
    p_enabled boolean,
    p_thank_you_message text,
    p_preset_amounts integer[],
    p_min_amount integer DEFAULT NULL,
    p_max_amount integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_writer_id      uuid;
    v_writer         record;
    v_cleaned_msg    text;
    v_presets        integer[];
    v_p              integer;
    v_min            integer;
    v_max            integer;
    v_res            record;
BEGIN
    v_writer_id := auth.uid();
    IF v_writer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_writer_id;
    IF v_writer.id IS NULL OR v_writer.status != 'approved' THEN
        RAISE EXCEPTION 'Only approved authors can configure tips.';
    END IF;

    -- Validate message
    v_cleaned_msg := pg_catalog.btrim(coalesce(p_thank_you_message, ''));
    IF pg_catalog.length(v_cleaned_msg) = 0 THEN
        v_cleaned_msg := 'شکریہ! آپ کی پزیرائی اور سپورٹ کا بہت شکریہ۔ یہ میرے لیے لکھنے کا سب سے بڑا حوصلہ ہے۔';
    ELSIF pg_catalog.length(v_cleaned_msg) > 500 THEN
        RAISE EXCEPTION 'Thank you message cannot exceed 500 characters.';
    END IF;

    -- Validate min/max if provided
    v_min := p_min_amount;
    v_max := p_max_amount;
    IF v_min IS NOT NULL AND (v_min < 1 OR v_min > 50000) THEN
        RAISE EXCEPTION 'Minimum amount must be between 1 and 50,000 PKR.';
    END IF;
    IF v_max IS NOT NULL AND (v_max < 1 OR v_max > 50000) THEN
        RAISE EXCEPTION 'Maximum amount must be between 1 and 50,000 PKR.';
    END IF;
    IF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min > v_max THEN
        RAISE EXCEPTION 'Minimum amount cannot exceed maximum amount.';
    END IF;

    -- Validate presets (array of 1 to 4 integers)
    IF p_preset_amounts IS NULL OR pg_catalog.array_length(p_preset_amounts, 1) IS NULL OR pg_catalog.array_length(p_preset_amounts, 1) = 0 THEN
        v_presets := '{100,250,500}'::integer[];
    ELSE
        IF pg_catalog.array_length(p_preset_amounts, 1) > 4 THEN
            RAISE EXCEPTION 'At most 4 preset amounts are allowed.';
        END IF;

        FOREACH v_p IN ARRAY p_preset_amounts
        LOOP
            IF v_p IS NULL OR v_p < 1 THEN
                RAISE EXCEPTION 'Preset amounts must be positive integers.';
            END IF;
            IF v_min IS NOT NULL AND v_p < v_min THEN
                RAISE EXCEPTION 'Preset amount % cannot be less than minimum amount %.', v_p, v_min;
            END IF;
            IF v_max IS NOT NULL AND v_p > v_max THEN
                RAISE EXCEPTION 'Preset amount % cannot exceed maximum amount %.', v_p, v_max;
            END IF;
        END LOOP;
        v_presets := p_preset_amounts;
    END IF;

    INSERT INTO public.writer_tip_settings (
        writer_id, enabled, thank_you_message, preset_amounts, min_amount, max_amount, updated_at
    ) VALUES (
        v_writer_id, p_enabled, v_cleaned_msg, v_presets, v_min, v_max, pg_catalog.now()
    )
    ON CONFLICT (writer_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        thank_you_message = EXCLUDED.thank_you_message,
        preset_amounts = EXCLUDED.preset_amounts,
        min_amount = EXCLUDED.min_amount,
        max_amount = EXCLUDED.max_amount,
        updated_at = pg_catalog.now()
    RETURNING * INTO v_res;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_writer_id, 'writer', 'update_tip_settings', 'writer_tip_settings', v_writer_id::text,
        pg_catalog.to_jsonb(v_res), pg_catalog.now()
    );

    RETURN pg_catalog.to_jsonb(v_res);
END;
$$;

-- 6.3 get_my_tip_settings: Writer fetches own tip settings & accounts
CREATE OR REPLACE FUNCTION public.get_my_tip_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_writer_id  uuid;
    v_settings   record;
    v_methods    jsonb;
BEGIN
    v_writer_id := auth.uid();
    IF v_writer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_settings FROM public.writer_tip_settings WHERE writer_id = v_writer_id;

    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', m.id,
                'method_type', m.method_type,
                'account_title', m.account_title,
                'account_number_or_iban', m.account_number_or_iban,
                'bank_name', m.bank_name,
                'instructions_note', m.instructions_note,
                'is_active', m.is_active,
                'use_for_tips', m.use_for_tips
            ) ORDER BY m.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_methods
    FROM public.writer_payment_methods m
    WHERE m.writer_id = v_writer_id;

    RETURN pg_catalog.jsonb_build_object(
        'writer_id', v_writer_id,
        'enabled', coalesce(v_settings.enabled, false),
        'thank_you_message', coalesce(v_settings.thank_you_message, 'شکریہ! آپ کی پزیرائی اور سپورٹ کا بہت شکریہ۔ یہ میرے لیے لکھنے کا سب سے بڑا حوصلہ ہے۔'),
        'preset_amounts', coalesce(v_settings.preset_amounts, '{100,250,500}'::integer[]),
        'min_amount', v_settings.min_amount,
        'max_amount', v_settings.max_amount,
        'payment_methods', v_methods
    );
END;
$$;

-- 6.4 create_tip: Creates tip and snapshots payment instructions
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

    -- Writer tip settings check
    SELECT * INTO v_tip_settings FROM public.writer_tip_settings WHERE writer_id = p_writer_id;
    IF v_tip_settings.writer_id IS NULL OR coalesce(v_tip_settings.enabled, false) = false THEN
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
      AND is_active = true
      AND use_for_tips = true;

    IF v_method.id IS NULL THEN
        RAISE EXCEPTION 'Selected payment method is invalid or inactive for tips.';
    END IF;

    -- Snapshot payment instructions (revealed only upon tip creation)
    v_snapshot := pg_catalog.jsonb_build_object(
        'payment_method_id', v_method.id,
        'method_type', v_method.method_type,
        'account_title', v_method.account_title,
        'account_number_or_iban', v_method.account_number_or_iban,
        'bank_name', v_method.bank_name,
        'instructions_note', v_method.instructions_note,
        'amount_pkr', p_amount_pkr,
        'currency', 'PKR'
    );

    -- Format tip number: TIP-YYYYMMDD-XXXXXXXX
    v_tip_number := 'TIP-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' ||
                    pg_catalog.upper(pg_catalog.substring(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));

    -- Clean optional message (max 300)
    IF p_message IS NOT NULL THEN
        v_cleaned_msg := pg_catalog.btrim(p_message);
        IF pg_catalog.length(v_cleaned_msg) = 0 THEN
            v_cleaned_msg := NULL;
        ELSIF pg_catalog.length(v_cleaned_msg) > 300 THEN
            RAISE EXCEPTION 'Message cannot exceed 300 characters.';
        END IF;
    END IF;

    -- Insert into tips
    INSERT INTO public.tips (
        tip_number, reader_id, writer_id, novel_id, chapter_id,
        amount_pkr, currency, status, payment_instructions_snapshot,
        payment_method_id, reader_message, is_anonymous, open_slot,
        created_at, updated_at
    ) VALUES (
        v_tip_number, v_reader_id, p_writer_id, p_novel_id, p_chapter_id,
        p_amount_pkr, 'PKR', 'pending_payment', v_snapshot,
        v_method.id, v_cleaned_msg, coalesce(p_is_anonymous, false), v_open_slot,
        pg_catalog.now(), pg_catalog.now()
    )
    RETURNING * INTO v_tip;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_reader_id, 'reader', 'create_tip', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object(
            'tip_number', v_tip.tip_number,
            'writer_id', p_writer_id,
            'amount_pkr', p_amount_pkr,
            'is_anonymous', coalesce(p_is_anonymous, false)
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'id', v_tip.id,
        'tip_number', v_tip.tip_number,
        'amount_pkr', v_tip.amount_pkr,
        'currency', v_tip.currency,
        'status', v_tip.status,
        'payment_instructions_snapshot', v_tip.payment_instructions_snapshot,
        'reader_message', v_tip.reader_message,
        'is_anonymous', v_tip.is_anonymous,
        'created_at', v_tip.created_at
    );
END;
$$;

-- 6.5 submit_tip_payment: Reader submits payment reference (TID)
CREATE OR REPLACE FUNCTION public.submit_tip_payment(
    p_tip_id uuid,
    p_tid text,
    p_screenshot_path text DEFAULT NULL,
    p_sender_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reader_id        uuid;
    v_tip              record;
    v_cleaned_tid      text;
    v_norm_tid         text;
    v_is_dup           boolean := false;
    v_review_flags     text[] := '{}'::text[];
    v_final_flag       text := NULL;
    v_cheapest_price   numeric(10,2);
    v_recent_tip_count integer;
    v_has_paid_novel   boolean;
    v_owns_any_novel   boolean;
    v_sender_clean     text := NULL;
    v_screenshot_clean text := NULL;
    v_dedupe_key       text;
BEGIN
    v_reader_id := auth.uid();
    IF v_reader_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    IF v_tip.reader_id != v_reader_id THEN
        RAISE EXCEPTION 'Access denied: You do not own this tip.';
    END IF;

    -- Validate TID
    v_cleaned_tid := pg_catalog.btrim(coalesce(p_tid, ''));
    IF pg_catalog.length(v_cleaned_tid) < 6 OR pg_catalog.length(v_cleaned_tid) > 40 THEN
        RAISE EXCEPTION 'Transaction reference (TID) must be between 6 and 40 characters.';
    END IF;

    IF v_cleaned_tid !~ '^[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'TID contains invalid characters. Use alphanumeric characters, hyphens, and underscores only.';
    END IF;

    v_norm_tid := upper(regexp_replace(v_cleaned_tid, '[^a-zA-Z0-9]', '', 'g'));

    -- Idempotent retry: if already payment_submitted with the same normalized TID
    IF v_tip.status = 'payment_submitted' AND v_tip.normalized_tid = v_norm_tid THEN
        RETURN pg_catalog.to_jsonb(v_tip);
    END IF;

    IF v_tip.status != 'pending_payment' THEN
        RAISE EXCEPTION 'Tip cannot accept payment submission in % status.', v_tip.status;
    END IF;

    -- Validate screenshot path if supplied
    IF p_screenshot_path IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(p_screenshot_path)) > 0 THEN
        v_screenshot_clean := pg_catalog.btrim(p_screenshot_path);
        IF v_screenshot_clean NOT LIKE (p_tip_id::text || '/%') THEN
            RAISE EXCEPTION 'Screenshot path must be scoped to the tip folder.';
        END IF;
        IF v_screenshot_clean ~ '\.\.' THEN
            RAISE EXCEPTION 'Screenshot path contains invalid characters.';
        END IF;
        IF v_screenshot_clean !~* '\.(webp|png|jpe?g)$' THEN
            RAISE EXCEPTION 'Screenshot must be a valid webp, png, or jpg image.';
        END IF;
    END IF;

    IF p_sender_name IS NOT NULL THEN
        v_sender_clean := pg_catalog.substring(pg_catalog.btrim(p_sender_name), 1, 100);
        IF pg_catalog.length(v_sender_clean) = 0 THEN
            v_sender_clean := NULL;
        END IF;
    END IF;

    -- Check duplicate TID across existing tips and payment submissions
    IF EXISTS (
        SELECT 1 FROM public.tips
        WHERE normalized_tid = v_norm_tid
          AND id != p_tip_id
    ) OR EXISTS (
        SELECT 1 FROM public.payment_submissions
        WHERE normalized_tid = v_norm_tid
    ) THEN
        v_is_dup := true;
        v_review_flags := pg_catalog.array_append(v_review_flags, 'duplicate_tid');
    END IF;

    -- Review Flag Logic (a): Reader doesn't own any paid novel of writer, writer has paid novels, and amount >= 80% cheapest novel price
    SELECT EXISTS (
        SELECT 1 FROM public.novels
        WHERE writer_id = v_tip.writer_id
          AND status = 'published'
          AND price_pkr > 0
    ) INTO v_has_paid_novel;

    IF v_has_paid_novel THEN
        SELECT EXISTS (
            SELECT 1 FROM public.purchase_entitlements pe
            JOIN public.novels n ON n.id = pe.novel_id
            WHERE pe.reader_id = v_reader_id
              AND n.writer_id = v_tip.writer_id
              AND pe.is_revoked = false
        ) INTO v_owns_any_novel;

        IF NOT v_owns_any_novel THEN
            SELECT pg_catalog.min(price_pkr) INTO v_cheapest_price
            FROM public.novels
            WHERE writer_id = v_tip.writer_id
              AND status = 'published'
              AND price_pkr > 0;

            IF v_cheapest_price IS NOT NULL AND v_tip.amount_pkr >= (v_cheapest_price * 0.80) THEN
                v_review_flags := pg_catalog.array_append(v_review_flags, 'potential_bypass');
            END IF;
        END IF;
    END IF;

    -- Review Flag Logic (b): Same reader sent more than 5 tips to writer within 7 days
    SELECT pg_catalog.count(*) INTO v_recent_tip_count
    FROM public.tips
    WHERE reader_id = v_reader_id
      AND writer_id = v_tip.writer_id
      AND created_at >= pg_catalog.now() - interval '7 days'
      AND id != p_tip_id;

    IF v_recent_tip_count >= 5 THEN
        v_review_flags := pg_catalog.array_append(v_review_flags, 'high_frequency');
    END IF;

    IF pg_catalog.array_length(v_review_flags, 1) > 0 THEN
        v_final_flag := pg_catalog.array_to_string(v_review_flags, ',');
    END IF;

    -- Update tip record
    UPDATE public.tips
    SET status = 'payment_submitted',
        transaction_reference_tid = v_cleaned_tid,
        screenshot_path = v_screenshot_clean,
        sender_account_name = v_sender_clean,
        is_duplicate_tid_flagged = v_is_dup,
        review_flag = v_final_flag,
        updated_at = pg_catalog.now()
    WHERE id = p_tip_id
    RETURNING * INTO v_tip;

    -- In-app notification for writer (NO amounts or TIDs)
    INSERT INTO public.notifications (
        user_id, type, title, message, body, link, entity_refs, is_read, created_at
    ) VALUES (
        v_tip.writer_id,
        'tip_submitted',
        'Someone said thanks!',
        'A reader sent a tip and submitted payment. Please check your bank and confirm receipt.',
        'A reader sent appreciation for your work.',
        '/writer/tips',
        pg_catalog.jsonb_build_object('tip_id', v_tip.id, 'tip_number', v_tip.tip_number),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox (non-critical, respects preferences, NO amounts or TIDs)
    v_dedupe_key := 'tip_submitted:' || v_tip.id::text;
    PERFORM public.enqueue_email_for_notification(
        v_tip.writer_id,
        'tip_submitted',
        'Someone said thanks! | UNB Premium',
        'A reader sent appreciation for your work and submitted direct payment. Please check your payment account and confirm receipt in your Writer Studio.',
        v_dedupe_key
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_reader_id, 'reader', 'submit_tip_payment', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object(
            'tip_number', v_tip.tip_number,
            'is_duplicate_tid', v_is_dup,
            'review_flag', v_final_flag
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.to_jsonb(v_tip);
END;
$$;

-- 6.6 cancel_tip: Reader cancels pending tip
CREATE OR REPLACE FUNCTION public.cancel_tip(p_tip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reader_id uuid;
    v_tip       record;
BEGIN
    v_reader_id := auth.uid();
    IF v_reader_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    IF v_tip.reader_id != v_reader_id THEN
        RAISE EXCEPTION 'Access denied: You do not own this tip.';
    END IF;

    IF v_tip.status != 'pending_payment' THEN
        RAISE EXCEPTION 'Only pending tips can be cancelled. Current status is %.', v_tip.status;
    END IF;

    UPDATE public.tips
    SET status = 'cancelled',
        open_slot = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_tip_id
    RETURNING * INTO v_tip;

    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_reader_id, 'reader', 'cancel_tip', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object('tip_number', v_tip.tip_number, 'status', 'cancelled'),
        pg_catalog.now()
    );

    RETURN pg_catalog.to_jsonb(v_tip);
END;
$$;

-- 6.7 confirm_tip_received: Writer or Admin confirms receipt of tip payment
CREATE OR REPLACE FUNCTION public.confirm_tip_received(
    p_tip_id uuid,
    p_reply text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id     uuid;
    v_is_admin      boolean;
    v_tip           record;
    v_writer_sett   record;
    v_reply         text;
    v_dedupe_key    text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    IF NOT v_is_admin AND v_tip.writer_id != v_caller_id THEN
        RAISE EXCEPTION 'Access denied: Only the tip recipient author or an admin can confirm receipt.';
    END IF;

    -- Idempotent check
    IF v_tip.status = 'confirmed' THEN
        RETURN pg_catalog.to_jsonb(v_tip);
    END IF;

    IF v_tip.status != 'payment_submitted' THEN
        RAISE EXCEPTION 'Tip cannot be confirmed in % status. It must be in payment_submitted status.', v_tip.status;
    END IF;

    -- Resolve thank you message
    SELECT * INTO v_writer_sett FROM public.writer_tip_settings WHERE writer_id = v_tip.writer_id;
    v_reply := pg_catalog.btrim(coalesce(p_reply, ''));
    IF pg_catalog.length(v_reply) = 0 THEN
        v_reply := coalesce(v_writer_sett.thank_you_message, 'شکریہ! آپ کی پزیرائی کا بہت شکریہ۔');
    ELSIF pg_catalog.length(v_reply) > 500 THEN
        v_reply := pg_catalog.substring(v_reply, 1, 500);
    END IF;

    UPDATE public.tips
    SET status = 'confirmed',
        writer_reply = v_reply,
        open_slot = NULL,
        confirmed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_tip_id
    RETURNING * INTO v_tip;

    -- In-app notification for reader
    INSERT INTO public.notifications (
        user_id, type, title, message, body, link, entity_refs, is_read, created_at
    ) VALUES (
        v_tip.reader_id,
        'tip_confirmed',
        'The author confirmed your thanks',
        v_reply,
        'Your appreciation has been acknowledged by the author.',
        '/tips',
        pg_catalog.jsonb_build_object('tip_id', v_tip.id, 'tip_number', v_tip.tip_number),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox (non-critical, respects preferences, NO amounts or TIDs)
    v_dedupe_key := 'tip_confirmed:' || v_tip.id::text;
    PERFORM public.enqueue_email_for_notification(
        v_tip.reader_id,
        'tip_confirmed',
        'The author confirmed your thanks | UNB Premium',
        'The author received your gift and sent you a thank you message: ' || v_reply,
        v_dedupe_key
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, CASE WHEN v_is_admin THEN 'admin' ELSE 'writer' END,
        'confirm_tip_received', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object('tip_number', v_tip.tip_number, 'status', 'confirmed', 'confirmed_at', v_tip.confirmed_at),
        pg_catalog.now()
    );

    RETURN pg_catalog.to_jsonb(v_tip);
END;
$$;

-- 6.8 mark_tip_not_received: Writer or Admin marks payment as not received
CREATE OR REPLACE FUNCTION public.mark_tip_not_received(
    p_tip_id uuid,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id     uuid;
    v_is_admin      boolean;
    v_tip           record;
    v_note          text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    IF NOT v_is_admin AND v_tip.writer_id != v_caller_id THEN
        RAISE EXCEPTION 'Access denied: Only the tip recipient author or an admin can mark not received.';
    END IF;

    IF v_tip.status = 'not_received' THEN
        RETURN pg_catalog.to_jsonb(v_tip);
    END IF;

    IF v_tip.status != 'payment_submitted' THEN
        RAISE EXCEPTION 'Tip cannot be marked not received in % status.', v_tip.status;
    END IF;

    v_note := pg_catalog.substring(pg_catalog.btrim(coalesce(p_note, '')), 1, 500);

    UPDATE public.tips
    SET status = 'not_received',
        writer_reply = v_note,
        open_slot = NULL,
        not_received_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_tip_id
    RETURNING * INTO v_tip;

    -- In-app notification for reader
    INSERT INTO public.notifications (
        user_id, type, title, message, body, link, entity_refs, is_read, created_at
    ) VALUES (
        v_tip.reader_id,
        'tip_not_received',
        'Tip payment deposit could not be verified',
        coalesce(v_note, 'The author was unable to verify the deposit in their account. If you believe this is an error, please contact support.'),
        'Deposit verification issue.',
        '/tips',
        pg_catalog.jsonb_build_object('tip_id', v_tip.id, 'tip_number', v_tip.tip_number),
        false,
        pg_catalog.now()
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, CASE WHEN v_is_admin THEN 'admin' ELSE 'writer' END,
        'mark_tip_not_received', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object('tip_number', v_tip.tip_number, 'status', 'not_received', 'note', v_note),
        pg_catalog.now()
    );

    RETURN pg_catalog.to_jsonb(v_tip);
END;
$$;

-- 6.9 get_my_tips: Reader fetches their own tips
CREATE OR REPLACE FUNCTION public.get_my_tips()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reader_id uuid;
    v_list      jsonb;
BEGIN
    v_reader_id := auth.uid();
    IF v_reader_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', t.id,
                'tip_number', t.tip_number,
                'writer_id', t.writer_id,
                'writer_pen_name', coalesce(w.pen_name_english, w.pen_name_urdu, 'Author'),
                'writer_pen_name_urdu', w.pen_name_urdu,
                'novel_id', t.novel_id,
                'novel_title', n.title_urdu,
                'amount_pkr', t.amount_pkr,
                'currency', t.currency,
                'status', t.status,
                'payment_instructions_snapshot', t.payment_instructions_snapshot,
                'transaction_reference_tid', t.transaction_reference_tid,
                'screenshot_path', t.screenshot_path,
                'reader_message', t.reader_message,
                'is_anonymous', t.is_anonymous,
                'writer_reply', t.writer_reply,
                'confirmed_at', t.confirmed_at,
                'not_received_at', t.not_received_at,
                'created_at', t.created_at
            ) ORDER BY t.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_list
    FROM public.tips t
    JOIN public.writer_profiles w ON w.id = t.writer_id
    LEFT JOIN public.novels n ON n.id = t.novel_id
    WHERE t.reader_id = v_reader_id;

    RETURN v_list;
END;
$$;

-- 6.9b get_tip_by_number: Fetches a single tip by tip_number for reader, writer, or admin
CREATE OR REPLACE FUNCTION public.get_tip_by_number(p_tip_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_is_admin  boolean;
    v_tip       record;
    v_writer    record;
    v_reader    record;
    v_novel     record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();

    SELECT * INTO v_tip FROM public.tips WHERE tip_number = p_tip_number;
    IF v_tip.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Multi-tenant isolation: caller must be reader, writer, or admin
    IF NOT v_is_admin AND v_tip.reader_id != v_caller_id AND v_tip.writer_id != v_caller_id THEN
        RAISE EXCEPTION 'Access denied to this tip.';
    END IF;

    SELECT pen_name_english, pen_name_urdu INTO v_writer FROM public.writer_profiles WHERE id = v_tip.writer_id;
    SELECT full_name, username INTO v_reader FROM public.profiles WHERE id = v_tip.reader_id;
    SELECT title_urdu, title_english INTO v_novel FROM public.novels WHERE id = v_tip.novel_id;

    RETURN pg_catalog.jsonb_build_object(
        'id', v_tip.id,
        'tip_number', v_tip.tip_number,
        'reader_id', v_tip.reader_id,
        'reader_display_name', CASE WHEN v_tip.is_anonymous AND v_tip.writer_id = v_caller_id AND NOT v_is_admin THEN 'Anonymous' ELSE coalesce(v_reader.full_name, v_reader.username, 'Reader') END,
        'writer_id', v_tip.writer_id,
        'writer_pen_name', coalesce(v_writer.pen_name_english, v_writer.pen_name_urdu, 'Author'),
        'writer_pen_name_urdu', v_writer.pen_name_urdu,
        'novel_id', v_tip.novel_id,
        'novel_title', v_novel.title_urdu,
        'chapter_id', v_tip.chapter_id,
        'amount_pkr', v_tip.amount_pkr,
        'currency', v_tip.currency,
        'status', v_tip.status,
        'payment_instructions_snapshot', v_tip.payment_instructions_snapshot,
        'transaction_reference_tid', v_tip.transaction_reference_tid,
        'screenshot_path', v_tip.screenshot_path,
        'sender_account_name', v_tip.sender_account_name,
        'reader_message', CASE WHEN v_tip.message_status = 'visible' OR v_is_admin OR v_tip.reader_id = v_caller_id THEN v_tip.reader_message ELSE NULL END,
        'message_status', v_tip.message_status,
        'is_anonymous', v_tip.is_anonymous,
        'writer_reply', v_tip.writer_reply,
        'review_flag', CASE WHEN v_is_admin THEN v_tip.review_flag ELSE NULL END,
        'confirmed_at', v_tip.confirmed_at,
        'not_received_at', v_tip.not_received_at,
        'created_at', v_tip.created_at,
        'updated_at', v_tip.updated_at
    );
END;
$$;

-- 6.10 get_my_received_tips: Writer fetches received tips queue (Privacy: never exposes reader email)
CREATE OR REPLACE FUNCTION public.get_my_received_tips(
    p_status text DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_writer_id uuid;
    v_list      jsonb;
    v_limit     integer;
    v_offset    integer;
BEGIN
    v_writer_id := auth.uid();
    IF v_writer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_limit := least(greatest(1, coalesce(p_limit, 50)), 100);
    v_offset := greatest(0, coalesce(p_offset, 0));

    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', t.id,
                'tip_number', t.tip_number,
                'reader_display_name', CASE WHEN t.is_anonymous THEN 'Anonymous' ELSE coalesce(p.full_name, p.username, 'Reader') END,
                'is_anonymous', t.is_anonymous,
                'novel_id', t.novel_id,
                'novel_title', n.title_urdu,
                'amount_pkr', t.amount_pkr,
                'currency', t.currency,
                'status', t.status,
                'transaction_reference_tid', t.transaction_reference_tid,
                'is_duplicate_tid_flagged', t.is_duplicate_tid_flagged,
                'screenshot_path', t.screenshot_path,
                'sender_account_name', t.sender_account_name,
                'reader_message', CASE WHEN t.message_status = 'visible' THEN t.reader_message ELSE NULL END,
                'message_status', t.message_status,
                'writer_reply', t.writer_reply,
                'confirmed_at', t.confirmed_at,
                'not_received_at', t.not_received_at,
                'created_at', t.created_at
            ) ORDER BY t.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_list
    FROM (
        SELECT * FROM public.tips
        WHERE writer_id = v_writer_id
          AND (p_status IS NULL OR status = p_status)
        ORDER BY created_at DESC
        LIMIT v_limit OFFSET v_offset
    ) t
    LEFT JOIN public.profiles p ON p.id = t.reader_id
    LEFT JOIN public.novels n ON n.id = t.novel_id;

    RETURN v_list;
END;
$$;

-- 6.11 get_my_tip_summary: Private monthly analytics for writer only (never public)
CREATE OR REPLACE FUNCTION public.get_my_tip_summary(
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_writer_id         uuid;
    v_confirmed_count   integer;
    v_confirmed_sum     numeric(10,2);
    v_unique_readers    integer;
    v_pending_count     integer;
BEGIN
    v_writer_id := auth.uid();
    IF v_writer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT
        pg_catalog.count(*),
        coalesce(pg_catalog.sum(amount_pkr), 0),
        pg_catalog.count(DISTINCT reader_id)
    INTO v_confirmed_count, v_confirmed_sum, v_unique_readers
    FROM public.tips
    WHERE writer_id = v_writer_id
      AND status = 'confirmed'
      AND (p_from IS NULL OR confirmed_at >= p_from)
      AND (p_to IS NULL OR confirmed_at <= p_to);

    SELECT pg_catalog.count(*) INTO v_pending_count
    FROM public.tips
    WHERE writer_id = v_writer_id
      AND status = 'payment_submitted';

    RETURN pg_catalog.jsonb_build_object(
        'writer_id', v_writer_id,
        'confirmed_tips_count', v_confirmed_count,
        'confirmed_total_pkr', v_confirmed_sum,
        'unique_supporters_count', v_unique_readers,
        'pending_confirmation_count', v_pending_count
    );
END;
$$;

-- 6.12 hide_tip_message: Writer can toggle visibility of message
CREATE OR REPLACE FUNCTION public.hide_tip_message(
    p_tip_id uuid,
    p_hidden boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_writer_id uuid;
    v_tip       record;
    v_new_status text;
BEGIN
    v_writer_id := auth.uid();
    IF v_writer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    IF v_tip.writer_id != v_writer_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Only the recipient author can hide this message.';
    END IF;

    v_new_status := CASE WHEN p_hidden THEN 'hidden_by_writer' ELSE 'visible' END;

    UPDATE public.tips
    SET message_status = v_new_status,
        updated_at = pg_catalog.now()
    WHERE id = p_tip_id
    RETURNING * INTO v_tip;

    RETURN pg_catalog.to_jsonb(v_tip);
END;
$$;

-- 6.13 report_tip_message: Reader or Writer reports an abusive tip message
CREATE OR REPLACE FUNCTION public.report_tip_message(
    p_tip_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_tip       record;
    v_reason    text;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    IF v_tip.reader_id != v_caller_id AND v_tip.writer_id != v_caller_id THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;

    v_reason := pg_catalog.substring(pg_catalog.btrim(coalesce(p_reason, 'Inappropriate content')), 1, 300);

    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, 'user', 'report_tip_message', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object('tip_number', v_tip.tip_number, 'reason', v_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('status', 'reported', 'tip_id', p_tip_id);
END;
$$;

-- 6.14 admin_remove_tip_message: Admin moderates message
CREATE OR REPLACE FUNCTION public.admin_remove_tip_message(
    p_tip_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_tip       record;
    v_reason    text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrator privileges required.';
    END IF;

    v_caller_id := auth.uid();
    v_reason := pg_catalog.substring(pg_catalog.btrim(coalesce(p_reason, 'Removed by admin')), 1, 300);

    UPDATE public.tips
    SET message_status = 'removed_by_admin',
        updated_at = pg_catalog.now()
    WHERE id = p_tip_id
    RETURNING * INTO v_tip;

    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'admin_remove_tip_message', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object('tip_number', v_tip.tip_number, 'reason', v_reason),
        pg_catalog.now()
    );

    RETURN pg_catalog.to_jsonb(v_tip);
END;
$$;

-- 6.15 admin_list_tips: Administrator inspection query (No emails exposed)
CREATE OR REPLACE FUNCTION public.admin_list_tips(
    p_status text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_flagged_only boolean DEFAULT false,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_limit     integer;
    v_offset    integer;
    v_search    text;
    v_list      jsonb;
    v_total     integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrator privileges required.';
    END IF;

    v_limit := least(greatest(1, coalesce(p_limit, 50)), 100);
    v_offset := greatest(0, coalesce(p_offset, 0));
    v_search := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');

    SELECT pg_catalog.count(*) INTO v_total
    FROM public.tips t
    JOIN public.writer_profiles w ON w.id = t.writer_id
    LEFT JOIN public.profiles p ON p.id = t.reader_id
    WHERE (p_status IS NULL OR t.status = p_status)
      AND (p_flagged_only IS FALSE OR t.review_flag IS NOT NULL OR t.is_duplicate_tid_flagged IS TRUE)
      AND (
          v_search IS NULL OR
          t.tip_number ILIKE ('%' || v_search || '%') OR
          t.transaction_reference_tid ILIKE ('%' || v_search || '%') OR
          w.pen_name_english ILIKE ('%' || v_search || '%') OR
          w.pen_name_urdu ILIKE ('%' || v_search || '%')
      );

    SELECT coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', t.id,
                'tip_number', t.tip_number,
                'reader_id', t.reader_id,
                'reader_display_name', coalesce(p.full_name, p.username, 'Reader'),
                'reader_username', p.username,
                'is_anonymous', t.is_anonymous,
                'writer_id', t.writer_id,
                'writer_pen_name', coalesce(w.pen_name_english, w.pen_name_urdu, 'Author'),
                'amount_pkr', t.amount_pkr,
                'status', t.status,
                'transaction_reference_tid', t.transaction_reference_tid,
                'is_duplicate_tid_flagged', t.is_duplicate_tid_flagged,
                'review_flag', t.review_flag,
                'screenshot_path', t.screenshot_path,
                'reader_message', t.reader_message,
                'message_status', t.message_status,
                'created_at', t.created_at,
                'confirmed_at', t.confirmed_at
            ) ORDER BY t.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_list
    FROM (
        SELECT t.*
        FROM public.tips t
        JOIN public.writer_profiles w ON w.id = t.writer_id
        LEFT JOIN public.profiles p ON p.id = t.reader_id
        WHERE (p_status IS NULL OR t.status = p_status)
          AND (p_flagged_only IS FALSE OR t.review_flag IS NOT NULL OR t.is_duplicate_tid_flagged IS TRUE)
          AND (
              v_search IS NULL OR
              t.tip_number ILIKE ('%' || v_search || '%') OR
              t.transaction_reference_tid ILIKE ('%' || v_search || '%') OR
              w.pen_name_english ILIKE ('%' || v_search || '%') OR
              w.pen_name_urdu ILIKE ('%' || v_search || '%')
          )
        ORDER BY t.created_at DESC
        LIMIT v_limit OFFSET v_offset
    ) t
    JOIN public.writer_profiles w ON w.id = t.writer_id
    LEFT JOIN public.profiles p ON p.id = t.reader_id;

    RETURN pg_catalog.jsonb_build_object(
        'total', v_total,
        'tips', v_list
    );
END;
$$;

-- 6.16 admin_get_tip: Administrator detailed inspection (No email exposed)
CREATE OR REPLACE FUNCTION public.admin_get_tip(p_tip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tip    record;
    v_reader record;
    v_writer record;
    v_novel  record;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrator privileges required.';
    END IF;

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    SELECT id, full_name, username INTO v_reader FROM public.profiles WHERE id = v_tip.reader_id;
    SELECT id, pen_name_urdu, pen_name_english INTO v_writer FROM public.writer_profiles WHERE id = v_tip.writer_id;
    SELECT id, title_urdu, title_english, slug INTO v_novel FROM public.novels WHERE id = v_tip.novel_id;

    RETURN pg_catalog.jsonb_build_object(
        'id', v_tip.id,
        'tip_number', v_tip.tip_number,
        'reader', pg_catalog.jsonb_build_object(
            'id', v_reader.id,
            'full_name', v_reader.full_name,
            'username', v_reader.username
        ),
        'writer', pg_catalog.jsonb_build_object(
            'id', v_writer.id,
            'pen_name_urdu', v_writer.pen_name_urdu,
            'pen_name_english', v_writer.pen_name_english
        ),
        'novel', CASE WHEN v_novel.id IS NOT NULL THEN pg_catalog.jsonb_build_object(
            'id', v_novel.id,
            'title_urdu', v_novel.title_urdu,
            'title_english', v_novel.title_english,
            'slug', v_novel.slug
        ) ELSE NULL END,
        'amount_pkr', v_tip.amount_pkr,
        'currency', v_tip.currency,
        'status', v_tip.status,
        'payment_instructions_snapshot', v_tip.payment_instructions_snapshot,
        'transaction_reference_tid', v_tip.transaction_reference_tid,
        'normalized_tid', v_tip.normalized_tid,
        'is_duplicate_tid_flagged', v_tip.is_duplicate_tid_flagged,
        'review_flag', v_tip.review_flag,
        'screenshot_path', v_tip.screenshot_path,
        'sender_account_name', v_tip.sender_account_name,
        'reader_message', v_tip.reader_message,
        'is_anonymous', v_tip.is_anonymous,
        'message_status', v_tip.message_status,
        'writer_reply', v_tip.writer_reply,
        'confirmed_at', v_tip.confirmed_at,
        'not_received_at', v_tip.not_received_at,
        'created_at', v_tip.created_at,
        'updated_at', v_tip.updated_at
    );
END;
$$;

-- 6.17 admin_review_tip: Admin marks review queue note
CREATE OR REPLACE FUNCTION public.admin_review_tip(
    p_tip_id uuid,
    p_action text,
    p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_tip       record;
    v_action    text;
    v_notes     text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Administrator privileges required.';
    END IF;

    v_caller_id := auth.uid();
    v_action := pg_catalog.btrim(coalesce(p_action, 'ok'));
    v_notes := pg_catalog.btrim(coalesce(p_notes, 'Reviewed by admin'));

    SELECT * INTO v_tip FROM public.tips WHERE id = p_tip_id;
    IF v_tip.id IS NULL THEN
        RAISE EXCEPTION 'Tip not found.';
    END IF;

    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'admin_review_tip', 'tips', v_tip.id::text,
        pg_catalog.jsonb_build_object('tip_number', v_tip.tip_number, 'action', v_action, 'notes', v_notes),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object('status', 'reviewed', 'tip_id', p_tip_id, 'action', v_action);
END;
$$;

-- 6.18 update_platform_settings: Extended for Tip controls
CREATE OR REPLACE FUNCTION public.update_platform_settings(
    p_default_commission_rate numeric DEFAULT NULL,
    p_default_unpaid_commission_limit numeric DEFAULT NULL,
    p_min_novel_price_pkr integer DEFAULT NULL,
    p_max_novel_price_pkr numeric DEFAULT NULL,
    p_dispute_window_days integer DEFAULT NULL,
    p_max_orders_per_hour integer DEFAULT NULL,
    p_max_chapter_reads_per_window integer DEFAULT NULL,
    p_chapter_read_window_minutes integer DEFAULT NULL,
    p_invoice_due_days integer DEFAULT NULL,
    p_overdue_grace_days integer DEFAULT NULL,
    p_min_dispute_wait_hours integer DEFAULT NULL,
    p_verification_reminder_hours integer DEFAULT NULL,
    p_support_email text DEFAULT NULL,
    p_unpaid_commission_threshold_pkr numeric DEFAULT NULL,
    p_payment_verification_window_hours integer DEFAULT NULL,
    p_tips_enabled boolean DEFAULT NULL,
    p_tip_min_pkr integer DEFAULT NULL,
    p_tip_max_pkr integer DEFAULT NULL,
    p_max_tips_per_hour integer DEFAULT NULL,
    p_tip_daily_cap_pkr_per_reader integer DEFAULT NULL,
    p_tip_confirm_reminder_hours integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_old_settings jsonb;
    v_new_settings jsonb;
    v_effective_unpaid_limit numeric(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Restricted: Only platform administrators can update platform settings.';
    END IF;

    v_effective_unpaid_limit := coalesce(p_default_unpaid_commission_limit, p_unpaid_commission_threshold_pkr);

    SELECT pg_catalog.to_jsonb(s) INTO v_old_settings
    FROM public.platform_settings s
    WHERE id = 1;

    -- Validations
    IF p_default_commission_rate IS NOT NULL AND (p_default_commission_rate < 0 OR p_default_commission_rate > 100) THEN
        RAISE EXCEPTION 'Commission rate must be between 0 and 100.';
    END IF;
    IF v_effective_unpaid_limit IS NOT NULL AND v_effective_unpaid_limit < 0 THEN
        RAISE EXCEPTION 'Default unpaid commission limit must be non-negative.';
    END IF;
    IF p_min_novel_price_pkr IS NOT NULL AND (p_min_novel_price_pkr < 50 OR p_min_novel_price_pkr > 5000) THEN
        RAISE EXCEPTION 'Minimum novel price must be between 50 and 5000 PKR.';
    END IF;
    IF p_max_novel_price_pkr IS NOT NULL AND (p_max_novel_price_pkr < 50 OR p_max_novel_price_pkr > 5000) THEN
        RAISE EXCEPTION 'Maximum novel price must be between 50 and 5000 PKR.';
    END IF;
    IF p_dispute_window_days IS NOT NULL AND (p_dispute_window_days < 1 OR p_dispute_window_days > 90) THEN
        RAISE EXCEPTION 'Dispute window days must be between 1 and 90.';
    END IF;
    IF p_max_orders_per_hour IS NOT NULL AND (p_max_orders_per_hour < 1 OR p_max_orders_per_hour > 100) THEN
        RAISE EXCEPTION 'Max orders per hour must be between 1 and 100.';
    END IF;
    IF p_max_chapter_reads_per_window IS NOT NULL AND (p_max_chapter_reads_per_window < 1 OR p_max_chapter_reads_per_window > 1000) THEN
        RAISE EXCEPTION 'Max chapter reads per window must be between 1 and 1000.';
    END IF;
    IF p_chapter_read_window_minutes IS NOT NULL AND (p_chapter_read_window_minutes < 1 OR p_chapter_read_window_minutes > 1440) THEN
        RAISE EXCEPTION 'Chapter read window minutes must be between 1 and 1440.';
    END IF;
    IF p_invoice_due_days IS NOT NULL AND (p_invoice_due_days < 1 OR p_invoice_due_days > 90) THEN
        RAISE EXCEPTION 'Invoice due days must be between 1 and 90.';
    END IF;
    IF p_overdue_grace_days IS NOT NULL AND (p_overdue_grace_days < 0 OR p_overdue_grace_days > 60) THEN
        RAISE EXCEPTION 'Overdue grace days must be between 0 and 60.';
    END IF;
    IF p_min_dispute_wait_hours IS NOT NULL AND (p_min_dispute_wait_hours < 0 OR p_min_dispute_wait_hours > 168) THEN
        RAISE EXCEPTION 'Min dispute wait hours must be between 0 and 168.';
    END IF;
    IF p_verification_reminder_hours IS NOT NULL AND (p_verification_reminder_hours < 1 OR p_verification_reminder_hours > 168) THEN
        RAISE EXCEPTION 'Verification reminder hours must be between 1 and 168.';
    END IF;

    -- Tip controls validation
    IF p_tip_min_pkr IS NOT NULL AND (p_tip_min_pkr < 1 OR p_tip_min_pkr > 5000) THEN
        RAISE EXCEPTION 'Minimum tip amount must be between 1 and 5,000 PKR.';
    END IF;
    IF p_tip_max_pkr IS NOT NULL AND (p_tip_max_pkr < 1 OR p_tip_max_pkr > 50000) THEN
        RAISE EXCEPTION 'Maximum tip amount must be between 1 and 50,000 PKR.';
    END IF;
    IF p_max_tips_per_hour IS NOT NULL AND (p_max_tips_per_hour < 1 OR p_max_tips_per_hour > 100) THEN
        RAISE EXCEPTION 'Max tips per hour must be between 1 and 100.';
    END IF;
    IF p_tip_daily_cap_pkr_per_reader IS NOT NULL AND p_tip_daily_cap_pkr_per_reader < 100 THEN
        RAISE EXCEPTION 'Daily tip cap must be at least 100 PKR.';
    END IF;
    IF p_tip_confirm_reminder_hours IS NOT NULL AND (p_tip_confirm_reminder_hours < 1 OR p_tip_confirm_reminder_hours > 168) THEN
        RAISE EXCEPTION 'Tip confirmation reminder hours must be between 1 and 168.';
    END IF;

    UPDATE public.platform_settings
    SET default_commission_rate = coalesce(p_default_commission_rate, default_commission_rate),
        default_unpaid_commission_limit = coalesce(v_effective_unpaid_limit, default_unpaid_commission_limit),
        min_novel_price_pkr = coalesce(p_min_novel_price_pkr, min_novel_price_pkr),
        max_novel_price_pkr = coalesce(p_max_novel_price_pkr, max_novel_price_pkr),
        dispute_window_days = coalesce(p_dispute_window_days, dispute_window_days),
        max_orders_per_hour = coalesce(p_max_orders_per_hour, max_orders_per_hour),
        max_chapter_reads_per_window = coalesce(p_max_chapter_reads_per_window, max_chapter_reads_per_window),
        chapter_read_window_minutes = coalesce(p_chapter_read_window_minutes, chapter_read_window_minutes),
        invoice_due_days = coalesce(p_invoice_due_days, invoice_due_days),
        overdue_grace_days = coalesce(p_overdue_grace_days, overdue_grace_days),
        min_dispute_wait_hours = coalesce(p_min_dispute_wait_hours, min_dispute_wait_hours),
        verification_reminder_hours = coalesce(p_verification_reminder_hours, verification_reminder_hours),
        support_email = coalesce(nullif(pg_catalog.btrim(p_support_email), ''), support_email),
        tips_enabled = coalesce(p_tips_enabled, tips_enabled),
        tip_min_pkr = coalesce(p_tip_min_pkr, tip_min_pkr),
        tip_max_pkr = coalesce(p_tip_max_pkr, tip_max_pkr),
        max_tips_per_hour = coalesce(p_max_tips_per_hour, max_tips_per_hour),
        tip_daily_cap_pkr_per_reader = coalesce(p_tip_daily_cap_pkr_per_reader, tip_daily_cap_pkr_per_reader),
        tip_confirm_reminder_hours = coalesce(p_tip_confirm_reminder_hours, tip_confirm_reminder_hours),
        updated_at = pg_catalog.now()
    WHERE id = 1;

    SELECT pg_catalog.to_jsonb(s) INTO v_new_settings
    FROM public.platform_settings s
    WHERE id = 1;

    INSERT INTO public.audit_logs (
        actor_id, actor_role, action_type, entity_type, entity_id, previous_state, new_state, created_at
    ) VALUES (
        v_caller_id, 'admin', 'update_platform_settings', 'platform_settings', '1',
        v_old_settings, v_new_settings, pg_catalog.now()
    );

    RETURN v_new_settings;
END;
$$;

-- 6.19 run_scheduled_reminders: Extended with tip reminders & expiry
CREATE OR REPLACE FUNCTION public.run_scheduled_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_settings           record;
    v_order_rem_hours    integer;
    v_tip_rem_hours      integer;
    v_order              record;
    v_tip                record;
    v_disp               record;
    v_admin              record;
    v_dedupe             text;
    v_enqueued           integer := 0;
    v_expired_tips       integer := 0;
BEGIN
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
    v_order_rem_hours := coalesce(v_settings.verification_reminder_hours, 12);
    v_tip_rem_hours := coalesce(v_settings.tip_confirm_reminder_hours, 48);

    -- 1. Orders: Payment submitted older than verification_reminder_hours (to writer)
    FOR v_order IN
        SELECT o.id, o.order_number, o.writer_id, o.created_at
        FROM public.orders o
        WHERE o.status = 'payment_submitted'
          AND o.created_at < pg_catalog.now() - (v_order_rem_hours || ' hours')::interval
          AND o.created_at >= pg_catalog.now() - interval '24 hours'
    LOOP
        v_dedupe := 'reminder:order:' || v_order_rem_hours || 'h:' || v_order.id::text;
        IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = v_dedupe) THEN
            INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
            VALUES (
                v_order.writer_id,
                'verification_reminder',
                'Pending Payment Verification: Order #' || v_order.order_number,
                'A reader submitted payment for order #' || v_order.order_number || ' over ' || v_order_rem_hours || ' hours ago. Please check your bank and verify.',
                'Order #' || v_order.order_number,
                '/writer/orders',
                pg_catalog.jsonb_build_object('order_id', v_order.id),
                false,
                pg_catalog.now()
            );

            PERFORM public.enqueue_email_for_notification(
                v_order.writer_id,
                'verification_reminder',
                'Action Needed: Verify Payment for Order #' || v_order.order_number,
                'A reader submitted payment for order #' || v_order.order_number || ' over ' || v_order_rem_hours || ' hours ago. Please inspect your account and verify the order.',
                v_dedupe
            );
            v_enqueued := v_enqueued + 1;
        END IF;
    END LOOP;

    -- 2. Orders: Payment submitted older than 24 hours (second reminder to writer)
    FOR v_order IN
        SELECT o.id, o.order_number, o.writer_id, o.created_at
        FROM public.orders o
        WHERE o.status = 'payment_submitted'
          AND o.created_at < pg_catalog.now() - interval '24 hours'
          AND o.created_at >= pg_catalog.now() - interval '48 hours'
    LOOP
        v_dedupe := 'reminder:order:24h:' || v_order.id::text;
        IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = v_dedupe) THEN
            INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
            VALUES (
                v_order.writer_id,
                'verification_reminder',
                'URGENT: Verify Payment for Order #' || v_order.order_number,
                'Payment submission for order #' || v_order.order_number || ' is pending verification for 24+ hours.',
                'Order #' || v_order.order_number,
                '/writer/orders',
                pg_catalog.jsonb_build_object('order_id', v_order.id),
                false,
                pg_catalog.now()
            );

            PERFORM public.enqueue_email_for_notification(
                v_order.writer_id,
                'verification_reminder',
                'URGENT: Verify Payment for Order #' || v_order.order_number,
                'Payment submission for order #' || v_order.order_number || ' has been waiting verification for over 24 hours. Readers rely on timely chapter delivery.',
                v_dedupe
            );
            v_enqueued := v_enqueued + 1;
        END IF;
    END LOOP;

    -- 3. Tips: Payment submitted older than tip_confirm_reminder_hours (reminder to writer)
    FOR v_tip IN
        SELECT t.id, t.tip_number, t.writer_id, t.created_at
        FROM public.tips t
        WHERE t.status = 'payment_submitted'
          AND t.created_at < pg_catalog.now() - (v_tip_rem_hours || ' hours')::interval
          AND t.created_at >= pg_catalog.now() - interval '7 days'
    LOOP
        v_dedupe := 'reminder:tip:' || v_tip_rem_hours || 'h:' || v_tip.id::text;
        IF NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE dedupe_key = v_dedupe) THEN
            INSERT INTO public.notifications (user_id, type, title, message, body, link, entity_refs, is_read, created_at)
            VALUES (
                v_tip.writer_id,
                'tip_reminder',
                'Pending Tip Confirmation: ' || v_tip.tip_number,
                'A reader sent a tip over ' || v_tip_rem_hours || ' hours ago. Please check your bank and confirm receipt.',
                'Tip ' || v_tip.tip_number,
                '/writer/tips',
                pg_catalog.jsonb_build_object('tip_id', v_tip.id),
                false,
                pg_catalog.now()
            );

            PERFORM public.enqueue_email_for_notification(
                v_tip.writer_id,
                'tip_reminder',
                'Reminder: Confirm Reader Appreciation | UNB Premium',
                'A reader submitted a tip over ' || v_tip_rem_hours || ' hours ago. Please check your account and confirm receipt in your Writer Studio.',
                v_dedupe
            );
            v_enqueued := v_enqueued + 1;
        END IF;
    END LOOP;

    -- 4. Tips: Expire pending_payment tips older than 7 days
    FOR v_tip IN
        SELECT t.id, t.tip_number, t.reader_id
        FROM public.tips t
        WHERE t.status = 'pending_payment'
          AND t.created_at < pg_catalog.now() - interval '7 days'
    LOOP
        UPDATE public.tips
        SET status = 'expired',
            open_slot = NULL,
            updated_at = pg_catalog.now()
        WHERE id = v_tip.id;

        INSERT INTO public.audit_logs (
            actor_id, actor_role, action_type, entity_type, entity_id, new_state, created_at
        ) VALUES (
            NULL, 'system', 'expire_tip', 'tips', v_tip.id::text,
            pg_catalog.jsonb_build_object('tip_number', v_tip.tip_number, 'status', 'expired'),
            pg_catalog.now()
        );

        v_expired_tips := v_expired_tips + 1;
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'status', 'ok',
        'enqueued_reminders', v_enqueued,
        'expired_tips', v_expired_tips,
        'ran_at', pg_catalog.now()
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- SECTION 7: DYNAMIC TRIGGER REVOCATION & RPC PERMISSIONS
-- ------------------------------------------------------------------------------

DO $$
DECLARE
    v_fn record;
BEGIN
    FOR v_fn IN
        SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prorettype = 'trigger'::regtype
    LOOP
        EXECUTE pg_catalog.format(
            'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;',
            v_fn.proname, v_fn.args
        );
    END LOOP;
END $$;

-- Revoke execute from PUBLIC and anon on all tip RPCs
REVOKE ALL ON FUNCTION public.get_tip_options(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_tip_settings(boolean, text, integer[], integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_tip_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_tip(uuid, numeric, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_tip_payment(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_tip(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_tip_received(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_tip_not_received(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_tips() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_tip_by_number(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_received_tips(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_tip_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hide_tip_message(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_tip_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_tip_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_tips(text, text, boolean, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_tip(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_tip(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer, boolean, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_scheduled_reminders() FROM PUBLIC, anon;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_tip_options(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_tip_settings(boolean, text, integer[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tip_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tip(uuid, numeric, uuid, uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tip_payment(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_tip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tip_received(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_tip_not_received(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tip_by_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_received_tips(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tip_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_tip_message(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_tip_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_tip_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_tips(text, text, boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_tip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_tip(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_platform_settings(numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text, numeric, integer, boolean, integer, integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_scheduled_reminders() TO authenticated;

-- Also allow anon to read tip options (e.g. to see if tips are enabled and show prompt to sign in)
GRANT EXECUTE ON FUNCTION public.get_tip_options(uuid, uuid, uuid) TO anon;
