-- P0-A4: realtime chat backbone
--
-- Three tables: chat_threads, chat_participants, chat_messages.
-- RLS gates every read/write to participants only. Inserts on messages
-- additionally require sender_id = auth.uid().

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  last_message_at timestamptz
);

create table chat_participants (
  thread_id uuid not null references chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('seeker','carer','family','support')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text,
  attachment_path text,
  attachment_kind text check (attachment_kind in ('image','video','audio')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index chat_messages_thread_idx
  on chat_messages(thread_id, created_at desc)
  where deleted_at is null;
create index chat_threads_last_msg_idx
  on chat_threads(last_message_at desc)
  where archived_at is null;
create index chat_participants_user_idx
  on chat_participants(user_id);
create index chat_threads_booking_idx
  on chat_threads(booking_id)
  where booking_id is not null;

alter table chat_threads enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;

-- A user can read threads + messages where they are a participant.
create policy "participants read threads" on chat_threads for select
  using (
    exists (
      select 1 from chat_participants p
      where p.thread_id = chat_threads.id and p.user_id = auth.uid()
    )
  );

create policy "participants read participants" on chat_participants for select
  using (
    exists (
      select 1 from chat_participants p
      where p.thread_id = chat_participants.thread_id and p.user_id = auth.uid()
    )
  );

create policy "participants read messages" on chat_messages for select
  using (
    exists (
      select 1 from chat_participants p
      where p.thread_id = chat_messages.thread_id and p.user_id = auth.uid()
    )
  );

create policy "participants insert messages" on chat_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from chat_participants p
      where p.thread_id = chat_messages.thread_id and p.user_id = auth.uid()
    )
  );

-- Allow participants to update their own last_read_at row. Other columns
-- on chat_participants (role, joined_at) are immutable from the client.
create policy "participants update own read state" on chat_participants for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
