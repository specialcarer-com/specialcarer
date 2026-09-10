-- DBS Update Service v1 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260514_dbs_update_service_v1.sql
-- Note: ledger version prefix is 20260512 (not 20260514) — bundle filename was misdated.
-- All chunks remain idempotent (guarded ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE VIEW, etc.).
--
-- Contains: recreate v_agency_opt_in_gates to accept the Update Service path.

-- 3. Refresh v_agency_opt_in_gates to accept the Update Service path
-- while preserving the population + training + grace fields from
-- 20260512_agency_optin_v2_courses_population.sql.
--
-- DBS gate is green when EITHER:
--   (a) the existing fresh Enhanced DBS branch passes (any source other
--       than 'update_service' — covers historic rows with NULL source
--       via coalesce), OR
--   (b) source='update_service' check with last_us_check_at within 6
--       months whose latest us_check_result.status = 'current' AND
--       whose workforce_type covers the carer's needs.
--       Recheck cadence is 6 months (gov.uk Update Service has no public
--       API; admins verify via the gov.uk portal and stamp the result).
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
             and bc.last_us_check_at > (now() - interval '6 months')
             and coalesce(bc.us_check_result ->> 'status', '') = 'current'
             and (
               bc.workforce_type = 'both'
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
         (coalesce(df.fresh_ok, false) or coalesce(du.us_ok, false)) as dbs_ok,
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
), course_pass as (
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
         (case
            when c.works_with_children
                 and c.works_with_children_admin_approved_at is null
            then false
            else true
          end) as child_approval_ok
  from carer c
), per_course as (
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
  'Phase 2.1 + DBS US: per-carer Channel B opt-in gates. DBS gate satisfied by EITHER fresh Enhanced DBS (Checkr) OR an Update Service verification within 6 months whose workforce_type matches the carer.';
