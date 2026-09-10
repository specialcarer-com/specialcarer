-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260511211924.
-- Ledger row: 20260511211924 agency_opt_in_contract_party_v1b
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

alter table public.organization_contracts
  add column if not exists contract_type text,
  add column if not exists signed_by_member_id uuid,
  add column if not exists signed_by_name text,
  add column if not exists signed_by_role text,
  add column if not exists countersigned_by_admin_id uuid,
  add column if not exists countersigned_at timestamp with time zone,
  add column if not exists signed_by_user_id uuid;
