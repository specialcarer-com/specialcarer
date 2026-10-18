-- Internal/per-user views were readable by the unauthenticated `anon` role.
-- They are SECURITY DEFINER views (owner postgres), so anyone holding the public
-- anon key could read them through the REST API, bypassing row level security
-- on the underlying tables (live carer positions, carer names/emails, DBS and
-- right-to-work status, credit and plan data, admin queues).
--
-- This migration only removes anon's SELECT. Every server path that reads these
-- views uses either a signed-in session (role authenticated) or the service
-- role, neither of which is affected. It is additive and reversible with GRANT.
--
-- Not changed here (reviewed separately): caregiver_achievements_v,
-- caregiver_rates_v, carer_ceu_totals_v, org_public_v,
-- public_caregiver_certifications_v, and making per-user views
-- security_invoker so signed-in users only see their own rows.

revoke all on public.ai_anomaly_queue_v from anon;
revoke all on public.caregiver_verification from anon;
revoke all on public.carer_positions_latest from anon;
revoke all on public.user_current_plan from anon;
revoke all on public.v_agency_opt_in_gates from anon;
revoke all on public.v_carer_doc_compliance from anon;
revoke all on public.v_carer_pipeline_funnel from anon;
revoke all on public.v_carer_referral_funnel from anon;
revoke all on public.v_carer_referral_leaderboard from anon;
revoke all on public.v_carer_sourcing_funnel from anon;
revoke all on public.v_holiday_pot_balances from anon;
revoke all on public.v_instant_ready_carers from anon;
revoke all on public.v_user_activity_feed from anon;
revoke all on public.v_user_credit_balance from anon;
