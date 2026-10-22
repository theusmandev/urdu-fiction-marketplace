-- ==============================================================================
-- UNB Premium — Migration 0002: Orders and Financial Ledger
-- Description: Creates orders, payment submissions (TID verification), entitlements,
--              append-only sales ledger, commission invoices, disputes, and audit logs.
-- ==============================================================================

-- 1. ORDERS
CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number text UNIQUE NOT NULL,
    reader_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    writer_id uuid NOT NULL REFERENCES writer_profiles(id) ON DELETE RESTRICT,
    novel_id uuid NOT NULL REFERENCES novels(id) ON DELETE RESTRICT,
    
    -- Immutable financial & product snapshot at checkout
    novel_title_snapshot text NOT NULL,
    amount_pkr numeric(10,2) NOT NULL CHECK (amount_pkr >= 0),
    currency text NOT NULL DEFAULT 'PKR',
    applied_commission_rate numeric(5,2) NOT NULL CHECK (applied_commission_rate >= 0 AND applied_commission_rate <= 100),
    calculated_commission_pkr numeric(10,2) NOT NULL CHECK (calculated_commission_pkr >= 0),
    calculated_writer_share_pkr numeric(10,2) NOT NULL CHECK (calculated_writer_share_pkr >= 0),
    
    -- Chosen direct payment destination
    selected_payment_method_id uuid REFERENCES writer_payment_methods(id) ON DELETE SET NULL,
    payment_instructions_snapshot jsonb,
    
    -- Verification lifecycle
    status order_status NOT NULL DEFAULT 'pending_payment',
    verified_at timestamptz,
    rejected_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_reader ON orders(reader_id);
CREATE INDEX IF NOT EXISTS idx_orders_writer ON orders(writer_id);
CREATE INDEX IF NOT EXISTS idx_orders_novel ON orders(novel_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- 2. PAYMENT SUBMISSIONS (TID + Proof Screenshot)
CREATE TABLE IF NOT EXISTS payment_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    reader_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    writer_id uuid NOT NULL REFERENCES writer_profiles(id) ON DELETE RESTRICT,
    
    -- Raw and sanitized Transaction ID
    transaction_reference_tid text NOT NULL,
    normalized_tid text GENERATED ALWAYS AS (upper(regexp_replace(transaction_reference_tid, '[^a-zA-Z0-9]', '', 'g'))) STORED,
    
    -- Cloudinary payment receipt proof
    screenshot_url text NOT NULL,
    screenshot_public_id text,
    paid_amount_claimed_pkr numeric(10,2) CHECK (paid_amount_claimed_pkr >= 0),
    sender_account_name text,
    reader_note text,
    
    -- Duplicate fraud detection
    is_duplicate_tid_flagged boolean NOT NULL DEFAULT false,
    duplicate_of_submission_id uuid REFERENCES payment_submissions(id) ON DELETE SET NULL,
    
    -- Review status by writer
    reviewer_status text NOT NULL DEFAULT 'pending' CHECK (reviewer_status IN ('pending', 'verified', 'rejected')),
    reviewer_note text,
    reviewed_by uuid REFERENCES profiles(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_submissions_order ON payment_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_writer ON payment_submissions(writer_id);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_normalized_tid ON payment_submissions(normalized_tid);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_duplicate_flag ON payment_submissions(is_duplicate_tid_flagged) WHERE is_duplicate_tid_flagged = true;

-- 3. PURCHASE ENTITLEMENTS (Digital Access Rights)
CREATE TABLE IF NOT EXISTS purchase_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reader_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    novel_id uuid NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    order_id uuid UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now(),
    is_revoked boolean NOT NULL DEFAULT false,
    revoked_reason text,
    CONSTRAINT uq_reader_novel_entitlement UNIQUE (reader_id, novel_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_reader ON purchase_entitlements(reader_id, novel_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_active ON purchase_entitlements(novel_id) WHERE is_revoked = false;

-- 4. COMMISSION INVOICES (Monthly / Periodic Platform Invoicing)
CREATE TABLE IF NOT EXISTS commission_invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number text UNIQUE NOT NULL,
    writer_id uuid NOT NULL REFERENCES writer_profiles(id) ON DELETE RESTRICT,
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,
    total_sales_count integer NOT NULL DEFAULT 0 CHECK (total_sales_count >= 0),
    total_gross_pkr numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (total_gross_pkr >= 0),
    total_commission_owed_pkr numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (total_commission_owed_pkr >= 0),
    amount_settled_pkr numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (amount_settled_pkr >= 0),
    status commission_invoice_status NOT NULL DEFAULT 'open',
    writer_reported_tid text,
    writer_reported_screenshot_url text,
    settled_by_admin_id uuid REFERENCES profiles(id),
    settled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_invoices_writer ON commission_invoices(writer_id);
CREATE INDEX IF NOT EXISTS idx_commission_invoices_status ON commission_invoices(status);

-- 5. SALES LEDGER (Immutable Append-Only Financial Audit Trail)
CREATE TABLE IF NOT EXISTS sales_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid UNIQUE NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    writer_id uuid NOT NULL REFERENCES writer_profiles(id) ON DELETE RESTRICT,
    reader_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    novel_id uuid NOT NULL REFERENCES novels(id) ON DELETE RESTRICT,
    entry_type text NOT NULL CHECK (entry_type IN ('sale_verified', 'refund_adjustment', 'manual_correction')),
    gross_amount_pkr numeric(10,2) NOT NULL CHECK (gross_amount_pkr >= 0),
    commission_rate numeric(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
    platform_commission_pkr numeric(10,2) NOT NULL CHECK (platform_commission_pkr >= 0),
    writer_net_pkr numeric(10,2) NOT NULL CHECK (writer_net_pkr >= 0),
    commission_invoice_id uuid REFERENCES commission_invoices(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_ledger_writer ON sales_ledger(writer_id);
CREATE INDEX IF NOT EXISTS idx_sales_ledger_created ON sales_ledger(created_at DESC);

-- 6. COMMISSION PAYMENTS (Settlement Receipts from Writers to Platform)
CREATE TABLE IF NOT EXISTS commission_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES commission_invoices(id) ON DELETE CASCADE,
    writer_id uuid NOT NULL REFERENCES writer_profiles(id) ON DELETE RESTRICT,
    amount_pkr numeric(12,2) NOT NULL CHECK (amount_pkr > 0),
    transaction_reference text NOT NULL,
    screenshot_url text,
    confirmed_by_admin_id uuid REFERENCES profiles(id),
    confirmed_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_payments_invoice ON commission_payments(invoice_id);

-- 7. DISPUTES
CREATE TABLE IF NOT EXISTS disputes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    raised_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    reason text NOT NULL,
    status dispute_status NOT NULL DEFAULT 'open',
    admin_resolution_notes text,
    resolved_by_id uuid REFERENCES profiles(id),
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_order ON disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

-- 8. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);

-- 9. AUDIT LOGS (Immutable Activity Log)
CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
    actor_role text,
    action_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    previous_state jsonb,
    new_state jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
