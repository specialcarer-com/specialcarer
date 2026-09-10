-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260523124056.
-- Ledger row: 20260523124056 ahj_drop_legacy_trips_read_by_code
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Drop the legacy trips_read_by_code RPC. Idempotent.
drop function if exists public.trips_read_by_code(text);
drop function if exists public.trips_read_by_code(text, text);
