-- Admin Ops v3.12 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260509_admin_ops_v3_12.sql
-- Split at logical Gap boundaries; all sub-files remain idempotent.
--
-- Contains Gap 7 (finance enhancements).

-- ─── Gap 7: Finance enhancements ────────────────────────────────────
-- New `payouts` table (period-bucketed) — distinct from the existing
-- payout_intents (per-request). Both coexist; the marketing /
-- product layer uses payout_intents, ops uses payouts.
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross numeric(12,2) not null default 0,
  fees numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending','processing','paid','failed','on_hold')),
  stripe_payout_id text,
  scheduled_for timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
-- Allow a row to be added later if columns are missing on a pre-existing
-- payouts table (defensive — current migration creates it from scratch).
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payouts'
  ) then
    alter table public.payouts
      add column if not exists scheduled_for timestamptz;
    alter table public.payouts
      add column if not exists stripe_payout_id text;
  end if;
end $$;
create index if not exists payouts_carer_period_idx
  on public.payouts(caregiver_id, period_start desc);
create index if not exists payouts_status_idx on public.payouts(status);

alter table public.payouts enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'payouts_owner_or_admin_select'
      and tablename = 'payouts'
  ) then
    create policy payouts_owner_or_admin_select on public.payouts
      for select to authenticated
      using (
        caregiver_id = (select auth.uid())
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'payouts_admin_write'
      and tablename = 'payouts'
  ) then
    create policy payouts_admin_write on public.payouts
      for all to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

create table if not exists public.fraud_signals (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in
    ('user','booking','caregiver')),
  subject_id uuid not null,
  signal_type text not null check (signal_type in
    ('velocity','card_mismatch','multi_account',
     'geo_mismatch','chargeback','unusual_pattern')),
  severity int not null check (severity between 1 and 5),
  details jsonb not null default '{}',
  status text not null default 'new'
    check (status in ('new','reviewing','cleared','confirmed')),
  flagged_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);
create index if not exists fraud_signals_status_idx
  on public.fraud_signals(status);
create index if not exists fraud_signals_subject_idx
  on public.fraud_signals(subject_type, subject_id);

alter table public.fraud_signals enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'fraud_signals_admin_all'
      and tablename = 'fraud_signals'
  ) then
    create policy fraud_signals_admin_all on public.fraud_signals
      for all to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

create table if not exists public.tax_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (doc_type in
    ('1099','p60','p11d','self_assessment_summary')),
  tax_year int not null check (tax_year between 2020 and 2099),
  file_url text,
  generated_at timestamptz,
  sent_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','ready','sent','amended'))
);
create index if not exists tax_documents_user_idx
  on public.tax_documents(user_id, tax_year);
create index if not exists tax_documents_status_idx
  on public.tax_documents(status);

alter table public.tax_documents enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'tax_documents_owner_or_admin_select'
      and tablename = 'tax_documents'
  ) then
    create policy tax_documents_owner_or_admin_select
      on public.tax_documents
      for select to authenticated
      using (
        user_id = (select auth.uid())
        or exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'tax_documents_admin_write'
      and tablename = 'tax_documents'
  ) then
    create policy tax_documents_admin_write on public.tax_documents
      for all to authenticated
      using (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      )
      with check (
        exists (select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role = 'admin')
      );
  end if;
end $$;

