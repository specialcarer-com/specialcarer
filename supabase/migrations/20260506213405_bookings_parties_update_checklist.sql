-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260506213405.
-- Ledger row: 20260506213405 bookings_parties_update_checklist
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Ledger effect: create policy 'parties_update_checklist' on public.bookings.
-- The policy has since been dropped/superseded in prod; drop-if-exists preserves the eventual state.
drop policy if exists parties_update_checklist on public.bookings;
