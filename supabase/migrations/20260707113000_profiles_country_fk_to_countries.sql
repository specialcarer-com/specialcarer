-- Align profiles.country with the existing countries feature-flag table.
--
-- Context: the multi-country framework (public.countries) was added in
-- 20260613150518_countries_v1.sql, but profiles.country was never repointed
-- to it and still uses the old hardcoded CHECK (GB, US). That stale CHECK is
-- what causes profiles_country_check violations in the admin edit form.
--
-- Scope: UK only for now. countries is seeded with GB; no new countries added.
-- Safe: production profiles.country contains only 'GB' (19) and NULL (13),
-- both valid against countries(code) (GB present; FK permits NULL).

alter table public.profiles drop constraint if exists profiles_country_check;

alter table public.profiles
  add constraint profiles_country_fk
  foreign key (country) references public.countries(code);
