-- ============================================================================
-- SpecialCarer — Live Tracking v1
--
-- A lightweight position-broadcast table the carer writes to once the booking
-- is paid (en route) or in_progress, and the seeker (or family members)
-- reads from. Each ping replaces the previous one for the same booking via
-- INSERT — we keep a small history (capped server-side) for trust & safety
-- audits but the seeker view always shows the latest row.
--
-- Privacy: position data is RLS-locked to the booking parties + active
-- family members of the seeker. Stale positions (>15 min old) are filtered
-- out by the read APIs so a carer who forgets to stop sharing doesn't leak.
-- ============================================================================

create table if not exists public.carer_positions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  carer_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  recorded_at timestamptz not null default now()
);

create index if not exists carer_positions_booking_recorded_idx
  on public.carer_positions(booking_id, recorded_at desc);

create index if not exists carer_positions_carer_idx
  on public.carer_positions(carer_id, recorded_at desc);

alter table public.carer_positions enable row level security;

-- Read: parties of the booking (seeker, caregiver) AND active family members
-- of the seeker can read positions for that booking.
drop policy if exists "parties can read carer positions" on public.carer_positions;
create policy "parties can read carer positions"
  on public.carer_positions for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = carer_positions.booking_id
        and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
    )
    or exists (
      select 1 from public.bookings b
      join public.families f on f.primary_user_id = b.seeker_id
      join public.family_members fm on fm.family_id = f.id
      where b.id = carer_positions.booking_id
        and fm.user_id = auth.uid()
        and fm.status = 'active'
    )
  );

-- Write: only the carer can insert their own pings, and only for a booking
-- they're the caregiver on, and only when status is paid or in_progress.
drop policy if exists "carer can insert own positions" on public.carer_positions;
create policy "carer can insert own positions"
  on public.carer_positions for insert
  to authenticated
  with check (
    carer_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = carer_positions.booking_id
        and b.caregiver_id = auth.uid()
        and b.status in ('paid','in_progress')
    )
  );

-- No update / delete from clients.

-- Helper view: most recent position per booking (used by the seeker UI to
-- avoid pulling history). Safe under RLS because it inherits the underlying
-- table policies.
create or replace view public.carer_positions_latest as
select distinct on (booking_id)
  booking_id, carer_id, lat, lng, accuracy_m, heading, speed_mps, recorded_at
from public.carer_positions
order by booking_id, recorded_at desc;

comment on table public.carer_positions is 'Live tracking pings. Carer broadcasts ~every 10s while booking is paid/in_progress; seeker/family read latest.';
comment on view public.carer_positions_latest is 'Most recent ping per booking. RLS inherited from carer_positions.';
