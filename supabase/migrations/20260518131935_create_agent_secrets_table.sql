-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260518131935.
-- Ledger row: 20260518131935 create_agent_secrets_table
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Original migration created public.agent_secrets. The table was subsequently
-- dropped (superseded by env-var-based secret handling) and is not in prod today.
-- No-op preserves the ledger.
select 1 where false;
