-- ============================================================================
-- Migration: 0062_drop_generate_commission_invoice_overload.sql
-- Description: Drop legacy 3-argument overload of generate_commission_invoice,
-- leaving only the canonical 4-argument signature with default p_due_date.
-- Invariants:
--   - Obey check:sql: Zero forbidden pg_catalog.<construct> qualification.
--   - Obey check:terms: Zero forbidden user-facing "commission" / "کمیشن" terms.
-- ============================================================================

-- 1. Drop stale 3-parameter overload
DROP FUNCTION IF EXISTS public.generate_commission_invoice(uuid, timestamptz, timestamptz);

-- 2. Explicitly reinforce permissions on canonical 4-parameter function
REVOKE ALL ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_commission_invoice(uuid, timestamptz, timestamptz, timestamptz) TO authenticated;
