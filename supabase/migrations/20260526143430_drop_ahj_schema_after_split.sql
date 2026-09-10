-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260526143430.
-- Ledger row: 20260526143430 drop_ahj_schema_after_split
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Drop the entire ahj schema after the split; all objects have been moved out.
drop schema if exists ahj cascade;
