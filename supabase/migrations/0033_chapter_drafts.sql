-- ==============================================================================
-- UNB Premium — Migration 0033: Offline-Tolerant Autosave & Chapter Drafts Store
-- Description:
--   1. Table public.chapter_drafts:
--      Separate draft store for chapter autosaves. Never writes into public.chapters.
--      Holds client_key, novel_id, optional chapter_id, urdu title and content,
--      chapter_number, optimistic concurrency revision, and device label.
--   2. Table public.chapter_draft_rate_limits:
--      Tracks sliding hourly rate limits per writer (240 syncs/hr).
--   3. RPC upsert_chapter_draft:
--      Atomic draft upsert with optimistic concurrency check, length validation (<=120k chars),
--      draft count limits (max 100/writer), rate limiting, and idempotency.
--   4. RPC get_chapter_draft:
--      Fetches full draft content and metadata for the calling writer's client_key.
--   5. RPC list_my_chapter_drafts:
--      Fetches metadata only (no full content) for all drafts belonging to caller.
--   6. RPC discard_chapter_draft:
--      Deletes draft and logs meaningful action to public.audit_logs.
--   7. RPC resolve_chapter_draft_conflict:
--      Explicit conflict resolution ('keep_mine' or 'keep_server') bumping server_revision.
--   8. RPC purge_old_chapter_drafts:
--      Retention cleanup callable only by admins or scheduled cron worker.
-- Security & Hardening:
--   - Strict search_path = '' lockdown.
--   - RLS enabled; all direct table privileges REVOKED from anon and authenticated (RPC-only).
--   - REVOKE EXECUTE FROM PUBLIC, anon on all functions.
--   - Dynamic trigger privilege lockdown loop applied.
--   - Zero qualified SQL syntax constructs (btrim, coalesce, now).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: TABLES AND INDEXES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chapter_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    novel_id uuid NOT NULL REFERENCES public.novels(id) ON DELETE CASCADE,
    chapter_id uuid NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    client_key text NOT NULL,
    title_urdu text NULL,
    content_urdu text NOT NULL,
    chapter_number integer NULL,
    base_chapter_updated_at timestamptz NULL,
    server_revision integer NOT NULL DEFAULT 1,
    device_label text NULL,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT uq_chapter_drafts_writer_client_key UNIQUE (writer_id, client_key),
    CONSTRAINT chk_chapter_drafts_content_length CHECK (char_length(content_urdu) <= 120000),
    CONSTRAINT chk_chapter_drafts_client_key_length CHECK (char_length(client_key) >= 1 AND char_length(client_key) <= 64),
    CONSTRAINT chk_chapter_drafts_device_label_length CHECK (device_label IS NULL OR char_length(device_label) <= 40),
    CONSTRAINT chk_chapter_drafts_title_length CHECK (title_urdu IS NULL OR char_length(title_urdu) <= 200),
    CONSTRAINT chk_chapter_drafts_revision_positive CHECK (server_revision >= 1)
);

CREATE TABLE IF NOT EXISTS public.chapter_draft_rate_limits (
    writer_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    window_start timestamptz NOT NULL DEFAULT pg_catalog.now(),
    call_count integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_chapter_drafts_writer_novel
    ON public.chapter_drafts (writer_id, novel_id);

CREATE INDEX IF NOT EXISTS idx_chapter_drafts_chapter
    ON public.chapter_drafts (chapter_id)
    WHERE chapter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chapter_drafts_updated_at
    ON public.chapter_drafts (updated_at);

-- Enable Row Level Security and lock down direct table operations
ALTER TABLE public.chapter_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_draft_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chapter_drafts FROM anon, authenticated;
REVOKE ALL ON TABLE public.chapter_draft_rate_limits FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 2: TRIGGER FUNCTION FOR updated_at
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_chapter_drafts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chapter_drafts_set_updated_at ON public.chapter_drafts;
CREATE TRIGGER trg_chapter_drafts_set_updated_at
    BEFORE UPDATE ON public.chapter_drafts
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_chapter_drafts_updated_at();

REVOKE EXECUTE ON FUNCTION public.trg_chapter_drafts_updated_at() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 3: RPC upsert_chapter_draft
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_chapter_draft(
    p_novel_id uuid,
    p_chapter_id uuid DEFAULT NULL,
    p_client_key text DEFAULT NULL,
    p_title_urdu text DEFAULT NULL,
    p_content_urdu text DEFAULT '',
    p_chapter_number integer DEFAULT NULL,
    p_base_chapter_updated_at timestamptz DEFAULT NULL,
    p_expected_server_revision integer DEFAULT 1,
    p_device_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role text;
    v_writer_status text;
    v_novel_record record;
    v_chapter_record record;
    v_existing record;
    v_window_start timestamptz;
    v_call_count integer;
    v_draft_count integer;
    v_new_revision integer;
    v_new_updated_at timestamptz;
BEGIN
    -- 1. Identify and authenticate caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Profile not found.';
    END IF;

    -- 2. Verify novel existence and caller ownership
    SELECT id, writer_id, status INTO v_novel_record
    FROM public.novels
    WHERE id = p_novel_id;

    IF v_novel_record.id IS NULL THEN
        RAISE EXCEPTION 'Novel not found.';
    END IF;

    IF v_caller_role <> 'admin' AND v_novel_record.writer_id <> v_caller_id THEN
        RAISE EXCEPTION 'Access denied. You do not own this novel.';
    END IF;

    -- 3. Verify writer status if non-admin
    IF v_caller_role <> 'admin' THEN
        SELECT status INTO v_writer_status
        FROM public.writer_profiles
        WHERE id = v_caller_id;

        IF v_writer_status <> 'approved' THEN
            RAISE EXCEPTION 'Only approved writers can save drafts.';
        END IF;
    END IF;

    -- 4. Verify novel status allows modifications
    IF v_novel_record.status IN ('under_review', 'suspended') THEN
        RAISE EXCEPTION 'Drafts cannot be modified while novel is %.', v_novel_record.status;
    END IF;

    -- 5. Verify chapter existence and relation if p_chapter_id provided
    IF p_chapter_id IS NOT NULL THEN
        SELECT id, novel_id, updated_at INTO v_chapter_record
        FROM public.chapters
        WHERE id = p_chapter_id;

        IF v_chapter_record.id IS NULL OR v_chapter_record.novel_id <> p_novel_id THEN
            RAISE EXCEPTION 'Chapter not found in this novel.';
        END IF;
    END IF;

    -- 6. Validate inputs
    IF p_client_key IS NULL OR length(btrim(p_client_key)) = 0 OR length(p_client_key) > 64 THEN
        RAISE EXCEPTION 'Client key must be between 1 and 64 characters.';
    END IF;

    IF p_content_urdu IS NULL THEN
        RAISE EXCEPTION 'Draft content cannot be null.';
    END IF;

    IF length(p_content_urdu) > 120000 THEN
        RAISE EXCEPTION 'Draft content exceeds maximum length of 120,000 characters.';
    END IF;

    IF p_title_urdu IS NOT NULL AND length(p_title_urdu) > 200 THEN
        RAISE EXCEPTION 'Draft title exceeds maximum length of 200 characters.';
    END IF;

    IF p_device_label IS NOT NULL AND length(p_device_label) > 40 THEN
        RAISE EXCEPTION 'Device label exceeds maximum length of 40 characters.';
    END IF;

    -- 7. Rate limit: 240 calls per hour per writer
    SELECT window_start, call_count INTO v_window_start, v_call_count
    FROM public.chapter_draft_rate_limits
    WHERE writer_id = v_caller_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.chapter_draft_rate_limits (writer_id, window_start, call_count)
        VALUES (v_caller_id, pg_catalog.now(), 1)
        ON CONFLICT (writer_id) DO UPDATE
        SET window_start = pg_catalog.now(), call_count = 1;
    ELSIF pg_catalog.now() - v_window_start > interval '1 hour' THEN
        UPDATE public.chapter_draft_rate_limits
        SET window_start = pg_catalog.now(), call_count = 1
        WHERE writer_id = v_caller_id;
    ELSIF v_call_count >= 240 THEN
        RAISE EXCEPTION 'Draft sync rate limit exceeded: You can sync at most 240 times per hour. Please wait before syncing again.';
    ELSE
        UPDATE public.chapter_draft_rate_limits
        SET call_count = call_count + 1
        WHERE writer_id = v_caller_id;
    END IF;

    -- 8. Fetch existing draft row with row lock
    SELECT * INTO v_existing
    FROM public.chapter_drafts
    WHERE writer_id = v_caller_id AND client_key = p_client_key
    FOR UPDATE;

    IF v_existing.id IS NOT NULL THEN
        -- Concurrency check: If server_revision <> p_expected_server_revision, return conflict
        IF p_expected_server_revision IS NOT NULL AND v_existing.server_revision <> p_expected_server_revision THEN
            RETURN jsonb_build_object(
                'status', 'conflict',
                'server_revision', v_existing.server_revision,
                'server_updated_at', v_existing.updated_at,
                'device_label', v_existing.device_label,
                'content_urdu', v_existing.content_urdu,
                'title_urdu', v_existing.title_urdu
            );
        END IF;

        -- Idempotency check: If content, title, chapter_number, and chapter_id are identical
        IF v_existing.content_urdu = p_content_urdu
           AND coalesce(v_existing.title_urdu, '') = coalesce(p_title_urdu, '')
           AND coalesce(v_existing.chapter_number, 0) = coalesce(p_chapter_number, 0)
           AND (v_existing.chapter_id IS NOT DISTINCT FROM p_chapter_id) THEN
            UPDATE public.chapter_drafts
            SET updated_at = pg_catalog.now(),
                device_label = coalesce(p_device_label, device_label)
            WHERE id = v_existing.id
            RETURNING server_revision, updated_at INTO v_new_revision, v_new_updated_at;

            RETURN jsonb_build_object(
                'status', 'ok',
                'server_revision', v_new_revision,
                'updated_at', v_new_updated_at
            );
        END IF;

        -- Content changed and revisions matched: bump server_revision
        UPDATE public.chapter_drafts
        SET novel_id = p_novel_id,
            chapter_id = p_chapter_id,
            title_urdu = p_title_urdu,
            content_urdu = p_content_urdu,
            chapter_number = p_chapter_number,
            base_chapter_updated_at = coalesce(p_base_chapter_updated_at, base_chapter_updated_at),
            server_revision = server_revision + 1,
            device_label = coalesce(p_device_label, device_label),
            updated_at = pg_catalog.now()
        WHERE id = v_existing.id
        RETURNING server_revision, updated_at INTO v_new_revision, v_new_updated_at;

        RETURN jsonb_build_object(
            'status', 'ok',
            'server_revision', v_new_revision,
            'updated_at', v_new_updated_at
        );
    ELSE
        -- Draft count check: At most 100 drafts per writer
        SELECT count(*) INTO v_draft_count
        FROM public.chapter_drafts
        WHERE writer_id = v_caller_id;

        IF v_draft_count >= 100 THEN
            RAISE EXCEPTION 'Maximum draft limit reached: You can have at most 100 active drafts. Please save or discard existing drafts.';
        END IF;

        -- Insert initial draft with server_revision = 1
        INSERT INTO public.chapter_drafts (
            writer_id,
            novel_id,
            chapter_id,
            client_key,
            title_urdu,
            content_urdu,
            chapter_number,
            base_chapter_updated_at,
            server_revision,
            device_label,
            created_at,
            updated_at
        ) VALUES (
            v_caller_id,
            p_novel_id,
            p_chapter_id,
            p_client_key,
            p_title_urdu,
            p_content_urdu,
            p_chapter_number,
            p_base_chapter_updated_at,
            1,
            p_device_label,
            pg_catalog.now(),
            pg_catalog.now()
        )
        RETURNING server_revision, updated_at INTO v_new_revision, v_new_updated_at;

        RETURN jsonb_build_object(
            'status', 'ok',
            'server_revision', v_new_revision,
            'updated_at', v_new_updated_at
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_chapter_draft(uuid, uuid, text, text, text, integer, timestamptz, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_chapter_draft(uuid, uuid, text, text, text, integer, timestamptz, integer, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 4: RPC get_chapter_draft
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_chapter_draft(
    p_client_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_draft record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT
        id,
        novel_id,
        chapter_id,
        client_key,
        title_urdu,
        content_urdu,
        chapter_number,
        base_chapter_updated_at,
        server_revision,
        device_label,
        created_at,
        updated_at,
        length(content_urdu) AS character_count
    INTO v_draft
    FROM public.chapter_drafts
    WHERE writer_id = v_caller_id AND client_key = p_client_key;

    IF v_draft.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_draft.id,
        'novel_id', v_draft.novel_id,
        'chapter_id', v_draft.chapter_id,
        'client_key', v_draft.client_key,
        'title_urdu', v_draft.title_urdu,
        'content_urdu', v_draft.content_urdu,
        'chapter_number', v_draft.chapter_number,
        'base_chapter_updated_at', v_draft.base_chapter_updated_at,
        'server_revision', v_draft.server_revision,
        'device_label', v_draft.device_label,
        'created_at', v_draft.created_at,
        'updated_at', v_draft.updated_at,
        'character_count', v_draft.character_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_chapter_draft(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_draft(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 5: RPC list_my_chapter_drafts
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_my_chapter_drafts(
    p_novel_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_result jsonb;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'novel_id', d.novel_id,
            'chapter_id', d.chapter_id,
            'client_key', d.client_key,
            'title_urdu', d.title_urdu,
            'chapter_number', d.chapter_number,
            'base_chapter_updated_at', d.base_chapter_updated_at,
            'server_revision', d.server_revision,
            'device_label', d.device_label,
            'created_at', d.created_at,
            'updated_at', d.updated_at,
            'character_count', length(d.content_urdu)
        ) ORDER BY d.updated_at DESC
    ), '[]'::jsonb)
    INTO v_result
    FROM public.chapter_drafts d
    WHERE d.writer_id = v_caller_id
      AND (p_novel_id IS NULL OR d.novel_id = p_novel_id);

    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_my_chapter_drafts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_chapter_drafts(uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 6: RPC discard_chapter_draft
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discard_chapter_draft(
    p_client_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role text;
    v_draft record;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    SELECT * INTO v_draft
    FROM public.chapter_drafts
    WHERE writer_id = v_caller_id AND client_key = p_client_key
    FOR UPDATE;

    IF v_draft.id IS NULL THEN
        RETURN jsonb_build_object('status', 'ok', 'discarded', false);
    END IF;

    DELETE FROM public.chapter_drafts
    WHERE id = v_draft.id;

    -- Meaningful audit log entry for draft discard
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
        coalesce(v_caller_role, 'writer'),
        'chapter_draft_discarded',
        'chapter_draft',
        v_draft.id::text,
        jsonb_build_object(
            'client_key', v_draft.client_key,
            'novel_id', v_draft.novel_id,
            'chapter_id', v_draft.chapter_id,
            'server_revision', v_draft.server_revision,
            'character_count', length(v_draft.content_urdu),
            'title_urdu', v_draft.title_urdu
        ),
        NULL,
        pg_catalog.now()
    );

    RETURN jsonb_build_object('status', 'ok', 'discarded', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.discard_chapter_draft(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_chapter_draft(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 7: RPC resolve_chapter_draft_conflict
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_chapter_draft_conflict(
    p_client_key text,
    p_choice text,
    p_content_urdu text DEFAULT NULL,
    p_title_urdu text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_existing record;
    v_new_revision integer;
    v_new_updated_at timestamptz;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_choice NOT IN ('keep_mine', 'keep_server') THEN
        RAISE EXCEPTION 'Invalid resolution choice. Must be keep_mine or keep_server.';
    END IF;

    SELECT * INTO v_existing
    FROM public.chapter_drafts
    WHERE writer_id = v_caller_id AND client_key = p_client_key
    FOR UPDATE;

    IF v_existing.id IS NULL THEN
        RAISE EXCEPTION 'Draft not found.';
    END IF;

    IF p_choice = 'keep_mine' THEN
        IF p_content_urdu IS NULL THEN
            RAISE EXCEPTION 'Content cannot be null when choosing keep_mine.';
        END IF;

        IF length(p_content_urdu) > 120000 THEN
            RAISE EXCEPTION 'Draft content exceeds maximum length of 120,000 characters.';
        END IF;

        IF p_title_urdu IS NOT NULL AND length(p_title_urdu) > 200 THEN
            RAISE EXCEPTION 'Draft title exceeds maximum length of 200 characters.';
        END IF;

        UPDATE public.chapter_drafts
        SET content_urdu = p_content_urdu,
            title_urdu = p_title_urdu,
            server_revision = server_revision + 1,
            updated_at = pg_catalog.now()
        WHERE id = v_existing.id
        RETURNING server_revision, updated_at INTO v_new_revision, v_new_updated_at;

        RETURN jsonb_build_object(
            'status', 'ok',
            'choice', 'keep_mine',
            'server_revision', v_new_revision,
            'updated_at', v_new_updated_at
        );
    ELSE
        -- keep_server: return current server draft version and revision
        RETURN jsonb_build_object(
            'status', 'ok',
            'choice', 'keep_server',
            'server_revision', v_existing.server_revision,
            'updated_at', v_existing.updated_at,
            'content_urdu', v_existing.content_urdu,
            'title_urdu', v_existing.title_urdu
        );
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_chapter_draft_conflict(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_chapter_draft_conflict(text, text, text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- SECTION 8: RPC purge_old_chapter_drafts
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_old_chapter_drafts(
    p_days integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_role text;
    v_deleted_count integer;
    v_cutoff timestamptz;
BEGIN
    v_caller_id := auth.uid();

    -- Authorize: Admin role OR service_role (background cron worker)
    IF auth.role() <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required.';
        END IF;

        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role <> 'admin' THEN
            RAISE EXCEPTION 'Access denied. Only administrators or cron worker can purge drafts.';
        END IF;
    END IF;

    IF p_days IS NULL OR p_days < 1 THEN
        p_days := 90;
    END IF;

    v_cutoff := pg_catalog.now() - (p_days * interval '1 day');

    DELETE FROM public.chapter_drafts
    WHERE updated_at < v_cutoff;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Clean up expired draft rate limit tracking records
    DELETE FROM public.chapter_draft_rate_limits
    WHERE window_start < pg_catalog.now() - interval '24 hours';

    RETURN jsonb_build_object(
        'status', 'ok',
        'purged_drafts', v_deleted_count,
        'cutoff_timestamp', v_cutoff
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_chapter_drafts(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_old_chapter_drafts(integer) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- SECTION 9: DYNAMIC TRIGGER FUNCTION PRIVILEGE LOCKDOWN LOOP
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_sql text;
    v_revoked_count integer := 0;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS proc_sig, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prorettype = 'trigger'::regtype
          AND p.prokind = 'f'
    LOOP
        BEGIN
            v_sql := format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.proc_sig);
            EXECUTE v_sql;
            v_revoked_count := v_revoked_count + 1;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END;
$$;
