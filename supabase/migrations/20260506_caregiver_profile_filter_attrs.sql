-- Booking preference filters: extra attributes on caregiver_profiles
-- (gender / driver / vehicle / tags / certifications). All optional —
-- existing rows continue to publish. Tags & certifications are open
-- text arrays validated at the API layer.

alter table public.caregiver_profiles
  add column if not exists gender text
    check (gender is null or gender in ('female','male','non_binary','prefer_not_to_say')),
  add column if not exists has_drivers_license boolean not null default false,
  add column if not exists has_own_vehicle boolean not null default false,
  add column if not exists tags text[] not null default '{}',
  add column if not exists certifications text[] not null default '{}';

-- Sanity CHECK so tags/certifications can't blow up to nonsense sizes
alter table public.caregiver_profiles
  drop constraint if exists caregiver_profiles_tags_size_chk;
alter table public.caregiver_profiles
  add constraint caregiver_profiles_tags_size_chk
  check (array_length(tags, 1) is null or array_length(tags, 1) <= 24);

alter table public.caregiver_profiles
  drop constraint if exists caregiver_profiles_certs_size_chk;
alter table public.caregiver_profiles
  add constraint caregiver_profiles_certs_size_chk
  check (array_length(certifications, 1) is null or array_length(certifications, 1) <= 32);

-- GIN indexes so contains() filter scans stay fast as the catalogue grows
create index if not exists caregiver_profiles_tags_gin
  on public.caregiver_profiles using gin (tags);
create index if not exists caregiver_profiles_certs_gin
  on public.caregiver_profiles using gin (certifications);
create index if not exists caregiver_profiles_languages_gin
  on public.caregiver_profiles using gin (languages);

-- Booking-level filter preferences (what the seeker required at request time).
-- Stored as jsonb so we can evolve the shape without a migration.
alter table public.bookings
  add column if not exists preferences jsonb not null default '{}'::jsonb;
