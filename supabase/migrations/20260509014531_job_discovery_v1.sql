-- Job Discovery v1 — saved searches, preferred clients, distance RPC,
-- and a discovery countdown column on bookings. All idempotent. RLS
-- guards use pg_policies.policyname (not the deprecated polname).

-- ── Saved searches ────────────────────────────────────────────────
create table if not exists public.carer_saved_searches (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carer_saved_searches_carer_idx
  on public.carer_saved_searches(carer_id, created_at desc);
alter table public.carer_saved_searches enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'carer_saved_searches_owner_rw'
      and tablename = 'carer_saved_searches'
  ) then
    create policy carer_saved_searches_owner_rw on public.carer_saved_searches
      for all to authenticated
      using (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── Preferred clients ─────────────────────────────────────────────
create table if not exists public.carer_preferred_clients (
  carer_id uuid not null references auth.users(id) on delete cascade,
  seeker_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (carer_id, seeker_id)
);
create index if not exists carer_preferred_clients_carer_idx
  on public.carer_preferred_clients(carer_id);
alter table public.carer_preferred_clients enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'carer_preferred_clients_owner_rw'
      and tablename = 'carer_preferred_clients'
  ) then
    create policy carer_preferred_clients_owner_rw on public.carer_preferred_clients
      for all to authenticated
      using (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── Discovery countdown column ────────────────────────────────────
alter table public.bookings
  add column if not exists discovery_expires_at timestamptz;
create index if not exists bookings_discovery_expires_idx
  on public.bookings(discovery_expires_at)
  where discovery_expires_at is not null;

-- Backfill: any current pending row gets a sensible expiry so it
-- doesn't appear stuck on the carer feed.
update public.bookings
  set discovery_expires_at = greatest(
    now(),
    starts_at - interval '15 minutes'
  )
  where status = 'pending'
    and discovery_expires_at is null;

-- ── RPC: bookings near a carer ────────────────────────────────────
-- Returns bookings TARGETED at this carer (caregiver_id match) that
-- are still upcoming and bookable, with distance from the carer's
-- home_point to the booking's service_point. Either point may be null
-- (we still return the row, with distance_m as null).
create or replace function public.bookings_near_carer(
  carer_uuid uuid,
  radius_m double precision default 50000
)
returns table (
  id uuid,
  seeker_id uuid,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  hours numeric,
  hourly_rate_cents int,
  currency text,
  service_type text,
  location_city text,
  location_country text,
  location_postcode text,
  service_point_lng double precision,
  service_point_lat double precision,
  distance_m double precision,
  discovery_expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with carer_home as (
    select home_point::extensions.geography as g
    from public.caregiver_profiles
    where user_id = carer_uuid
    limit 1
  )
  select
    b.id,
    b.seeker_id,
    b.status::text,
    b.starts_at,
    b.ends_at,
    b.hours,
    b.hourly_rate_cents,
    b.currency,
    b.service_type::text,
    b.location_city,
    b.location_country,
    b.location_postcode,
    case when b.service_point is not null
      then extensions.st_x(b.service_point::extensions.geometry)
      else null
    end as service_point_lng,
    case when b.service_point is not null
      then extensions.st_y(b.service_point::extensions.geometry)
      else null
    end as service_point_lat,
    case
      when b.service_point is null or (select g from carer_home) is null
        then null
      else extensions.st_distance(
        b.service_point::extensions.geography,
        (select g from carer_home)
      )
    end as distance_m,
    b.discovery_expires_at,
    b.created_at
  from public.bookings b
  where b.caregiver_id = carer_uuid
    and b.status in ('pending','accepted','paid')
    and b.starts_at >= now()
    and (
      b.service_point is null
      or (select g from carer_home) is null
      or extensions.st_dwithin(
        b.service_point::extensions.geography,
        (select g from carer_home),
        radius_m
      )
    )
  order by b.starts_at asc;
$$;

grant execute on function public.bookings_near_carer(uuid, double precision)
  to authenticated;

-- ── Open service requests (Option B: open job board) ──────────────
-- Seekers post a request; carers within range can claim it.
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references auth.users(id) on delete cascade,
  service_type text not null check (service_type in (
    'elderly_care','childcare','special_needs','postnatal','complex_care'
  )),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  hours numeric(6,2) not null,
  hourly_rate_cents integer not null check (hourly_rate_cents > 0),
  currency text not null check (currency in ('gbp','usd')),
  location_city text,
  location_country text check (location_country in ('GB','US')),
  location_postcode text,
  service_point extensions.geography(Point, 4326),
  notes text,
  status text not null default 'open'
    check (status in ('open','claimed','cancelled','expired')),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_requests_point_gix
  on public.service_requests using gist (service_point);
create index if not exists service_requests_status_expires_idx
  on public.service_requests (status, expires_at desc);
create index if not exists service_requests_seeker_idx
  on public.service_requests (seeker_id);
create index if not exists service_requests_claimed_by_idx
  on public.service_requests (claimed_by);

alter table public.service_requests enable row level security;

-- Seekers fully own their own requests (read/write/delete).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'service_requests_seeker_rw'
      and tablename = 'service_requests'
  ) then
    create policy service_requests_seeker_rw on public.service_requests
      for all to authenticated
      using (seeker_id = (select auth.uid()))
      with check (seeker_id = (select auth.uid()));
  end if;
end $$;

-- Any authenticated user (i.e. carers) can read OPEN, non-expired
-- requests for discovery. Inserts/updates flow through service-role
-- routes so no carer-side write policy is needed.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'service_requests_carer_select_open'
      and tablename = 'service_requests'
  ) then
    create policy service_requests_carer_select_open on public.service_requests
      for select to authenticated
      using (status = 'open' and expires_at > now());
  end if;
end $$;

-- ── RPC: open requests near a carer ───────────────────────────────
create or replace function public.open_requests_near_carer(
  carer_uuid uuid,
  radius_m double precision default 50000
)
returns table (
  id uuid,
  seeker_id uuid,
  service_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  hours numeric,
  hourly_rate_cents int,
  currency text,
  location_city text,
  location_country text,
  location_postcode text,
  notes text,
  expires_at timestamptz,
  service_point_lng double precision,
  service_point_lat double precision,
  distance_m double precision,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with carer_home as (
    select home_point::extensions.geography as g
    from public.caregiver_profiles
    where user_id = carer_uuid
    limit 1
  )
  select
    s.id,
    s.seeker_id,
    s.service_type,
    s.starts_at,
    s.ends_at,
    s.hours,
    s.hourly_rate_cents,
    s.currency,
    s.location_city,
    s.location_country,
    s.location_postcode,
    s.notes,
    s.expires_at,
    case when s.service_point is not null
      then extensions.st_x(s.service_point::extensions.geometry)
      else null
    end,
    case when s.service_point is not null
      then extensions.st_y(s.service_point::extensions.geometry)
      else null
    end,
    case
      when s.service_point is null or (select g from carer_home) is null
        then null
      else extensions.st_distance(
        s.service_point::extensions.geography,
        (select g from carer_home)
      )
    end,
    s.created_at
  from public.service_requests s
  where s.status = 'open'
    and s.expires_at > now()
    and (
      s.service_point is null
      or (select g from carer_home) is null
      or extensions.st_dwithin(
        s.service_point::extensions.geography,
        (select g from carer_home),
        radius_m
      )
    )
  order by s.starts_at asc;
$$;

grant execute on function public.open_requests_near_carer(uuid, double precision)
  to authenticated;
