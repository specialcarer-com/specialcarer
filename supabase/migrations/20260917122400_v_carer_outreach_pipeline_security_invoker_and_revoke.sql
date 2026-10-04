-- Fix live PII leak: v_carer_outreach_pipeline was security_definer (default) + granted to anon/authenticated,
-- allowing anon to read every carer's name/email/phone/stage/DBS status via the public REST API.
-- Hotfix applied to prod via Supabase MCP on 2026-09-17T12:24 UTC; this file persists the same SQL
-- so future rebuilds and branches reproduce the fixed state.
-- If the view itself is missing on a fresh env, that's a pre-existing baseline gap (view was created
-- ad-hoc in Studio ~2026-06-17 and never captured in migrations); this migration guards the fix with
-- an IF EXISTS check so it's a no-op there.
--
-- NOTE 2026-10-04: this is a duplicate of 20260917112348 (same migration, two ledger entries).
-- The rename attempted earlier today raced with CI and both versions ended up applied/recorded.
-- Left in place deliberately: deleting it again would leave a ledger row with no matching file,
-- which is the same class of bug that blocked db push for 2.5 weeks. The SQL is idempotent
-- (IF EXISTS guard), so having it run is harmless; removing it isn't worth the risk it recreates.

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_carer_outreach_pipeline' and c.relkind = 'v'
  ) then
    execute 'alter view public.v_carer_outreach_pipeline set (security_invoker = true)';
    execute 'revoke select on public.v_carer_outreach_pipeline from anon, authenticated';
  end if;
end $$;
