-- Active Job v1 — carer-side live shift screen.
-- Adds check-out fields, a default geofence radius, the 'nap' enum
-- value for quick-logs, and an is_inside_geofence helper RPC.
-- Idempotent throughout. RLS policy guards use pg_policies.policyname.

-- ── Booking columns ──────────────────────────────────────────────
alter table public.bookings
  add column if not exists handoff_notes text
    check (length(coalesce(handoff_notes,'')) <= 4000);
alter table public.bookings
  add column if not exists checked_out_at timestamptz;
alter table public.bookings
  add column if not exists geofence_radius_m integer not null default 200;

-- ── journal_kind enum: add 'nap' ─────────────────────────────────
-- Carer quick-logs include "Nap"; the existing enum has activity but
-- not a dedicated nap value. Add only if missing.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'journal_kind'
      and e.enumlabel = 'nap'
  ) then
    alter type journal_kind add value 'nap';
  end if;
end $$;

-- ── RPC: is_inside_geofence ──────────────────────────────────────
-- Returns true when (lat,lng) is within bookings.geofence_radius_m of
-- the booking's service_point. Degraded path: returns true when
-- service_point is null (no fence to enforce — better than blocking
-- check-in forever).
create or replace function public.is_inside_geofence(
  p_booking_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_pt extensions.geography;
  v_radius integer;
  v_dist double precision;
begin
  select b.service_point::extensions.geography, b.geofence_radius_m
    into v_pt, v_radius
  from public.bookings b
  where b.id = p_booking_id;
  if not found then
    return false;
  end if;
  if v_pt is null then
    return true; -- degraded: no fence to enforce
  end if;
  v_dist := extensions.st_distance(
    v_pt,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  );
  return v_dist <= coalesce(v_radius, 200);
end;
$$;

grant execute on function public.is_inside_geofence(uuid, double precision, double precision)
  to authenticated;

-- Companion RPC that returns the actual distance for nicer UX
-- ("you're 327 m away"). Same SECURITY DEFINER gate — anyone authed
-- on the booking already sees its coordinates via the existing track
-- APIs, so no additional disclosure here.
create or replace function public.distance_to_booking(
  p_booking_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns double precision
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_pt extensions.geography;
begin
  select b.service_point::extensions.geography into v_pt
  from public.bookings b
  where b.id = p_booking_id;
  if v_pt is null then return null; end if;
  return extensions.st_distance(
    v_pt,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  );
end;
$$;

grant execute on function public.distance_to_booking(uuid, double precision, double precision)
  to authenticated;
