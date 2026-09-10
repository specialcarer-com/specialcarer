-- Phase 2.1 — Expand Channel B compliance: 6 mandatory courses with adult/child
-- population gating, 30-day grace period, and audit trail.
--
-- Strictly additive on top of 20260511_agency_opt_in_v1.sql.
--
-- Idempotent. Parent agent will apply this via Supabase MCP after this file is
-- committed. The application code in this commit assumes this migration is
-- live.

-- ─── 1. profiles: population columns + grace period ─────────────────────────
alter table public.profiles
  add column if not exists works_with_adults    boolean not null default true,
  add column if not exists works_with_children  boolean not null default false,
  add column if not exists works_with_children_admin_approved_at timestamptz,
  add column if not exists agency_optin_grace_period_until        timestamptz;

-- Sanity: a carer must serve at least one population if they want opt-in.
-- Enforced softly in app code (toggle UI); we don't add a CHECK constraint
-- because non-carer rows wouldn't satisfy it and we don't want to touch
-- the seeker/admin rows.

-- For carers currently 'active', seed a 30-day grace window so they keep
-- working while they complete the two new mandatory courses. Idempotent —
-- only sets the column when null AND the carer is active.
update public.profiles
   set agency_optin_grace_period_until = now() + interval '30 days'
 where role = 'caregiver'
   and agency_opt_in_status = 'active'
   and agency_optin_grace_period_until is null;


-- ─── 2. training_courses: accepted certifications JSONB ─────────────────────
alter table public.training_courses
  add column if not exists accepted_certifications jsonb not null default '[]'::jsonb;


-- ─── 3. course_population_requirements ──────────────────────────────────────
create table if not exists public.course_population_requirements (
  course_slug          text primary key,
  required_for_adults  boolean not null default false,
  required_for_children boolean not null default false,
  always_required      boolean not null default false,
  created_at           timestamptz not null default now()
);

comment on table public.course_population_requirements is
  'Phase 2.1: maps a mandatory training course (by slug) to which population(s) it satisfies.';

-- Seed the 6 mandatory courses. Idempotent via on-conflict.
insert into public.course_population_requirements (course_slug, required_for_adults, required_for_children, always_required)
values
  ('manual-handling',          false, false, true),
  ('infection-control',        false, false, true),
  ('food-hygiene',             false, false, true),
  ('medication-administration', false, false, true),
  ('safeguarding-adults',      true,  false, false),
  ('safeguarding-children',    false, true,  false)
on conflict (course_slug) do update
   set required_for_adults  = excluded.required_for_adults,
       required_for_children = excluded.required_for_children,
       always_required      = excluded.always_required;


-- ─── 4. agency_optin_audit_log ──────────────────────────────────────────────
create table if not exists public.agency_optin_audit_log (
  id                 uuid primary key default gen_random_uuid(),
  carer_id           uuid not null references auth.users(id) on delete cascade,
  field              text not null,
  old_value          text,
  new_value          text,
  changed_by_user_id uuid references auth.users(id),
  changed_at         timestamptz not null default now()
);

create index if not exists agency_optin_audit_log_carer_idx
  on public.agency_optin_audit_log (carer_id, changed_at desc);

comment on table public.agency_optin_audit_log is
  'Phase 2.1: audit trail for adult/child population toggles and admin approvals.';

-- RLS: carer can read their own audit rows; admin reads all via service role.
alter table public.agency_optin_audit_log enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'agency_optin_audit_log_self_read'
      and tablename  = 'agency_optin_audit_log'
  ) then
    create policy agency_optin_audit_log_self_read on public.agency_optin_audit_log
      for select to authenticated
      using (carer_id = (select auth.uid()));
  end if;
end $$;


-- ─── 5. v_agency_opt_in_gates — rebuilt with population logic ───────────────
-- The visible UI shape stays the same: contract / dbs / rtw / training.
-- The training gate is now satisfied only when:
--   - every always_required course is passed, AND
--   - if works_with_adults  → safeguarding-adults is passed, AND
--   - if works_with_children → safeguarding-children is passed, AND
--   - if works_with_children → works_with_children_admin_approved_at IS NOT NULL.
--
-- We also expose:
--   works_with_adults, works_with_children,
--   works_with_children_admin_approved_at,
--   agency_optin_grace_period_until,
--   in_grace_period (computed),
--   per-course pass booleans (used by the UI).
create or replace view public.v_agency_opt_in_gates as
with carer as (
  select p.id as user_id,
         p.agency_opt_in_status,
         p.agency_opt_in_started_at,
         p.agency_opt_in_submitted_at,
         p.agency_opt_in_approved_at,
         p.agency_opt_in_rejected_reason,
         p.agency_opt_in_paused_reason,
         p.works_with_adults,
         p.works_with_children,
         p.works_with_children_admin_approved_at,
         p.agency_optin_grace_period_until
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
), course_pass as (
  -- One row per (carer, required course) with a boolean for pass.
  select c.user_id,
         tc.slug as course_slug,
         exists (
           select 1
           from public.training_enrollments te
           where te.carer_id  = c.user_id
             and te.course_id = tc.id
             and te.quiz_passed_at is not null
         ) as passed
  from carer c
  cross join public.training_courses tc
  where tc.required_for_agency_optin = true
), required_set as (
  -- The set of slugs THIS carer must complete, given their populations.
  select c.user_id,
         cpr.course_slug,
         cpr.always_required,
         cpr.required_for_adults,
         cpr.required_for_children
  from carer c
  join public.course_population_requirements cpr
    on  cpr.always_required = true
     or (cpr.required_for_adults  and c.works_with_adults)
     or (cpr.required_for_children and c.works_with_children)
), training_gate as (
  select c.user_id,
         (select count(*) from required_set rs where rs.user_id = c.user_id) as training_required_count,
         (select count(*) from required_set rs
            join course_pass cp
              on cp.user_id = rs.user_id
             and cp.course_slug = rs.course_slug
           where rs.user_id = c.user_id and cp.passed) as training_passed_count,
         (select coalesce(bool_and(cp.passed), false)
            from required_set rs
            left join course_pass cp
              on cp.user_id = rs.user_id
             and cp.course_slug = rs.course_slug
           where rs.user_id = c.user_id) as all_required_passed,
         -- child opt-in must have admin approval before counting as ready.
         (case
            when c.works_with_children
                 and c.works_with_children_admin_approved_at is null
            then false
            else true
          end) as child_approval_ok
  from carer c
), per_course as (
  -- Aggregated per-course flags exposed to the UI (used to dynamically render rows).
  select c.user_id,
         bool_or(cp.course_slug = 'manual-handling'           and cp.passed) as manual_handling_passed,
         bool_or(cp.course_slug = 'infection-control'         and cp.passed) as infection_control_passed,
         bool_or(cp.course_slug = 'food-hygiene'              and cp.passed) as food_hygiene_passed,
         bool_or(cp.course_slug = 'medication-administration' and cp.passed) as medication_administration_passed,
         bool_or(cp.course_slug = 'safeguarding-adults'       and cp.passed) as safeguarding_adults_passed,
         bool_or(cp.course_slug = 'safeguarding-children'     and cp.passed) as safeguarding_children_passed
  from carer c
  left join course_pass cp on cp.user_id = c.user_id
  group by c.user_id
)
select c.user_id,
       c.agency_opt_in_status,
       c.agency_opt_in_started_at,
       c.agency_opt_in_submitted_at,
       c.agency_opt_in_approved_at,
       c.agency_opt_in_rejected_reason,
       c.agency_opt_in_paused_reason,
       c.works_with_adults,
       c.works_with_children,
       c.works_with_children_admin_approved_at,
       c.agency_optin_grace_period_until,
       (c.agency_optin_grace_period_until is not null
          and c.agency_optin_grace_period_until > now()) as in_grace_period,
       cg.contract_ok,
       cg.contract_countersigned_at,
       dg.dbs_ok,
       dg.dbs_cleared_at,
       rg.rtw_ok,
       rg.rtw_cleared_at,
       tg.training_passed_count,
       tg.training_required_count,
       coalesce(tg.all_required_passed and tg.child_approval_ok, false) as training_ok,
       pc.manual_handling_passed,
       pc.infection_control_passed,
       pc.food_hygiene_passed,
       pc.medication_administration_passed,
       pc.safeguarding_adults_passed,
       pc.safeguarding_children_passed,
       (cg.contract_ok
        and dg.dbs_ok
        and rg.rtw_ok
        and tg.training_required_count > 0
        and coalesce(tg.all_required_passed and tg.child_approval_ok, false)) as overall_ready
from carer c
  left join contract_gate cg using (user_id)
  left join dbs_gate      dg using (user_id)
  left join rtw_gate      rg using (user_id)
  left join training_gate tg using (user_id)
  left join per_course    pc using (user_id);

comment on view public.v_agency_opt_in_gates is
  'Phase 2.1: per-carer Channel B opt-in gates with adult/child population logic + grace period.';
