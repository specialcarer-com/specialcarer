-- Phase 2 — Channel B carer agency opt-in (additive).
--
-- This migration is idempotent: parent agent already applied an equivalent
-- migration to the live database. The file captures the schema for version
-- control and future provisioning of new environments.
--
-- Spec: phase2-spec.md (Phase 2 — Channel B Carer Agency Opt-in).

-- 1. agency_opt_in_status_t enum on profiles.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'agency_opt_in_status_t') then
    create type public.agency_opt_in_status_t as enum (
      'not_started',
      'in_progress',
      'ready_for_review',
      'active',
      'rejected',
      'paused'
    );
  end if;
end $$;

-- 2. profiles columns.
alter table public.profiles
  add column if not exists agency_opt_in_status public.agency_opt_in_status_t
    not null default 'not_started',
  add column if not exists agency_opt_in_started_at   timestamptz,
  add column if not exists agency_opt_in_submitted_at timestamptz,
  add column if not exists agency_opt_in_approved_at  timestamptz,
  add column if not exists agency_opt_in_approved_by  uuid references auth.users(id),
  add column if not exists agency_opt_in_rejected_reason text,
  add column if not exists agency_opt_in_paused_reason   text;

create index if not exists idx_profiles_agency_opt_in_status
  on public.profiles(agency_opt_in_status)
  where agency_opt_in_status in ('in_progress','ready_for_review','active','paused');

-- 3. training_courses flag.
alter table public.training_courses
  add column if not exists required_for_agency_optin boolean not null default false;

-- 4. Relax organization_contracts.contract_type check to allow 'worker_b'.
--    Idempotent: drops the old check (if present) and re-adds the broader one.
do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'organization_contracts'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%contract_type%';
  if conname is not null then
    execute format('alter table public.organization_contracts drop constraint %I', conname);
  end if;
  alter table public.organization_contracts
    add constraint organization_contracts_contract_type_chk
    check (contract_type in ('msa','dpa','worker_b'));
end $$;

-- 5. Allow worker_b contracts to be linked to the carer user directly.
--    Worker contracts are between the carer and the platform org
--    (All Care 4 U). We add signed_by_user_id to bind the contract to
--    the individual carer, and we relax organization_id NOT NULL so a
--    worker_b row can exist before a platform-org sentinel is created.
alter table public.organization_contracts
  add column if not exists signed_by_user_id uuid references auth.users(id);

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_contracts'
      and column_name = 'organization_id'
      and is_nullable = 'NO'
  ) then
    alter table public.organization_contracts
      alter column organization_id drop not null;
  end if;
end $$;

create index if not exists organization_contracts_signed_by_user_idx
  on public.organization_contracts (signed_by_user_id)
  where contract_type = 'worker_b';

-- Enforce: worker_b rows MUST have signed_by_user_id; msa/dpa MUST have organization_id.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organization_contracts_party_chk'
  ) then
    alter table public.organization_contracts
      add constraint organization_contracts_party_chk
      check (
        (contract_type = 'worker_b' and signed_by_user_id is not null)
        or (contract_type in ('msa','dpa') and organization_id is not null)
      );
  end if;
end $$;

-- RLS: carer can read their own worker_b contract row.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organization_contracts_worker_self_read'
      and tablename = 'organization_contracts'
  ) then
    create policy organization_contracts_worker_self_read on public.organization_contracts
      for select to authenticated
      using (
        signed_by_user_id = (select auth.uid())
      );
  end if;
end $$;

-- 6. v_agency_opt_in_gates view.
--    One row per caregiver in any state other than 'not_started'.
--    Exposes the four gate booleans + overall_ready.
create or replace view public.v_agency_opt_in_gates as
with carer as (
  select p.id as user_id,
         p.agency_opt_in_status,
         p.agency_opt_in_started_at,
         p.agency_opt_in_submitted_at,
         p.agency_opt_in_approved_at,
         p.agency_opt_in_rejected_reason,
         p.agency_opt_in_paused_reason
  from public.profiles p
  where p.role = 'caregiver'
), contract_gate as (
  select c.user_id,
         exists (
           select 1
           from public.organization_contracts oc
           where oc.signed_by_user_id = c.user_id
             and oc.contract_type = 'worker_b'
             and oc.status in ('countersigned','active')
             and oc.countersigned_at is not null
         ) as contract_ok,
         (select max(oc.countersigned_at)
            from public.organization_contracts oc
            where oc.signed_by_user_id = c.user_id
              and oc.contract_type = 'worker_b') as contract_countersigned_at
  from carer c
), dbs_gate as (
  select c.user_id,
         exists (
           select 1 from public.background_checks bc
           where bc.user_id = c.user_id
             and bc.check_type = 'enhanced_dbs_barred'
             and bc.status = 'cleared'
             and bc.issued_at is not null
             and bc.issued_at > (now() - interval '12 months')
         ) as dbs_ok,
         (select max(bc.issued_at) from public.background_checks bc
            where bc.user_id = c.user_id
              and bc.check_type = 'enhanced_dbs_barred'
              and bc.status = 'cleared') as dbs_cleared_at
  from carer c
), rtw_gate as (
  select c.user_id,
         exists (
           select 1 from public.background_checks bc
           where bc.user_id = c.user_id
             and bc.check_type = 'right_to_work'
             and bc.status = 'cleared'
             and coalesce(bc.reverify_status, 'cleared') = 'cleared'
             and (bc.next_reverify_at is null
                  or bc.next_reverify_at > (current_date + interval '60 days'))
         ) as rtw_ok,
         (select max(bc.issued_at) from public.background_checks bc
            where bc.user_id = c.user_id
              and bc.check_type = 'right_to_work'
              and bc.status = 'cleared') as rtw_cleared_at
  from carer c
), training_gate as (
  select c.user_id,
         coalesce(
           (select count(*) from public.training_enrollments te
              join public.training_courses tc on tc.id = te.course_id
              where te.carer_id = c.user_id
                and tc.required_for_agency_optin = true
                and te.quiz_passed_at is not null), 0) as training_passed_count,
         (select count(*) from public.training_courses tc
            where tc.required_for_agency_optin = true) as training_required_count
  from carer c
)
select c.user_id,
       c.agency_opt_in_status,
       c.agency_opt_in_started_at,
       c.agency_opt_in_submitted_at,
       c.agency_opt_in_approved_at,
       c.agency_opt_in_rejected_reason,
       c.agency_opt_in_paused_reason,
       cg.contract_ok,
       cg.contract_countersigned_at,
       dg.dbs_ok,
       dg.dbs_cleared_at,
       rg.rtw_ok,
       rg.rtw_cleared_at,
       tg.training_passed_count,
       tg.training_required_count,
       (tg.training_required_count > 0
         and tg.training_passed_count >= tg.training_required_count) as training_ok,
       (cg.contract_ok
        and dg.dbs_ok
        and rg.rtw_ok
        and tg.training_required_count > 0
        and tg.training_passed_count >= tg.training_required_count) as overall_ready
from carer c
  left join contract_gate cg using (user_id)
  left join dbs_gate      dg using (user_id)
  left join rtw_gate      rg using (user_id)
  left join training_gate tg using (user_id);

comment on view public.v_agency_opt_in_gates is
  'Phase 2: one row per caregiver with the four Channel B opt-in gates resolved server-side.';
