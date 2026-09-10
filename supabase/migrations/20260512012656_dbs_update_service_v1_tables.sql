-- DBS Update Service v1 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260514_dbs_update_service_v1.sql
-- Note: ledger version prefix is 20260512 (not 20260514) — bundle filename was misdated.
-- All chunks remain idempotent (guarded ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE VIEW, etc.).
--
-- Contains: background_checks ALTER (Update Service columns) + dbs_change_events table.

-- DBS Update Service path (compliance cost-saver).
--
-- Adds a parallel verification path so carers with a current DBS on the
-- gov.uk Update Service can satisfy the Channel B opt-in DBS gate
-- without paying for a fresh Enhanced DBS via Checkr.
--
-- Strictly additive. The existing `check_type='enhanced_dbs_barred'`
-- path in v_agency_opt_in_gates continues to satisfy the gate; this
-- migration adds a second OR-branch alongside it.
--
-- Sequencing: must run AFTER 20260512_agency_optin_v2_courses_population.sql
-- because it preserves and extends that migration's view shape
-- (works_with_adults / works_with_children / grace period / per-course
-- training flags).

-- 1. Extend background_checks with Update Service columns.
alter table public.background_checks
  add column if not exists source text default 'fresh_checkr',
  add column if not exists update_service_subscription_id text,
  add column if not exists update_service_consent_at timestamptz,
  add column if not exists last_us_check_at timestamptz,
  add column if not exists next_us_check_due_at timestamptz,
  add column if not exists us_check_result jsonb,
  add column if not exists workforce_type text,
  add column if not exists us_reminder_sent_at timestamptz;

-- Constrain source values. Idempotent: drops/recreates the check so we
-- can broaden the enum in future without a fresh migration.
do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'background_checks_source_chk'
  ) then
    alter table public.background_checks drop constraint background_checks_source_chk;
  end if;
  alter table public.background_checks
    add constraint background_checks_source_chk
    check (source is null or source in ('fresh_checkr','update_service','admin_manual'));
end $$;

do $$ begin
  if exists (
    select 1 from pg_constraint
    where conname = 'background_checks_workforce_type_chk'
  ) then
    alter table public.background_checks drop constraint background_checks_workforce_type_chk;
  end if;
  alter table public.background_checks
    add constraint background_checks_workforce_type_chk
    check (workforce_type is null or workforce_type in ('adult','child','both'));
end $$;

create index if not exists idx_background_checks_us_recheck
  on public.background_checks (next_us_check_due_at)
  where source = 'update_service' and next_us_check_due_at is not null;


-- 2. dbs_change_events — audit trail of US-detected status changes
-- and admin priority-review queue.
create table if not exists public.dbs_change_events (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references public.profiles(id) on delete cascade,
  detected_at timestamptz not null default now(),
  source text not null check (source in ('update_service_recheck','manual','webhook')),
  prior_status text,
  new_status text,
  raw_payload jsonb,
  admin_reviewed_at timestamptz,
  admin_reviewer_id uuid references public.profiles(id),
  admin_decision text check (admin_decision is null or admin_decision in ('cleared','suspended','requires_fresh_dbs')),
  admin_notes text
);

create index if not exists idx_dbs_change_events_unreviewed
  on public.dbs_change_events (detected_at desc)
  where admin_reviewed_at is null;

create index if not exists idx_dbs_change_events_carer
  on public.dbs_change_events (carer_id, detected_at desc);

alter table public.dbs_change_events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'dbs_change_events_admin_read'
      and tablename = 'dbs_change_events'
  ) then
    create policy dbs_change_events_admin_read on public.dbs_change_events
      for select to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'dbs_change_events_carer_self_read'
      and tablename = 'dbs_change_events'
  ) then
    create policy dbs_change_events_carer_self_read on public.dbs_change_events
      for select to authenticated
      using (carer_id = (select auth.uid()));
  end if;
end $$;

