-- Migration: replace hardcoded profiles_country_check with a managed lookup table
-- Context: scope expanded beyond UK. Adds Ireland (IE) and enables adding future
-- countries via data (allowed_countries) instead of schema migrations.
-- Existing data audit (prod, 2026-07-07): GB=19, NULL=13, US=0.

-- 1. Reference table of supported countries (ISO 3166-1 alpha-2 codes)
create table if not exists public.allowed_countries (
  code       text primary key,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.allowed_countries is
  'Supported countries for profiles.country. Add rows to support new countries; toggle is_active to enable/disable without deleting.';

-- 2. Seed currently-supported + newly-in-scope countries.
--    US retained but inactive (never used in prod; kept for future launch).
insert into public.allowed_countries (code, name, is_active) values
  ('GB', 'United Kingdom', true),
  ('IE', 'Ireland',        true),
  ('US', 'United States',  false)
on conflict (code) do nothing;

-- 3. Replace the hardcoded CHECK with referential integrity.
--    Safe: all existing profiles.country values are 'GB' or NULL (both valid).
alter table public.profiles drop constraint if exists profiles_country_check;

alter table public.profiles
  add constraint profiles_country_fk
  foreign key (country) references public.allowed_countries(code);

-- 4. RLS: allow authenticated users to read active countries (for the form dropdown).
alter table public.allowed_countries enable row level security;

create policy allowed_countries_read_active
  on public.allowed_countries
  for select
  to authenticated
  using (is_active = true);
