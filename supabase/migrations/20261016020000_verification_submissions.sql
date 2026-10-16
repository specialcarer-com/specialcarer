-- Manual verification evidence (interim route until uCheck is live).
-- Carers submit evidence for each pre-employment check; the back office
-- reviews it against a fixed checklist and records a decision.
-- Strictly additive. Writes happen only through server routes (service role):
-- there is deliberately no insert/update policy for client sessions.

create table if not exists public.verification_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'right_to_work', 'identity', 'dbs', 'employment_history',
    'references', 'health_declaration', 'qualifications'
  )),
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected')),
  data jsonb not null default '{}'::jsonb,
  files jsonb not null default '{}'::jsonb,
  consent_at timestamptz,
  checklist jsonb not null default '{}'::jsonb,
  review_note text,
  expires_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.verification_submissions is
  'Carer-submitted evidence for pre-employment checks, reviewed manually by the back office. Contains personal data: read via server routes only.';

-- At most one open submission per carer per kind.
create unique index if not exists verification_submissions_one_open
  on public.verification_submissions (user_id, kind)
  where status = 'submitted';

create index if not exists verification_submissions_queue
  on public.verification_submissions (status, created_at);

alter table public.verification_submissions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'verification_submissions'
      and policyname = 'verification_submissions_owner_select'
  ) then
    create policy verification_submissions_owner_select
      on public.verification_submissions
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- Private bucket. No storage policies are created, so client sessions cannot
-- read or write it; the server uses the service role and short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'verification-docs', 'verification-docs', false, 4194304,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  on conflict (id) do nothing;
