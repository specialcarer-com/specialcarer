-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260502181039.
-- Ledger row: 20260502181039 checkr_webhook_events_and_view
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.checkr_webhook_events (
  id text not null,
  type text not null,
  payload jsonb not null,
  received_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone,
  error text,
  primary key (id)
);

alter table public.checkr_webhook_events enable row level security;


-- Unified admin view over all vendor webhook events.
create or replace view public.admin_webhook_events as
 SELECT 'stripe'::text AS vendor,
    e.id AS event_id, e.type AS event_type, e.created_at AS received_at,
    e.processed_at, e.error, e.payload
   FROM public.stripe_webhook_events e
UNION ALL
 SELECT 'uchecks'::text AS vendor,
    e.id AS event_id, e.type AS event_type, e.received_at,
    e.processed_at, e.error, e.payload
   FROM public.uchecks_webhook_events e
UNION ALL
 SELECT 'checkr'::text AS vendor,
    e.id AS event_id, e.type AS event_type, e.received_at,
    e.processed_at, e.error, e.payload
   FROM public.checkr_webhook_events e;
