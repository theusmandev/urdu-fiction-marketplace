-- ==============================================================================
-- UNB Premium — Migration 0005: Seed Genres and Platform Settings
-- Description: Seeds the core single-row platform configuration (20% commission,
--              PKR 5,000 threshold) and 8 foundational Urdu fiction genres.
-- ==============================================================================

-- 1. SEED PLATFORM SETTINGS
INSERT INTO public.platform_settings (
    id,
    default_commission_rate,
    default_unpaid_commission_limit,
    support_email,
    updated_at
) VALUES (
    1,
    20.00,
    5000.00,
    'support@unbpremium.pk',
    now()
)
ON CONFLICT (id) DO UPDATE SET
    default_commission_rate = EXCLUDED.default_commission_rate,
    default_unpaid_commission_limit = EXCLUDED.default_unpaid_commission_limit,
    support_email = EXCLUDED.support_email,
    updated_at = now();

-- 2. SEED FOUNDATIONAL URDU FICTION GENRES
INSERT INTO public.genres (slug, name_english, name_urdu, display_order)
VALUES
    ('social-romantic', 'Social & Romantic', 'معاشرتی و رومانی', 1),
    ('spiritual-sufism', 'Spiritual & Sufism', 'روحانی و صوفیانہ', 2),
    ('suspense-thriller', 'Suspense & Thriller', 'سسپنس و تھرلر', 3),
    ('historical-fiction', 'Historical Fiction', 'تاریخی فکشن', 4),
    ('family-drama', 'Family Drama', 'خاندانی و اصلاحی ڈراما', 5),
    ('digest-classic', 'Digest Classic', 'ڈائجسٹ کلاسیک', 6),
    ('crime-mystery', 'Crime & Mystery', 'جرم و سراغ رسانی', 7),
    ('fantasy-supernatural', 'Fantasy & Supernatural', 'فینٹسی و ماورائی', 8)
ON CONFLICT (slug) DO UPDATE SET
    name_english = EXCLUDED.name_english,
    name_urdu = EXCLUDED.name_urdu,
    display_order = EXCLUDED.display_order;
