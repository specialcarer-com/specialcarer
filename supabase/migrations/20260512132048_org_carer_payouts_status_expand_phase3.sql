-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260512132048.
-- Ledger row: 20260512132048 org_carer_payouts_status_expand_phase3
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Extend the org_carer_payout_status enum with the phase-3 values.
-- ADD VALUE is not transactional but IF NOT EXISTS keeps it idempotent (Postgres 12+).
do $$
begin
  if exists (select 1 from pg_type t where t.typname = 'org_carer_payout_status') then
    begin
      alter type public.org_carer_payout_status add value if not exists 'phase3_ready';
    exception when others then null;
    end;
    begin
      alter type public.org_carer_payout_status add value if not exists 'phase3_processing';
    exception when others then null;
    end;
    begin
      alter type public.org_carer_payout_status add value if not exists 'phase3_paid';
    exception when others then null;
    end;
  end if;
end $$;
