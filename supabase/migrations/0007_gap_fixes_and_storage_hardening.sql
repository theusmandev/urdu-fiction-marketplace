-- ==============================================================================
-- UNB Premium — Migration 0007: Gap Fixes and Storage Hardening Patch
-- Description:
--   1. Chapters: 120,000 char length CHECK, chapter_revisions with AFTER UPDATE
--      trigger, and reader_progress table with isolated reader RLS.
--   2. platform_settings: idempotent CHECK (id = 1) constraint and documented
--      ROUND(..., 2) arithmetic in financial procedures.
--   3. resolve_dispute: decoupled from auto-refund; separate admin_force_verify
--      and record_refund_adjustment outcomes; resolved_for_writer leaves order rejected.
--   4. Storage: granular RLS for novel-assets (user folder isolated) and
--      payment-proofs (reader order-folder isolated, order status restricted).
--   5. Client direct write blocks: strictly prohibit direct INSERT/UPDATE/DELETE on
--      commission_payments, disputes, notifications (read-status only),
--      purchase_entitlements, sales_ledger, and audit_logs.
--   6. Admin bootstrap: allows direct postgres superuser role updates while strictly
--      blocking authenticated users from privilege escalation.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: CHAPTERS, REVISIONS & READER PROGRESS
-- ------------------------------------------------------------------------------

-- 1.1 Chapters: Add CHECK constraint on content_urdu length (~120,000 characters max)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.chapters'::regclass 
          AND conname = 'chk_chapters_content_length'
    ) THEN
        ALTER TABLE public.chapters
            ADD CONSTRAINT chk_chapters_content_length
            CHECK (pg_catalog.char_length(content_urdu) <= 120000);
    END IF;
END $$;

-- 1.2 chapter_revisions: Historical log of chapter edits
CREATE TABLE IF NOT EXISTS public.chapter_revisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    content_urdu text NOT NULL,
    edited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapter_revisions_chapter
    ON public.chapter_revisions (chapter_id, created_at DESC);

-- AFTER UPDATE trigger on chapters populating chapter_revisions with previous snapshot
CREATE OR REPLACE FUNCTION public.trg_record_chapter_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Record prior version in chapter_revisions only when content has changed
    IF NEW.content_urdu IS DISTINCT FROM OLD.content_urdu THEN
        INSERT INTO public.chapter_revisions (
            chapter_id,
            content_urdu,
            edited_by,
            created_at
        ) VALUES (
            OLD.id,
            OLD.content_urdu,
            auth.uid(),
            pg_catalog.now()
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chapters_record_revision ON public.chapters;
CREATE TRIGGER trg_chapters_record_revision
    AFTER UPDATE ON public.chapters
    FOR EACH ROW EXECUTE FUNCTION public.trg_record_chapter_revision();

-- RLS for chapter_revisions: readable ONLY by novel's author and admins
ALTER TABLE public.chapter_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Writers view own chapter revisions" ON public.chapter_revisions;
CREATE POLICY "Writers view own chapter revisions"
    ON public.chapter_revisions FOR SELECT
    USING (
        public.is_admin() OR
        EXISTS (
            SELECT 1 FROM public.chapters c
            JOIN public.novels n ON n.id = c.novel_id
            WHERE c.id = chapter_revisions.chapter_id AND n.writer_id = auth.uid()
        )
    );

-- Block direct client writes to chapter_revisions
REVOKE INSERT, UPDATE, DELETE ON public.chapter_revisions FROM PUBLIC, anon, authenticated;

-- 1.3 reader_progress: Bookmarking / chapter progress per reader per novel
CREATE TABLE IF NOT EXISTS public.reader_progress (
    reader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    novel_id uuid NOT NULL REFERENCES public.novels(id) ON DELETE CASCADE,
    last_chapter_number integer NOT NULL CHECK (last_chapter_number > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (reader_id, novel_id)
);

CREATE INDEX IF NOT EXISTS idx_reader_progress_novel ON public.reader_progress (novel_id);

ALTER TABLE public.reader_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readers read own progress" ON public.reader_progress;
CREATE POLICY "Readers read own progress"
    ON public.reader_progress FOR SELECT
    USING (reader_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Readers insert own progress" ON public.reader_progress;
CREATE POLICY "Readers insert own progress"
    ON public.reader_progress FOR INSERT
    WITH CHECK (reader_id = auth.uid());

DROP POLICY IF EXISTS "Readers update own progress" ON public.reader_progress;
CREATE POLICY "Readers update own progress"
    ON public.reader_progress FOR UPDATE
    USING (reader_id = auth.uid())
    WITH CHECK (reader_id = auth.uid());

DROP POLICY IF EXISTS "Readers delete own progress" ON public.reader_progress;
CREATE POLICY "Readers delete own progress"
    ON public.reader_progress FOR DELETE
    USING (reader_id = auth.uid() OR public.is_admin());


-- ------------------------------------------------------------------------------
-- SECTION 2: PLATFORM SETTINGS SINGLE-ROW CHECK & FINANCIAL ROUNDING
-- ------------------------------------------------------------------------------

-- Ensure platform_settings check constraint exists idempotently
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.platform_settings'::regclass 
          AND conname = 'chk_platform_settings_single_row'
    ) THEN
        ALTER TABLE public.platform_settings
            ADD CONSTRAINT chk_platform_settings_single_row CHECK (id = 1);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 3: PRIVILEGE ESCALATION TRIGGERS (SUPPORT POSTGRES BOOTSTRAP)
-- ------------------------------------------------------------------------------

-- Allow direct SQL bootstrapping by postgres/superuser while blocking authenticated users
CREATE OR REPLACE FUNCTION public.trg_protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_db_admin boolean;
BEGIN
    -- Detect direct postgres/DBA execution (e.g. initial admin bootstrap in SQL Editor)
    -- When running via client API, auth.uid() is populated or role is 'authenticated'/'anon'
    v_is_db_admin := (auth.uid() IS NULL AND pg_catalog.current_setting('role', true) NOT IN ('authenticated', 'anon'));

    IF NOT v_is_db_admin AND NOT public.is_admin() THEN
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


-- ------------------------------------------------------------------------------
-- SECTION 4: DISPUTE RESOLUTION REVISION & ADMIN FORCE-VERIFY
-- ------------------------------------------------------------------------------

-- 4.1 Revised resolve_dispute: NO auto-refund on resolved_for_reader. Leaves order rejected on resolved_for_writer.
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

    IF p_resolution_note IS NULL OR trim(p_resolution_note) = '' THEN
        RAISE EXCEPTION 'A resolution note is required.';
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

    -- Update dispute status and notes
    UPDATE public.disputes
    SET status = p_resolution::public.dispute_status,
        resolution_note = p_resolution_note,
        admin_resolution_notes = p_resolution_note,
        resolved_by = v_caller_id,
        resolved_by_id = v_caller_id,
        resolved_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_dispute_id;

    -- OUTCOME LOGIC:
    -- 1. resolved_for_writer: Leave / set order to 'rejected'
    IF p_resolution = 'resolved_for_writer' THEN
        UPDATE public.orders
        SET status = 'rejected',
            rejected_reason = 'Dispute resolved in favor of writer: ' || p_resolution_note,
            updated_at = pg_catalog.now()
        WHERE id = v_order.id;
    -- 2. resolved_for_reader: Do NOT auto-refund. Keep order in current state for explicit admin action:
    --    (a) admin_force_verify: if reader proved payment
    --    (b) record_refund_adjustment: if order was previously verified and needs reversal
    ELSIF p_resolution = 'resolved_for_reader' THEN
        UPDATE public.orders
        SET updated_at = pg_catalog.now()
        WHERE id = v_order.id;
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
        pg_catalog.jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', p_resolution),
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
        pg_catalog.jsonb_build_object('order_id', v_order.id, 'dispute_id', p_dispute_id, 'resolution', p_resolution),
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

-- 4.2 admin_force_verify: Admin overrides writer rejection / confirms reader proof
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

    IF p_admin_note IS NULL OR trim(p_admin_note) = '' THEN
        RAISE EXCEPTION 'An admin note is required to force-verify an order.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Fetch latest payment submission
    SELECT * INTO v_submission
    FROM public.payment_submissions
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Determine authoritative commission rate at verification time
    SELECT * INTO v_writer FROM public.writer_profiles WHERE id = v_order.writer_id;
    SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

    v_rate := coalesce(v_writer.custom_commission_rate, v_settings.default_commission_rate, 20.00);

    -- Apply explicit ROUND(..., 2) on commission and net calculation
    v_commission_pkr := pg_catalog.round((v_order.amount_pkr * v_rate / 100.0), 2);
    v_writer_share_pkr := v_order.amount_pkr - v_commission_pkr;

    -- 1. Update Payment Submission if present
    IF v_submission.id IS NOT NULL THEN
        UPDATE public.payment_submissions
        SET reviewer_status = 'verified',
            reviewer_note = 'Admin force-verified: ' || p_admin_note,
            reviewed_by = v_caller_id,
            reviewed_at = pg_catalog.now()
        WHERE id = v_submission.id;
    END IF;

    -- 2. Update Order
    UPDATE public.orders
    SET status = 'verified',
        applied_commission_rate = v_rate,
        calculated_commission_pkr = v_commission_pkr,
        calculated_writer_share_pkr = v_writer_share_pkr,
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_order_id;

    -- 3. Grant Purchase Entitlement
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

    -- 4. Record Immutable Entry in Sales Ledger
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
            'Admin force-verified: ' || p_admin_note,
            pg_catalog.now()
        )
        RETURNING id INTO v_ledger_id;
    END IF;

    -- 5. Reconcile Writer Accrued Unpaid Commission from Ledger
    v_new_unpaid := public.reconcile_writer_unpaid_commission(v_order.writer_id);

    SELECT is_orders_paused_for_commission INTO v_paused
    FROM public.writer_profiles
    WHERE id = v_order.writer_id;

    -- 6. Notifications
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
        'ادائیگی کی تصدیق ہو گئی (Payment Verified by Admin)',
        'انتظامیہ نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ ناول آپ کی لائبریری میں دستیاب ہے۔',
        'انتظامیہ نے آپ کی ادائیگی کی تصدیق کر دی ہے۔ نوٹ: ' || p_admin_note,
        '/library',
        pg_catalog.jsonb_build_object('order_id', p_order_id, 'novel_id', v_order.novel_id),
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
        'order_verified',
        'ایڈمن تصدیق شدہ آرڈر (Order Force-Verified by Admin)',
        'انتظامیہ نے تنازعہ کا جائزہ لینے کے بعد آرڈر نمبر ' || v_order.order_number || ' کی تصدیق کی ہے۔',
        'نوٹ: ' || p_admin_note,
        '/writer/orders',
        pg_catalog.jsonb_build_object('order_id', p_order_id),
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
        'admin',
        'ADMIN_FORCE_VERIFY',
        'orders',
        p_order_id::text,
        pg_catalog.jsonb_build_object('status', v_order.status),
        pg_catalog.jsonb_build_object(
            'status', 'verified',
            'entitlement_id', v_entitlement_id,
            'ledger_id', v_ledger_id,
            'admin_note', p_admin_note,
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

REVOKE EXECUTE ON FUNCTION public.admin_force_verify(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_force_verify(uuid, text) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 5: STORAGE POLICIES REFINEMENT (EXACT SPECIFICATION)
-- ------------------------------------------------------------------------------

-- Ensure storage buckets exist with precise limits
DO $$
BEGIN
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
EXCEPTION
    WHEN undefined_table THEN NULL;
END $$;

-- Drop previous storage policies to avoid conflicts
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public view novel assets" ON storage.objects;
    DROP POLICY IF EXISTS "Writer and admin manage novel assets" ON storage.objects;
    DROP POLICY IF EXISTS "novel_assets_public_read" ON storage.objects;
    DROP POLICY IF EXISTS "novel_assets_user_folder_insert" ON storage.objects;
    DROP POLICY IF EXISTS "novel_assets_user_folder_update" ON storage.objects;
    DROP POLICY IF EXISTS "novel_assets_user_folder_delete" ON storage.objects;
    DROP POLICY IF EXISTS "novel_assets_admin_all" ON storage.objects;

    DROP POLICY IF EXISTS "Private payment proof read access" ON storage.objects;
    DROP POLICY IF EXISTS "Reader upload payment proof" ON storage.objects;
    DROP POLICY IF EXISTS "payment_proofs_read" ON storage.objects;
    DROP POLICY IF EXISTS "payment_proofs_reader_insert" ON storage.objects;
    DROP POLICY IF EXISTS "payment_proofs_admin_all" ON storage.objects;
EXCEPTION
    WHEN undefined_table THEN NULL;
END $$;

-- Policies for bucket: novel-assets
DO $$
BEGIN
    -- 1. Public read
    CREATE POLICY "novel_assets_public_read"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'novel-assets');

    -- 2. Insert: user in own folder ({auth.uid()}/...) or admin
    CREATE POLICY "novel_assets_user_folder_insert"
        ON storage.objects FOR INSERT
        WITH CHECK (
            bucket_id = 'novel-assets' AND (
                public.is_admin() OR
                (storage.foldername(name))[1] = auth.uid()::text
            )
        );

    -- 3. Update: user in own folder or admin
    CREATE POLICY "novel_assets_user_folder_update"
        ON storage.objects FOR UPDATE
        USING (
            bucket_id = 'novel-assets' AND (
                public.is_admin() OR
                (storage.foldername(name))[1] = auth.uid()::text
            )
        )
        WITH CHECK (
            bucket_id = 'novel-assets' AND (
                public.is_admin() OR
                (storage.foldername(name))[1] = auth.uid()::text
            )
        );

    -- 4. Delete: user in own folder or admin
    CREATE POLICY "novel_assets_user_folder_delete"
        ON storage.objects FOR DELETE
        USING (
            bucket_id = 'novel-assets' AND (
                public.is_admin() OR
                (storage.foldername(name))[1] = auth.uid()::text
            )
        );

    -- Policies for bucket: payment-proofs
    -- 5. Read: Reader who owns the order, order's writer, or admin (also writer for invoices)
    CREATE POLICY "payment_proofs_read"
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

    -- 6. Insert: Reader may upload ONLY to {order_id}/ of an order they own,
    --    ONLY while that order is in pending_payment or rejected status
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
                      AND ci.status IN ('invoiced', 'open', 'payment_reported')
                )
            )
        );

    -- 7. Admin manage payment-proofs (UPDATE / DELETE)
    CREATE POLICY "payment_proofs_admin_all"
        ON storage.objects FOR ALL
        USING (
            bucket_id = 'payment-proofs' AND public.is_admin()
        )
        WITH CHECK (
            bucket_id = 'payment-proofs' AND public.is_admin()
        );
EXCEPTION
    WHEN undefined_table THEN NULL;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 6: STRICT CLIENT DIRECT WRITE PROHIBITIONS
-- ------------------------------------------------------------------------------

-- 6.1 disputes: Drop any direct INSERT policy (must use open_dispute RPC)
DROP POLICY IF EXISTS "Readers open dispute for own orders" ON public.disputes;
REVOKE INSERT, UPDATE, DELETE ON public.disputes FROM PUBLIC, anon, authenticated;

-- 6.2 commission_payments: Admin and RPC only
REVOKE INSERT, UPDATE, DELETE ON public.commission_payments FROM PUBLIC, anon, authenticated;

-- 6.3 purchase_entitlements: RPC only
REVOKE INSERT, UPDATE, DELETE ON public.purchase_entitlements FROM PUBLIC, anon, authenticated;

-- 6.4 sales_ledger: Append-only RPC only
REVOKE INSERT, UPDATE, DELETE ON public.sales_ledger FROM PUBLIC, anon, authenticated;

-- 6.5 audit_logs: Append-only RPC only
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM PUBLIC, anon, authenticated;

-- 6.6 notifications: Users can only mark their own notifications as read
-- Block direct client INSERT and DELETE
REVOKE INSERT, DELETE ON public.notifications FROM PUBLIC, anon, authenticated;

-- Trigger ensuring non-admins can ONLY modify is_read and read_at
CREATE OR REPLACE FUNCTION public.trg_protect_notification_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
           NEW.type IS DISTINCT FROM OLD.type OR
           NEW.title IS DISTINCT FROM OLD.title OR
           NEW.message IS DISTINCT FROM OLD.message OR
           NEW.body IS DISTINCT FROM OLD.body OR
           NEW.link IS DISTINCT FROM OLD.link OR
           NEW.entity_refs IS DISTINCT FROM OLD.entity_refs OR
           NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Unauthorized: Users can only update the read status of their own notifications.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_notification_columns ON public.notifications;
CREATE TRIGGER trg_protect_notification_columns
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.trg_protect_notification_columns();
