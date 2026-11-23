-- ==============================================================================
-- UNB Premium — Migration 0057: Harden handle_new_user for Google OAuth
--
-- PURPOSE:
-- 1. Support Google OAuth OpenID Connect metadata claims (name, picture).
-- 2. Ensure full_name is never NULL, falling back to initcap email local part or 'Reader'.
-- 3. Support avatar_url from metadata avatar_url or picture claim.
-- 4. Validate metadata username against application regex /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$/.
-- 5. Auto-generate regex-compliant username if missing or invalid:
--    lowercase email local part stripped of non-[a-z0-9] (fallback 'reader'),
--    max 18 chars, + '_' + 8 hex chars of user UUID.
-- 6. Add bounded collision retry loop (up to 3 retries) using GET STACKED DIAGNOSTICS
--    verifying specifically profiles_username_key.
-- 7. Unconditionally assign role 'reader' and is_active true (zero metadata role trust).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_full_name text;
    v_avatar_url text;
    v_raw_username text;
    v_cleaned_prefix text;
    v_clean_uuid text;
    v_base_username text;
    v_username text;
    v_attempt integer;
    v_constraint_name text;
    v_is_explicit boolean := false;
BEGIN
    -- Strict security hardening: All signups default unconditionally to 'reader' and active.
    -- Never read role or status from metadata to prevent privilege escalation.

    -- 1. Resolve full_name: metadata full_name -> metadata name -> initcap email prefix -> 'Reader'
    v_full_name := coalesce(
        nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'full_name'), ''),
        nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'name'), ''),
        nullif(pg_catalog.btrim(pg_catalog.initcap(pg_catalog.replace(pg_catalog.split_part(NEW.email, '@', 1), '.', ' '))), ''),
        'Reader'
    );

    -- 2. Resolve avatar_url: metadata avatar_url -> metadata picture (Google OIDC)
    v_avatar_url := coalesce(
        nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'avatar_url'), ''),
        nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'picture'), '')
    );

    -- 3. Prepare UUID hex string for suffix generation (32 hex characters without hyphens)
    v_clean_uuid := pg_catalog.replace(NEW.id::text, '-', '');

    -- 4. Username resolution and validation
    v_raw_username := nullif(pg_catalog.btrim(NEW.raw_user_meta_data->>'username'), '');

    IF v_raw_username IS NOT NULL AND v_raw_username ~ '^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$' THEN
        v_base_username := v_raw_username;
        v_username := v_raw_username;
        v_is_explicit := true;
    ELSE
        -- Generate regex-compliant base prefix
        v_cleaned_prefix := pg_catalog.regexp_replace(
            pg_catalog.lower(pg_catalog.split_part(NEW.email, '@', 1)),
            '[^a-z0-9]',
            '',
            'g'
        );

        IF v_cleaned_prefix IS NULL OR v_cleaned_prefix = '' THEN
            v_cleaned_prefix := 'reader';
        END IF;

        -- Bound prefix to max 18 chars to ensure prefix + '_' + 8-hex suffix <= 27 chars
        v_base_username := pg_catalog.substr(v_cleaned_prefix, 1, 18);
        v_username := v_base_username || '_' || pg_catalog.substr(v_clean_uuid, 1, 8);
        v_is_explicit := false;
    END IF;

    -- 5. Bounded collision retry loop (up to 4 attempts = 1 initial + 3 retries)
    FOR v_attempt IN 1..4 LOOP
        BEGIN
            INSERT INTO public.profiles (
                id,
                email,
                full_name,
                username,
                avatar_url,
                role,
                is_active,
                created_at,
                updated_at
            ) VALUES (
                NEW.id,
                NEW.email,
                v_full_name,
                v_username,
                v_avatar_url,
                'reader'::public.user_role,
                true,
                pg_catalog.now(),
                pg_catalog.now()
            )
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                updated_at = pg_catalog.now();

            -- Successfully inserted or updated
            EXIT;
        EXCEPTION
            WHEN unique_violation THEN
                GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;

                -- Only retry if collision is specifically on username unique constraint
                IF v_constraint_name IN ('profiles_username_key', 'idx_profiles_username') THEN
                    IF v_attempt >= 4 THEN
                        RAISE;
                    END IF;

                    -- Retry with alternative 8-character hex slices from user UUID
                    IF v_attempt = 1 THEN
                        v_username := pg_catalog.substr(v_base_username, 1, 18) || '_' || pg_catalog.substr(v_clean_uuid, 9, 8);
                    ELSIF v_attempt = 2 THEN
                        v_username := pg_catalog.substr(v_base_username, 1, 18) || '_' || pg_catalog.substr(v_clean_uuid, 17, 8);
                    ELSIF v_attempt = 3 THEN
                        v_username := pg_catalog.substr(v_base_username, 1, 18) || '_' || pg_catalog.substr(v_clean_uuid, 25, 8);
                    END IF;
                ELSE
                    -- Re-raise any other unique constraint violation
                    RAISE;
                END IF;
        END;
    END LOOP;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
'Provisions public.profiles record on auth.users insert with Google OAuth claims, regex-compliant username, and collision retry.';

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
