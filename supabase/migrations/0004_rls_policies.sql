-- ==============================================================================
-- UNB Premium — Migration 0004: Row Level Security (RLS) Policies
-- Description: Enables strict Row Level Security on all tables. Enforces
--              reader-writer boundaries, protected chapter access via entitlements,
--              and prevents tampering with financial ledgers.
-- ==============================================================================

-- 1. HELPER SECURITY FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.has_novel_entitlement(p_novel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.purchase_entitlements
        WHERE novel_id = p_novel_id
          AND reader_id = auth.uid()
          AND is_revoked = false
    );
$$;

-- 2. ENABLE RLS ACROSS ALL TABLES
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writer_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novel_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. POLICIES: platform_settings
CREATE POLICY "Public read platform settings"
    ON public.platform_settings FOR SELECT
    USING (true);

CREATE POLICY "Admin manage platform settings"
    ON public.platform_settings FOR ALL
    USING (public.is_admin());

-- 4. POLICIES: profiles
CREATE POLICY "Public view basic profiles"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Users update own profile"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admin manage profiles"
    ON public.profiles FOR ALL
    USING (public.is_admin());

-- 5. POLICIES: writer_profiles
CREATE POLICY "Public view approved writer profiles"
    ON public.writer_profiles FOR SELECT
    USING (status = 'approved' OR id = auth.uid() OR public.is_admin());

CREATE POLICY "Writers update own profile metadata"
    ON public.writer_profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid() AND
        current_unpaid_commission = (SELECT current_unpaid_commission FROM public.writer_profiles WHERE id = auth.uid()) AND
        unpaid_commission_limit = (SELECT unpaid_commission_limit FROM public.writer_profiles WHERE id = auth.uid()) AND
        status = (SELECT status FROM public.writer_profiles WHERE id = auth.uid())
    );

CREATE POLICY "Admin manage writer profiles"
    ON public.writer_profiles FOR ALL
    USING (public.is_admin());

-- 6. POLICIES: writer_payment_methods
CREATE POLICY "Writers view own payment methods"
    ON public.writer_payment_methods FOR SELECT
    USING (writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Readers view active payment methods of approved writers during checkout"
    ON public.writer_payment_methods FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM public.writer_profiles wp
            WHERE wp.id = writer_payment_methods.writer_id AND wp.status = 'approved'
        )
    );

CREATE POLICY "Writers manage own payment methods"
    ON public.writer_payment_methods FOR ALL
    USING (writer_id = auth.uid())
    WITH CHECK (writer_id = auth.uid());

CREATE POLICY "Admin manage payment methods"
    ON public.writer_payment_methods FOR ALL
    USING (public.is_admin());

-- 7. POLICIES: genres & novel_genres
CREATE POLICY "Public view genres"
    ON public.genres FOR SELECT
    USING (true);

CREATE POLICY "Admin manage genres"
    ON public.genres FOR ALL
    USING (public.is_admin());

CREATE POLICY "Public view novel_genres"
    ON public.novel_genres FOR SELECT
    USING (true);

CREATE POLICY "Writers manage their novel genres"
    ON public.novel_genres FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = novel_genres.novel_id AND n.writer_id = auth.uid()
        ) OR public.is_admin()
    );

-- 8. POLICIES: novels
CREATE POLICY "Public view published novels"
    ON public.novels FOR SELECT
    USING (status = 'published' OR writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Writers insert own novels"
    ON public.novels FOR INSERT
    WITH CHECK (
        writer_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.writer_profiles wp
            WHERE wp.id = auth.uid() AND wp.status = 'approved'
        )
    );

CREATE POLICY "Writers update own novels"
    ON public.novels FOR UPDATE
    USING (writer_id = auth.uid() OR public.is_admin())
    WITH CHECK (writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Writers delete draft novels"
    ON public.novels FOR DELETE
    USING ((writer_id = auth.uid() AND status = 'draft') OR public.is_admin());

-- 9. POLICIES: chapters (STRICT PAID CHAPTER RLS)
CREATE POLICY "Read chapters if free preview or entitled or owner or admin"
    ON public.chapters FOR SELECT
    USING (
        -- Case 1: Free preview chapter of a published novel
        (
            is_free_preview = true AND
            is_published = true AND
            EXISTS (
                SELECT 1 FROM public.novels n
                WHERE n.id = chapters.novel_id AND n.status = 'published'
            )
        )
        OR
        -- Case 2: Reader holds verified, non-revoked purchase entitlement
        (
            is_published = true AND
            public.has_novel_entitlement(chapters.novel_id)
        )
        OR
        -- Case 3: Author of the novel
        EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = chapters.novel_id AND n.writer_id = auth.uid()
        )
        OR
        -- Case 4: Platform administrator
        public.is_admin()
    );

CREATE POLICY "Writers manage chapters of own novels"
    ON public.chapters FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = chapters.novel_id AND n.writer_id = auth.uid()
        ) OR public.is_admin()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = chapters.novel_id AND n.writer_id = auth.uid()
        ) OR public.is_admin()
    );

-- 10. POLICIES: orders
CREATE POLICY "View orders: reader, writer, or admin"
    ON public.orders FOR SELECT
    USING (reader_id = auth.uid() OR writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Readers create orders for published novels"
    ON public.orders FOR INSERT
    WITH CHECK (
        reader_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = novel_id AND n.status = 'published'
        ) AND
        EXISTS (
            SELECT 1 FROM public.writer_profiles wp
            WHERE wp.id = writer_id AND wp.is_orders_paused_for_commission = false
        )
    );

CREATE POLICY "Readers cancel unpaid orders"
    ON public.orders FOR UPDATE
    USING (reader_id = auth.uid() AND status = 'pending_payment')
    WITH CHECK (reader_id = auth.uid() AND status = 'cancelled');

CREATE POLICY "Admin manage orders"
    ON public.orders FOR ALL
    USING (public.is_admin());

-- 11. POLICIES: payment_submissions
CREATE POLICY "View submissions: reader, writer, or admin"
    ON public.payment_submissions FOR SELECT
    USING (reader_id = auth.uid() OR writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Readers insert payment submissions for own orders"
    ON public.payment_submissions FOR INSERT
    WITH CHECK (
        reader_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id AND o.reader_id = auth.uid() AND o.status IN ('pending_payment', 'payment_submitted')
        )
    );

CREATE POLICY "Admin manage submissions"
    ON public.payment_submissions FOR ALL
    USING (public.is_admin());

-- 12. POLICIES: purchase_entitlements (CLIENT DIRECT MUTATION FORBIDDEN)
CREATE POLICY "View purchase entitlements"
    ON public.purchase_entitlements FOR SELECT
    USING (
        reader_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.novels n
            WHERE n.id = purchase_entitlements.novel_id AND n.writer_id = auth.uid()
        ) OR
        public.is_admin()
    );

CREATE POLICY "Admin manage purchase entitlements"
    ON public.purchase_entitlements FOR ALL
    USING (public.is_admin());

-- 13. POLICIES: sales_ledger (IMMUTABLE; NO DIRECT CLIENT WRITES)
CREATE POLICY "View sales ledger: writer or admin"
    ON public.sales_ledger FOR SELECT
    USING (writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admin manage sales ledger"
    ON public.sales_ledger FOR ALL
    USING (public.is_admin());

-- 14. POLICIES: commission_invoices & payments
CREATE POLICY "View commission invoices: writer or admin"
    ON public.commission_invoices FOR SELECT
    USING (writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Writers submit invoice payment proof"
    ON public.commission_invoices FOR UPDATE
    USING (writer_id = auth.uid())
    WITH CHECK (
        writer_id = auth.uid() AND
        status = 'payment_reported'
    );

CREATE POLICY "Admin manage commission invoices"
    ON public.commission_invoices FOR ALL
    USING (public.is_admin());

CREATE POLICY "View commission payments: writer or admin"
    ON public.commission_payments FOR SELECT
    USING (writer_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admin manage commission payments"
    ON public.commission_payments FOR ALL
    USING (public.is_admin());

-- 15. POLICIES: disputes
CREATE POLICY "View disputes: participants or admin"
    ON public.disputes FOR SELECT
    USING (
        raised_by_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = disputes.order_id AND (o.reader_id = auth.uid() OR o.writer_id = auth.uid())
        ) OR
        public.is_admin()
    );

CREATE POLICY "Readers open dispute for own orders"
    ON public.disputes FOR INSERT
    WITH CHECK (
        raised_by_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id AND o.reader_id = auth.uid()
        )
    );

CREATE POLICY "Admin manage disputes"
    ON public.disputes FOR ALL
    USING (public.is_admin());

-- 16. POLICIES: notifications
CREATE POLICY "Users view own notifications"
    ON public.notifications FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users update read status on own notifications"
    ON public.notifications FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 17. POLICIES: audit_logs (ADMIN ONLY)
CREATE POLICY "Admin view audit logs"
    ON public.audit_logs FOR SELECT
    USING (public.is_admin());
