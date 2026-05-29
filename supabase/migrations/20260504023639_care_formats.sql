-- Add care delivery formats (live_in, visiting) to caregiver profiles.
-- A caregiver can declare one or both. Live-in uses a weekly rate;
-- visiting uses the existing hourly_rate_cents.
--
-- Applied to qupjaanyhnuvlexkwtpq on 2026-05-04 via Supabase apply_migration.

alter table public.caregiver_profiles
  add column if not exists care_formats text[] not null default '{}';

alter table public.caregiver_profiles
  add column if not exists weekly_rate_cents integer;

alter table public.caregiver_profiles
  drop constraint if exists caregiver_profiles_care_formats_check;
alter table public.caregiver_profiles
  add constraint caregiver_profiles_care_formats_check
  check (care_formats <@ array['live_in','visiting']::text[]);

alter table public.caregiver_profiles
  drop constraint if exists caregiver_profiles_weekly_rate_check;
alter table public.caregiver_profiles
  add constraint caregiver_profiles_weekly_rate_check
  check (weekly_rate_cents is null or (weekly_rate_cents >= 10000 and weekly_rate_cents <= 500000));

-- Backfill: every existing caregiver currently has an hourly rate, so they
-- offer visiting. Only update rows where the array is still empty.
update public.caregiver_profiles
  set care_formats = array['visiting']
  where care_formats = '{}';

create index if not exists caregiver_profiles_care_formats_gin
  on public.caregiver_profiles using gin (care_formats);
