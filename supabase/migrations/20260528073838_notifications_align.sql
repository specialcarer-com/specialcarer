-- P1-drift-recovery: align the notifications table with the canonical
-- shape declared by 20260524_notifications.sql.
--
-- Production was sitting on the earlier 20260507 shape (columns `kind`
-- and `link_url`, nullable `body`) while application code was already
-- writing the newer shape (`type` / `deeplink`, NOT NULL `body`).
-- This file is the recorded, idempotent version of the SQL that was
-- applied by hand on 2026-05-28 via the Supabase management API to
-- bring prod into line.
--
-- Idempotency notes
--   * Renames are wrapped in DO blocks that only fire when the source
--     column still exists, so re-running against an already-migrated
--     database is a no-op rather than an error.
--   * Indexes and policies use IF EXISTS / IF NOT EXISTS guards.

-- ---------------------------------------------------------------------
-- Column renames (only fire if the old column still exists).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'kind'
  ) then
    alter table public.notifications rename column kind to type;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'link_url'
  ) then
    alter table public.notifications rename column link_url to deeplink;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- body is NOT NULL in the canonical schema. Backfill any NULLs first
-- so the constraint can be enforced safely.
-- ---------------------------------------------------------------------
update public.notifications set body = '' where body is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'body'
      and is_nullable = 'YES'
  ) then
    alter table public.notifications alter column body set not null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Indexes: drop old names, create canonical names.
-- ---------------------------------------------------------------------
drop index if exists public.notifications_user_id_created_at_idx;
drop index if exists public.notifications_user_id_unread_idx;

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS policies: rename to the canonical names.
-- ---------------------------------------------------------------------
drop policy if exists notifications_self_read on public.notifications;
drop policy if exists notifications_self_update on public.notifications;
drop policy if exists "users read own notifications" on public.notifications;
drop policy if exists "users update own read state" on public.notifications;

create policy "users read own notifications" on public.notifications
  for select using (auth.uid() = user_id);

create policy "users update own read state" on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
