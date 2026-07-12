-- GPS clock-in/out scaffold (Sprint 4.5).
--
-- Self-attesting visit verification: the carer taps "Clock in" / "Clock out"
-- on the active-job screen; the device's GPS reading + timestamps are recorded
-- here as an append-only event log against a booking. This is the evidence-of-
-- visit trail CQC expects and the source of truth a later payroll follow-up
-- will read from.
--
-- Scope note: this migration deliberately does NOT enforce a geofence radius
-- policy — it records what the device reports. Geofence enforcement, photo
-- verification and payroll timesheet auto-generation are separate follow-ups.

-- ── event type ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'visit_event_type') then
    create type visit_event_type as enum ('clock_in', 'clock_out');
  end if;
end$$;

-- ── table ────────────────────────────────────────────────────────────────────
create table if not exists public.visit_events (
  id uuid primary key default gen_random_uuid(),

  -- The visit this event belongs to. `bookings` is the canonical visit row.
  visit_id uuid not null references public.bookings(id) on delete cascade,

  -- The carer who raised the event. Must match bookings.caregiver_id (enforced
  -- in the API + RLS). References auth.users like every other party column.
  carer_id uuid not null references auth.users(id) on delete restrict,

  event_type visit_event_type not null,

  -- When the event happened (authoritative event time).
  event_at timestamptz not null,

  -- Device-reported GPS. Nullable so a future forced/offline path can record an
  -- event without a fix, but the API requires coordinates for the normal flow.
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  accuracy_metres numeric,

  -- Device clock at the moment of the event, vs. when the server persisted it.
  -- A large skew between the two is a signal worth surfacing to ops later.
  client_reported_at timestamptz,
  server_recorded_at timestamptz not null default now(),

  -- user-agent / platform / app version, captured best-effort.
  device_info jsonb,

  -- Optional free-text note the carer adds at clock-in/out.
  notes text check (notes is null or length(notes) <= 1000),

  -- Placeholder for a future photo-verification follow-up. Not populated here.
  photo_url text,

  created_at timestamptz not null default now()
);

create index if not exists visit_events_visit_idx
  on public.visit_events (visit_id);
create index if not exists visit_events_carer_event_at_idx
  on public.visit_events (carer_id, event_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.visit_events enable row level security;

-- Carer can insert their own events for their own visit. Defence in depth —
-- the API also validates assignment with the service-role client before
-- inserting.
drop policy if exists "visit_events carer insert own" on public.visit_events;
create policy "visit_events carer insert own" on public.visit_events
  for insert to authenticated
  with check (
    auth.uid() = carer_id
    and exists (
      select 1 from public.bookings b
      where b.id = visit_id
        and b.caregiver_id = auth.uid()
    )
  );

-- Booking parties can read: the assigned carer and the seeker/family who owns
-- the visit. Mirrors the "sos booking party read" pattern.
drop policy if exists "visit_events party read" on public.visit_events;
create policy "visit_events party read" on public.visit_events
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = visit_id
        and (auth.uid() = b.caregiver_id or auth.uid() = b.seeker_id)
    )
  );

-- Admins can read everything.
drop policy if exists "visit_events admin read all" on public.visit_events;
create policy "visit_events admin read all" on public.visit_events
  for select to authenticated
  using (is_admin(auth.uid()));

-- ── duration helper ────────────────────────────────────────────────────────
-- Computes visit duration from the earliest clock_in to the latest clock_out.
-- Returns null when either bookend is missing. SECURITY INVOKER so it honours
-- the caller's RLS on visit_events.
create or replace function public.visit_duration_from_events(p_visit_id uuid)
returns interval
language sql
stable
security invoker
set search_path = public
as $$
  select max(e.event_at) filter (where e.event_type = 'clock_out')
       - min(e.event_at) filter (where e.event_type = 'clock_in')
  from public.visit_events e
  where e.visit_id = p_visit_id
    and exists (
      select 1 from public.visit_events ci
      where ci.visit_id = p_visit_id and ci.event_type = 'clock_in'
    )
    and exists (
      select 1 from public.visit_events co
      where co.visit_id = p_visit_id and co.event_type = 'clock_out'
    );
$$;
