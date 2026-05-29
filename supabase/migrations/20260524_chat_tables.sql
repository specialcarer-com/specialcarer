-- P0-A4-min: chat backbone tables.
--
-- Booking-scoped messaging: one thread per booking, two participants
-- (seeker + caregiver), append-only message log. Threads are created
-- by the server (service role) when both parties exist on the booking;
-- realtime subscription, auto-archive on booking completion, and the
-- HTTP routes are deferred to A4-bis.

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id)
);

create table chat_participants (
  thread_id uuid not null references chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);

create index on chat_participants(user_id);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index on chat_messages(thread_id, created_at desc);

alter table chat_threads enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;

-- chat_threads: participants can read their threads. Inserts / updates /
-- deletes happen via the service role (no policies declared, so RLS
-- denies by default).
create policy "participants read own threads" on chat_threads
  for select using (
    exists (
      select 1 from chat_participants p
      where p.thread_id = id and p.user_id = auth.uid()
    )
  );

-- chat_participants: a user can see only their own membership rows. The
-- server seeds membership via the service role.
create policy "users read own participation" on chat_participants
  for select using (auth.uid() = user_id);

-- chat_messages: participants read all messages in their thread; they
-- can post only as themselves. Updates / deletes are denied (no policy).
create policy "participants read thread messages" on chat_messages
  for select using (
    exists (
      select 1 from chat_participants p
      where p.thread_id = chat_messages.thread_id
        and p.user_id = auth.uid()
    )
  );

create policy "participants insert own messages" on chat_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from chat_participants p
      where p.thread_id = chat_messages.thread_id
        and p.user_id = auth.uid()
    )
  );
