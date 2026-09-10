-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260512011135.
-- Ledger row: 20260512011135 agency_optin_v2_drop_gates_view
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Drop the earlier v1b agency-opt-in gates view before recreating with v2 shape.
drop view if exists public.agency_opt_in_gates_v1b;
