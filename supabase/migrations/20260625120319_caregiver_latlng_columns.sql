-- SpecialCarers · Plain lat/lng columns for distance-sorted search (gap 19 follow-up)
--
-- The carer search handler (src/app/api/m/carers/search/search-handler.ts) is
-- built on the Supabase JS query builder and computes "Nearest" distances with
-- a JS haversine — it has no SQL/PostGIS surface to call ST_Distance. To feed
-- it, we expose the carer's service-area centre as plain numeric columns
-- derived from the existing PostGIS home_point. PostGIS is touched ONLY here in
-- the migration (backfill + trigger); the read path stays PostGIS-free.
--
-- Additive + idempotent (caregiver_profiles is provisioned outside migrations,
-- so we only ALTER ... ADD COLUMN IF NOT EXISTS).

-- ──────────────────────────────────────────────────────────────────
-- 1. Columns
-- ──────────────────────────────────────────────────────────────────

alter table public.caregiver_profiles
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision;

comment on column public.caregiver_profiles.home_lat is
  'WGS84 latitude mirror of home_point. Plain numeric so the JS search handler can haversine without PostGIS. Kept in sync by trigger.';
comment on column public.caregiver_profiles.home_lng is
  'WGS84 longitude mirror of home_point. Plain numeric so the JS search handler can haversine without PostGIS. Kept in sync by trigger.';

-- ──────────────────────────────────────────────────────────────────
-- 2. Backfill from the existing PostGIS home_point
-- ──────────────────────────────────────────────────────────────────

update public.caregiver_profiles
   set home_lat = extensions.ST_Y(home_point::extensions.geometry),
       home_lng = extensions.ST_X(home_point::extensions.geometry)
 where home_point is not null
   and (home_lat is null or home_lng is null);

-- ──────────────────────────────────────────────────────────────────
-- 3. Keep the mirror current whenever home_point changes
-- ──────────────────────────────────────────────────────────────────

create or replace function public.sync_caregiver_home_latlng()
returns trigger
language plpgsql
as $$
begin
  if new.home_point is null then
    new.home_lat := null;
    new.home_lng := null;
  else
    new.home_lat := extensions.ST_Y(new.home_point::extensions.geometry);
    new.home_lng := extensions.ST_X(new.home_point::extensions.geometry);
  end if;
  return new;
end;
$$;

drop trigger if exists caregiver_profiles_sync_home_latlng
  on public.caregiver_profiles;
create trigger caregiver_profiles_sync_home_latlng
  before insert or update of home_point on public.caregiver_profiles
  for each row execute function public.sync_caregiver_home_latlng();
