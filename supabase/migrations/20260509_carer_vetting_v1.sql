-- Carer vetting v1 — references, certifications, skills quiz, video
-- interview, onboarding course. Idempotent throughout. All RLS guards
-- use `policyname` (not the deprecated `polname`).

-- ── References (3 per carer, tokenised email verification) ─────
create table if not exists public.carer_references (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references auth.users(id) on delete cascade,
  referee_name text not null check (length(referee_name) between 1 and 80),
  referee_email text not null check (length(referee_email) between 3 and 120),
  relationship text check (length(relationship) <= 80),
  status text not null default 'invited'
    check (status in ('invited','submitted','verified','rejected','expired')),
  token text not null unique,
  token_expires_at timestamptz not null default (now() + interval '14 days'),
  rating int check (rating between 1 and 5),
  recommend boolean,
  comment text check (length(coalesce(comment,'')) <= 2000),
  ip_address text,
  user_agent text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  rejected_reason text,
  created_at timestamptz not null default now()
);
create index if not exists carer_references_carer_idx on public.carer_references(carer_id);
create index if not exists carer_references_status_idx on public.carer_references(status);
alter table public.carer_references enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='carer_references_owner_rw' and tablename='carer_references') then
    create policy carer_references_owner_rw on public.carer_references
      for all to authenticated
      using (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── Certifications (file uploads + admin verification) ─────────
create table if not exists public.carer_certifications (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references auth.users(id) on delete cascade,
  cert_type text not null check (length(cert_type) <= 60),
  issuer text check (length(issuer) <= 120),
  issued_at date,
  expires_at date,
  file_path text,
  status text not null default 'pending'
    check (status in ('pending','verified','rejected','expired')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  rejection_reason text check (length(coalesce(rejection_reason,'')) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carer_certifications_carer_idx on public.carer_certifications(carer_id);
alter table public.carer_certifications enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='carer_certifications_owner_rw' and tablename='carer_certifications') then
    create policy carer_certifications_owner_rw on public.carer_certifications
      for all to authenticated
      using (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── Skills assessment results (per vertical) ───────────────────
create table if not exists public.carer_skills_attempts (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references auth.users(id) on delete cascade,
  vertical text not null check (vertical in ('elderly_care','childcare','special_needs','postnatal','complex_care')),
  score int not null check (score between 0 and 100),
  passed boolean not null,
  answers jsonb not null,
  attempted_at timestamptz not null default now()
);
create index if not exists carer_skills_attempts_carer_idx on public.carer_skills_attempts(carer_id);
create index if not exists carer_skills_attempts_vertical_idx on public.carer_skills_attempts(vertical);
alter table public.carer_skills_attempts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='carer_skills_attempts_owner_rw' and tablename='carer_skills_attempts') then
    create policy carer_skills_attempts_owner_rw on public.carer_skills_attempts
      for all to authenticated
      using (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── Video interview submissions ────────────────────────────────
create table if not exists public.carer_interview_submissions (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references auth.users(id) on delete cascade,
  prompt_index int not null check (prompt_index between 0 and 2),
  video_path text not null,
  duration_seconds int check (duration_seconds between 1 and 90),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  unique(carer_id, prompt_index)
);
alter table public.carer_interview_submissions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='carer_interview_submissions_owner_rw' and tablename='carer_interview_submissions') then
    create policy carer_interview_submissions_owner_rw on public.carer_interview_submissions
      for all to authenticated
      using (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── Onboarding course progress ─────────────────────────────────
create table if not exists public.carer_course_progress (
  carer_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  read_at timestamptz,
  knowledge_check_correct boolean,
  knowledge_check_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (carer_id, module_key)
);
alter table public.carer_course_progress enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='carer_course_progress_owner_rw' and tablename='carer_course_progress') then
    create policy carer_course_progress_owner_rw on public.carer_course_progress
      for all to authenticated
      using (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

-- ── Storage buckets (private) ──────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('certifications', 'certifications', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('interview-videos', 'interview-videos', false)
  on conflict (id) do nothing;

-- Storage policies — owner can read/write own folder.
do $$ begin
  if not exists (select 1 from pg_policies where policyname='certifications_owner_rw' and tablename='objects' and schemaname='storage') then
    create policy certifications_owner_rw on storage.objects
      for all to authenticated
      using (bucket_id = 'certifications' and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = 'certifications' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where policyname='interview_videos_owner_rw' and tablename='objects' and schemaname='storage') then
    create policy interview_videos_owner_rw on storage.objects
      for all to authenticated
      using (bucket_id = 'interview-videos' and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = 'interview-videos' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;
