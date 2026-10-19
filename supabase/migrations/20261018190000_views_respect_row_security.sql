-- Follow-up to 20261018160000 (anon revoke). The remaining internal views are
-- SECURITY DEFINER (owner postgres), so ANY signed-in user could read every
-- row through the REST API, bypassing row level security on the tables behind
-- them (everyone's live carer positions, credit/plan/holiday-pot balances,
-- activity feed, DBS/right-to-work status, admin queues).
--
-- Two groups, chosen from how the code actually reads them:
--
-- A) Per-user views read with a signed-in session. Make them security_invoker
--    so the caller's own row level security applies. Every underlying table
--    already has own-row / party / admin SELECT policies and `authenticated`
--    holds SELECT on it, so a user sees only their own rows, a booking party
--    sees the carer position for their booking, and admins keep access.
--
-- B) Admin-only views. Every reader uses the service role (createAdminClient)
--    or nothing at all, so signed-in users have no business reading them.
--    Revoke SELECT from `authenticated`. service_role and postgres keep access.
--
-- Not changed: caregiver_achievements_v, caregiver_rates_v, carer_ceu_totals_v,
-- org_public_v, public_caregiver_certifications_v (reviewed separately).
-- Reversible: ALTER VIEW ... SET (security_invoker = false) / GRANT SELECT.

-- A) respect the caller's row level security
alter view public.carer_positions_latest set (security_invoker = true);
alter view public.user_current_plan set (security_invoker = true);
alter view public.v_holiday_pot_balances set (security_invoker = true);
alter view public.v_user_activity_feed set (security_invoker = true);
alter view public.v_user_credit_balance set (security_invoker = true);
alter view public.caregiver_verification set (security_invoker = true);

-- B) admin / service-role only
revoke all on public.ai_anomaly_queue_v from authenticated;
revoke all on public.v_agency_opt_in_gates from authenticated;
revoke all on public.v_carer_doc_compliance from authenticated;
revoke all on public.v_carer_pipeline_funnel from authenticated;
revoke all on public.v_carer_referral_funnel from authenticated;
revoke all on public.v_carer_referral_leaderboard from authenticated;
revoke all on public.v_carer_sourcing_funnel from authenticated;
revoke all on public.v_instant_ready_carers from authenticated;
