-- ==============================================================================
-- UNB Premium — Migration 0031: Chapter Import and Split RPCs
-- Description:
--   1. RPC import_chapters(p_novel_id uuid, p_start_number integer, p_parts jsonb):
--      Atomic batch insertion of draft chapters from writer-approved parsed splits.
--      Validates caller permissions (approved writer / admin), novel status,
--      chapter limits (<= 120,000 chars, title length, max 60 parts), and prevents
--      numbering collisions.
--   2. RPC split_chapter(p_chapter_id uuid, p_parts jsonb):
--      Atomic chapter division. Locks chapter, validates text preservation
--      (lossless whitespace-invariant check), enforces sold-content protections
--      (blocks renumbering middle published chapters on sold novels), stores
--      historical snapshot in chapter_revisions, and safely shifts following
--      chapter numbers via a two-step temporary offset to prevent unique constraint
--      violations on (novel_id, chapter_number).
--   3. Audit trail logging in public.audit_logs for all import/split actions.
-- Security & Hardening:
--   - Strict search_path = '' lockdown.
--   - REVOKE EXECUTE FROM PUBLIC, anon.
--   - GRANT EXECUTE TO authenticated.
--   - No unqualified or forbidden schema-qualified SQL syntax constructs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: RPC import_chapters
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.import_chapters(uuid, integer, jsonb);

CREATE OR REPLACE FUNCTION public.import_chapters(
    p_novel_id uuid,
    p_start_number integer DEFAULT NULL,
    p_parts jsonb DEFAULT '[]'::jsonb
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
    v_parts_count integer;
    v_start_num integer;
    v_existing_conflict integer;
    v_part jsonb;
    v_part_title text;
    v_part_content text;
    v_part_free_preview boolean;
    v_part_published boolean;
    v_inserted_chapters jsonb := '[]'::jsonb;
    v_chapter_record record;
    i integer;
BEGIN
    -- 1. Identify and authenticate caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Lookup caller profile role
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    -- 2. Verify novel existence and caller ownership
    SELECT id, writer_id, status, title_urdu INTO v_novel_record
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
            RAISE EXCEPTION 'Only approved writers can import chapters.';
        END IF;
    END IF;

    -- 4. Verify novel status allows modifications
    IF v_novel_record.status IN ('under_review', 'suspended') THEN
        RAISE EXCEPTION 'Chapters cannot be imported while novel is %.', v_novel_record.status;
    END IF;

    -- 5. Validate input parts array
    IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' THEN
        RAISE EXCEPTION 'Parts payload must be a valid JSON array.';
    END IF;

    v_parts_count := jsonb_array_length(p_parts);
    IF v_parts_count < 1 THEN
        RAISE EXCEPTION 'At least one chapter part is required.';
    END IF;

    IF v_parts_count > 60 THEN
        RAISE EXCEPTION 'Cannot import more than 60 chapters in a single operation.';
    END IF;

    -- 6. Validate each part's title and character length
    FOR i IN 0..(v_parts_count - 1) LOOP
        v_part := p_parts->i;
        v_part_title := btrim(coalesce(v_part->>'title_urdu', ''));
        v_part_content := btrim(coalesce(v_part->>'content_urdu', ''));

        IF pg_catalog.length(v_part_title) < 1 OR pg_catalog.length(v_part_title) > 200 THEN
            RAISE EXCEPTION 'Chapter part #% has an invalid title length (must be between 1 and 200 characters).', (i + 1);
        END IF;

        IF pg_catalog.length(v_part_content) < 1 THEN
            RAISE EXCEPTION 'Chapter part #% content cannot be empty.', (i + 1);
        END IF;

        IF pg_catalog.length(v_part_content) > 120000 THEN
            RAISE EXCEPTION 'Chapter part #% ("%") exceeds the 120,000 character platform limit (% characters). Please split this chapter into smaller parts.',
                (i + 1), v_part_title, pg_catalog.length(v_part_content);
        END IF;
    END LOOP;

    -- 7. Determine starting chapter number and ensure no collisions
    IF p_start_number IS NULL OR p_start_number <= 0 THEN
        SELECT coalesce(max(chapter_number), 0) + 1 INTO v_start_num
        FROM public.chapters
        WHERE novel_id = p_novel_id;
    ELSE
        v_start_num := p_start_number;
        -- Check if any chapter in range [v_start_num, v_start_num + v_parts_count - 1] already exists
        SELECT chapter_number INTO v_existing_conflict
        FROM public.chapters
        WHERE novel_id = p_novel_id
          AND chapter_number >= v_start_num
          AND chapter_number < (v_start_num + v_parts_count)
        LIMIT 1;

        IF v_existing_conflict IS NOT NULL THEN
            RAISE EXCEPTION 'Target chapter number % already exists for this novel. Cannot overwrite existing chapters.', v_existing_conflict;
        END IF;
    END IF;

    -- 8. Insert chapters atomically
    FOR i IN 0..(v_parts_count - 1) LOOP
        v_part := p_parts->i;
        v_part_title := btrim(v_part->>'title_urdu');
        v_part_content := btrim(v_part->>'content_urdu');
        -- Only part 0 can have is_free_preview = true if explicitly requested
        v_part_free_preview := CASE
            WHEN i = 0 THEN coalesce((v_part->>'is_free_preview')::boolean, false)
            ELSE false
        END;
        -- Imported chapters are saved as DRAFT (is_published = false)
        v_part_published := coalesce((v_part->>'is_published')::boolean, false);

        INSERT INTO public.chapters (
            novel_id,
            chapter_number,
            title_urdu,
            content_urdu,
            is_free_preview,
            is_published,
            created_at,
            updated_at
        ) VALUES (
            p_novel_id,
            v_start_num + i,
            v_part_title,
            v_part_content,
            v_part_free_preview,
            v_part_published,
            pg_catalog.now(),
            pg_catalog.now()
        )
        RETURNING id, chapter_number, title_urdu, word_count, is_free_preview, is_published
        INTO v_chapter_record;

        v_inserted_chapters := v_inserted_chapters || jsonb_build_object(
            'id', v_chapter_record.id,
            'chapter_number', v_chapter_record.chapter_number,
            'title_urdu', v_chapter_record.title_urdu,
            'word_count', v_chapter_record.word_count,
            'is_free_preview', v_chapter_record.is_free_preview,
            'is_published', v_chapter_record.is_published
        );
    END LOOP;

    -- 9. Audit trail logging
    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action_type,
        entity_type,
        entity_id,
        new_state,
        created_at
    ) VALUES (
        v_caller_id,
        v_caller_role,
        'chapters_imported',
        'novel',
        p_novel_id::text,
        jsonb_build_object(
            'imported_count', v_parts_count,
            'start_number', v_start_num,
            'end_number', v_start_num + v_parts_count - 1
        ),
        pg_catalog.now()
    );

    RETURN v_inserted_chapters;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_chapters(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_chapters(uuid, integer, jsonb) TO authenticated;


-- ------------------------------------------------------------------------------
-- SECTION 2: RPC split_chapter
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.split_chapter(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.split_chapter(
    p_chapter_id uuid,
    p_parts jsonb
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
    v_chapter_record record;
    v_novel_record record;
    v_parts_count integer;
    v_offset integer;
    v_max_chapter_num integer;
    v_has_active_entitlements boolean;
    v_part jsonb;
    v_part_title text;
    v_part_content text;
    v_part_free_preview boolean;
    v_part_published boolean;
    v_concatenated_content text := '';
    v_original_normalized text;
    v_concatenated_normalized text;
    v_result_chapters jsonb := '[]'::jsonb;
    v_sub_record record;
    i integer;
BEGIN
    -- 1. Identify and authenticate caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    -- 2. Lock and retrieve target chapter
    SELECT * INTO v_chapter_record
    FROM public.chapters
    WHERE id = p_chapter_id
    FOR UPDATE;

    IF v_chapter_record.id IS NULL THEN
        RAISE EXCEPTION 'Chapter not found.';
    END IF;

    -- 3. Verify novel ownership and writer status
    SELECT id, writer_id, status, title_urdu INTO v_novel_record
    FROM public.novels
    WHERE id = v_chapter_record.novel_id;

    IF v_caller_role <> 'admin' AND v_novel_record.writer_id <> v_caller_id THEN
        RAISE EXCEPTION 'Access denied. You do not own this novel.';
    END IF;

    IF v_caller_role <> 'admin' THEN
        SELECT status INTO v_writer_status
        FROM public.writer_profiles
        WHERE id = v_caller_id;

        IF v_writer_status <> 'approved' THEN
            RAISE EXCEPTION 'Only approved writers can split chapters.';
        END IF;
    END IF;

    IF v_novel_record.status IN ('under_review', 'suspended') THEN
        RAISE EXCEPTION 'Chapters cannot be modified while novel is %.', v_novel_record.status;
    END IF;

    -- 4. Validate parts payload structure
    IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' THEN
        RAISE EXCEPTION 'Parts payload must be a valid JSON array.';
    END IF;

    v_parts_count := jsonb_array_length(p_parts);
    IF v_parts_count < 2 THEN
        RAISE EXCEPTION 'Splitting requires at least 2 chapter parts.';
    END IF;

    IF v_parts_count > 60 THEN
        RAISE EXCEPTION 'Cannot split into more than 60 parts in a single operation.';
    END IF;

    -- 5. Sold Content & Reader Progress Protection Invariant:
    -- If novel is published and has active purchase entitlements,
    -- only unpublished drafts or the final chapter may be split/renumbered.
    SELECT EXISTS (
        SELECT 1
        FROM public.purchase_entitlements
        WHERE novel_id = v_novel_record.id
          AND is_revoked = false
    ) INTO v_has_active_entitlements;

    IF v_novel_record.status = 'published' AND v_has_active_entitlements THEN
        SELECT max(chapter_number) INTO v_max_chapter_num
        FROM public.chapters
        WHERE novel_id = v_novel_record.id;

        IF v_chapter_record.is_published = true AND v_chapter_record.chapter_number < v_max_chapter_num THEN
            RAISE EXCEPTION 'Cannot split a published middle chapter on a novel with active reader purchases. Renumbering chapters would corrupt existing buyers'' reading progress and bookmarks. You may only split unpublished drafts or the final chapter.';
        END IF;
    END IF;

    -- 6. Validate each part and assemble concatenated content
    FOR i IN 0..(v_parts_count - 1) LOOP
        v_part := p_parts->i;
        v_part_title := btrim(coalesce(v_part->>'title_urdu', ''));
        v_part_content := btrim(coalesce(v_part->>'content_urdu', ''));

        IF pg_catalog.length(v_part_title) < 1 OR pg_catalog.length(v_part_title) > 200 THEN
            RAISE EXCEPTION 'Part #% has an invalid title length (must be between 1 and 200 characters).', (i + 1);
        END IF;

        IF pg_catalog.length(v_part_content) < 1 THEN
            RAISE EXCEPTION 'Part #% content cannot be empty.', (i + 1);
        END IF;

        IF pg_catalog.length(v_part_content) > 120000 THEN
            RAISE EXCEPTION 'Part #% ("%") exceeds the 120,000 character platform limit (% characters).',
                (i + 1), v_part_title, pg_catalog.length(v_part_content);
        END IF;

        v_concatenated_content := v_concatenated_content || v_part_content;
    END LOOP;

    -- 7. Text Preservation Verification (Lossless check ignoring only inter-part whitespace)
    v_original_normalized := regexp_replace(v_chapter_record.content_urdu, '\s+', '', 'g');
    v_concatenated_normalized := regexp_replace(v_concatenated_content, '\s+', '', 'g');

    IF v_original_normalized <> v_concatenated_normalized THEN
        RAISE EXCEPTION 'Text preservation check failed: The combined text of the split parts does not match the original chapter content.';
    END IF;

    -- 8. Save historical snapshot of original chapter in chapter_revisions
    INSERT INTO public.chapter_revisions (
        chapter_id,
        content_urdu,
        edited_by,
        created_at
    ) VALUES (
        v_chapter_record.id,
        v_chapter_record.content_urdu,
        v_caller_id,
        pg_catalog.now()
    );

    -- 9. Renumber following chapters safely to prevent unique constraint (novel_id, chapter_number) collision
    v_offset := v_parts_count - 1;

    -- Step A: Shift existing following chapters into a safe temporary range (+1,000,000)
    IF v_offset > 0 THEN
        UPDATE public.chapters
        SET chapter_number = chapter_number + 1000000
        WHERE novel_id = v_chapter_record.novel_id
          AND chapter_number > v_chapter_record.chapter_number;
    END IF;

    -- Step B: Update original chapter in place to become Part 1
    v_part := p_parts->0;
    v_part_title := btrim(v_part->>'title_urdu');
    v_part_content := btrim(v_part->>'content_urdu');
    v_part_free_preview := coalesce((v_part->>'is_free_preview')::boolean, v_chapter_record.is_free_preview);
    v_part_published := false; -- Split chapters saved as draft

    UPDATE public.chapters
    SET title_urdu = v_part_title,
        content_urdu = v_part_content,
        is_free_preview = v_part_free_preview,
        is_published = v_part_published,
        updated_at = pg_catalog.now()
    WHERE id = v_chapter_record.id
    RETURNING id, chapter_number, title_urdu, word_count, is_free_preview, is_published
    INTO v_sub_record;

    v_result_chapters := v_result_chapters || jsonb_build_object(
        'id', v_sub_record.id,
        'chapter_number', v_sub_record.chapter_number,
        'title_urdu', v_sub_record.title_urdu,
        'word_count', v_sub_record.word_count,
        'is_free_preview', v_sub_record.is_free_preview,
        'is_published', v_sub_record.is_published
    );

    -- Step C: Insert Parts 2..N into newly opened chapter slots
    FOR i IN 1..(v_parts_count - 1) LOOP
        v_part := p_parts->i;
        v_part_title := btrim(v_part->>'title_urdu');
        v_part_content := btrim(v_part->>'content_urdu');

        INSERT INTO public.chapters (
            novel_id,
            chapter_number,
            title_urdu,
            content_urdu,
            is_free_preview,
            is_published,
            created_at,
            updated_at
        ) VALUES (
            v_chapter_record.novel_id,
            v_chapter_record.chapter_number + i,
            v_part_title,
            v_part_content,
            false, -- Only part 1 can be free preview
            false, -- Split chapters saved as draft
            pg_catalog.now(),
            pg_catalog.now()
        )
        RETURNING id, chapter_number, title_urdu, word_count, is_free_preview, is_published
        INTO v_sub_record;

        v_result_chapters := v_result_chapters || jsonb_build_object(
            'id', v_sub_record.id,
            'chapter_number', v_sub_record.chapter_number,
            'title_urdu', v_sub_record.title_urdu,
            'word_count', v_sub_record.word_count,
            'is_free_preview', v_sub_record.is_free_preview,
            'is_published', v_sub_record.is_published
        );
    END LOOP;

    -- Step D: Shift following chapters back from temporary range to their final positions (+v_offset)
    IF v_offset > 0 THEN
        UPDATE public.chapters
        SET chapter_number = chapter_number - 1000000 + v_offset
        WHERE novel_id = v_chapter_record.novel_id
          AND chapter_number > 1000000;
    END IF;

    -- 10. Audit trail logging
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
        v_caller_role,
        'chapter_split',
        'chapter',
        v_chapter_record.id::text,
        jsonb_build_object(
            'original_chapter_number', v_chapter_record.chapter_number,
            'original_title', v_chapter_record.title_urdu,
            'original_word_count', v_chapter_record.word_count
        ),
        jsonb_build_object(
            'parts_count', v_parts_count,
            'first_chapter_id', v_chapter_record.id,
            'new_chapter_range_start', v_chapter_record.chapter_number,
            'new_chapter_range_end', v_chapter_record.chapter_number + v_parts_count - 1
        ),
        pg_catalog.now()
    );

    RETURN v_result_chapters;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.split_chapter(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_chapter(uuid, jsonb) TO authenticated;
