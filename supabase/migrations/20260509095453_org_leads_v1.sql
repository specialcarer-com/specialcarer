-- Org marketing-page lead capture. Idempotent.
-- pg_policies guard uses policyname (not the deprecated polname).

create table if not exists public.org_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text,
  work_email text not null,
  org_name text,
  role text,
  message text,
  source text,
  user_agent text,
  ip_address text,
  status text not null default 'new'
    check (status in ('new','contacted','qualified','disqualified','converted')),
  notes text,
  contacted_at timestamptz,
  converted_to_org_id uuid references public.organizations(id)
);
create index if not exists org_leads_created_idx
  on public.org_leads (created_at desc);
create index if not exists org_leads_status_idx
  on public.org_leads (status, created_at desc);

alter table public.org_leads enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'org_leads_admin_only'
      and tablename = 'org_leads'
  ) then
    create policy org_leads_admin_only on public.org_leads
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      );
  end if;
end $$;
