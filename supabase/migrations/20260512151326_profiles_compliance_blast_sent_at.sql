-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260512151326.
-- Ledger row: 20260512151326 profiles_compliance_blast_sent_at
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

alter table public.profiles
  add column if not exists compliance_blast_sent_at timestamp with time zone;
