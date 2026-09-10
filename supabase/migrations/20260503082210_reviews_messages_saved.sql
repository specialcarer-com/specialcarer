-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260503082210.
-- Ledger row: 20260503082210 reviews_messages_saved
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.reviews (
  id uuid not null default gen_random_uuid(),
  booking_id uuid not null,
  reviewer_id uuid not null,
  caregiver_id uuid not null,
  rating integer not null,
  body text,
  created_at timestamp with time zone not null default now(),
  hidden_at timestamp with time zone,
  hidden_by uuid,
  hidden_reason text,
  rating_punctuality integer,
  rating_communication integer,
  rating_care_quality integer,
  rating_cleanliness integer,
  tags text[] not null default '{}'::text[],
  primary key (id)
);

alter table public.reviews enable row level security;

create table if not exists public.messages (
  id uuid not null default gen_random_uuid(),
  booking_id uuid not null,
  sender_id uuid not null,
  body text not null,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.messages enable row level security;

create table if not exists public.saved_caregivers (
  seeker_id uuid not null,
  caregiver_id uuid not null,
  created_at timestamp with time zone not null default now(),
  primary key (seeker_id, caregiver_id)
);

alter table public.saved_caregivers enable row level security;

