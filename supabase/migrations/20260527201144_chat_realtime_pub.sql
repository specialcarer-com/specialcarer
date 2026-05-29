-- P0-A4-bis-1: enable Supabase realtime for chat_messages.
--
-- The browser subscribes via postgres_changes; that requires the table
-- to be in the supabase_realtime publication. Idempotent — re-running
-- this migration in any environment is a no-op if the table is already
-- in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;
