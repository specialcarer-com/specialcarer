-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260503001520.
-- Ledger row: 20260503001520 employer_leads
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.employer_leads (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  company_name text not null,
  contact_name text not null,
  work_email text not null,
  phone text,
  country text not null,
  employee_count text,
  use_case text,
  message text,
  source text not null default 'employers_page'::text,
  status text not null default 'new'::text,
  primary key (id)
);

alter table public.employer_leads enable row level security;

