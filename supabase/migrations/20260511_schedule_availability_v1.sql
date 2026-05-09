-- ──────────────────────────────────────────────────────────────────────────────
-- 3.7 Schedule & Availability — Phase 1
-- Adds: caregiver_blockouts, caregiver_timeoff_requests,
--       soft index on caregiver_availability_slots,
--       updated bookings_near_carer RPC (filters out own blockouts/timeoff),
--       admin RLS policy for timeoff.
-- Convention: pg_policies.policyname idempotency guards throughout.
-- NO ALTER TYPE ... ADD VALUE (not needed here).
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Soft index on caregiver_availability_slots ─────────────────────────────
create index if not exists caregiver_availability_slots_user_weekday_start
  on public.caregiver_availability_slots (user_id, weekday, start_time);

-- ── 2. caregiver_blockouts ────────────────────────────────────────────────────
create table if not exists public.caregiver_blockouts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  starts_on   date        not null,
  ends_on     date        not null,
  reason      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint caregiver_blockouts_dates_check check (ends_on >= starts_on)
);

create index if not exists caregiver_blockouts_user_idx
  on public.caregiver_blockouts (user_id, starts_on);

alter table public.caregiver_blockouts enable row level security;

-- updated_at trigger
create or replace function public.set_updated_at_blockouts()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists tg_blockouts_touch on public.caregiver_blockouts;
create trigger tg_blockouts_touch
  before update on public.caregiver_blockouts
  for each row execute procedure public.set_updated_at_blockouts();

-- RLS: public read (so matcher/org can read), self write
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'blockouts_public_read'
      and tablename  = 'caregiver_blockouts'
  ) then
    create policy blockouts_public_read on public.caregiver_blockouts
      for select to authenticated
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'blockouts_self_write'
      and tablename  = 'caregiver_blockouts'
  ) then
    create policy blockouts_self_write on public.caregiver_blockouts
      for all to authenticated
      using  (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ── 3. caregiver_timeoff_requests ─────────────────────────────────────────────
create table if not exists public.caregiver_timeoff_requests (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  starts_on   date        not null,
  ends_on     date        not null,
  reason      text        not null default '',
  status      text        not null default 'pending'
                check (status in ('pending','approved','declined','cancelled')),
  reviewed_by uuid        references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint caregiver_timeoff_requests_dates_check check (ends_on >= starts_on)
);

create index if not exists caregiver_timeoff_user_idx
  on public.caregiver_timeoff_requests (user_id, starts_on);
create index if not exists caregiver_timeoff_status_idx
  on public.caregiver_timeoff_requests (status, starts_on);

alter table public.caregiver_timeoff_requests enable row level security;

-- updated_at trigger
create or replace function public.set_updated_at_timeoff()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists tg_timeoff_touch on public.caregiver_timeoff_requests;
create trigger tg_timeoff_touch
  before update on public.caregiver_timeoff_requests
  for each row execute procedure public.set_updated_at_timeoff();

-- RLS: carer reads/writes their own rows
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'timeoff_carer_rw'
      and tablename  = 'caregiver_timeoff_requests'
  ) then
    create policy timeoff_carer_rw on public.caregiver_timeoff_requests
      for all to authenticated
      using  (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- RLS: admin reads ALL rows (admin = role = 'admin' in profiles)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'timeoff_admin_read'
      and tablename  = 'caregiver_timeoff_requests'
  ) then
    create policy timeoff_admin_read on public.caregiver_timeoff_requests
      for select to authenticated
      using (
        exists (
          select 1 from public.profiles
          where id   = (select auth.uid())
            and role = 'admin'
        )
      );
  end if;
end $$;

-- RLS: admin can update status on any row
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'timeoff_admin_update'
      and tablename  = 'caregiver_timeoff_requests'
  ) then
    create policy timeoff_admin_update on public.caregiver_timeoff_requests
      for update to authenticated
      using (
        exists (
          select 1 from public.profiles
          where id   = (select auth.uid())
            and role = 'admin'
        )
      );
  end if;
end $$;

-- ── 4. bookings_near_carer — drop + recreate with blockout/timeoff filter ─────
-- IMPORTANT: this RPC ALSO surfaces the Phase B columns (shift_mode,
-- sleep_in_carer_pay, booking_source) and includes status='offered' so org
-- shift offers reach carers. Do NOT remove those — the carer mobile feed
-- (src/app/api/m/jobs/route.ts) consumes them via TargetedRpcRow.
--
-- Filter additions in 3.7:
--   • Excludes bookings overlapping the carer's own approved time-off
--   • Excludes bookings overlapping the carer's caregiver_blockouts
drop function if exists public.bookings_near_carer(uuid, double precision);

create function public.bookings_near_carer(
  carer_uuid uuid,
  radius_m double precision default 50000
)
returns table (
  id                    uuid,
  seeker_id             uuid,
  status                text,
  starts_at             timestamptz,
  ends_at               timestamptz,
  hours                 numeric,
  hourly_rate_cents     int,
  currency              text,
  service_type          text,
  location_city         text,
  location_country      text,
  location_postcode     text,
  service_point_lng     double precision,
  service_point_lat     double precision,
  distance_m            double precision,
  discovery_expires_at  timestamptz,
  created_at            timestamptz,
  shift_mode            text,
  sleep_in_carer_pay    numeric,
  booking_source        text
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
  ),
  blocked as (
    select starts_on::timestamptz as bs,
           (ends_on + interval '1 day')::timestamptz as be
    from public.caregiver_timeoff_requests
    where user_id = carer_uuid
      and status  = 'approved'
    union all
    select starts_on::timestamptz,
           (ends_on  + interval '1 day')::timestamptz
    from public.caregiver_blockouts
    where user_id = carer_uuid
  )
  select
    b.id, b.seeker_id, b.status::text, b.starts_at, b.ends_at, b.hours,
    b.hourly_rate_cents, b.currency, b.service_type::text, b.location_city,
    b.location_country, b.location_postcode,
    case when b.service_point is not null then extensions.st_x(b.service_point::extensions.geometry) else null end,
    case when b.service_point is not null then extensions.st_y(b.service_point::extensions.geometry) else null end,
    case
      when b.service_point is null or (select g from carer_home) is null then null
      else extensions.st_distance(b.service_point::extensions.geography, (select g from carer_home))
    end,
    b.discovery_expires_at, b.created_at,
    b.shift_mode::text, b.sleep_in_carer_pay, b.booking_source::text
  from public.bookings b
  where b.caregiver_id = carer_uuid
    and b.status in ('pending','accepted','paid','offered')
    and b.starts_at >= now()
    and not exists (
      select 1 from blocked
      where b.starts_at < blocked.be
        and b.ends_at   > blocked.bs
    )
    and (
      b.service_point is null
      or (select g from carer_home) is null
      or extensions.st_dwithin(b.service_point::extensions.geography, (select g from carer_home), radius_m)
    )
  order by b.starts_at asc;
$$;

grant execute on function public.bookings_near_carer(uuid, double precision)
  to authenticated;
