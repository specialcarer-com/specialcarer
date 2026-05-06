-- SOS alerts raised by users in distress.
--
-- Triggered from the in-app SOS button (e.g. on /m/track/[id]).
-- Captures who raised it, optional booking context, best-effort
-- coordinates, and an optional note. Admin team triages from the
-- dashboard.

create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete set null,
  lat numeric(9,6) null,
  lng numeric(9,6) null,
  accuracy_m numeric null,
  note text null check (note is null or length(note) <= 1000),
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved')),
  acknowledged_by uuid null references auth.users(id) on delete set null,
  acknowledged_at timestamptz null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists sos_alerts_user_idx
  on public.sos_alerts (user_id, created_at desc);
create index if not exists sos_alerts_status_idx
  on public.sos_alerts (status, created_at desc);
create index if not exists sos_alerts_booking_idx
  on public.sos_alerts (booking_id);

alter table public.sos_alerts enable row level security;

-- Owner can insert (must be self).
drop policy if exists "sos owner can insert" on public.sos_alerts;
create policy "sos owner can insert" on public.sos_alerts
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Owner can read their own.
drop policy if exists "sos owner can read" on public.sos_alerts;
create policy "sos owner can read" on public.sos_alerts
  for select to authenticated
  using (auth.uid() = user_id);

-- Admins can read everything.
drop policy if exists "sos admins read all" on public.sos_alerts;
create policy "sos admins read all" on public.sos_alerts
  for select to authenticated
  using (is_admin(auth.uid()));

-- The other party on the booking can read (so a carer sees an SOS the
-- seeker raised on their shared booking, and vice-versa).
drop policy if exists "sos booking party read" on public.sos_alerts;
create policy "sos booking party read" on public.sos_alerts
  for select to authenticated
  using (
    booking_id is not null and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (auth.uid() = b.seeker_id or auth.uid() = b.caregiver_id)
    )
  );
