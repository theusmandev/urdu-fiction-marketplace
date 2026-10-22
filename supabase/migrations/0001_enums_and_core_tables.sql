-- ==============================================================================
-- UNB Premium — Migration 0001: Enums and Core Tables
-- Description: Creates foundational business enums, user profiles, writer profiles,
--              payment methods, genres, novels, and chapter content tables.
-- Idempotency: Uses IF NOT EXISTS and guarded TYPE blocks.
-- ==============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('reader', 'writer', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE writer_status AS ENUM ('pending_approval', 'approved', 'suspended', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_type AS ENUM ('jazzcash', 'easypaisa', 'raast', 'bank_iban');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE novel_status AS ENUM ('draft', 'under_review', 'published', 'rejected', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'pending_payment',
        'payment_submitted',
        'verified',
        'rejected',
        'disputed',
        'cancelled',
        'refunded_adjusted'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE commission_invoice_status AS ENUM (
        'open',
        'invoiced',
        'payment_reported',
        'settled',
        'disputed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dispute_status AS ENUM (
        'open',
        'under_review',
        'resolved_for_reader',
        'resolved_for_writer',
        'closed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. CORE PLATFORM SETTINGS (Single-Row Configuration)
CREATE TABLE IF NOT EXISTS platform_settings (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    default_commission_rate numeric(5,2) NOT NULL DEFAULT 20.00 CHECK (default_commission_rate >= 0 AND default_commission_rate <= 100),
    default_unpaid_commission_limit numeric(12,2) NOT NULL DEFAULT 5000.00 CHECK (default_unpaid_commission_limit >= 0),
    support_email text NOT NULL DEFAULT 'support@unbpremium.pk',
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. PROFILES (1-to-1 extension of Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text,
    username text UNIQUE,
    avatar_url text,
    role user_role NOT NULL DEFAULT 'reader',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- 4. WRITER PROFILES (Extensions for approved/onboarding Urdu authors)
CREATE TABLE IF NOT EXISTS writer_profiles (
    id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    pen_name_urdu text NOT NULL,
    pen_name_english text NOT NULL,
    bio_urdu text,
    bio_english text,
    status writer_status NOT NULL DEFAULT 'pending_approval',
    custom_commission_rate numeric(5,2) CHECK (custom_commission_rate >= 0 AND custom_commission_rate <= 100),
    unpaid_commission_limit numeric(12,2) NOT NULL DEFAULT 5000.00 CHECK (unpaid_commission_limit >= 0),
    current_unpaid_commission numeric(12,2) NOT NULL DEFAULT 0.00 CHECK (current_unpaid_commission >= 0),
    is_orders_paused_for_commission boolean NOT NULL DEFAULT false,
    agreement_accepted_at timestamptz,
    approved_by uuid REFERENCES profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_writer_profiles_status ON writer_profiles(status);
CREATE INDEX IF NOT EXISTS idx_writer_profiles_commission_paused ON writer_profiles(is_orders_paused_for_commission);

-- 5. WRITER DIRECT PAYMENT METHODS (JazzCash, EasyPaisa, Raast, Bank IBAN)
CREATE TABLE IF NOT EXISTS writer_payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id uuid NOT NULL REFERENCES writer_profiles(id) ON DELETE CASCADE,
    method_type payment_method_type NOT NULL,
    account_title text NOT NULL,
    account_number_or_iban text NOT NULL,
    bank_name text,
    instructions_note text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_writer_payment_methods_writer ON writer_payment_methods(writer_id, is_active);

-- 6. GENRES & NOVEL TAXONOMY
CREATE TABLE IF NOT EXISTS genres (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    name_english text NOT NULL,
    name_urdu text NOT NULL,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_genres_display_order ON genres(display_order);

-- 7. NOVELS
CREATE TABLE IF NOT EXISTS novels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    writer_id uuid NOT NULL REFERENCES writer_profiles(id) ON DELETE RESTRICT,
    slug text UNIQUE NOT NULL,
    title_urdu text NOT NULL,
    title_english text NOT NULL,
    synopsis_urdu text NOT NULL,
    description_urdu text,
    cover_url text,
    cover_public_id text,
    price_pkr numeric(10,2) NOT NULL CHECK (price_pkr >= 0),
    language text NOT NULL DEFAULT 'ur',
    status novel_status NOT NULL DEFAULT 'draft',
    moderation_reason text,
    total_chapters integer NOT NULL DEFAULT 0 CHECK (total_chapters >= 0),
    is_featured boolean NOT NULL DEFAULT false,
    rights_declaration_accepted boolean NOT NULL DEFAULT false,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_novels_writer ON novels(writer_id);
CREATE INDEX IF NOT EXISTS idx_novels_status ON novels(status);
CREATE INDEX IF NOT EXISTS idx_novels_featured ON novels(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_novels_slug ON novels(slug);

-- 8. NOVEL GENRES JOIN TABLE
CREATE TABLE IF NOT EXISTS novel_genres (
    novel_id uuid NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    genre_id uuid NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (novel_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_novel_genres_genre ON novel_genres(genre_id);

-- 9. CHAPTERS (With Free Preview vs Paid RLS segregation)
CREATE TABLE IF NOT EXISTS chapters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id uuid NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_number integer NOT NULL CHECK (chapter_number > 0),
    title_urdu text NOT NULL,
    content_urdu text NOT NULL,
    is_free_preview boolean NOT NULL DEFAULT false,
    word_count integer NOT NULL DEFAULT 0 CHECK (word_count >= 0),
    is_published boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_novel_chapter_number UNIQUE (novel_id, chapter_number)
);

CREATE INDEX IF NOT EXISTS idx_chapters_novel_number ON chapters(novel_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_chapters_preview ON chapters(novel_id, is_free_preview);
