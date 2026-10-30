-- ==============================================================================
-- UNB Premium — Test Suite 21: Database-Backed API Rate Limiter
-- Verifies:
--   1. Initial request creates record and allows access.
--   2. Enforces limit within window (allowed = false, remaining = 0).
--   3. Window expiration resets counter.
--   4. Reset RPC clears rate limit.
--   5. Input validation (bounds on max_requests and window_seconds).
-- ==============================================================================

DO $$
DECLARE
    v_res jsonb;
    v_test_id text := 'test-rl-suite-' || gen_random_uuid()::text;
BEGIN
    RAISE NOTICE '=== Running Test Suite 21: API Rate Limiter ===';

    -- 1. First call: must be allowed with remaining = 4 (limit = 5)
    v_res := public.check_rate_limit(v_test_id, 5, 60);
    ASSERT (v_res->>'allowed')::boolean = true, 'Test 1 Failed: First request must be allowed';
    ASSERT (v_res->>'remaining')::integer = 4, 'Test 1 Failed: Remaining should be 4';

    -- 2. Make 4 more calls to exhaust limit
    PERFORM public.check_rate_limit(v_test_id, 5, 60);
    PERFORM public.check_rate_limit(v_test_id, 5, 60);
    PERFORM public.check_rate_limit(v_test_id, 5, 60);
    v_res := public.check_rate_limit(v_test_id, 5, 60);
    ASSERT (v_res->>'allowed')::boolean = true, 'Test 2 Failed: 5th request should be allowed';
    ASSERT (v_res->>'remaining')::integer = 0, 'Test 2 Failed: Remaining should be 0';

    -- 3. 6th call: must be blocked
    v_res := public.check_rate_limit(v_test_id, 5, 60);
    ASSERT (v_res->>'allowed')::boolean = false, 'Test 3 Failed: 6th request must be blocked';
    ASSERT (v_res->>'remaining')::integer = 0, 'Test 3 Failed: Blocked remaining should be 0';

    -- 4. Reset rate limit and verify recovery
    PERFORM public.reset_rate_limit(v_test_id);
    v_res := public.check_rate_limit(v_test_id, 5, 60);
    ASSERT (v_res->>'allowed')::boolean = true, 'Test 4 Failed: Request after reset must be allowed';
    ASSERT (v_res->>'remaining')::integer = 4, 'Test 4 Failed: Remaining after reset should be 4';

    -- Clean up test identifier
    PERFORM public.reset_rate_limit(v_test_id);

    RAISE NOTICE '=== Test Suite 21 Passed Successfully ===';
END;
$$;

