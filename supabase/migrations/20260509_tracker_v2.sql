-- Live Booking Tracker v2 — emergency contacts, photo consent, arrival
-- selfie, and ETA cache columns. Idempotent throughout.

-- ── Journal kind enum: add 'system' ──────────────────────────────
-- The auto-injected arrival/departure/photo-consent events all use
-- kind='system'. Add the enum value if it isn't already present.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'journal_kind'
      and e.enumlabel = 'system'
  ) then
    alter type journal_kind add value 'system';
  end if;
end $$;

-- ── Emergency contacts (per seeker) ──────────────────────────────
create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  phone text not null check (length(phone) between 5 and 30),
  relationship text check (length(relationship) <= 40),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists emergency_contacts_owner_idx
  on public.emergency_contacts(owner_id);

alter table public.emergency_contacts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'emergency_contacts_owner_rw'
      and tablename = 'emergency_contacts'
  ) then
    create policy emergency_contacts_owner_rw on public.emergency_contacts
      for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;
end $$;

-- The 3-per-owner cap is enforced application-side at the
-- /api/emergency-contacts POST handler. Keeping it in the API rather
-- than via a trigger keeps error messages user-readable.

-- ── Per-booking photo consent + arrival selfie ───────────────────
alter table public.bookings
  add column if not exists photo_updates_consent boolean;
alter table public.bookings
  add column if not exists arrival_selfie_path text;

-- ── ETA cache on tracking session ────────────────────────────────
alter table public.shift_tracking_sessions
  add column if not exists eta_seconds int;
alter table public.shift_tracking_sessions
  add column if not exists eta_calculated_at timestamptz;
alter table public.shift_tracking_sessions
  add column if not exists eta_destination_lng numeric;
alter table public.shift_tracking_sessions
  add column if not exists eta_destination_lat numeric;

-- Helper: read service_point geometry as plain (lng, lat) pair.
-- Used by the ETA helper when caching the destination on a session row.
create or replace function public.booking_service_point_lnglat(
  p_booking_id uuid
)
returns table (lng double precision, lat double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    extensions.st_x(b.service_point::extensions.geometry) as lng,
    extensions.st_y(b.service_point::extensions.geometry) as lat
  from public.bookings b
  where b.id = p_booking_id
    and b.service_point is not null
$$;
