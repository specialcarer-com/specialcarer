-- P0-A1: push_tokens
-- Per-user device push tokens for APNs / Expo / FCM. Row-level access
-- restricted to the owning user; the dispatcher uses the service role to
-- read tokens across users when fanning out events.

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null,
  device_id text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

-- Partial index for the dispatcher hot path: "active tokens for this user".
create index if not exists push_tokens_user_active_idx
  on push_tokens (user_id)
  where revoked_at is null;

alter table push_tokens enable row level security;

-- Owning user can read/insert/update/delete their own rows. Service role
-- (used by the dispatcher) bypasses RLS as usual.
drop policy if exists "users manage own tokens" on push_tokens;
create policy "users manage own tokens" on push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
