-- Admin Ops v3.12 — split chunk for ledger alignment.
-- Original bundle: supabase/migrations/20260509_admin_ops_v3_12.sql
-- Split at logical Gap boundaries; all sub-files remain idempotent.
--
-- Contains Gap 6 (compliance documents + alerts view).

-- ─── Gap 6: Compliance documents + alerts view ─────────────────────
create table if not exists public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null check (doc_type in
    ('dbs','right_to_work','insurance','first_aid_cert',
     'safeguarding_cert','driver_license','covid_vaccination')),
  status text not null default 'pending'
    check (status in ('pending','verified','expired','rejected')),
  file_url text,
  issued_at date,
  expires_at date,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compliance_documents_carer_idx
  on public.compliance_documents(caregiver_id);
create index if not exists compliance_documents_expires_idx
  on public.compliance_documents(expires_at);
create index if not exists compliance_documents_status_idx
  on public.compliance_documents(status);

create or replace function public.compliance_documents_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'compliance_documents_touch_trg'
  ) then
    create trigger compliance_documents_touch_trg
      before update on public.compliance_documents
      for each row execute function public.compliance_documents_touch();
  end if;
end $$;

alter table public.compliance_documents enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'compliance_documents_owner_or_admin_select'
      and tablename = 'compliance_documents'
  ) then
    create policy compliance_documents_owner_or_admin_select
      on public.compliance_documents
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
    where policyname = 'compliance_documents_admin_write'
      and tablename = 'compliance_documents'
  ) then
    create policy compliance_documents_admin_write
      on public.compliance_documents
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

create or replace view public.compliance_alerts_view as
  select
    cd.id as document_id,
    cd.caregiver_id,
    p.full_name,
    u.email,
    cd.doc_type,
    cd.status,
    cd.expires_at,
    case
      when cd.expires_at is null then null
      else (cd.expires_at - current_date)
    end as days_to_expiry
  from public.compliance_documents cd
  left join public.profiles p on p.id = cd.caregiver_id
  left join auth.users u on u.id = cd.caregiver_id
  where cd.status = 'expired'
     or (cd.expires_at is not null
         and cd.expires_at <= current_date + interval '30 days');
grant select on public.compliance_alerts_view to authenticated;

