-- Fix live PII leak: v_carer_outreach_pipeline was security_definer (default) + granted to anon/authenticated,
-- allowing anon to read every carer's name/email/phone/stage/DBS status via the public REST API.
-- Hotfix applied to prod via Supabase MCP on 2026-09-17T12:24 UTC; this file persists the same SQL
-- so future rebuilds and branches reproduce the fixed state.
-- If the view itself is missing on a fresh env, that's a pre-existing baseline gap (view was created
-- ad-hoc in Studio ~2026-06-17 and never captured in migrations); this migration guards the fix with
-- an IF EXISTS check so it's a no-op there.

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
