-- ============================================================================
-- SpecialCarers — Mobile Redesign R3 distance (PR-R3)
--
-- Moves carer distance search from the JS haversine in the search handler
-- (src/app/api/m/carers/search/search-handler.ts) onto PostGIS, so radius
-- filtering and distance sorting happen in the database against a GiST index
-- instead of in application code over the whole result set.
--
-- The geography source of truth stays home_lat / home_lng (the plain numeric
-- mirror added in 20260610_caregiver_latlng_columns.sql, kept in sync from the
-- PostGIS home_point by trigger). This migration adds a GENERATED geography
-- column derived from those, so it is always consistent with the JS path's
-- inputs and needs no separate backfill or trigger.
--
-- Consumed by src/lib/m/distance/postgis.ts behind
-- NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED; when the flag is off the existing JS
-- haversine path is unchanged.
--
-- PostGIS lives in the `extensions` schema (Supabase convention, see
-- 20260507_postcode_geosearch.sql) — types and functions are referenced with
-- the explicit `extensions.` prefix and security-definer functions pin
-- search_path accordingly.
--
-- Idempotent throughout: extension/column/index/function creation all guard
-- against re-runs. Safe to re-run; a no-op where objects already exist.
-- ============================================================================

-- 1) PostGIS (no-op if already enabled by the geosearch foundation migration).
create extension if not exists postgis with schema extensions;

-- 2) Generated geography column derived from the existing lat/lng mirror.
--    GENERATED ALWAYS ... STORED requires an IMMUTABLE expression; ST_MakePoint
--    + ST_SetSRID + the geography cast are all immutable. Null lat/lng yields a
--    null geography (ST_MakePoint is strict), which the radius function skips.
alter table public.caregiver_profiles
  add column if not exists home_geog extensions.geography(Point, 4326)
    generated always as (
      extensions.ST_SetSRID(
        extensions.ST_MakePoint(home_lng, home_lat), 4326
      )::extensions.geography
    ) stored;

comment on column public.caregiver_profiles.home_geog is
  'PostGIS geography mirror of home_lng/home_lat (WGS84). GENERATED + STORED so it stays consistent with the JS haversine inputs without a trigger. Drives carers_within_radius() ST_DWithin / ST_Distance.';

-- 3) GiST index for fast radius queries on the generated column.
create index if not exists caregiver_profiles_home_geog_gix
  on public.caregiver_profiles using gist (home_geog);

-- 4) carers_within_radius(p_lat, p_lng, p_meters)
--    Returns full caregiver_profiles rows within p_meters of (p_lat, p_lng),
--    using the indexed ST_DWithin predicate. Distance itself (distance_m) is
--    computed by the caller via ST_Distance against home_geog so the SETOF
--    signature stays a plain table type; see src/lib/m/distance/postgis.ts.
--    Published carers only, ordered nearest-first.
create or replace function public.carers_within_radius(
  p_lat double precision,
  p_lng double precision,
  p_meters double precision
)
returns setof public.caregiver_profiles
language sql
stable
security definer
set search_path = public, extensions
as $$
  select cp.*
    from public.caregiver_profiles cp
   where cp.home_geog is not null
     and cp.is_published = true
     and extensions.ST_DWithin(
           cp.home_geog,
           extensions.ST_SetSRID(
             extensions.ST_MakePoint(p_lng, p_lat), 4326
           )::extensions.geography,
           p_meters
         )
   order by extensions.ST_Distance(
              cp.home_geog,
              extensions.ST_SetSRID(
                extensions.ST_MakePoint(p_lng, p_lat), 4326
              )::extensions.geography
            ) asc;
$$;

grant execute on function public.carers_within_radius(
  double precision, double precision, double precision
) to anon, authenticated, service_role;
