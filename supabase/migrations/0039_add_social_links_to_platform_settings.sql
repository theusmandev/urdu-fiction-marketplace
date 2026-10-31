-- 0039_add_social_links_to_platform_settings.sql
-- Idempotent: adds social_links JSONB column to platform_settings and seeds default URLs.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}';

UPDATE platform_settings
SET social_links = '{
  "facebook": "https://www.facebook.com/people/Urdu-novel-Bank/100090906471153/",
  "whatsapp": "https://whatsapp.com/channel/0029VaurdEY0wajrnyeAl50Y",
  "pinterest": "https://www.pinterest.com/urdunovelbanks/",
  "instagram": "https://www.instagram.com/urdunovelbank/",
  "youtube": "https://youtube.com/@urdunovelbank",
  "telegram": "https://t.me/urdunovelbank"
}'::JSONB
WHERE id = (SELECT id FROM platform_settings LIMIT 1);
