-- ==============================================================================
-- UNB Premium — Migration 0030: Platform Payment Methods Admin RLS & Grants
-- Description:
--   1. Grants SELECT, INSERT, UPDATE, DELETE on public.platform_payment_methods
--      to authenticated users with an RLS policy restricting access exclusively
--      to platform administrators (public.is_admin()).
--   2. Normal users (readers and writers) are denied direct access and can only
--      view active instructions via the get_platform_payment_instructions() RPC.
-- ==============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_payment_methods TO authenticated;

DROP POLICY IF EXISTS "platform_payment_methods_admin_all" ON public.platform_payment_methods;
CREATE POLICY "platform_payment_methods_admin_all"
    ON public.platform_payment_methods
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
