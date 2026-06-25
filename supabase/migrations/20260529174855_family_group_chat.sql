-- P1-B11: Family group chat (multi-participant threads).
--
-- Lets the seeker invite family members (typically adult children) into
-- the booking's chat thread so they can coordinate with the carer.
--
-- chat_participants already exists with (thread_id, user_id, last_read_at,
-- muted_until, banned_at). This migration extends it with role/added_by/
-- added_at/removed_at, adds a family-invite table, and introduces a
-- `kind` column on chat_messages so system announcements ("X (family)
-- was added") can be distinguished from user-authored messages.
--
-- All statements are idempotent so the migration can be re-applied
-- against an environment that may already carry partial state.

-- ---------------------------------------------------------------------------
-- 1. Role enum
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'chat_participant_role') then
    create type public.chat_participant_role as enum ('seeker', 'carer', 'family', 'admin');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Extend chat_participants
-- ---------------------------------------------------------------------------
alter table public.chat_participants
  add column if not exists role public.chat_participant_role,
  add column if not exists added_by uuid references auth.users(id) on delete set null,
  add column if not exists added_at timestamptz not null default now(),
  add column if not exists removed_at timestamptz;

-- Backfill role for existing rows by joining through bookings.
update public.chat_participants p
   set role = 'seeker'
  from public.chat_threads t
  join public.bookings b on b.id = t.booking_id
 where p.thread_id = t.id
   and p.user_id = b.seeker_id
   and p.role is null;

update public.chat_participants p
   set role = 'carer'
  from public.chat_threads t
  join public.bookings b on b.id = t.booking_id
 where p.thread_id = t.id
   and p.user_id = b.caregiver_id
   and p.role is null;

-- Anything left over (shouldn't happen given the seed pattern but
-- defend just in case) defaults to 'family' so the NOT NULL below
-- still succeeds.
update public.chat_participants
   set role = 'family'
 where role is null;

alter table public.chat_participants
  alter column role set not null;

-- Active-participant lookups (the hot path for RLS, see policies
-- below) filter on removed_at is null. Cover that with a partial index.
create index if not exists chat_participants_active_idx
  on public.chat_participants(thread_id, user_id)
  where removed_at is null;

-- ---------------------------------------------------------------------------
-- 3. chat_messages: system message convention.
--
-- No prior `kind` column or magic sender_id existed (grep'd the repo).
-- Add a kind enum'd via text so future system-event types can be
-- introduced without another migration. `sender_id` stays NOT NULL
-- (matches the original table definition); the seeker_id of the thread
-- is used for system rows so existing RLS / FK constraints hold.
-- ---------------------------------------------------------------------------
alter table public.chat_messages
  add column if not exists kind text not null default 'message'
    check (kind in ('message', 'system'));

create index if not exists chat_messages_kind_idx
  on public.chat_messages(thread_id, kind, created_at desc)
  where kind = 'system';

-- ---------------------------------------------------------------------------
-- 4. Family invitations table
-- ---------------------------------------------------------------------------
create table if not exists public.chat_family_invites (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references public.chat_threads(id) on delete cascade,
  invited_email     text not null,
  invited_by        uuid not null references auth.users(id) on delete cascade,
  token             text not null unique,
  expires_at        timestamptz not null default (now() + interval '7 days'),
  accepted_at       timestamptz,
  accepted_user_id  uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists chat_family_invites_token_idx
  on public.chat_family_invites(token);
create index if not exists chat_family_invites_email_idx
  on public.chat_family_invites(lower(invited_email));
create index if not exists chat_family_invites_thread_idx
  on public.chat_family_invites(thread_id);

alter table public.chat_family_invites enable row level security;

drop policy if exists "inviter reads own invites" on public.chat_family_invites;
create policy "inviter reads own invites" on public.chat_family_invites
  for select using (invited_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. RLS rewrite for chat_messages — restrict to ACTIVE participants.
--
-- The original policies (see 20260524_chat_tables.sql) already use
-- chat_participants, but they predate the `removed_at` soft-delete
-- column. Now that family members can be removed, both policies must
-- filter removed rows out so a removed family member can no longer
-- read or post.
-- ---------------------------------------------------------------------------
drop policy if exists "participants read thread messages" on public.chat_messages;
create policy "participants read thread messages" on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_participants p
      where p.thread_id = chat_messages.thread_id
        and p.user_id = auth.uid()
        and p.removed_at is null
    )
  );

drop policy if exists "participants insert own messages" on public.chat_messages;
create policy "participants insert own messages" on public.chat_messages
  for insert with check (
    sender_id = auth.uid()
    and kind = 'message'
    and exists (
      select 1 from public.chat_participants p
      where p.thread_id = chat_messages.thread_id
        and p.user_id = auth.uid()
        and p.removed_at is null
    )
  );

-- chat_threads SELECT policy — same removed_at fix.
drop policy if exists "participants read own threads" on public.chat_threads;
create policy "participants read own threads" on public.chat_threads
  for select using (
    exists (
      select 1 from public.chat_participants p
      where p.thread_id = chat_threads.id
        and p.user_id = auth.uid()
        and p.removed_at is null
    )
  );
