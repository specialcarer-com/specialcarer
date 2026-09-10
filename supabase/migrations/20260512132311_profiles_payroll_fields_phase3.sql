-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260512132311.
-- Ledger row: 20260512132311 profiles_payroll_fields_phase3
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

alter table public.profiles
  add column if not exists tax_code text,
  add column if not exists ni_number text,
  add column if not exists email text;
