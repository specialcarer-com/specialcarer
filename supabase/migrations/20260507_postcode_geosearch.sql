-- Postcode + geosearch foundation
--   * enable PostGIS for ST_DWithin / ST_Distance
--   * caregiver_profiles: postcode (text, country-aware), home_point (geography),
--     hide_precise_location (privacy default ON — only show district-level pin)
--   * bookings: location_postcode (text), service_point (geography)
--   * GiST indexes for fast radius queries
--   * Backfill home_point for known cities so /find-care/map populates immediately
--     (carers can refine via the profile editor's postcode field).

-- 1) Enable PostGIS in its dedicated schema (Supabase convention).
create extension if not exists postgis with schema extensions;

-- 2) Caregiver profile location columns (additive, all nullable).
alter table public.caregiver_profiles
  add column if not exists postcode text,
  add column if not exists home_point extensions.geography(Point, 4326),
  add column if not exists hide_precise_location boolean not null default true;

comment on column public.caregiver_profiles.postcode is
  'UK postcode or US ZIP. Stored as raw user input; geocoded result lives in home_point.';
comment on column public.caregiver_profiles.home_point is
  'WGS84 lat/lng of the carer''s service-area centre (geocoded from postcode). Used for ST_DWithin radius searches.';
comment on column public.caregiver_profiles.hide_precise_location is
  'Privacy default. When true, public surfaces show district-level area only; full pin reveals to families post-booking.';

-- 3) Booking service location.
alter table public.bookings
  add column if not exists location_postcode text,
  add column if not exists service_point extensions.geography(Point, 4326);

comment on column public.bookings.location_postcode is
  'Postcode/ZIP where care will be delivered.';
comment on column public.bookings.service_point is
  'WGS84 lat/lng of the booking address (geocoded from location_postcode).';

-- 4) Indexes for radius queries.
create index if not exists caregiver_profiles_home_point_gix
  on public.caregiver_profiles using gist (home_point);
create index if not exists bookings_service_point_gix
  on public.bookings using gist (service_point);

-- 5) Backfill home_point for existing carers via known city centroids.
--    Approximate (suburb-level), good enough until the carer enters their
--    own postcode in the profile editor. Source: ONS / Wikipedia, OK for UX.
do $$
declare
  centroids jsonb := jsonb_build_object(
    'London',       jsonb_build_array(-0.1276, 51.5074),
    'Birmingham',   jsonb_build_array(-1.8904, 52.4862),
    'Manchester',   jsonb_build_array(-2.2426, 53.4808),
    'Leeds',        jsonb_build_array(-1.5491, 53.8008),
    'Glasgow',      jsonb_build_array(-4.2518, 55.8642),
    'Edinburgh',    jsonb_build_array(-3.1883, 55.9533),
    'Bristol',      jsonb_build_array(-2.5879, 51.4545),
    'Liverpool',    jsonb_build_array(-2.9916, 53.4084),
    'Cardiff',      jsonb_build_array(-3.1791, 51.4816),
    'Belfast',      jsonb_build_array(-5.9301, 54.5973),
    'New York',     jsonb_build_array(-74.0060, 40.7128),
    'Brooklyn',     jsonb_build_array(-73.9442, 40.6782),
    'Los Angeles',  jsonb_build_array(-118.2437, 34.0522),
    'San Francisco',jsonb_build_array(-122.4194, 37.7749),
    'Chicago',      jsonb_build_array(-87.6298, 41.8781),
    'Houston',      jsonb_build_array(-95.3698, 29.7604),
    'Boston',       jsonb_build_array(-71.0589, 42.3601),
    'Seattle',      jsonb_build_array(-122.3321, 47.6062),
    'Miami',        jsonb_build_array(-80.1918, 25.7617),
    'Washington',   jsonb_build_array(-77.0369, 38.9072)
  );
  rec record;
  coords jsonb;
  lng numeric;
  lat numeric;
begin
  for rec in
    select user_id, city
      from public.caregiver_profiles
     where home_point is null
       and city is not null
  loop
    coords := centroids -> rec.city;
    if coords is not null then
      lng := (coords ->> 0)::numeric;
      lat := (coords ->> 1)::numeric;
      update public.caregiver_profiles
         set home_point = extensions.ST_SetSRID(
                            extensions.ST_MakePoint(lng, lat), 4326
                          )::extensions.geography
       where user_id = rec.user_id;
    end if;
  end loop;
end$$;

-- 7) RPC: caregivers_within_radius
--    Returns user_ids + distance_m for published carers whose home_point
--    lies within radius_m metres of (origin_lng, origin_lat). Used as a
--    geo prefilter by searchCaregivers() before joining to the main query.
create or replace function public.caregivers_within_radius(
  origin_lng double precision,
  origin_lat double precision,
  radius_m double precision
)
returns table(user_id uuid, distance_m double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select cp.user_id,
         extensions.ST_Distance(
           cp.home_point,
           extensions.ST_SetSRID(
             extensions.ST_MakePoint(origin_lng, origin_lat), 4326
           )::extensions.geography
         ) as distance_m
    from public.caregiver_profiles cp
   where cp.home_point is not null
     and cp.is_published = true
     and extensions.ST_DWithin(
           cp.home_point,
           extensions.ST_SetSRID(
             extensions.ST_MakePoint(origin_lng, origin_lat), 4326
           )::extensions.geography,
           radius_m
         )
   order by distance_m asc;
$$;

grant execute on function public.caregivers_within_radius(
  double precision, double precision, double precision
) to anon, authenticated, service_role;

-- 8) RPC: caregiver_points
--    Returns lat/lng pairs for the supplied user_ids. Map view fetches
--    these for the visible result set so we don't expose every carer's
--    point to the client. Pins are fuzzed client-side when
--    hide_precise_location = true (default).
create or replace function public.caregiver_points(p_user_ids uuid[])
returns table(user_id uuid, lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select cp.user_id,
         extensions.ST_Y(cp.home_point::extensions.geometry) as lat,
         extensions.ST_X(cp.home_point::extensions.geometry) as lng
    from public.caregiver_profiles cp
   where cp.user_id = any(p_user_ids)
     and cp.home_point is not null
     and cp.is_published = true;
$$;

grant execute on function public.caregiver_points(uuid[])
  to anon, authenticated, service_role;
