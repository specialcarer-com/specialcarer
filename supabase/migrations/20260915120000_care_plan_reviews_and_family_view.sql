-- ============================================================================
-- SpecialCarer — E4: care-plan review cadence (Reg 9) + per-recipient view.
--
-- Additive-only DDL for PR #E4. Discovery: /phase_e/e4_discovery.md.
--
-- Scope
-- ─────
--   1. `public.care_plan_reviews`
--        One row per scheduled care-plan review. Written by the trigger
--        below (first review at care_plan creation) and by the
--        /api/care-plan/reviews/[id]/complete route (which inserts the
--        next scheduled row on completion). Read by the seeker + admin
--        surfaces and by the nightly reminder cron.
--
--   2. Trigger on `public.care_plans` (AFTER INSERT):
--        Inserts a first review row for the new care plan
--        (`scheduled_for = created_at::date + interval '6 months'`,
--         `cadence_months = 6`, `status = 'due'`).
--
--   3. `public.care_plan_latest_for_recipient` (view)
--        For each recipient_id present in any booking.recipient_ids
--        array, returns the most recent care_plans row. Used by the
--        family read-only care-plan viewer. RLS on the view is
--        naturally inherited from care_plans + bookings.
--
-- Governance
-- ──────────
-- * Additive only. No DROP, no ALTER ... DROP, no TRUNCATE, no DELETE.
-- * No `drop policy if exists` anywhere in this file — the new table is
--   brand new so name collisions are impossible; PR #220's preflight
--   destructive-diff gate will pass without an Allow-Destructive trailer.
-- * No `||` string concatenation inside DDL literal clauses.
-- * Admin role checks use `is_admin(auth.uid())` (single admin role).
--   RM / NI role split is deferred; TODO markers below.
-- * `create table if not exists` + `create index if not exists` keep
--   this migration idempotent for reruns against a manually-baselined
--   environment (matching the pattern used in prior E-series work).
-- * View uses `create or replace` per the discovery-doc recipe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. care_plan_reviews
-- ---------------------------------------------------------------------------
create table if not exists public.care_plan_reviews (
  id                uuid primary key default gen_random_uuid(),
  care_plan_id      uuid not null references public.care_plans(id) on delete cascade,
  scheduled_for     date not null,
  status            text not null default 'due'
                     check (status in ('due','in_progress','completed','overdue','skipped')),
  completed_at      timestamptz,
  completed_by      uuid references auth.users(id),
  reviewer_notes    text check (reviewer_notes is null or char_length(reviewer_notes) <= 4000),
  next_review_due   date,
  cadence_months    smallint not null default 6 check (cadence_months in (3,6,12)),
  event_trigger     text check (
                       event_trigger is null
                       or event_trigger in (
                         'hospital_discharge','medication_change','safeguarding','other'
                       )
                     ),
  -- Nightly cron writes here after emitting an in-app + email reminder.
  -- Column-on-row keeps the reminder-idempotency state next to the review
  -- (chosen over a separate reminders_sent table per E4 spec).
  last_reminded_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists care_plan_reviews_plan_status_sched_idx
  on public.care_plan_reviews(care_plan_id, status, scheduled_for);

comment on table public.care_plan_reviews is
  'One row per scheduled Reg-9 care-plan review. First row inserted by the trigger on care_plans; subsequent rows inserted by the /api/care-plan/reviews/[id]/complete route.';

alter table public.care_plan_reviews enable row level security;

-- Read: seeker on the parent care_plan's booking, carer on the booking, or admin.
--
-- TODO(rm-ni-split): widen `is_admin(auth.uid())` to accept RM / NI when
-- the role split lands. The read path currently binds to the single
-- admin role.
create policy care_plan_reviews_read on public.care_plan_reviews
  for select
  using (
    exists (
      select 1
        from public.care_plans cp
        join public.bookings b on b.id = cp.booking_id
       where cp.id = care_plan_reviews.care_plan_id
         and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
    )
    or is_admin(auth.uid())
  );

-- Write: seeker on the booking or admin. Cron / route inserts happen via
-- the service-role client which bypasses RLS.
--
-- TODO(rm-ni-split): widen `is_admin(auth.uid())` to accept RM / NI when
-- the role split lands.
create policy care_plan_reviews_write on public.care_plan_reviews
  for all
  using (
    exists (
      select 1
        from public.care_plans cp
        join public.bookings b on b.id = cp.booking_id
       where cp.id = care_plan_reviews.care_plan_id
         and b.seeker_id = auth.uid()
    )
    or is_admin(auth.uid())
  )
  with check (
    exists (
      select 1
        from public.care_plans cp
        join public.bookings b on b.id = cp.booking_id
       where cp.id = care_plan_reviews.care_plan_id
         and b.seeker_id = auth.uid()
    )
    or is_admin(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. Auto-schedule trigger on care_plans
--
-- On insert of a care_plans row, seed the first review 6 months out. The
-- trigger is intentionally simple: exactly one review row per care plan
-- at creation time. Subsequent rows are inserted by the completion route.
--
-- Uses `if not exists` when creating both function + trigger for
-- idempotency; the check on care_plan_reviews inside the function
-- avoids double-seeding if the trigger fires more than once (belt-and-braces).
-- ---------------------------------------------------------------------------
create or replace function public.tg_care_plan_reviews_seed_first()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.care_plan_reviews
     where care_plan_id = new.id
  ) then
    insert into public.care_plan_reviews (
      care_plan_id, scheduled_for, cadence_months, status
    ) values (
      new.id,
      (new.created_at::date + interval '6 months')::date,
      6,
      'due'
    );
  end if;
  return new;
end;
$$;

comment on function public.tg_care_plan_reviews_seed_first() is
  'Trigger fn (E4): seed a 6-month first Reg-9 review row for every new care_plans row.';

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'care_plans_seed_first_review'
       and tgrelid = 'public.care_plans'::regclass
  ) then
    create trigger care_plans_seed_first_review
      after insert on public.care_plans
      for each row
      execute function public.tg_care_plan_reviews_seed_first();
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3. care_plan_latest_for_recipient view
--
-- For each recipient_id in any booking's `recipient_ids` array, return
-- the most recent care_plans row. Standard `distinct on` pattern from
-- the discovery doc.
--
-- RLS on the view is inherited from care_plans + bookings (view runs
-- with the caller's rights via security invoker). The join is what
-- filters — a user who cannot see the underlying rows will see 0 rows.
-- ---------------------------------------------------------------------------
create or replace view public.care_plan_latest_for_recipient
with (security_invoker = true) as
select distinct on (r_id)
  r_id                       as recipient_id,
  cp.id                      as id,
  cp.booking_id              as booking_id,
  cp.recipient_name          as recipient_name,
  cp.recipient_dob           as recipient_dob,
  cp.address_line1           as address_line1,
  cp.address_line2           as address_line2,
  cp.city                    as city,
  cp.postcode                as postcode,
  cp.goals                   as goals,
  cp.special_instructions    as special_instructions,
  cp.routine_notes           as routine_notes,
  cp.created_by              as created_by,
  cp.created_at              as created_at,
  cp.updated_at              as updated_at
from public.care_plans cp
join public.bookings b on b.id = cp.booking_id
cross join lateral unnest(coalesce(b.recipient_ids, array[]::uuid[])) as r_id
order by r_id, cp.updated_at desc;

comment on view public.care_plan_latest_for_recipient is
  'Latest care_plans row per recipient_id (from bookings.recipient_ids). Read by the family care-plan viewer. security_invoker = true so RLS on care_plans + bookings applies.';
