-- Notifications table — minimal, kind-tagged inbox per user.
-- Used today by the instant-booking flow so carers see a "new instant
-- request" item in their dashboard alongside the email. Designed to
-- generalise: any feature can write a row with a `kind` and a `payload`.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                    -- e.g. 'instant_booking_request'
  title text not null,
  body text,
  link_url text,                         -- where to deep-link in the app
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_id_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Users can read their own notifications.
drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications
  for select using (auth.uid() = user_id);

-- Users can mark their own notifications read.
drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update using (auth.uid() = user_id);

-- Inserts are server-side only (service role bypasses RLS).
-- We do NOT expose an insert policy to authenticated users.
