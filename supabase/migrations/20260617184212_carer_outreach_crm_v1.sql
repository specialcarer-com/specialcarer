-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260617184212.
-- Ledger row: 20260617184212 carer_outreach_crm_v1
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.outreach_stages (
  id integer not null default nextval('outreach_stages_id_seq'::regclass),
  stage caregiver_application_stage,
  synthetic_code text,
  crm_label text not null,
  sort_order integer not null,
  default_template_code text,
  auto_send boolean not null default false,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.outreach_stages enable row level security;

create table if not exists public.outreach_email_templates (
  id integer not null default nextval('outreach_email_templates_id_seq'::regclass),
  code text not null,
  crm_stage_label text not null,
  when_to_send text,
  subject text not null,
  body text not null,
  merge_fields text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.outreach_email_templates enable row level security;

create table if not exists public.outreach_email_log (
  id uuid not null default gen_random_uuid(),
  caregiver_id uuid not null,
  template_id integer,
  template_code text,
  to_email text not null,
  subject text not null,
  status text not null default 'queued'::text,
  resend_email_id text,
  error text,
  stage_at_send caregiver_application_stage,
  merge_vars jsonb default '{}'::jsonb,
  sent_by uuid,
  sent_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.outreach_email_log enable row level security;

