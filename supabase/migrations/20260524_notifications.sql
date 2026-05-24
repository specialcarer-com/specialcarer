-- P0-A3: notifications inbox table.
--
-- A per-user feed populated by the push dispatcher (PR-A2) via the
-- service role. Users can read their own rows and update them to mark
-- as read; inserts are restricted to the service role (no insert
-- policy is declared, which deny-by-default under RLS).

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  deeplink text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Unread-feed index — supports the bell badge count and the inbox
-- filter for unread items. Partial index keeps it tiny.
create index notifications_user_unread_idx
  on notifications(user_id, created_at desc)
  where read_at is null;

-- Full-feed index — supports keyset pagination of the inbox.
create index notifications_user_recent_idx
  on notifications(user_id, created_at desc);

alter table notifications enable row level security;

create policy "users read own notifications" on notifications
  for select using (auth.uid() = user_id);

create policy "users update own read state" on notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No insert / delete policies: inserts come from the service role
-- (the dispatcher in src/lib/notifications/server.ts), and rows are
-- retained for the user's history.
