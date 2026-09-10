-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260506213413.
-- Ledger row: 20260506213413 bookings_drop_broad_update_policy
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

-- Destructive migration: drop the legacy broad UPDATE policy on bookings.
drop policy if exists broad_update on public.bookings;
drop policy if exists "broad update" on public.bookings;
