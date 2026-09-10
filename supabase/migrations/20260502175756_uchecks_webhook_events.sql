-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260502175756.
-- Ledger row: 20260502175756 uchecks_webhook_events
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.uchecks_webhook_events (
  id text not null,
  type text not null,
  payload jsonb not null,
  received_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone,
  error text,
  primary key (id)
);

alter table public.uchecks_webhook_events enable row level security;

