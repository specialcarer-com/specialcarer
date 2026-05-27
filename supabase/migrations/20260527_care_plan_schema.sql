-- P1-B7-A: care plan schema (care_plans, medications, allergies).
--
-- One care plan per booking, optional. Seeker on the booking owns the plan
-- (they enter recipient details, goals, special instructions). Carer on the
-- booking reads it during their shift. Admin can edit too.
--
-- Medications and allergies are child tables linked by care_plan_id with
-- on-delete cascade.
--
-- RLS strategy (mirrors booking_tasks from B4):
--   read:   seeker_id, caregiver_id, admin
--   write:  seeker_id, admin
--
-- The PDF endpoint (/api/m/bookings/[id]/care-plan.pdf) is the primary
-- consumer of this data.

-- ── care_plans ──────────────────────────────────────────────────────────
create table if not exists public.care_plans (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references public.bookings(id) on delete cascade,
  recipient_name        text check (recipient_name is null or char_length(recipient_name) between 1 and 120),
  recipient_dob         date,
  address_line1         text,
  address_line2         text,
  city                  text,
  postcode              text,
  goals                 text[] not null default '{}',
  special_instructions  text check (special_instructions is null or char_length(special_instructions) <= 4000),
  routine_notes         text check (routine_notes is null or char_length(routine_notes) <= 4000),
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- One care plan per booking max.
  constraint care_plans_booking_unique unique (booking_id)
);

create index if not exists care_plans_booking_idx on public.care_plans(booking_id);

alter table public.care_plans enable row level security;

-- Read: seeker, carer, or admin on the booking.
drop policy if exists "care_plans read" on public.care_plans;
create policy "care_plans read" on public.care_plans
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = care_plans.booking_id
        and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
    )
    or is_admin(auth.uid())
  );

-- Write: seeker on the booking, or admin.
drop policy if exists "care_plans write seeker" on public.care_plans;
create policy "care_plans write seeker" on public.care_plans
  for all
  using (
    exists (
      select 1 from public.bookings b
      where b.id = care_plans.booking_id and b.seeker_id = auth.uid()
    )
    or is_admin(auth.uid())
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = care_plans.booking_id and b.seeker_id = auth.uid()
    )
    or is_admin(auth.uid())
  );

-- ── medications ─────────────────────────────────────────────────────────
create table if not exists public.medications (
  id                uuid primary key default gen_random_uuid(),
  care_plan_id      uuid not null references public.care_plans(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  dose              text check (dose is null or char_length(dose) <= 80),
  schedule          text check (schedule is null or char_length(schedule) <= 200),
  notes             text check (notes is null or char_length(notes) <= 1000),
  position          int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists medications_care_plan_position_idx
  on public.medications(care_plan_id, position);

alter table public.medications enable row level security;

drop policy if exists "medications read" on public.medications;
create policy "medications read" on public.medications
  for select
  using (
    exists (
      select 1 from public.care_plans cp
      join public.bookings b on b.id = cp.booking_id
      where cp.id = medications.care_plan_id
        and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
    )
    or is_admin(auth.uid())
  );

drop policy if exists "medications write seeker" on public.medications;
create policy "medications write seeker" on public.medications
  for all
  using (
    exists (
      select 1 from public.care_plans cp
      join public.bookings b on b.id = cp.booking_id
      where cp.id = medications.care_plan_id and b.seeker_id = auth.uid()
    )
    or is_admin(auth.uid())
  )
  with check (
    exists (
      select 1 from public.care_plans cp
      join public.bookings b on b.id = cp.booking_id
      where cp.id = medications.care_plan_id and b.seeker_id = auth.uid()
    )
    or is_admin(auth.uid())
  );

-- ── allergies ───────────────────────────────────────────────────────────
create table if not exists public.allergies (
  id                uuid primary key default gen_random_uuid(),
  care_plan_id      uuid not null references public.care_plans(id) on delete cascade,
  substance         text not null check (char_length(substance) between 1 and 120),
  severity          text check (severity is null or severity in ('mild','moderate','severe','life_threatening')),
  reaction          text check (reaction is null or char_length(reaction) <= 500),
  notes             text check (notes is null or char_length(notes) <= 500),
  position          int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists allergies_care_plan_position_idx
  on public.allergies(care_plan_id, position);

alter table public.allergies enable row level security;

drop policy if exists "allergies read" on public.allergies;
create policy "allergies read" on public.allergies
  for select
  using (
    exists (
      select 1 from public.care_plans cp
      join public.bookings b on b.id = cp.booking_id
      where cp.id = allergies.care_plan_id
        and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
    )
    or is_admin(auth.uid())
  );

drop policy if exists "allergies write seeker" on public.allergies;
create policy "allergies write seeker" on public.allergies
  for all
  using (
    exists (
      select 1 from public.care_plans cp
      join public.bookings b on b.id = cp.booking_id
      where cp.id = allergies.care_plan_id and b.seeker_id = auth.uid()
    )
    or is_admin(auth.uid())
  )
  with check (
    exists (
      select 1 from public.care_plans cp
      join public.bookings b on b.id = cp.booking_id
      where cp.id = allergies.care_plan_id and b.seeker_id = auth.uid()
    )
    or is_admin(auth.uid())
  );

-- ── updated_at trigger ──────────────────────────────────────────────────
-- Pattern matches tg_set_updated_at used elsewhere in the codebase.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    create function public.tg_set_updated_at()
    returns trigger language plpgsql as $f$
    begin
      new.updated_at = now();
      return new;
    end;
    $f$;
  end if;
end $$;

drop trigger if exists care_plans_set_updated_at on public.care_plans;
create trigger care_plans_set_updated_at
  before update on public.care_plans
  for each row execute function public.tg_set_updated_at();
