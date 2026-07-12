-- P1-B9.1: chat attachments (image + PDF).
--
-- Adds the `chat-attachments` private storage bucket and the
-- `chat_attachments` table that records per-message file metadata.
-- Reads always go via short-lived signed URLs from the API; the
-- bucket itself is private and RLS is enforced both on storage.objects
-- and on the metadata row.

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- chat_messages: cheap list-render hint for "this message has files".
-- ---------------------------------------------------------------------------
alter table public.chat_messages
  add column if not exists has_attachments boolean not null default false;

-- ---------------------------------------------------------------------------
-- chat_attachments table
-- ---------------------------------------------------------------------------
create table if not exists public.chat_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.chat_messages(id) on delete cascade,
  storage_path text not null,
  mime_type    text not null,
  size_bytes   integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  width        integer,
  height       integer,
  filename     text not null,
  created_at   timestamptz not null default now()
);

create index if not exists chat_attachments_message_id_idx
  on public.chat_attachments(message_id);

alter table public.chat_attachments enable row level security;

-- Participants of the message's thread can read attachments.
create policy "participants read attachments"
  on public.chat_attachments
  for select using (
    exists (
      select 1
      from public.chat_messages m
      join public.chat_participants p
        on p.thread_id = m.thread_id
      where m.id = chat_attachments.message_id
        and p.user_id = auth.uid()
    )
  );

-- The sender of the message can insert attachments for it.
create policy "sender inserts own attachments"
  on public.chat_attachments
  for insert with check (
    exists (
      select 1
      from public.chat_messages m
      where m.id = chat_attachments.message_id
        and m.sender_id = auth.uid()
    )
  );

-- No update policy = updates denied.
-- No delete policy = deletes via service role only (DELETE endpoint uses admin).

-- ---------------------------------------------------------------------------
-- Trigger: flip has_attachments=true on the parent message after insert.
-- ---------------------------------------------------------------------------
create or replace function public.chat_attachments_mark_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_messages
     set has_attachments = true
   where id = new.message_id
     and has_attachments = false;
  return new;
end;
$$;

drop trigger if exists chat_attachments_mark_parent_trg on public.chat_attachments;
create trigger chat_attachments_mark_parent_trg
  after insert on public.chat_attachments
  for each row execute function public.chat_attachments_mark_parent();

-- ---------------------------------------------------------------------------
-- storage.objects RLS for the `chat-attachments` bucket.
--
-- Only participants of the thread the file belongs to may select/insert.
-- The storage path is `<thread_id>/<message_id>/<uuid>.<ext>`, so we
-- match the first path segment against chat_threads.id and confirm the
-- caller is a participant of that thread.
-- ---------------------------------------------------------------------------
create policy "chat attachments: participants select"
  on storage.objects
  for select using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_participants p
      where p.thread_id = ((storage.foldername(name))[1])::uuid
        and p.user_id = auth.uid()
    )
  );

create policy "chat attachments: participants insert"
  on storage.objects
  for insert with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_participants p
      where p.thread_id = ((storage.foldername(name))[1])::uuid
        and p.user_id = auth.uid()
    )
  );
