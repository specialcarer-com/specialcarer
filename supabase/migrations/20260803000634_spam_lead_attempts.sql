-- Anti-spam visibility for B2B lead forms (/organisations, /employers/contact).
-- Logs rejected submissions (honeypot hits, random-string names, free-webmail
-- blocks, invalid UK phone, rate-limit hits) so we can see spam volume and
-- pattern over time. Idempotent.

create table if not exists public.spam_lead_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_form text not null,
  rejection_reason text not null,
  ip_address text,
  user_agent text,
  payload_json jsonb
);

create index if not exists spam_lead_attempts_created_idx
  on public.spam_lead_attempts (created_at desc);
create index if not exists spam_lead_attempts_source_idx
  on public.spam_lead_attempts (source_form, created_at desc);

alter table public.spam_lead_attempts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'spam_lead_attempts_admin_only'
      and tablename = 'spam_lead_attempts'
  ) then
    create policy spam_lead_attempts_admin_only on public.spam_lead_attempts
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
