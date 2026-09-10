-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260511205446.
-- Ledger row: 20260511205446 payroll_preview_dispute_v1
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

alter table public.payroll_runs
  add column if not exists preview_opens_at timestamp with time zone,
  add column if not exists preview_closes_at timestamp with time zone;
