-- P1-B4: booking_tasks
--
-- Per-booking checklist that the assigned carer ticks off during the
-- shift. The seeker has a read-only mirror. State is realtime-broadcast
-- via the supabase_realtime publication so both sides stay in sync
-- without polling.
--
-- NB: the bookings table uses caregiver_id (not carer_id). RLS gates
-- delivery for realtime via postgres_changes — same approach we use on
-- chat_messages.

create table if not exists public.booking_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id),
  position int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_tasks_booking_id_position_idx
  on public.booking_tasks(booking_id, position);

alter table public.booking_tasks enable row level security;

-- Carer assigned to the booking can read.
drop policy if exists "booking_tasks carer read" on public.booking_tasks;
create policy "booking_tasks carer read" on public.booking_tasks
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_tasks.booking_id
        and b.caregiver_id = auth.uid()
    )
  );

-- Carer assigned to the booking can update (toggle done).
drop policy if exists "booking_tasks carer update" on public.booking_tasks;
create policy "booking_tasks carer update" on public.booking_tasks
  for update
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_tasks.booking_id
        and b.caregiver_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_tasks.booking_id
        and b.caregiver_id = auth.uid()
    )
  );

-- Seeker on the booking can read (but never write).
drop policy if exists "booking_tasks seeker read" on public.booking_tasks;
create policy "booking_tasks seeker read" on public.booking_tasks
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_tasks.booking_id
        and b.seeker_id = auth.uid()
    )
  );

-- Admins: full access (matches the sos_alerts pattern).
drop policy if exists "booking_tasks admins all" on public.booking_tasks;
create policy "booking_tasks admins all" on public.booking_tasks
  for all
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

-- Add to the supabase_realtime publication so both seeker and carer
-- clients receive UPDATE events via postgres_changes. RLS gates row
-- visibility per subscriber. Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'booking_tasks'
  ) then
    alter publication supabase_realtime add table public.booking_tasks;
  end if;
end $$;
