-- Reconstructed 2026-09-10 from live prod schema.
-- Original migration was applied via Supabase Management API on 20260617194421.
-- Ledger row: 20260617194421 carer_referral_engine_v1
-- This file is idempotent and reproduces the schema state that the original migration is believed to have created.

create table if not exists public.carer_referral_codes (
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  code text not null,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.carer_referral_codes enable row level security;

drop policy if exists "carer_referral_codes_admin_write" on public.carer_referral_codes;
create policy "carer_referral_codes_admin_write" on public.carer_referral_codes
  for all to public
  using (_is_carer_outreach_admin())
  with check (_is_carer_outreach_admin());

drop policy if exists "carer_referral_codes_self_read" on public.carer_referral_codes;
create policy "carer_referral_codes_self_read" on public.carer_referral_codes
  for select to public
  using (((auth.uid() = owner_id) OR _is_carer_outreach_admin()));

create table if not exists public.carer_referrals (
  id uuid not null default gen_random_uuid(),
  code text not null,
  referrer_id uuid not null,
  referred_carer_id uuid,
  referred_email text,
  source text,
  status text not null default 'pending'::text,
  signed_up_at timestamp with time zone,
  applied_at timestamp with time zone,
  activated_at timestamp with time zone,
  paid_at timestamp with time zone,
  payout_referrer_pence integer,
  payout_referred_pence integer,
  payout_reference text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.carer_referrals enable row level security;

drop policy if exists "carer_referrals_admin_write" on public.carer_referrals;
create policy "carer_referrals_admin_write" on public.carer_referrals
  for all to public
  using (_is_carer_outreach_admin())
  with check (_is_carer_outreach_admin());

drop policy if exists "carer_referrals_self_read" on public.carer_referrals;
create policy "carer_referrals_self_read" on public.carer_referrals
  for select to public
  using (((auth.uid() = referrer_id) OR (auth.uid() = referred_carer_id) OR _is_carer_outreach_admin()));

create table if not exists public.referral_programme_config (
  id integer not null default 1,
  active boolean not null default true,
  payout_referrer_pence integer not null default 10000,
  payout_referred_pence integer not null default 10000,
  required_hours_to_qualify integer not null default 0,
  expiry_days_from_signup integer not null default 90,
  terms_url text,
  updated_at timestamp with time zone not null default now(),
  primary key (id)
);

alter table public.referral_programme_config enable row level security;

drop policy if exists "referral_programme_config_admin_write" on public.referral_programme_config;
create policy "referral_programme_config_admin_write" on public.referral_programme_config
  for all to public
  using (_is_carer_outreach_admin())
  with check (_is_carer_outreach_admin());

drop policy if exists "referral_programme_config_read" on public.referral_programme_config;
create policy "referral_programme_config_read" on public.referral_programme_config
  for select to public
  using ((auth.role() = 'authenticated'::text));

