-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260502192911.
-- Ledger row: 20260502192911 shift_tracking_tables
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.shift_tracking_sessions (
  id uuid not null default gen_random_uuid(),
  booking_id uuid not null,
  caregiver_id uuid not null,
  seeker_id uuid not null,
  status shift_tracking_status not null default 'pending'::shift_tracking_status,
  scheduled_start timestamp with time zone not null,
  scheduled_end timestamp with time zone not null,
  tracking_window_end timestamp with time zone not null,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  last_ping_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  eta_seconds integer,
  eta_calculated_at timestamp with time zone,
  eta_destination_lng numeric,
  eta_destination_lat numeric,
  primary key (id)
);

alter table public.shift_tracking_sessions enable row level security;

create table if not exists public.shift_locations (
  id bigint not null default nextval('shift_locations_id_seq'::regclass),
  session_id uuid not null,
  booking_id uuid not null,
  caregiver_id uuid not null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  heading double precision,
  speed_mps double precision,
  battery_pct integer,
  recorded_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.shift_locations enable row level security;

