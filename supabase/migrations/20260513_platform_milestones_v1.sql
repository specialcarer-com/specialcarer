-- 20260513_platform_milestones_v1 — one-shot alert log for production-safety
-- milestones (first live Stripe payment, first dispute, etc.). Apply via
-- Supabase MCP before deploying webhooks that reference the table.
--
-- Reads/writes go through service_role only — there are no public policies,
-- so RLS is enabled with no permissive policies (deny-by-default).

CREATE TABLE IF NOT EXISTS platform_milestones (
  key TEXT PRIMARY KEY,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB
);

ALTER TABLE platform_milestones ENABLE ROW LEVEL SECURITY;

-- No policies on purpose. service_role bypasses RLS, which is exactly what
-- the webhook handler uses (createAdminClient). Anything that tries to read
-- this table with anon/authenticated keys gets nothing.
