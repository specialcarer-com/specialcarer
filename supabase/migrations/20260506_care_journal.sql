-- ============================================================================
-- SpecialCarer · Care Journal
-- Short notes, photos, and mood tags written by carers (or seekers) about a
-- visit. Family members on the booking can read; carer can write/edit/delete
-- their own entries within a 24h window. Optionally tied to a specific booking.
--
-- RLS model:
--   - INSERT: any authenticated user can insert their own (author_id=auth.uid).
--             If booking_id is set, they must be a party on that booking.
--   - SELECT: visible to author + booking parties (seeker, caregiver).
--             When booking_id is null, only author sees it (private notes).
--   - UPDATE/DELETE: author only, within 24h of created_at.
--
-- Photos:
--   Storage bucket "journal-photos" (private). Object path convention:
--     {auth.uid}/{entry_id}/{filename}
--   The `photos` column holds the list of object paths (NOT signed URLs).
--   The app calls `createSignedUrl()` at read time.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Entry kind enum
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'journal_kind') then
    create type journal_kind as enum (
      'note',         -- general written update
      'meal',         -- meal / hydration
      'medication',   -- medication given (NOT clinical advice — just a log)
      'activity',     -- walk, game, outing
      'mood',         -- mood-only entry
      'incident'      -- something to flag (fall, refusal, distress)
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'journal_mood') then
    create type journal_mood as enum (
      'calm',
      'engaged',
      'tired',
      'unsettled',
      'distressed'
    );
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- 2. Table
-- ----------------------------------------------------------------------------
create table if not exists public.care_journal_entries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  -- Optional convenience: when booking_id is null we still want to know whose
  -- visit this is "about" (e.g. the seeker who hired the carer). Set to the
  -- seeker_id when present; carers writing private notes can leave it null.
  about_user_id uuid references auth.users(id) on delete set null,

  kind journal_kind not null default 'note',
  mood journal_mood,
  body text not null check (length(body) between 1 and 2000),
  -- Storage object paths (NOT URLs). Empty array = no photos.
  photos text[] not null default '{}'
    check (array_length(photos, 1) is null or array_length(photos, 1) <= 6),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists care_journal_entries_author_idx
  on public.care_journal_entries(author_id, created_at desc);
create index if not exists care_journal_entries_booking_idx
  on public.care_journal_entries(booking_id, created_at desc)
  where booking_id is not null;
create index if not exists care_journal_entries_about_idx
  on public.care_journal_entries(about_user_id, created_at desc)
  where about_user_id is not null;

-- updated_at trigger
create or replace function public.touch_journal_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_journal_touch on public.care_journal_entries;
create trigger trg_journal_touch
  before update on public.care_journal_entries
  for each row execute function public.touch_journal_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
alter table public.care_journal_entries enable row level security;

-- INSERT: must be the author. If booking_id is given, must be a party on it.
drop policy if exists "author can insert journal entry" on public.care_journal_entries;
create policy "author can insert journal entry"
  on public.care_journal_entries for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      booking_id is null
      or exists (
        select 1 from public.bookings b
        where b.id = booking_id
          and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
      )
    )
  );

-- SELECT:
--   * author always
--   * if booking_id set: any party on that booking
--   * if about_user_id set: that user (the family member it concerns)
drop policy if exists "parties can read journal entry" on public.care_journal_entries;
create policy "parties can read journal entry"
  on public.care_journal_entries for select
  to authenticated
  using (
    auth.uid() = author_id
    or auth.uid() = about_user_id
    or (
      booking_id is not null and exists (
        select 1 from public.bookings b
        where b.id = booking_id
          and (b.seeker_id = auth.uid() or b.caregiver_id = auth.uid())
      )
    )
  );

-- UPDATE: author only, within 24h
drop policy if exists "author can edit recent journal entry" on public.care_journal_entries;
create policy "author can edit recent journal entry"
  on public.care_journal_entries for update
  to authenticated
  using (
    auth.uid() = author_id
    and created_at > now() - interval '24 hours'
  )
  with check (auth.uid() = author_id);

-- DELETE: author only, within 24h
drop policy if exists "author can delete recent journal entry" on public.care_journal_entries;
create policy "author can delete recent journal entry"
  on public.care_journal_entries for delete
  to authenticated
  using (
    auth.uid() = author_id
    and created_at > now() - interval '24 hours'
  );

-- ----------------------------------------------------------------------------
-- 4. Storage bucket: journal-photos
-- Private. Path convention: {auth.uid}/{entry_id}/{filename}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('journal-photos', 'journal-photos', false)
on conflict (id) do nothing;

-- Storage RLS: allow authenticated users to write under their own uid prefix.
drop policy if exists "authenticated can upload own journal photos" on storage.objects;
create policy "authenticated can upload own journal photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'journal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read: only server-side via signed URL (service role bypass), so no public policy here.
-- This means clients fetch through a server action that creates a signed URL after
-- verifying the user has SELECT on the corresponding entry via the table RLS.

-- Allow author to delete their own photos (within 24h is enforced at app level
-- via the entry's update window — bucket policy is just an ownership check).
drop policy if exists "authenticated can delete own journal photos" on storage.objects;
create policy "authenticated can delete own journal photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'journal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
