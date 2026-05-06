-- Instant booking foundation
--   * caregiver_instant_settings: per-carer opt-in toggle, min notice
--     (minutes), instant_radius_km override (falls back to caregiver_profiles.max_radius_km),
--     auto_decline_minutes (timeout before we offer to the next match).
--   * caregiver_availability_slots: recurring weekly slots (weekday 0=Sun..6=Sat,
--     start_time, end_time). A carer with no rows is treated as "always
--     available" so onboarding doesn't block instant booking.
--   * find_instant_match RPC: postcode-derived origin + duration + service
--     -> ordered list of eligible carers (within radius, vertical match,
--     available at the requested time, payouts enabled, instant opt-in,
--     no overlapping booking).

-- 1) Per-carer instant booking settings (1:1)
create table if not exists public.caregiver_instant_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  min_notice_minutes integer not null default 60
    check (min_notice_minutes between 15 and 1440),
  instant_radius_km integer
    check (instant_radius_km is null or instant_radius_km between 1 and 100),
  auto_decline_minutes integer not null default 5
    check (auto_decline_minutes between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.caregiver_instant_settings is
  'Per-carer instant booking opt-in + matching parameters. Default OFF.';
comment on column public.caregiver_instant_settings.instant_radius_km is
  'Override radius for instant matches; falls back to caregiver_profiles.max_radius_km when null.';

-- 2) Recurring weekly availability
create table if not exists public.caregiver_availability_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists caregiver_avail_slots_user_idx
  on public.caregiver_availability_slots(user_id, weekday);

comment on table public.caregiver_availability_slots is
  'Recurring weekly availability slots. No rows for a user = treated as always available (lenient default for matching).';

-- 3) RLS: carers manage their own; everyone can read instant_settings
--    (so the seeker UI can show 'instant' badges without server roundtrips).
alter table public.caregiver_instant_settings enable row level security;
alter table public.caregiver_availability_slots enable row level security;

drop policy if exists "instant_settings_self_read" on public.caregiver_instant_settings;
create policy "instant_settings_self_read"
  on public.caregiver_instant_settings for select
  using (true);

drop policy if exists "instant_settings_self_write" on public.caregiver_instant_settings;
create policy "instant_settings_self_write"
  on public.caregiver_instant_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "availability_slots_public_read" on public.caregiver_availability_slots;
create policy "availability_slots_public_read"
  on public.caregiver_availability_slots for select
  using (true);

drop policy if exists "availability_slots_self_write" on public.caregiver_availability_slots;
create policy "availability_slots_self_write"
  on public.caregiver_availability_slots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4) Trigger: keep instant_settings.updated_at fresh
create or replace function public.tg_instant_settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists tg_instant_settings_touch on public.caregiver_instant_settings;
create trigger tg_instant_settings_touch
  before update on public.caregiver_instant_settings
  for each row execute function public.tg_instant_settings_touch();

-- 5) RPC: find_instant_match
--    Returns ranked list (closest first) of carers eligible to take the
--    booking right now. Eligibility rules:
--      - is_published = true
--      - instant_settings.enabled = true
--      - distance_m <= COALESCE(instant_radius_km, max_radius_km, 25) * 1000
--      - service_type in caregiver_profiles.services
--      - starts_at >= now() + min_notice_minutes
--      - matches a recurring availability window (or none recorded -> ok)
--      - has a Stripe Connect account with payouts_enabled = true
--      - no overlapping booking in (pending|accepted|in_progress)
create or replace function public.find_instant_match(
  origin_lng double precision,
  origin_lat double precision,
  p_service_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_country text default null,
  p_max_results integer default 5
)
returns table(
  user_id uuid,
  display_name text,
  city text,
  photo_url text,
  rating_avg numeric,
  hourly_rate_cents integer,
  currency text,
  distance_m double precision,
  min_notice_minutes integer
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  origin_geo extensions.geography;
  shift_weekday smallint;
  shift_start_t time;
  shift_end_t time;
  notice_minutes integer;
begin
  origin_geo := extensions.ST_SetSRID(
    extensions.ST_MakePoint(origin_lng, origin_lat), 4326
  )::extensions.geography;

  -- Minutes between now() and the requested start. Carers whose
  -- min_notice_minutes exceeds this are filtered out.
  notice_minutes := greatest(
    0,
    extract(epoch from (p_starts_at - now()))::integer / 60
  );

  -- Local time-of-day in UTC. (Booking timestamps are stored in UTC; for
  -- v1 we treat availability as UTC-aligned. Per-carer timezone refinement
  -- lands when we add timezone to caregiver_profiles.)
  shift_weekday := extract(dow from p_starts_at at time zone 'UTC')::smallint;
  shift_start_t := (p_starts_at at time zone 'UTC')::time;
  shift_end_t   := (p_ends_at   at time zone 'UTC')::time;

  return query
    select
      cp.user_id,
      cp.display_name,
      cp.city,
      cp.photo_url,
      cp.rating_avg,
      cp.hourly_rate_cents,
      cp.currency,
      extensions.ST_Distance(cp.home_point, origin_geo) as distance_m,
      coalesce(cis.min_notice_minutes, 60) as min_notice_minutes
    from public.caregiver_profiles cp
    join public.caregiver_instant_settings cis
      on cis.user_id = cp.user_id and cis.enabled = true
    join public.caregiver_stripe_accounts csa
      on csa.user_id = cp.user_id and csa.payouts_enabled = true
   where cp.is_published = true
     and cp.home_point is not null
     and (p_country is null or cp.country = p_country)
     -- vertical match: requested service must be in services array
     and p_service_type = any(cp.services)
     -- radius: instant override > profile max_radius_km > 25 km default
     and extensions.ST_DWithin(
           cp.home_point,
           origin_geo,
           coalesce(cis.instant_radius_km, cp.max_radius_km, 25) * 1000.0
         )
     -- min notice satisfied
     and coalesce(cis.min_notice_minutes, 60) <= notice_minutes
     -- availability: either no slots recorded (lenient) or matching slot
     and (
       not exists (
         select 1 from public.caregiver_availability_slots ca
          where ca.user_id = cp.user_id
       )
       or exists (
         select 1 from public.caregiver_availability_slots ca
          where ca.user_id = cp.user_id
            and ca.weekday = shift_weekday
            and ca.start_time <= shift_start_t
            and ca.end_time   >= shift_end_t
       )
     )
     -- no overlapping live booking
     and not exists (
       select 1 from public.bookings b
        where b.caregiver_id = cp.user_id
          and b.status in ('pending','accepted','in_progress')
          and b.starts_at < p_ends_at
          and b.ends_at   > p_starts_at
     )
   order by distance_m asc
   limit greatest(1, least(coalesce(p_max_results, 5), 25));
end$$;

grant execute on function public.find_instant_match(
  double precision, double precision, text, timestamptz, timestamptz, text, integer
) to anon, authenticated, service_role;

-- 6) Convenience view: which carers are 'instant ready' right now (for
--    dashboard counters + the lightning badge on /find-care/map). Excludes
--    timing checks since this is just a presence indicator.
create or replace view public.v_instant_ready_carers as
  select
    cp.user_id,
    cp.display_name,
    cp.city,
    cp.country,
    cp.home_point,
    cp.services,
    cis.min_notice_minutes,
    coalesce(cis.instant_radius_km, cp.max_radius_km, 25) as effective_radius_km
  from public.caregiver_profiles cp
  join public.caregiver_instant_settings cis
    on cis.user_id = cp.user_id and cis.enabled = true
  join public.caregiver_stripe_accounts csa
    on csa.user_id = cp.user_id and csa.payouts_enabled = true
  where cp.is_published = true
    and cp.home_point is not null;

comment on view public.v_instant_ready_carers is
  'Carers who could in principle take an instant booking right now (still subject to availability + no-overlap checks at match time).';

grant select on public.v_instant_ready_carers to anon, authenticated, service_role;
