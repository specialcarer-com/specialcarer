-- Referee response routing and candidate disclosure consent for reference collection.
alter table public.carer_references
  add column if not exists response_mode text check (response_mode in ('form','upload','declined')),
  add column if not exists decline_reason text check (length(coalesce(decline_reason,'')) <= 1000),
  add column if not exists uploaded_file_path text,
  add column if not exists uploaded_file_size int,
  add column if not exists uploaded_file_mime text;

create table if not exists public.carer_reference_consents (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 120),
  date_of_birth date not null,
  national_insurance_number text check (national_insurance_number ~ '^[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}[0-9]{6}[A-D]{1}$'),
  signature_data_url text not null check (length(signature_data_url) <= 200000),
  signed_at timestamptz not null default now(),
  signed_ip text,
  signed_ua text,
  pdf_storage_path text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (carer_id)
);
create index if not exists carer_reference_consents_carer_idx on public.carer_reference_consents(carer_id);
alter table public.carer_reference_consents enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='carer_reference_consents_owner_rw' and tablename='carer_reference_consents') then
    create policy carer_reference_consents_owner_rw on public.carer_reference_consents for all to authenticated
      using (carer_id = (select auth.uid())) with check (carer_id = (select auth.uid()));
  end if;
end $$;
insert into storage.buckets (id, name, public) values ('reference-consents', 'reference-consents', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('reference-uploads', 'reference-uploads', false) on conflict (id) do nothing;
