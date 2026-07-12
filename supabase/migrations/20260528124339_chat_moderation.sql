-- P1-B10: chat moderation.
--
-- Adds a per-message flag table (chat_message_flags) that captures both
-- auto-detected off-platform/off-channel attempts AND user-submitted
-- reports. Admin queue queries (e.g. all open flags newest-first) are
-- the hot read path, so thread_id is denormalised onto the row and an
-- index covers (status, created_at desc) where status = 'open'.
--
-- Also extends chat_messages with a `flagged_at` marker (lazy "is this
-- under review?" stamp set when the first flag arrives on a message)
-- and chat_participants with two enforcement fields (muted_until,
-- banned_at) so the existing per-thread participant row can carry the
-- admin action without a parallel table.
--
-- Migration is idempotent so it's safe to re-run against environments
-- that may have been hand-patched.

-- ---------------------------------------------------------------------
-- chat_message_flags
-- ---------------------------------------------------------------------
create table if not exists chat_message_flags (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  -- Denormalised so the admin queue can filter / join by thread without
  -- bouncing through chat_messages on every query.
  thread_id uuid not null references chat_threads(id) on delete cascade,
  -- NULL when the row was inserted by the auto-detector (service role).
  flagged_by uuid references auth.users(id) on delete set null,
  reason text not null check (reason in (
    'off_platform_contact',
    'off_platform_payment',
    'harassment',
    'spam',
    'safeguarding',
    'other'
  )),
  auto_detected boolean not null default false,
  -- Which named regex matched (only meaningful when auto_detected=true).
  detected_pattern text,
  status text not null default 'open' check (status in (
    'open',
    'resolved_no_action',
    'resolved_warn',
    'resolved_ban',
    'resolved_safeguarding'
  )),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  -- Free-form admin notes. Reporters' free-text notes are stored here
  -- on insert too (for user reports) — the admin/system distinction is
  -- carried by auto_detected + flagged_by.
  admin_notes text,
  created_at timestamptz not null default now()
);

-- Hot path: admin queue = open flags, newest first. Partial index so
-- the resolved tail doesn't bloat the queue scan.
create index if not exists chat_message_flags_open_idx
  on chat_message_flags (status, created_at desc)
  where status = 'open';

create index if not exists chat_message_flags_thread_idx
  on chat_message_flags (thread_id);

create index if not exists chat_message_flags_message_idx
  on chat_message_flags (message_id);

-- ---------------------------------------------------------------------
-- chat_messages.flagged_at — set on first flag, leaves a cheap marker
-- for "is this message under review?" without a JOIN.
-- ---------------------------------------------------------------------
alter table chat_messages
  add column if not exists flagged_at timestamptz;

-- ---------------------------------------------------------------------
-- chat_participants enforcement — admin actions stamp these.
-- ---------------------------------------------------------------------
alter table chat_participants
  add column if not exists muted_until timestamptz,
  add column if not exists banned_at timestamptz;

-- ---------------------------------------------------------------------
-- RLS on chat_message_flags.
--
-- Reads + updates: admin-only (mirrors the forum_reports pattern —
-- admins are identified by `profiles.role = 'admin'`).
-- Inserts: a thread participant may insert a flag where they are the
-- reporter (flagged_by = auth.uid()). Auto-detector inserts go through
-- the service role, which bypasses RLS — no policy needed for that.
-- ---------------------------------------------------------------------
alter table chat_message_flags enable row level security;

drop policy if exists "admins read flags" on chat_message_flags;
create policy "admins read flags" on chat_message_flags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "admins update flags" on chat_message_flags;
create policy "admins update flags" on chat_message_flags
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

drop policy if exists "participants insert flag" on chat_message_flags;
create policy "participants insert flag" on chat_message_flags
  for insert with check (
    flagged_by = auth.uid()
    and exists (
      select 1 from chat_participants p
      where p.thread_id = chat_message_flags.thread_id
        and p.user_id = auth.uid()
    )
  );
