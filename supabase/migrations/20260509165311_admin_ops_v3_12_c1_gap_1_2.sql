-- Admin Ops v3.12 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260509_admin_ops_v3_12.sql
-- Split at logical Gap boundaries; all sub-files remain idempotent.
--
-- Contains Gap 1 (ID re-verification) and Gap 2 (application pipeline).

-- Admin Ops 3.12 — operations dashboard expansion. Adds: ID re-verify
-- columns on background_checks, caregiver application-pipeline column
-- + history table, marketplace heatmap + surge rules + events,
-- native support ticketing (tickets + messages), built-in CMS (posts +
-- faqs + banners), compliance documents + view, finance enhancements
-- (payouts, fraud signals, tax docs), and KPI rollups for analytics.
--
-- Idempotent. RLS enabled on every new table; admin gating is the
-- existing pattern: `exists (select 1 from public.profiles p where
-- p.id = (select auth.uid()) and p.role = 'admin')` — service-role
-- always bypasses RLS.
--
-- The file is split into a Schema (DDL) section and a Seed (DML)
-- section so the parent agent can apply chunks independently.

-- ════════════════════════════════════════════════════════════════════
-- ── Schema ──────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════

-- ─── Gap 1: Recurring ID re-verification ────────────────────────────
-- Extend background_checks (created out-of-band; we cannot recreate it,
-- only ADD COLUMN IF NOT EXISTS additively).
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'background_checks'
  ) then
    alter table public.background_checks
      add column if not exists next_reverify_at date;
    alter table public.background_checks
      add column if not exists reverify_cadence_months int not null default 12;
    alter table public.background_checks
      add column if not exists reverify_status text not null default 'none'
        check (reverify_status in
          ('none','due','overdue','in_progress','cleared'));
  end if;
end $$;

-- Helper view: caregivers due for re-verification. View materialises
-- the join with profiles for the admin queue. Defined CREATE OR REPLACE
-- so it is safe to re-run.
create or replace view public.reverify_queue_v as
  select
    bc.id as background_check_id,
    bc.user_id,
    p.full_name,
    u.email,
    bc.check_type,
    bc.vendor,
    bc.status as check_status,
    bc.issued_at,
    bc.expires_at,
    bc.next_reverify_at,
    bc.reverify_cadence_months,
    bc.reverify_status,
    case
      when bc.next_reverify_at is null then null
      else (bc.next_reverify_at - current_date)
    end as due_in_days
  from public.background_checks bc
  left join public.profiles p on p.id = bc.user_id
  left join auth.users u on u.id = bc.user_id;
grant select on public.reverify_queue_v to authenticated;

-- ─── Gap 2: Caregiver application pipeline ──────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_type where typname = 'caregiver_application_stage'
  ) then
    create type public.caregiver_application_stage as enum (
      'applied','screening','interview','background_check',
      'training','activated','rejected'
    );
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'caregiver_profiles'
  ) then
    alter table public.caregiver_profiles
      add column if not exists application_stage
        public.caregiver_application_stage not null default 'applied';
    alter table public.caregiver_profiles
      add column if not exists stage_entered_at timestamptz not null
        default now();
  end if;
end $$;

create table if not exists public.caregiver_stage_history (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  from_stage public.caregiver_application_stage,
  to_stage public.caregiver_application_stage not null,
  moved_by uuid references auth.users(id) on delete set null,
  moved_at timestamptz not null default now(),
  note text
);
create index if not exists caregiver_stage_history_carer_idx
  on public.caregiver_stage_history(caregiver_id, moved_at desc);

alter table public.caregiver_stage_history enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'caregiver_stage_history_admin_select'
      and tablename = 'caregiver_stage_history'
  ) then
    create policy caregiver_stage_history_admin_select
      on public.caregiver_stage_history
      for select to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'caregiver_stage_history_admin_insert'
      and tablename = 'caregiver_stage_history'
  ) then
    create policy caregiver_stage_history_admin_insert
      on public.caregiver_stage_history
      for insert to authenticated
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

