-- ============================================================================
-- SpecialCarer — Family Timeline v1 (gap 41)
--
-- A chronological feed of events around a family's care: care-journal notes,
-- booking lifecycle changes, etc. Family members (invited by the seeker) and
-- carers-on-bookings can read; family + seeker can comment and react.
--
-- DESIGN NOTE — reuse of existing family-sharing infra:
--   The 9-Jun audit proposed a new `family_members(seeker_id,...)` table, but a
--   mature family-sharing schema already exists (20260506_family_sharing.sql):
--   `families` (one per primary/seeker user), `family_members`, `family_invites`,
--   plus a full invite + accept flow (src/lib/family/server.ts, /api/family/*).
--   Re-creating it would collide, so this migration BUILDS ON TOP of it:
--     - The "seeker" / care recipient owner is `families.primary_user_id`.
--     - We extend `family_members` with `relationship` + a `timeline_role`
--       (viewer | commenter) instead of adding a parallel table.
--     - The timeline keys on `family_id` (one timeline per family).
--
-- All four new tables get RLS. Writes that fan out (event ingestion,
-- notifications) run server-side through the service role; the RLS here is the
-- read/authorisation backstop for the user-scoped client.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extend family_members for timeline roles + relationship label
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'family_timeline_role') then
    create type public.family_timeline_role as enum ('viewer', 'commenter');
  end if;
end$$;

alter table public.family_members
  add column if not exists relationship text,                          -- free text e.g. "Daughter"
  add column if not exists timeline_role public.family_timeline_role
    not null default 'commenter';

-- ---------------------------------------------------------------------------
-- 1. Event type enum
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timeline_event_type') then
    create type public.timeline_event_type as enum (
      'note.created',
      'booking.confirmed',
      'booking.started',
      'booking.completed',
      'booking.cancelled'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Reaction kind enum
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'timeline_reaction_kind') then
    create type public.timeline_reaction_kind as enum (
      'heart',
      'pray',
      'thanks',
      'concern'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3. timeline_events
--
-- seeker_id is the family's primary user (denormalised from families for a
-- cheap, index-friendly read path). payload carries everything the UI needs to
-- render the card without re-joining (actor name, title, body excerpt, etc.).
-- source_table + source_id give idempotency: an event is recorded at most once
-- per (source_table, source_id, event_type).
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  seeker_id uuid not null references auth.users(id) on delete cascade,
  event_type public.timeline_event_type not null,
  source_table text not null,                  -- 'care_journal_entries' | 'bookings'
  source_id uuid not null,                      -- journal entry id / booking id
  booking_id uuid references public.bookings(id) on delete set null, -- for carer scoping
  actor_id uuid references auth.users(id) on delete set null,        -- who caused it
  payload jsonb not null default '{}'::jsonb,   -- denormalised renderable fields
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One row per logical event. Re-running ingestion is a no-op (ON CONFLICT).
create unique index if not exists timeline_events_source_uidx
  on public.timeline_events(source_table, source_id, event_type);

create index if not exists timeline_events_family_occurred_idx
  on public.timeline_events(family_id, occurred_at desc);

create index if not exists timeline_events_seeker_occurred_idx
  on public.timeline_events(seeker_id, occurred_at desc);

create index if not exists timeline_events_booking_idx
  on public.timeline_events(booking_id)
  where booking_id is not null;

-- ---------------------------------------------------------------------------
-- 4. timeline_comments
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.timeline_events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists timeline_comments_event_idx
  on public.timeline_comments(event_id, created_at asc);

-- ---------------------------------------------------------------------------
-- 5. timeline_reactions
-- ---------------------------------------------------------------------------
create table if not exists public.timeline_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.timeline_events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind public.timeline_reaction_kind not null,
  created_at timestamptz not null default now()
);

create unique index if not exists timeline_reactions_uidx
  on public.timeline_reactions(event_id, author_id, kind);

create index if not exists timeline_reactions_event_idx
  on public.timeline_reactions(event_id);

-- ---------------------------------------------------------------------------
-- 6. Shared read predicate helpers (inlined into policies below)
--
-- A user may READ a family's timeline event when ANY of:
--   (a) they are the family's primary user (the seeker), OR
--   (b) they are an ACTIVE family_member of that family, OR
--   (c) the event is tied to a booking they are the carer on (privacy
--       boundary: carers only see events from their own bookings).
-- ---------------------------------------------------------------------------

alter table public.timeline_events enable row level security;
alter table public.timeline_comments enable row level security;
alter table public.timeline_reactions enable row level security;

-- timeline_events: SELECT
drop policy if exists "timeline events readable by circle" on public.timeline_events;
create policy "timeline events readable by circle"
  on public.timeline_events for select
  to authenticated
  using (
    exists (
      select 1 from public.families f
      where f.id = timeline_events.family_id
        and f.primary_user_id = auth.uid()
    )
    or exists (
      select 1 from public.family_members fm
      where fm.family_id = timeline_events.family_id
        and fm.user_id = auth.uid()
        and fm.status = 'active'
    )
    or (
      timeline_events.booking_id is not null and exists (
        select 1 from public.bookings b
        where b.id = timeline_events.booking_id
          and b.caregiver_id = auth.uid()
      )
    )
  );

-- timeline_events writes are server-side (service role) only — no INSERT/UPDATE
-- policy for authenticated users. The ingestion layer uses the admin client.

-- timeline_comments: SELECT — same circle as the parent event (incl. carer).
drop policy if exists "timeline comments readable by circle" on public.timeline_comments;
create policy "timeline comments readable by circle"
  on public.timeline_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.timeline_events e
      where e.id = timeline_comments.event_id
        and (
          exists (
            select 1 from public.families f
            where f.id = e.family_id and f.primary_user_id = auth.uid()
          )
          or exists (
            select 1 from public.family_members fm
            where fm.family_id = e.family_id
              and fm.user_id = auth.uid()
              and fm.status = 'active'
          )
          or (
            e.booking_id is not null and exists (
              select 1 from public.bookings b
              where b.id = e.booking_id and b.caregiver_id = auth.uid()
            )
          )
        )
    )
  );

-- timeline_comments: INSERT — author must be self AND a commenter in the
-- circle: the seeker (always allowed) OR an active family_member whose
-- timeline_role = 'commenter'. Carers are read-only on the timeline (no write).
drop policy if exists "timeline comments writable by commenters" on public.timeline_comments;
create policy "timeline comments writable by commenters"
  on public.timeline_comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.timeline_events e
      where e.id = timeline_comments.event_id
        and (
          exists (
            select 1 from public.families f
            where f.id = e.family_id and f.primary_user_id = auth.uid()
          )
          or exists (
            select 1 from public.family_members fm
            where fm.family_id = e.family_id
              and fm.user_id = auth.uid()
              and fm.status = 'active'
              and fm.timeline_role = 'commenter'
          )
        )
    )
  );

-- timeline_comments: DELETE — author only.
drop policy if exists "timeline comments deletable by author" on public.timeline_comments;
create policy "timeline comments deletable by author"
  on public.timeline_comments for delete
  to authenticated
  using (author_id = auth.uid());

-- timeline_reactions: SELECT — same circle as the parent event.
drop policy if exists "timeline reactions readable by circle" on public.timeline_reactions;
create policy "timeline reactions readable by circle"
  on public.timeline_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.timeline_events e
      where e.id = timeline_reactions.event_id
        and (
          exists (
            select 1 from public.families f
            where f.id = e.family_id and f.primary_user_id = auth.uid()
          )
          or exists (
            select 1 from public.family_members fm
            where fm.family_id = e.family_id
              and fm.user_id = auth.uid()
              and fm.status = 'active'
          )
          or (
            e.booking_id is not null and exists (
              select 1 from public.bookings b
              where b.id = e.booking_id and b.caregiver_id = auth.uid()
            )
          )
        )
    )
  );

-- timeline_reactions: INSERT — any authenticated reader of the event (seeker or
-- active family member). Carers are read-only.
drop policy if exists "timeline reactions writable by circle" on public.timeline_reactions;
create policy "timeline reactions writable by circle"
  on public.timeline_reactions for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.timeline_events e
      where e.id = timeline_reactions.event_id
        and (
          exists (
            select 1 from public.families f
            where f.id = e.family_id and f.primary_user_id = auth.uid()
          )
          or exists (
            select 1 from public.family_members fm
            where fm.family_id = e.family_id
              and fm.user_id = auth.uid()
              and fm.status = 'active'
          )
        )
    )
  );

-- timeline_reactions: DELETE — author only (toggle off).
drop policy if exists "timeline reactions deletable by author" on public.timeline_reactions;
create policy "timeline reactions deletable by author"
  on public.timeline_reactions for delete
  to authenticated
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Backfill — last 90 days of care-journal notes + completed bookings.
--
-- Bounded to 90 days to keep the initial timeline size sane. Idempotent via
-- the (source_table, source_id, event_type) unique index. Runs as one shot.
-- ---------------------------------------------------------------------------

-- 7a. Note events from care_journal_entries (kind <> 'system' only — system
-- rows like check-in/out are surfaced via their own booking events instead).
insert into public.timeline_events
  (family_id, seeker_id, event_type, source_table, source_id, booking_id, actor_id, payload, occurred_at)
select
  f.id,
  f.primary_user_id,
  'note.created'::public.timeline_event_type,
  'care_journal_entries',
  cje.id,
  cje.booking_id,
  cje.author_id,
  jsonb_build_object(
    'kind', cje.kind,
    'mood', cje.mood,
    'excerpt', left(cje.body, 280),
    'photo_count', coalesce(array_length(cje.photos, 1), 0)
  ),
  cje.created_at
from public.care_journal_entries cje
join public.bookings b on b.id = cje.booking_id
join public.families f on f.primary_user_id = b.seeker_id
where cje.created_at >= now() - interval '90 days'
  and cje.kind <> 'system'
  and cje.booking_id is not null
on conflict (source_table, source_id, event_type) do nothing;

-- Also backfill notes that target a seeker directly via about_user_id (no booking).
insert into public.timeline_events
  (family_id, seeker_id, event_type, source_table, source_id, booking_id, actor_id, payload, occurred_at)
select
  f.id,
  f.primary_user_id,
  'note.created'::public.timeline_event_type,
  'care_journal_entries',
  cje.id,
  cje.booking_id,
  cje.author_id,
  jsonb_build_object(
    'kind', cje.kind,
    'mood', cje.mood,
    'excerpt', left(cje.body, 280),
    'photo_count', coalesce(array_length(cje.photos, 1), 0)
  ),
  cje.created_at
from public.care_journal_entries cje
join public.families f on f.primary_user_id = cje.about_user_id
where cje.created_at >= now() - interval '90 days'
  and cje.kind <> 'system'
  and cje.about_user_id is not null
on conflict (source_table, source_id, event_type) do nothing;

-- 7b. Completed bookings.
insert into public.timeline_events
  (family_id, seeker_id, event_type, source_table, source_id, booking_id, actor_id, payload, occurred_at)
select
  f.id,
  f.primary_user_id,
  'booking.completed'::public.timeline_event_type,
  'bookings',
  b.id,
  b.id,
  b.caregiver_id,
  jsonb_build_object(
    'starts_at', b.starts_at,
    'ends_at', b.ends_at
  ),
  coalesce(b.shift_completed_at, b.updated_at, b.starts_at)
from public.bookings b
join public.families f on f.primary_user_id = b.seeker_id
where b.status = 'completed'
  and coalesce(b.shift_completed_at, b.updated_at, b.starts_at) >= now() - interval '90 days'
on conflict (source_table, source_id, event_type) do nothing;

comment on table public.timeline_events is
  'Family Timeline v1 (gap 41). One feed per family; events from care notes + booking lifecycle. seeker_id = families.primary_user_id (denormalised).';
comment on table public.timeline_comments is
  'Comments on timeline events. Writable by seeker + active family_members with timeline_role=commenter.';
comment on table public.timeline_reactions is
  'Reactions on timeline events (heart/pray/thanks/concern). Toggle on/off; unique per (event,author,kind).';
