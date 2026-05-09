-- Phase A — Organisation user type. Idempotent. RLS guards use
-- pg_policies.policyname (not the deprecated polname).
--
-- Adds:
--   • 'organization' value to public.user_role enum
--   • organizations / organization_members / organization_documents
--     / organization_billing tables
--   • org_public_v read-only view exposing only id/legal_name/trading_name/
--     country/verified to non-members (carers see this on bookings)
--   • organization-documents storage bucket + RLS policies

-- ── Role enum ────────────────────────────────────────────────────
-- 'organization' enum value added separately via execute_sql
-- because alter type ... add value cannot run in a transaction.
-- See SESSION_NOTES: applied 2026-05-09 by parent agent.

-- ── organizations ────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  country text check (country in ('GB','US')),
  org_type text,
  purpose text,
  legal_name text,
  trading_name text,
  companies_house_number text,
  ein text,
  vat_number text,
  year_established int,
  size_band text check (
    size_band is null or size_band in ('1-10','11-50','51-250','250+')
  ),
  office_address jsonb,
  website text,
  cqc_number text,
  ofsted_urn text,
  charity_number text,
  la_gss_code text,
  us_npi text,
  other_registration_note text,
  free_email_override boolean not null default false,
  verification_status text not null default 'draft'
    check (verification_status in ('draft','pending','verified','rejected','suspended')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  rejection_reason text,
  booking_enabled boolean not null default false,
  submitted_at timestamptz
);
create index if not exists organizations_status_created_idx
  on public.organizations (verification_status, created_at desc);

alter table public.organizations enable row level security;

-- ── organization_members ─────────────────────────────────────────
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner','admin','booker','viewer')),
  full_name text,
  job_title text,
  job_title_other text,
  work_email text,
  phone text,
  is_signatory boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists organization_members_user_idx
  on public.organization_members (user_id);

alter table public.organization_members enable row level security;

-- ── organization_documents ───────────────────────────────────────
create table if not exists public.organization_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in (
    'registration_certificate','proof_of_address',
    'public_liability_insurance','employers_liability_insurance',
    'signatory_letter','safeguarding_policy','other'
  )),
  storage_path text not null,
  filename text,
  mime_type text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  verified boolean not null default false,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  rejection_reason text
);
create index if not exists organization_documents_org_kind_idx
  on public.organization_documents (organization_id, kind);

alter table public.organization_documents enable row level security;

-- ── organization_billing ─────────────────────────────────────────
create table if not exists public.organization_billing (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,
  billing_contact_name text,
  billing_contact_email text,
  billing_address jsonb,
  po_required boolean not null default false,
  po_mode text check (po_mode is null or po_mode in ('per_booking','per_period')),
  default_terms text not null default 'net_14'
    check (default_terms in ('net_7','net_14','net_30')),
  stripe_customer_id text,
  default_payment_method_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.organization_billing enable row level security;

-- ── Member-side RLS policies ────────────────────────────────────
-- All four tables share the same access pattern: a row is readable
-- (and, where applicable, writable) by an active member of that org,
-- and by admins. Writes from carer-side flows always go through
-- service-role API routes, so we don't need carer policies.

-- helper expression: is the caller a member of this org?
-- Inlined per table because RLS policies can't reference helper
-- functions cheaply on Supabase.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organizations_members_read'
      and tablename = 'organizations'
  ) then
    create policy organizations_members_read on public.organizations
      for select to authenticated
      using (
        id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organizations_members_update'
      and tablename = 'organizations'
  ) then
    create policy organizations_members_update on public.organizations
      for update to authenticated
      using (
        id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
      )
      with check (
        id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organization_members_self_read'
      and tablename = 'organization_members'
  ) then
    create policy organization_members_self_read on public.organization_members
      for select to authenticated
      using (
        user_id = (select auth.uid())
        or organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organization_documents_member_rw'
      and tablename = 'organization_documents'
  ) then
    create policy organization_documents_member_rw on public.organization_documents
      for all to authenticated
      using (
        organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      )
      with check (
        organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organization_billing_member_rw'
      and tablename = 'organization_billing'
  ) then
    create policy organization_billing_member_rw on public.organization_billing
      for all to authenticated
      using (
        organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      )
      with check (
        organization_id in (
          select organization_id from public.organization_members
          where user_id = (select auth.uid())
        )
      );
  end if;
end $$;

-- ── Public-ish read view used by carer-side surfaces ─────────────
-- Exposes only the bare minimum so a carer can display "Booked by:
-- {legal_name} ✓ Verified" on a booking they've been assigned. Not a
-- general directory — selecting from this view in arbitrary contexts
-- is fine because it never leaks address / contact / docs / billing.
create or replace view public.org_public_v as
  select id, legal_name, trading_name, country,
         (verification_status = 'verified') as verified
  from public.organizations
  where verification_status in ('verified','suspended');

grant select on public.org_public_v to authenticated, anon;

-- ── Storage bucket for org documents ─────────────────────────────
insert into storage.buckets (id, name, public)
  values ('organization-documents', 'organization-documents', false)
  on conflict (id) do nothing;

-- Storage policy: a member can read/write objects under their own
-- org's folder. Path convention is ${organization_id}/...
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organization_documents_storage_rw'
      and tablename = 'objects'
      and schemaname = 'storage'
  ) then
    create policy organization_documents_storage_rw on storage.objects
      for all to authenticated
      using (
        bucket_id = 'organization-documents'
        and (
          (storage.foldername(name))[1] in (
            select organization_id::text
            from public.organization_members
            where user_id = (select auth.uid())
          )
          or exists (
            select 1 from public.profiles
            where id = (select auth.uid()) and role = 'admin'
          )
        )
      )
      with check (
        bucket_id = 'organization-documents'
        and (storage.foldername(name))[1] in (
          select organization_id::text
          from public.organization_members
          where user_id = (select auth.uid())
        )
      );
  end if;
end $$;
