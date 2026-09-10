-- DBS Update Service v1 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260514_dbs_update_service_v1.sql
-- Note: ledger version prefix is 20260512 (not 20260514) — bundle filename was misdated.
-- All chunks remain idempotent (guarded ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE VIEW, etc.).
--
-- Contains: DROP VIEW for v_agency_opt_in_gates so the subsequent
-- _view chunk can recreate it with a new column shape. Idempotent.

drop view if exists public.v_agency_opt_in_gates;
