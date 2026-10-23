-- =============================================================================
-- Migration 0017_a: Commission Invoice Status Enum Values
-- Step 5.1 Enums: New enum values must be committed in a standalone migration
-- before they can be referenced in tables, RPCs, or policies (PostgreSQL 55P04).
-- =============================================================================

ALTER TYPE public.commission_invoice_status ADD VALUE IF NOT EXISTS 'partially_paid';
ALTER TYPE public.commission_invoice_status ADD VALUE IF NOT EXISTS 'void';
