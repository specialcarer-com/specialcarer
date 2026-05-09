-- Phase A.5 — Organisation contracts (MSA + DPA). Idempotent. RLS
-- guards use pg_policies.policyname. Storage objects live in the
-- existing `organization-documents` bucket so its RLS already handles
-- access; we just track signed PDF paths here.

create table if not exists public.organization_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  contract_type text not null check (contract_type in ('msa','dpa')),
  version text not null,
  markdown_path text,
  signed_pdf_storage_path text,
  status text not null default 'draft'
    check (status in (
      'draft','sent','viewed','signed','countersigned',
      'active','expired','terminated'
    )),
  signed_by_member_id uuid
    references public.organization_members(id) on delete set null,
  signed_by_name text,
  signed_by_role text,
  signed_at timestamptz,
  signature_ip text,
  signature_user_agent text,
  signature_method text not null default 'clickwrap'
    check (signature_method in ('clickwrap','docusign','wet')),
  countersigned_by_admin_id uuid references auth.users(id),
  countersigned_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  termination_notice_at timestamptz,
  termination_reason text,
  legal_review_comment text,
  created_at timestamptz not null default now(),
  unique (organization_id, contract_type, version)
);

create index if not exists organization_contracts_org_status_idx
  on public.organization_contracts (organization_id, contract_type, status);

alter table public.organization_contracts enable row level security;

-- Members of an org can read their org's contracts. Admins read all.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'organization_contracts_member_read'
      and tablename = 'organization_contracts'
  ) then
    create policy organization_contracts_member_read on public.organization_contracts
      for select to authenticated
      using (
        organization_id in (
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

-- Inserts and updates for org-side actions (signing) flow through
-- the service-role API route, so no member write policy is needed.
-- Admin countersignature also runs server-side as service-role.
