-- ==============================================================================
-- UNB Premium — Migration 0050: Enable "Say Thanks" (Tips) by Default for All Writers
-- Description:
--   1. Alter column default on public.writer_tip_settings:
--      - enabled boolean NOT NULL DEFAULT true
--   2. Backfill existing writer profiles:
--      - Upsert a default row into public.writer_tip_settings with enabled = true
--        for every writer profile, activating "Say Thanks" out-of-the-box.
--   3. Auto-provision on approval and application:
--      - Update public.approve_writer to automatically insert default tip settings.
--      - Update public.apply_as_writer to ensure default tip settings exist.
--   4. Update RPC fallbacks to default enabled to true when no row exists yet:
--      - public.get_tip_options (defaults writer_enabled to true)
--      - public.create_tip (allows tip if no row exists, blocks only when enabled = false)
--      - public.get_my_tip_settings (coalesce(enabled, true))
--   5. Security & Hardening:
--      - Strict search_path = '' lockdown
--      - Unqualified SQL constructs (coalesce, trim) per check:sql
--      - Preserves transactional email outbox notifications in approve_writer
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: ALTER COLUMN DEFAULT ON WRITER_TIP_SETTINGS
-- ------------------------------------------------------------------------------

ALTER TABLE public.writer_tip_settings
    ALTER COLUMN enabled SET DEFAULT true;

-- ------------------------------------------------------------------------------
-- SECTION 2: BACKFILL ALL EXISTING WRITERS TO ENABLED = TRUE
-- ------------------------------------------------------------------------------

INSERT INTO public.writer_tip_settings (
    writer_id,
    enabled,
    thank_you_message,
    preset_amounts,
    updated_at
)
SELECT
    wp.id,
    true,
    'شکریہ! آپ کی پزیرائی اور سپورٹ کا بہت شکریہ۔ یہ میرے لیے لکھنے کا سب سے بڑا حوصلہ ہے۔',
    '{100,250,500}'::integer[],
    pg_catalog.now()
FROM public.writer_profiles wp
ON CONFLICT (writer_id) DO UPDATE SET
    enabled = true,
    updated_at = pg_catalog.now();

-- ------------------------------------------------------------------------------
-- SECTION 3: AUTO-PROVISION IN WRITER APPROVAL & APPLICATION
-- ------------------------------------------------------------------------------

-- 3.1 APPROVE WRITER (Preserving email outbox wiring from 0040)
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

    UPDATE public.profiles
    SET role = 'writer',
        updated_at = pg_catalog.now()
    WHERE id = p_writer_id;

    -- Auto-provision tip settings (enabled by default)
    INSERT INTO public.writer_tip_settings (writer_id, enabled)
    VALUES (p_writer_id, true)
    ON CONFLICT (writer_id) DO NOTHING;

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
        'writer_approved',
        'مصنف اکاؤنٹ منظور ہو گیا! (Writer Account Approved)',
        'مبارک ہو! آپ کا رائٹر پروفائل منظور ہو چکا ہے۔ اب آپ ناولز شائع کر سکتے ہیں۔',
        'مبارک ہو! آپ کا رائٹر پروفائل منظور ہو چکا ہے۔ اب آپ ناولز شائع کر سکتے ہیں۔',
        '/writer/dashboard',
        pg_catalog.jsonb_build_object('writer_id', p_writer_id),
        false,
        pg_catalog.now()
    );

    -- Transactional email outbox for writer (critical event)
    PERFORM public.enqueue_email_for_notification(
        p_writer_id,
        'writer_approved',
        'Welcome to UNB Premium Writer Studio! — Application Approved',
        'Congratulations! Your author application has been approved by the editorial team.' || E'\n\nYou can now access your Writer Studio, set up your payment receiving methods, and publish your novels for readers.',
        'writer_approved:' || p_writer_id::text
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

REVOKE ALL ON FUNCTION public.approve_writer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_writer(uuid) TO authenticated;


-- 3.2 APPLY AS WRITER (Preserving reapplication logic from 0010)
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

        -- Set transaction-local setting so trigger allows reapplication transition
        PERFORM pg_catalog.set_config('app.writer_reapply', '1', true);

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

    -- Provision default tip settings
    INSERT INTO public.writer_tip_settings (writer_id, enabled)
    VALUES (v_caller_id, true)
    ON CONFLICT (writer_id) DO NOTHING;

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
        'APPLY_AS_WRITER',
        'writer_profiles',
        v_caller_id::text,
        NULL,
        pg_catalog.jsonb_build_object(
            'pen_name_urdu', trim(p_pen_name_urdu),
            'pen_name_english', trim(p_pen_name_english),
            'status', 'pending_approval'
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

REVOKE ALL ON FUNCTION public.apply_as_writer(text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_as_writer(text, text, text, text, boolean) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 4: UPDATE RPC FALLBACKS TO DEFAULT ENABLED TO TRUE
-- ------------------------------------------------------------------------------

-- 4.1 get_tip_options: Fetches publicly visible tip configuration with masked labels
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

    -- 3. Check writer tip settings (defaults to true if row not created yet)
    SELECT * INTO v_tip_settings FROM public.writer_tip_settings WHERE writer_id = v_target_writer_id;
    IF coalesce(v_tip_settings.enabled, true) = false THEN
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
    v_thank_you := coalesce(v_tip_settings.thank_you_message, 'شکریہ! آپ کی پزیرائی اور سپورٹ کا بہت شکریہ۔ یہ میرے لیے لکھنے کا سب سے بڑا حوصلہ ہے۔');
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

REVOKE ALL ON FUNCTION public.get_tip_options(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tip_options(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tip_options(uuid, uuid, uuid) TO anon;


-- 4.2 create_tip: Creates tip and snapshots payment instructions
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

REVOKE ALL ON FUNCTION public.create_tip(uuid, numeric, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tip(uuid, numeric, uuid, uuid, uuid, text, boolean) TO authenticated;


-- 4.3 get_my_tip_settings: Writer fetches own tip settings & accounts
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
        'enabled', coalesce(v_settings.enabled, true),
        'thank_you_message', coalesce(v_settings.thank_you_message, 'شکریہ! آپ کی پزیرائی اور سپورٹ کا بہت شکریہ۔ یہ میرے لیے لکھنے کا سب سے بڑا حوصلہ ہے۔'),
        'preset_amounts', coalesce(v_settings.preset_amounts, '{100,250,500}'::integer[]),
        'min_amount', v_settings.min_amount,
        'max_amount', v_settings.max_amount,
        'payment_methods', v_methods
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_tip_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tip_settings() TO authenticated;

