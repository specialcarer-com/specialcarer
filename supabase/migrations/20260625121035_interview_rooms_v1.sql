-- ============================================================================
-- SpecialCarers — Interview Rooms v1 (Whereby Embedded video interviews)
--
-- Family ⇄ carer 1:1 video interviews backed by Whereby Embedded. A booking-
-- like `interviews` record schedules the session; an `interview_rooms` record
-- holds the Whereby meeting we create on demand (host URL for the family,
-- viewer URL for the carer).
--
-- The repo's only pre-existing "interview" tables (carer_interview_submissions)
-- are unrelated carer-vetting recordings, so we introduce a fresh minimal
-- `interviews` table here.
--
-- Gated by the INTERVIEWS_VIDEO_ENABLED feature flag at the application layer;
-- with the flag off these tables are simply never written to.
-- Idempotent: create-if-not-exists throughout.
-- ============================================================================

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null,
  family_id uuid not null,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create index if not exists interviews_carer_idx
  on public.interviews(carer_id);
create index if not exists interviews_family_idx
  on public.interviews(family_id);

create table if not exists public.interview_rooms (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  meeting_id text not null unique,
  host_room_url text not null,
  viewer_room_url text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists interview_rooms_interview_idx
  on public.interview_rooms(interview_id);
create index if not exists interview_rooms_meeting_idx
  on public.interview_rooms(meeting_id);

comment on table public.interview_rooms is
  'Whereby Embedded video rooms for family/carer interviews. One live (deleted_at IS NULL) room per interview. Only written when INTERVIEWS_VIDEO_ENABLED is on.';
