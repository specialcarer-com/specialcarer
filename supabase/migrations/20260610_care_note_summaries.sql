-- Gap 29 (10 Jun 2026): AI summarisation of long carer shift notes.
--
-- When a carer writes a long care-journal note (>= 200 chars) we generate a
-- short "Key points" bullet summary (gpt-4o-mini) that the family sees on the
-- timeline. Summaries are cached one-per-note so we only pay the LLM cost
-- once; every subsequent render (any viewer, any device) is a cache read.
--
-- Inserts are service-role only — the summarise route runs the LLM call
-- server-side and writes the row. Readers get SELECT via RLS that mirrors the
-- visibility of the underlying care_journal_entries row (author, the family
-- member it concerns, or any party on the linked booking).

create table if not exists public.care_note_summaries (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null
    references public.care_journal_entries(id) on delete cascade,
  summary text not null check (length(summary) between 1 and 4000),
  model text not null,
  prompt_version text not null default 'v1',
  created_at timestamptz not null default now(),
  -- One summary per note.
  constraint care_note_summaries_note_unique unique (note_id)
);

create index if not exists care_note_summaries_note_idx
  on public.care_note_summaries(note_id);

-- ----------------------------------------------------------------------------
-- RLS — mirror the SELECT visibility of the parent care_journal_entries row.
-- ----------------------------------------------------------------------------
alter table public.care_note_summaries enable row level security;

-- SELECT: anyone who can read the underlying note can read its summary.
--   * the note's author (carer or seeker who wrote it)
--   * the about_user_id (the family member the note concerns)
--   * any party (seeker or caregiver) on the note's linked booking
drop policy if exists "readers of a note read its summary"
  on public.care_note_summaries;
create policy "readers of a note read its summary"
  on public.care_note_summaries for select
  to authenticated
  using (
    exists (
      select 1
      from public.care_journal_entries e
      where e.id = care_note_summaries.note_id
        and (
          e.author_id = auth.uid()
          or e.about_user_id = auth.uid()
          or (
            e.booking_id is not null and exists (
              select 1 from public.bookings b
              where b.id = e.booking_id
                and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
            )
          )
        )
    )
  );

-- No INSERT/UPDATE/DELETE policy: writes flow through the service role in the
-- summarise route, which bypasses RLS.
