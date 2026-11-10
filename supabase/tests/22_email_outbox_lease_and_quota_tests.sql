-- ==============================================================================
-- UNB Premium — Test Suite 22: Email Outbox Lease Locking & Quota Resilience
-- Verifies:
--   1. Two sequential calls to claim_pending_emails_for_sending return disjoint rows (lease locking).
--   2. A stale lease (claimed_at older than 10 minutes) becomes claimable again.
--   3. A 'sent' row is never reclaimed.
--   4. A rate-limited delivery result clears claimed_at, sets retry_after, and does NOT increment attempts.
-- ==============================================================================

DO $$
DECLARE
    v_user_id uuid;
    v_email_1 uuid;
    v_email_2 uuid;
    v_claimed_id uuid;
    v_claim_count integer := 0;
    v_rec record;
    v_attempts integer;
    v_status text;
    v_claimed_at timestamptz;
    v_retry_after timestamptz;
    v_test_key_1 text := 'test-lease-1-' || gen_random_uuid()::text;
    v_test_key_2 text := 'test-lease-2-' || gen_random_uuid()::text;
BEGIN
    RAISE NOTICE '=== Running Test Suite 22: Email Outbox Lease Locking & Quota Resilience ===';

    -- Setup: Find or create a test profile
    SELECT id INTO v_user_id FROM public.profiles LIMIT 1;
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO public.profiles (id, email, display_name, role)
        VALUES (v_user_id, 'test-lease-worker@example.com', 'Test Lease User', 'reader');
    END IF;

    -- Clean any leftover test rows for this key pattern
    DELETE FROM public.email_outbox WHERE dedupe_key IN (v_test_key_1, v_test_key_2);

    -- Insert 2 pending test emails
    INSERT INTO public.email_outbox (user_id, template, subject, body_text, status, attempts, dedupe_key, created_at)
    VALUES (v_user_id, 'payment_verified', 'Test Lease Subject 1', 'Test body 1', 'pending', 0, v_test_key_1, pg_catalog.now() - interval '2 minutes')
    RETURNING id INTO v_email_1;

    INSERT INTO public.email_outbox (user_id, template, subject, body_text, status, attempts, dedupe_key, created_at)
    VALUES (v_user_id, 'payment_verified', 'Test Lease Subject 2', 'Test body 2', 'pending', 0, v_test_key_2, pg_catalog.now() - interval '1 minute')
    RETURNING id INTO v_email_2;

    -- -------------------------------------------------------------------------
    -- Test 1: Two sequential calls to claim_pending_emails_for_sending return disjoint rows
    -- -------------------------------------------------------------------------
    -- First claim with batch size 1
    v_claimed_id := NULL;
    FOR v_rec IN SELECT id FROM public.claim_pending_emails_for_sending(1) WHERE id IN (v_email_1, v_email_2) LOOP
        v_claimed_id := v_rec.id;
    END LOOP;
    ASSERT v_claimed_id = v_email_1, 'Test 1a Failed: First claim should return the earliest row (email 1)';

    -- Check that email 1 is now leased
    SELECT claimed_at INTO v_claimed_at FROM public.email_outbox WHERE id = v_email_1;
    ASSERT v_claimed_at IS NOT NULL, 'Test 1b Failed: Claimed row must have claimed_at set';

    -- Second claim with batch size 1 must return email 2 (disjoint)
    v_claimed_id := NULL;
    FOR v_rec IN SELECT id FROM public.claim_pending_emails_for_sending(1) WHERE id IN (v_email_1, v_email_2) LOOP
        v_claimed_id := v_rec.id;
    END LOOP;
    ASSERT v_claimed_id = v_email_2, 'Test 1c Failed: Second claim should return disjoint row (email 2)';

    -- Third claim: Both rows are leased, so zero of our test rows should be returned
    v_claim_count := 0;
    FOR v_rec IN SELECT id FROM public.claim_pending_emails_for_sending(10) WHERE id IN (v_email_1, v_email_2) LOOP
        v_claim_count := v_claim_count + 1;
    END LOOP;
    ASSERT v_claim_count = 0, 'Test 1d Failed: Leased rows must not be claimed again';

    -- -------------------------------------------------------------------------
    -- Test 2: A stale lease (claimed_at older than 10 minutes) becomes claimable again
    -- -------------------------------------------------------------------------
    UPDATE public.email_outbox
    SET claimed_at = pg_catalog.now() - interval '15 minutes'
    WHERE id = v_email_1;

    v_claimed_id := NULL;
    FOR v_rec IN SELECT id FROM public.claim_pending_emails_for_sending(1) WHERE id IN (v_email_1, v_email_2) LOOP
        v_claimed_id := v_rec.id;
    END LOOP;
    ASSERT v_claimed_id = v_email_1, 'Test 2 Failed: Stale leased row should be reclaimed';

    -- -------------------------------------------------------------------------
    -- Test 3: A 'sent' row is never reclaimed
    -- -------------------------------------------------------------------------
    PERFORM public.record_email_delivery_result(v_email_1, true);

    SELECT status, claimed_at INTO v_status, v_claimed_at FROM public.email_outbox WHERE id = v_email_1;
    ASSERT v_status = 'sent', 'Test 3a Failed: Status should be sent';
    ASSERT v_claimed_at IS NULL, 'Test 3b Failed: claimed_at should be cleared on success';

    v_claim_count := 0;
    FOR v_rec IN SELECT id FROM public.claim_pending_emails_for_sending(10) WHERE id = v_email_1 LOOP
        v_claim_count := v_claim_count + 1;
    END LOOP;
    ASSERT v_claim_count = 0, 'Test 3c Failed: Sent row must never be reclaimed';

    -- -------------------------------------------------------------------------
    -- Test 4: Rate-limited delivery result clears lease, sets retry_after, preserves attempts
    -- -------------------------------------------------------------------------
    -- For email 2 (which is currently leased), record a 429 rate-limited result
    PERFORM public.record_email_delivery_result(
        v_email_2,
        false,
        'Provider 429 Rate Limit Exceeded',
        true,
        pg_catalog.now() + interval '5 minutes'
    );

    SELECT status, attempts, claimed_at, retry_after 
    INTO v_status, v_attempts, v_claimed_at, v_retry_after 
    FROM public.email_outbox 
    WHERE id = v_email_2;

    ASSERT v_status = 'pending', 'Test 4a Failed: Rate limited email must remain pending';
    ASSERT v_attempts = 0, 'Test 4b Failed: Rate limited email must NOT increment attempts';
    ASSERT v_claimed_at IS NULL, 'Test 4c Failed: Rate limited email must clear claimed_at lease';
    ASSERT v_retry_after > pg_catalog.now(), 'Test 4d Failed: retry_after must be in the future';

    -- While retry_after is in the future, it cannot be claimed
    v_claim_count := 0;
    FOR v_rec IN SELECT id FROM public.claim_pending_emails_for_sending(10) WHERE id = v_email_2 LOOP
        v_claim_count := v_claim_count + 1;
    END LOOP;
    ASSERT v_claim_count = 0, 'Test 4e Failed: Email with future retry_after must not be claimed';

    -- When retry_after expires, it can be claimed again
    UPDATE public.email_outbox
    SET retry_after = pg_catalog.now() - interval '1 second'
    WHERE id = v_email_2;

    v_claimed_id := NULL;
    FOR v_rec IN SELECT id FROM public.claim_pending_emails_for_sending(1) WHERE id = v_email_2 LOOP
        v_claimed_id := v_rec.id;
    END LOOP;
    ASSERT v_claimed_id = v_email_2, 'Test 4f Failed: Email with expired retry_after should be claimable';

    -- Clean up test records
    DELETE FROM public.email_outbox WHERE id IN (v_email_1, v_email_2);

    RAISE NOTICE '=== Test Suite 22 Passed Successfully ===';
END;
$$;

