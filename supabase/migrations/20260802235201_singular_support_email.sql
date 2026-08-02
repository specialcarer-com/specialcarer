-- Update support_email default from plural to singular brand
--
-- The original 20260509132749_support_safety_v3_10.sql migration seeded
-- public.support_settings.support_email with the plural-brand default
-- 'support@specialcarers.com'. That migration is not rewritten here (never
-- rewrite migration history) — this is a new, additive, idempotent forward
-- migration that updates the already-seeded singleton row (and the column
-- default for any future inserts) to the singular brand domain.
--
-- Safe to re-run: the WHERE clause makes this a no-op once applied.
--
-- Ref: /home/user/workspace/plural_email_audit.md

update public.support_settings
set support_email = 'support@specialcarer.com',
    updated_at = now()
where support_email = 'support@specialcarers.com';

alter table public.support_settings
  alter column support_email set default 'support@specialcarer.com';
