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
-- Sequencing note: must run AFTER the parallel courses-population
-- migration (filename `agency_optin_v2_courses_population.sql` or
-- similar) so that any new gate columns on the view are not clobbered.
-- The 20260514_* prefix gives a one-day buffer beyond the 2026-05-13
-- platform_milestones migration.

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

-- service_role bypasses RLS for inserts/updates from cron + admin
-- routes; no explicit insert policy needed.

-- 3. Refresh v_agency_opt_in_gates to accept the Update Service path.
--
-- The DBS gate is green when EITHER:
--   (a) the existing fresh Enhanced DBS branch passes, OR
--   (b) a row exists with source='update_service' whose last_us_check_at
--       resolved to status='current' within the last 12 months AND
--       whose workforce_type covers the carer's needs.
--
-- workforce compatibility: a cert covering 'both' covers any carer;
-- a cert covering 'adult' covers carers with works_with_adults=true and
-- works_with_children=false (or NULL); same logic for 'child'.
--
-- We reference profiles.works_with_adults / works_with_children if
-- those columns exist (added by the parallel courses migration). If
-- they're missing, the workforce test degrades to "cert is non-null",
-- which is the safe default during the brief window before the
-- courses migration lands.
create or replace view public.v_agency_opt_in_gates as
with carer as (
  select p.id as user_id,
         p.agency_opt_in_status,
         p.agency_opt_in_started_at,
         p.agency_opt_in_submitted_at,
         p.agency_opt_in_approved_at,
         p.agency_opt_in_rejected_reason,
         p.agency_opt_in_paused_reason,
         -- Read works_with_* if present; coalesce to NULL so the
         -- workforce test below short-circuits to "any cert works".
         coalesce(
           (to_jsonb(p) ->> 'works_with_adults')::boolean,
           null
         ) as works_with_adults,
         coalesce(
           (to_jsonb(p) ->> 'works_with_children')::boolean,
           null
         ) as works_with_children
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
), dbs_fresh as (
  select c.user_id,
         exists (
           select 1 from public.background_checks bc
           where bc.user_id = c.user_id
             and bc.check_type = 'enhanced_dbs_barred'
             and bc.status = 'cleared'
             and bc.issued_at is not null
             and bc.issued_at > (now() - interval '12 months')
             and coalesce(bc.source, 'fresh_checkr') <> 'update_service'
         ) as fresh_ok,
         (select max(bc.issued_at) from public.background_checks bc
            where bc.user_id = c.user_id
              and bc.check_type = 'enhanced_dbs_barred'
              and bc.status = 'cleared'
              and coalesce(bc.source, 'fresh_checkr') <> 'update_service') as fresh_cleared_at
  from carer c
), dbs_us as (
  select c.user_id,
         exists (
           select 1 from public.background_checks bc
           where bc.user_id = c.user_id
             and bc.source = 'update_service'
             and bc.last_us_check_at is not null
             and bc.last_us_check_at > (now() - interval '12 months')
             and coalesce(bc.us_check_result ->> 'status', '') = 'current'
             -- workforce compatibility
             and (
               -- cert covers both => always compatible
               bc.workforce_type = 'both'
               or (
                 c.works_with_adults is null and c.works_with_children is null
               )
               or (
                 bc.workforce_type = 'adult'
                 and coalesce(c.works_with_adults, false) = true
                 and coalesce(c.works_with_children, false) = false
               )
               or (
                 bc.workforce_type = 'child'
                 and coalesce(c.works_with_children, false) = true
                 and coalesce(c.works_with_adults, false) = false
               )
             )
         ) as us_ok,
         (select max(bc.last_us_check_at) from public.background_checks bc
            where bc.user_id = c.user_id
              and bc.source = 'update_service') as us_last_checked_at
  from carer c
), dbs_gate as (
  select c.user_id,
         (df.fresh_ok or du.us_ok) as dbs_ok,
         greatest(df.fresh_cleared_at, du.us_last_checked_at) as dbs_cleared_at
  from carer c
  left join dbs_fresh df using (user_id)
  left join dbs_us    du using (user_id)
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
  'Phase 2 + DBS US: DBS gate satisfied by either a fresh Enhanced DBS (Checkr) or an Update Service verification within 12 months with matching workforce.';
