-- P1-B9.4: chat thread pinning + auto-archive refinements.
--
-- Adds three additive columns to chat_threads:
--   * pinned          — sticky-to-top flag, defaults false
--   * archived_reason — short string explaining why archive fired
--                       (system action sets e.g. "booking completed"
--                       and an admin unarchive nulls it back out)
--   * archived_by     — uuid of the admin who archived (NULL for the
--                       system path; only the admin/unarchive routes
--                       will ever populate it)
--
-- All three are nullable / defaulted, so existing rows are untouched.
-- No destructive change to data.

alter table chat_threads
  add column pinned boolean not null default false,
  add column archived_reason text,
  add column archived_by uuid references auth.users(id) on delete set null;

-- The thread list sorts pinned first then by recency. The chat thread
-- list is keyed off chat_participants (per-user), so this partial index
-- on `pinned = true` keeps the sticky group cheap to fetch without
-- bloating the table for the common (unpinned) case.
create index chat_threads_pinned_idx on chat_threads (pinned) where pinned = true;

-- ---------------------------------------------------------------------
-- RLS: participants can flip their thread's `pinned` flag.
--
-- The existing chat_threads policy is SELECT-only for participants; all
-- writes route through the service role. Pinning is the first
-- participant-driven write on this table, so add a narrow UPDATE policy
-- that allows a participant to update their own thread *only*. The
-- WITH CHECK guards against a participant flipping unrelated columns —
-- the PATCH /pin route only sets `pinned`, but RLS is defense-in-depth.
--
-- Admin unarchive runs through the service role and bypasses RLS, so it
-- doesn't need its own policy.
-- ---------------------------------------------------------------------
create policy "participants pin own thread" on chat_threads
  for update using (
    exists (
      select 1 from chat_participants p
      where p.thread_id = chat_threads.id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from chat_participants p
      where p.thread_id = chat_threads.id
        and p.user_id = auth.uid()
    )
  );
