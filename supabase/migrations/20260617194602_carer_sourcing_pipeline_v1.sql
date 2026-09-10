-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260617194602.
-- Ledger row: 20260617194602 carer_sourcing_pipeline_v1
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.carer_sourcing_channels (
  id uuid not null default gen_random_uuid(),
  code text not null,
  display_name text not null,
  lawful_basis text not null,
  active boolean not null default true,
  notes text,
  primary key (id)
);

alter table public.carer_sourcing_channels enable row level security;

drop policy if exists "carer_sourcing_channels_read" on public.carer_sourcing_channels;
create policy "carer_sourcing_channels_read" on public.carer_sourcing_channels
  for select to public
  using (_is_carer_outreach_admin());

create table if not exists public.carer_sourcing_prospects (
  id uuid not null default gen_random_uuid(),
  full_name text,
  email text,
  phone text,
  postcode text,
  channel_code text not null,
  source_detail text,
  lawful_basis_snapshot text not null,
  consent_text_shown text,
  consent_timestamp timestamp with time zone,
  consent_ip_address inet,
  consent_user_agent text,
  consent_evidence_url text,
  marketing_consent boolean not null default false,
  contact_status text not null default 'new'::text,
  applied_carer_id uuid,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.carer_sourcing_prospects enable row level security;

drop policy if exists "carer_sourcing_prospects_admin_all" on public.carer_sourcing_prospects;
create policy "carer_sourcing_prospects_admin_all" on public.carer_sourcing_prospects
  for all to public
  using (_is_carer_outreach_admin())
  with check (_is_carer_outreach_admin());

create table if not exists public.carer_outreach_suppression (
  id uuid not null default gen_random_uuid(),
  email text not null,
  phone text,
  reason text not null,
  added_at timestamp with time zone not null default now(),
  notes text,
  primary key (id)
);

alter table public.carer_outreach_suppression enable row level security;

drop policy if exists "carer_outreach_suppression_admin_all" on public.carer_outreach_suppression;
create policy "carer_outreach_suppression_admin_all" on public.carer_outreach_suppression
  for all to public
  using (_is_carer_outreach_admin())
  with check (_is_carer_outreach_admin());

