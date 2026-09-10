-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260511205301.
-- Ledger row: 20260511205301 payroll_tax_breakdown_v1
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

alter table public.payroll_runs
  add column if not exists total_gross_cents integer default 0,
  add column if not exists total_net_cents integer default 0,
  add column if not exists total_paye_cents integer default 0,
  add column if not exists total_ni_employer_cents integer default 0;
