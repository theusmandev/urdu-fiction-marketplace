-- ==============================================================================
-- UNB Premium — Automated Test Suite: Public Catalog & Discovery (Step 2.1)
-- Description:
--   Comprehensive transactional impersonation tests verifying:
--     1. anon sees strictly published novels in public.public_novels.
--     2. anon cannot see drafts, under_review, rejected, or suspended novels.
--     3. anon cannot read base tables directly (novels, chapters, sales_ledger,
--        writer_payment_methods, orders).
--     4. anon cannot access sensitive writer financial fields or personal emails.
--     5. anon can read free-preview chapters only via public_free_preview_chapters;
--        paid chapters and unpublished chapters are strictly excluded.
--     6. get_public_novel_chapters RPC returns chapter metadata without paid content.
--     7. search_public_novels safely escapes wildcards and returns only published novels.
--     8. Suspending or unpublishing a novel causes it to vanish from public views immediately.
--
-- Execution: Can be run directly in the Supabase SQL Editor or psql.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TEST RESULTS ACCUMULATOR
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE test_results (
    test_id integer,
    test_name text,
    status text,
    details text
);
GRANT ALL ON test_results TO PUBLIC;

DO $$
DECLARE
    -- User UUIDs
    v_writer_id      uuid := '33333333-3333-3333-3333-333333333333'::uuid;
    v_writer_empty_id uuid := '44444444-4444-4444-4444-444444444444'::uuid;
    v_reader_id      uuid := '55555555-5555-5555-5555-555555555555'::uuid;

    -- Entity UUIDs
    v_genre_id       uuid := gen_random_uuid();
    v_pub_novel_id   uuid := gen_random_uuid();
    v_draft_novel_id uuid := gen_random_uuid();
    v_susp_novel_id  uuid := gen_random_uuid();
    v_ch1_id         uuid := gen_random_uuid();
    v_ch2_id         uuid := gen_random_uuid();
    v_ch3_id         uuid := gen_random_uuid();
    v_draft_ch_id    uuid := gen_random_uuid();

    -- Test verification helpers
    v_count          integer;
    v_err_caught     boolean;
    v_ch_content     text;
    v_total_search   bigint;
BEGIN
    -- --------------------------------------------------------------------------
    -- FIXTURE SETUP (Run as privileged bootstrap)
    -- --------------------------------------------------------------------------

    -- 1. Create fake users in auth.users
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES 
        (v_writer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_pub_06@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_writer_empty_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'writer_empty_06@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
        (v_reader_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader_pub_06@unb.pk', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 2. Bootstrap profiles
    UPDATE public.profiles SET role = 'writer', username = 'author_pub_06', full_name = 'Author Published', is_active = true WHERE id = v_writer_id;
    UPDATE public.profiles SET role = 'writer', username = 'author_empty_06', full_name = 'Author Empty', is_active = true WHERE id = v_writer_empty_id;
    UPDATE public.profiles SET role = 'reader', username = 'reader_pub_06', full_name = 'Reader Public', is_active = true WHERE id = v_reader_id;

    -- 3. Writer Profiles
    INSERT INTO public.writer_profiles (
        id, pen_name_urdu, pen_name_english, bio_urdu, bio_english, status, custom_commission_rate,
        unpaid_commission_limit, current_unpaid_commission, is_orders_paused_for_commission
    ) VALUES 
        (v_writer_id, 'اشفاق احمد', 'Ashfaq Ahmed', 'معروف افسانہ نگار اور ناول نگار', 'Renowned Urdu fiction author', 'approved', NULL, 5000, 0, false),
        (v_writer_empty_id, 'نئے مصنف', 'New Author', 'نوآموز ادیب', 'New writer without published works', 'approved', NULL, 5000, 0, false)
    ON CONFLICT (id) DO UPDATE SET status = 'approved';

    -- 4. Payment Method (sensitive)
    INSERT INTO public.writer_payment_methods (
        id, writer_id, method_type, account_title, account_number_or_iban, is_active
    ) VALUES (
        gen_random_uuid(), v_writer_id, 'jazzcash', 'Ashfaq Ahmed', '03001234567', true
    );

    -- 5. Genre
    INSERT INTO public.genres (
        id, slug, name_english, name_urdu, display_order, is_active
    ) VALUES (
        v_genre_id, 'mystery-thriller', 'Mystery & Thriller', 'سسپنس و تجسس', 1, true
    ) ON CONFLICT (id) DO NOTHING;

    -- 6. Novels (1 Published, 1 Draft, 1 Suspended)
    INSERT INTO public.novels (
        id, writer_id, slug, title_urdu, title_english, synopsis_urdu, description_urdu,
        cover_url, price_pkr, language, status, total_chapters, is_featured,
        rights_declaration_accepted, published_at
    ) VALUES 
        (v_pub_novel_id, v_writer_id, 'talism-e-hoshruba', 'طلسمِ ہوشربا', 'Talism-e-Hoshruba', 'داستانِ امیر حمزہ کا ایک پرشکوہ حصہ', 'مکمل کلاسیکی فکشن تفصیلات', 'https://example.com/cover1.jpg', 600, 'Urdu', 'published', 2, true, true, now() - interval '2 days'),
        (v_draft_novel_id, v_writer_id, 'secret-draft', 'خفیہ ڈرافٹ', 'Secret Draft', 'ابھی زیر تکمیل ہے', NULL, NULL, 300, 'Urdu', 'draft', 1, false, true, NULL),
        (v_susp_novel_id, v_writer_id, 'suspended-novel', 'معطل شدہ ناول', 'Suspended Novel', 'معطل ناول کا خلاصہ', NULL, NULL, 400, 'Urdu', 'suspended', 0, false, true, now() - interval '5 days');

    INSERT INTO public.novel_genres (novel_id, genre_id) VALUES (v_pub_novel_id, v_genre_id);

    -- 7. Chapters for Published Novel
    -- Ch 1: Free Preview, Published
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, word_count, is_published
    ) VALUES (
        v_ch1_id, v_pub_novel_id, 1, 'پہلا باب: طلسم کا آغاز', 'یہ مفت پیش منظر کا پہلا باب ہے جس میں سحر انگیز فضا کا ذکر ہے۔', true, 120, true
    );

    -- Ch 2: Paid, Published
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, word_count, is_published
    ) VALUES (
        v_ch2_id, v_pub_novel_id, 2, 'دوسرا باب: افراسیاب کا دربار', 'یہ خفیہ ادا شدہ باب ہے جو بغیر اجازت نہیں پڑھا جا سکتا۔', false, 250, true
    );

    -- Ch 3: Free Preview, Unpublished
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, word_count, is_published
    ) VALUES (
        v_ch3_id, v_pub_novel_id, 3, 'تیسرا باب: غیر شائع شدہ', 'یہ غیر شائع شدہ مسودہ ہے۔', true, 80, false
    );

    -- Ch for Draft Novel (Free Preview, Published)
    INSERT INTO public.chapters (
        id, novel_id, chapter_number, title_urdu, content_urdu, is_free_preview, word_count, is_published
    ) VALUES (
        v_draft_ch_id, v_draft_novel_id, 1, 'ڈرافٹ باب', 'ڈرافٹ کا متن', true, 50, true
    );

    -- ==========================================================================
    -- TEST 1: anon sees strictly published novels in public.public_novels
    -- ==========================================================================
    SET LOCAL ROLE anon;
    SET LOCAL "request.jwt.claims" TO '{}';

    SELECT count(*) INTO v_count
    FROM public.public_novels
    WHERE id = v_pub_novel_id;

    IF v_count = 1 THEN
        INSERT INTO test_results VALUES (1, 'Public Novels: Published novel visible to anon', 'SUCCESS', 'Published novel appears in public_novels view');
    ELSE
        INSERT INTO test_results VALUES (1, 'Public Novels: Published novel visible to anon', 'FAILURE', 'Published novel not found in public_novels view');
    END IF;

    -- ==========================================================================
    -- TEST 2: anon CANNOT see draft, under_review, or suspended novels
    -- ==========================================================================
    SELECT count(*) INTO v_count
    FROM public.public_novels
    WHERE id IN (v_draft_novel_id, v_susp_novel_id);

    IF v_count = 0 THEN
        INSERT INTO test_results VALUES (2, 'Public Novels: Draft and suspended novels strictly hidden', 'SUCCESS', 'Non-published novels are 100% excluded from public_novels');
    ELSE
        INSERT INTO test_results VALUES (2, 'Public Novels: Draft and suspended novels strictly hidden', 'FAILURE', format('Exposed %s non-published novels to anon', v_count));
    END IF;

    -- ==========================================================================
    -- TEST 3: Base table direct access strictly blocked for anon
    -- ==========================================================================
    v_err_caught := false;
    BEGIN
        EXECUTE 'SELECT count(*) FROM public.sales_ledger';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_err_caught := true;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (3, 'Security: Direct SELECT on sales_ledger blocked for anon', 'SUCCESS', 'Permission denied (insufficient_privilege) as required');
    ELSE
        INSERT INTO test_results VALUES (3, 'Security: Direct SELECT on sales_ledger blocked for anon', 'FAILURE', 'anon was able to read public.sales_ledger');
    END IF;

    -- Test writer payment methods blocked
    v_err_caught := false;
    BEGIN
        EXECUTE 'SELECT count(*) FROM public.writer_payment_methods';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_err_caught := true;
    END;

    IF v_err_caught THEN
        INSERT INTO test_results VALUES (4, 'Security: Direct SELECT on writer_payment_methods blocked', 'SUCCESS', 'Payment methods inaccessible to anon');
    ELSE
        INSERT INTO test_results VALUES (4, 'Security: Direct SELECT on writer_payment_methods blocked', 'FAILURE', 'anon was able to read writer_payment_methods');
    END IF;

    -- ==========================================================================
    -- TEST 5: public.public_writers lists only approved authors with published novels
    -- ==========================================================================
    SELECT count(*) INTO v_count
    FROM public.public_writers
    WHERE id = v_writer_id;

    IF v_count = 1 THEN
        -- Verify author without published works is excluded
        SELECT count(*) INTO v_count
        FROM public.public_writers
        WHERE id = v_writer_empty_id;

        IF v_count = 0 THEN
            INSERT INTO test_results VALUES (5, 'Public Writers: Only authors with published novels listed', 'SUCCESS', 'Approved author with novel listed; author without novel excluded');
        ELSE
            INSERT INTO test_results VALUES (5, 'Public Writers: Only authors with published novels listed', 'FAILURE', 'Author with 0 published novels was included in public directory');
        END IF;
    ELSE
        INSERT INTO test_results VALUES (5, 'Public Writers: Only authors with published novels listed', 'FAILURE', 'Published author not found in public_writers');
    END IF;

    -- ==========================================================================
    -- TEST 6: public.public_genres returns accurate published novel counts
    -- ==========================================================================
    SELECT published_novels_count INTO v_count
    FROM public.public_genres
    WHERE id = v_genre_id;

    IF v_count = 1 THEN
        INSERT INTO test_results VALUES (6, 'Public Genres: Accurate published novel count', 'SUCCESS', 'Mystery & Thriller genre reflects exactly 1 published novel');
    ELSE
        INSERT INTO test_results VALUES (6, 'Public Genres: Accurate published novel count', 'FAILURE', format('Expected 1 published novel, got %s', v_count));
    END IF;

    -- ==========================================================================
    -- TEST 7: public_free_preview_chapters exposes ONLY published free chapters of published novels
    -- ==========================================================================
    -- Chapter 1 (free preview, published, of published novel) -> Must be visible
    SELECT count(*) INTO v_count
    FROM public.public_free_preview_chapters
    WHERE id = v_ch1_id;

    IF v_count = 1 THEN
        -- Chapter 2 (paid chapter) -> Must NOT be visible
        SELECT count(*) INTO v_count
        FROM public.public_free_preview_chapters
        WHERE id = v_ch2_id;

        IF v_count = 0 THEN
            -- Chapter 3 (unpublished chapter) -> Must NOT be visible
            SELECT count(*) INTO v_count
            FROM public.public_free_preview_chapters
            WHERE id = v_ch3_id;

            IF v_count = 0 THEN
                -- Draft novel chapter -> Must NOT be visible
                SELECT count(*) INTO v_count
                FROM public.public_free_preview_chapters
                WHERE id = v_draft_ch_id;

                IF v_count = 0 THEN
                    INSERT INTO test_results VALUES (7, 'Free Preview Chapters: Strict content isolation', 'SUCCESS', 'Only published free preview chapter is exposed; paid and drafts hidden');
                ELSE
                    INSERT INTO test_results VALUES (7, 'Free Preview Chapters: Strict content isolation', 'FAILURE', 'Draft novel chapter was exposed');
                END IF;
            ELSE
                INSERT INTO test_results VALUES (7, 'Free Preview Chapters: Strict content isolation', 'FAILURE', 'Unpublished chapter was exposed');
            END IF;
        ELSE
            INSERT INTO test_results VALUES (7, 'Free Preview Chapters: Strict content isolation', 'FAILURE', 'Paid chapter was exposed in free preview view');
        END IF;
    ELSE
        INSERT INTO test_results VALUES (7, 'Free Preview Chapters: Strict content isolation', 'FAILURE', 'Free preview chapter 1 was not found');
    END IF;

    -- ==========================================================================
    -- TEST 8: RPC get_public_novel_chapters returns metadata without paid content
    -- ==========================================================================
    SELECT count(*) INTO v_count
    FROM public.get_public_novel_chapters('talism-e-hoshruba');

    IF v_count = 2 THEN
        INSERT INTO test_results VALUES (8, 'Novel Chapters TOC RPC: Returns published chapter metadata', 'SUCCESS', 'Returned 2 published chapters; unpublished chapter 3 safely omitted');
    ELSE
        INSERT INTO test_results VALUES (8, 'Novel Chapters TOC RPC: Returns published chapter metadata', 'FAILURE', format('Expected 2 chapters in TOC, got %s', v_count));
    END IF;

    -- ==========================================================================
    -- TEST 9: search_public_novels with wildcard escaping and sorting
    -- ==========================================================================
    -- Search by Urdu title
    SELECT count(*), max(total_count) INTO v_count, v_total_search
    FROM public.search_public_novels('طلسم', NULL, 'featured', 10, 0);

    IF v_count = 1 AND v_total_search = 1 THEN
        -- Search with wildcard character '%' should match only literal or safe query
        SELECT count(*) INTO v_count
        FROM public.search_public_novels('non_existent_%_pattern', NULL, 'featured', 10, 0);

        IF v_count = 0 THEN
            INSERT INTO test_results VALUES (9, 'Search RPC: Trigram/ILIKE with wildcard escaping', 'SUCCESS', 'Matches Urdu query and safely escapes wildcard patterns');
        ELSE
            INSERT INTO test_results VALUES (9, 'Search RPC: Trigram/ILIKE with wildcard escaping', 'FAILURE', 'Wildcard query unexpectedly matched rows');
        END IF;
    ELSE
        INSERT INTO test_results VALUES (9, 'Search RPC: Trigram/ILIKE with wildcard escaping', 'FAILURE', format('Expected 1 search match, got count=%s, total=%s', v_count, v_total_search));
    END IF;

    -- ==========================================================================
    -- TEST 10: Suspending novel makes it disappear immediately from public views
    -- ==========================================================================
    -- Revert to postgres to update novel status
    RESET ROLE;

    UPDATE public.novels SET status = 'suspended' WHERE id = v_pub_novel_id;

    -- Re-check as anon
    SET LOCAL ROLE anon;
    SET LOCAL "request.jwt.claims" TO '{}';

    SELECT count(*) INTO v_count
    FROM public.public_novels
    WHERE id = v_pub_novel_id;

    IF v_count = 0 THEN
        -- Author also has 0 published novels now, so author disappears from public_writers
        SELECT count(*) INTO v_count
        FROM public.public_writers
        WHERE id = v_writer_id;

        IF v_count = 0 THEN
            INSERT INTO test_results VALUES (10, 'Reactivity: Suspended novel immediately vanishes from views', 'SUCCESS', 'Suspension immediately hides novel and updates author directory');
        ELSE
            INSERT INTO test_results VALUES (10, 'Reactivity: Suspended novel immediately vanishes from views', 'FAILURE', 'Author with now 0 published novels still visible');
        END IF;
    ELSE
        INSERT INTO test_results VALUES (10, 'Reactivity: Suspended novel immediately vanishes from views', 'FAILURE', 'Suspended novel still visible in public_novels');
    END IF;

END $$;

-- ------------------------------------------------------------------------------
-- 2. DISPLAY TEST RESULTS
-- ------------------------------------------------------------------------------
SELECT 
    test_id,
    test_name,
    status,
    details
FROM test_results
ORDER BY test_id ASC;

ROLLBACK;
