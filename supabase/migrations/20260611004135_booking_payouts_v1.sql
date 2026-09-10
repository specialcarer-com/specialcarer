-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260611004135.
-- Ledger row: 20260611004135 booking_payouts_v1
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.booking_payouts (
  id uuid not null default gen_random_uuid(),
  booking_id uuid not null,
  payee_kind text not null,
  payee_user_id uuid,
  stripe_account_id text,
  amount_cents integer not null,
  currency text not null,
  transfer_id text,
  status text not null default 'pending'::text,
  failure_reason text,
  created_at timestamp with time zone not null default now(),
  transferred_at timestamp with time zone,
  reversed_at timestamp with time zone,
  primary key (id)
);

alter table public.booking_payouts enable row level security;

drop policy if exists "booking_payouts_select_participant" on public.booking_payouts;
create policy "booking_payouts_select_participant" on public.booking_payouts
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_payouts.booking_id) AND ((b.seeker_id = auth.uid()) OR (b.caregiver_id = auth.uid()))))));

