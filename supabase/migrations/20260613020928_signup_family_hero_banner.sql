-- Seed the hero banner for /signup/family.
--
-- Context:
--   PR #91 split sign-up into /signup/{caregiver,family,organisation}. Each
--   page renders <PageHeroBanner pageKey="audience.{...}" />, which reads its
--   media from public.page_hero_banners by page_key (see
--   src/components/page-hero-banner.tsx + src/lib/page-banners/get.ts). When no
--   active row exists the component falls back to a brand gradient and renders
--   NO <img> at all.
--
--   The caregivers and organisations audiences already have rows (created via
--   the admin CMS), so their pages show a hero image. The families audience
--   ('audience.families') was introduced by #91 but never got a row, so
--   /signup/family fell through to the gradient fallback with no banner image.
--
--   This migration inserts the missing primary row, pointing media_url at the
--   asset added to the repo at public/banners/family/v1/family_v1_1920x640.webp
--   (served from /banners/family/v1/...). focal_y=45 matches the caregiver
--   page's face-height composition (object-position 50% 45%).
--
--   Idempotent: re-running is a no-op for an existing row's media. Mirrors how
--   20260514_phase2_banner_alternates.sql manages banner data via SQL.

insert into public.page_hero_banners
  (page_key, media_url, media_kind, alt, focal_x, focal_y, active)
values
  (
    'audience.families',
    '/banners/family/v1/family_v1_1920x640.webp',
    'image',
    'A family welcoming a professional carer at home',
    50,
    45,
    true
  )
on conflict (page_key) do nothing;
