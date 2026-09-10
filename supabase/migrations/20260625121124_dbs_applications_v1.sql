-- ============================================================================
-- SpecialCarers — DBS Applications v1 (PR-DBS-1, manual admin review path)
--
-- Every carer must hold an Enhanced DBS for BOTH the Adult AND Child
-- workforce (CQC safeguarding requirement). This table tracks the lifecycle
-- of each DBS application — one row per (carer, kind). SpecialCarers fronts
-- the ~£60 application cost and recovers it from the carer's first £200 of
-- platform earnings via Stripe Connect (recovery_* columns).
--
-- Gated by NEXT_PUBLIC_DBS_ENABLED at the application layer; with the flag
-- off these tables are simply never written to. Mirrors the
-- identity_verifications_v1 / interview_rooms_v1 conventions.
--
-- This is the MANUAL path: admins record decisions by hand. PR-DBS-2 adds
-- the uCheck API + Veriff cross-check + Update Service polling on top of the
-- same data model.
--
-- Additive + idempotent throughout (caregiver_profiles is provisioned outside
-- migrations, so we only ALTER ... ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. dbs_applications table
--    NOTE: caregiver_profiles' PK is user_id (confirmed in PR-R2), so the
--    FK references caregiver_profiles(user_id).
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.dbs_applications (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null
    references public.caregiver_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('adult', 'child')),
  vendor text default 'ucheck',
  vendor_reference text,
  status text default 'not_started'
    check (status in (
      'not_started',
      'submitted',
      'in_progress',
      'approved',
      'rejected',
      'expired'
    )),
  submitted_at timestamptz,
  decision_at timestamptz,
  certificate_number text,
  certificate_issued_on date,
  update_service_enrolled boolean default false,
  update_service_last_checked_at timestamptz,
  cost_pence int not null default 6000,
  recovery_status text default 'pending'
    check (recovery_status in (
      'pending',
      'recovering',
      'recovered',
      'paid_upfront',
      'waived'
    )),
  recovery_collected_pence int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dbs_applications is
  'One row per (carer, kind) DBS application. Adult + Child both required for every carer. Only written when NEXT_PUBLIC_DBS_ENABLED is on. Manual admin review in PR-DBS-1; uCheck API + Update Service polling in PR-DBS-2.';

-- ──────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ──────────────────────────────────────────────────────────────────

create index if not exists dbs_applications_carer_idx
  on public.dbs_applications (carer_id);
create index if not exists dbs_applications_carer_kind_idx
  on public.dbs_applications (carer_id, kind);
-- Admin queue: open applications awaiting a decision.
create index if not exists dbs_applications_open_status_idx
  on public.dbs_applications (status)
  where status in ('submitted', 'in_progress');
-- Recovery worker: applications still owing money.
create index if not exists dbs_applications_open_recovery_idx
  on public.dbs_applications (recovery_status)
  where recovery_status in ('pending', 'recovering');

-- ──────────────────────────────────────────────────────────────────
-- 3. updated_at trigger (mirrors public.touch_identity_verifications_updated_at)
-- ──────────────────────────────────────────────────────────────────

create or replace function public.touch_dbs_applications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_dbs_applications_touch
  on public.dbs_applications;
create trigger trg_dbs_applications_touch
  before update on public.dbs_applications
  for each row execute function public.touch_dbs_applications_updated_at();

-- ──────────────────────────────────────────────────────────────────
-- 4. RLS
--    - carer reads/inserts own rows
--    - admin role reads/updates all rows
--    - service role bypasses RLS entirely (used by the API routes)
-- ──────────────────────────────────────────────────────────────────

alter table public.dbs_applications enable row level security;

-- carer reads own rows
drop policy if exists "carer reads own dbs applications"
  on public.dbs_applications;
create policy "carer reads own dbs applications"
  on public.dbs_applications for select
  to authenticated
  using (carer_id = (select auth.uid()));

-- carer inserts own rows
drop policy if exists "carer inserts own dbs applications"
  on public.dbs_applications;
create policy "carer inserts own dbs applications"
  on public.dbs_applications for insert
  to authenticated
  with check (carer_id = (select auth.uid()));

-- admin reads all rows
drop policy if exists "admin reads all dbs applications"
  on public.dbs_applications;
create policy "admin reads all dbs applications"
  on public.dbs_applications for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- admin updates all rows
drop policy if exists "admin updates all dbs applications"
  on public.dbs_applications;
create policy "admin updates all dbs applications"
  on public.dbs_applications for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 5. caregiver_profiles roll-up columns
--    dbs_overall_status + dbs_search_eligible are maintained by the
--    application layer (recomputeOverallStatus in src/lib/dbs/service.ts).
--    dbs_search_eligible gates seeker search + booking acceptance.
-- ──────────────────────────────────────────────────────────────────

alter table public.caregiver_profiles
  add column if not exists dbs_overall_status text default 'not_started',
  add column if not exists dbs_search_eligible boolean default false;

-- Add the CHECK constraint separately + idempotently (ADD COLUMN can't carry
-- a named constraint conditionally).
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'caregiver_profiles_dbs_overall_status_check'
  ) then
    alter table public.caregiver_profiles
      add constraint caregiver_profiles_dbs_overall_status_check
      check (dbs_overall_status in (
        'not_started',
        'in_progress',
        'approved',
        'rejected',
        'expired'
      ));
  end if;
end $$;

comment on column public.caregiver_profiles.dbs_overall_status is
  'Roll-up of the carer''s adult + child dbs_applications rows. Maintained by recomputeOverallStatus(). Only meaningful when NEXT_PUBLIC_DBS_ENABLED is on.';
comment on column public.caregiver_profiles.dbs_search_eligible is
  'True only when BOTH adult + child DBS are approved. Gates seeker search visibility + booking acceptance. Maintained by recomputeOverallStatus().';
