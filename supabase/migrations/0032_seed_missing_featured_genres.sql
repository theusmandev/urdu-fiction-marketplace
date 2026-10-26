-- ==============================================================================
-- UNB Premium — Migration 0032: Seed Missing Featured Genres
-- Description: Seeds the featured header genres (Action & Espionage, Mystery &
--              Crime Thriller, Historical & Classical, Horror & Supernatural,
--              Literary & Philosophical) so empty genre pages never 404.
-- ==============================================================================

INSERT INTO public.genres (slug, name_english, name_urdu, display_order, is_active)
VALUES
    ('action-adventure', 'Action & Espionage', 'جاسوسی و مہم جوئی', 9, true),
    ('mystery-thriller', 'Mystery & Crime Thriller', 'پراسرار و سسپنس تھرلر', 10, true),
    ('historical-epic', 'Historical & Classical', 'تاریخی و کلاسیکی', 11, true),
    ('horror-supernatural', 'Horror & Supernatural', 'خوفناک و ماورائی', 12, true),
    ('philosophical-literary', 'Literary & Philosophical', 'ادبی و فلسفیانہ', 13, true)
ON CONFLICT (slug) DO UPDATE SET
    name_english = EXCLUDED.name_english,
    name_urdu = EXCLUDED.name_urdu,
    is_active = true;
