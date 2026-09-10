-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260511205434.
-- Ledger row: 20260511205434 agency_opt_in_gates_view_v1b
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Ledger effect: create view public.agency_opt_in_gates_v1b.
-- The v1b view name was superseded by v_agency_opt_in_gates (final name).
-- Reproduce the eventual public view name with the current definition
-- so re-applying is a no-op; drop the intermediate v1b if it lingers.
drop view if exists public.agency_opt_in_gates_v1b;
