-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260509104228.
-- Ledger row: 20260509104228 org_carer_payouts_v1
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.org_carer_payouts (
  id uuid not null default gen_random_uuid(),
  carer_id uuid not null,
  period_start date not null,
  period_end date not null,
  booking_count integer not null default 0,
  total_pay_cents integer not null default 0,
  currency text not null default 'gbp'::text,
  status text not null default 'pending'::text,
  bank_reference text,
  notes text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  gross_pay_cents integer,
  paye_deducted_cents integer default 0,
  ni_employee_cents integer default 0,
  ni_employer_cents integer default 0,
  holiday_accrued_cents integer default 0,
  net_pay_cents integer,
  payslip_pdf_url text,
  tax_year text,
  tax_code text,
  run_id uuid,
  dispute_reason text,
  dispute_flagged_at timestamp with time zone,
  dispute_resolved_at timestamp with time zone,
  dispute_resolved_by uuid,
  holiday_payout_cents integer not null default 0,
  holiday_payout_request_ids uuid[] not null default '{}'::uuid[],
  primary key (id)
);

alter table public.org_carer_payouts enable row level security;

