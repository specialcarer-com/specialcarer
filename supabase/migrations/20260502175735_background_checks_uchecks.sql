-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260502175735.
-- Ledger row: 20260502175735 background_checks_uchecks
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.background_checks (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  vendor bg_vendor not null,
  check_type bg_check_type not null,
  status bg_check_status not null default 'not_started'::bg_check_status,
  vendor_applicant_id text,
  vendor_check_id text,
  invite_url text,
  issued_at timestamp with time zone,
  expires_at timestamp with time zone,
  result_summary text,
  raw jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  next_reverify_at date,
  reverify_cadence_months integer not null default 12,
  reverify_status text not null default 'none'::text,
  source text default 'fresh_checkr'::text,
  update_service_subscription_id text,
  update_service_consent_at timestamp with time zone,
  last_us_check_at timestamp with time zone,
  next_us_check_due_at timestamp with time zone,
  us_check_result jsonb,
  workforce_type text,
  us_reminder_sent_at timestamp with time zone,
  primary key (id)
);

alter table public.background_checks enable row level security;


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

