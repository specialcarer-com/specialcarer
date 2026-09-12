-- ============================================================================
-- SpecialCarer — C3b / Notifiable-Events Storage Bucket
--
-- Adds a private Supabase Storage bucket `notifiable-events` for
-- attachments filed against duty-of-candour + notifiable-event
-- casework rows. Companion migration to
-- 20260912170000_notifiable_events.sql (PR #222 / C3a foundation) —
-- the schema landed there; this migration adds the storage layer
-- needed by C3b's admin UI attachment upload endpoint.
--
-- Bucket policy
-- ─────────────
-- Private (public=false). 10 MiB per file. RLS on `storage.objects`
-- restricts SELECT / INSERT to:
--   - Admins (today `role='admin'`; when RM/NI roles are added,
--     extend the OR-list — grep for `notifiable_events_storage_admin`).
--   - Reporters of the parent event may SELECT their own uploads —
--     enforced by joining storage.objects.name to
--     notifiable_event_actions.attachment_path back to the parent
--     event's reported_by.
--
-- No UPDATE / DELETE policies by design (append-only files, matches
-- the append-only shape of notifiable_event_actions). If a file
-- needs to be removed for GDPR reasons, use a service-role tool and
-- record the erasure explicitly.
--
-- Freeze-respectful / additive-only
-- ─────────────────────────────────
-- * `insert ... on conflict do nothing` — idempotent bucket create.
-- * Fresh policy names — no `drop policy if exists` (which trips
--   PR #220's pre-flight destructive-migration gate; see the header
--   comment on 20260912170000_notifiable_events.sql for the pattern
--   this follows).
-- * No touch of the C3a tables — only `storage.buckets` +
--   `storage.objects` policies are added.
-- ============================================================================

-- ── 1. Bucket ───────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('notifiable-events', 'notifiable-events', false, 10485760)
on conflict (id) do nothing;

-- ── 2. RLS policies on storage.objects ──────────────────────────────────────

-- Admin can SELECT any file in the bucket.
-- TODO(rm-ni-split): extend the OR-list to include 'rm' / 'ni' when
-- those roles are introduced — grep for `notifiable_events_storage_admin_read`.
create policy notifiable_events_storage_admin_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'notifiable-events'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin')
    )
  );

-- Admin can INSERT files into the bucket.
-- TODO(rm-ni-split): extend to 'rm' when introduced.
create policy notifiable_events_storage_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'notifiable-events'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin')
    )
  );

-- Reporter of the parent event can SELECT files they uploaded for
-- that event. The file path convention is `{event_id}/{ISO}_{name}`,
-- so `(storage.foldername(name))[1]` extracts the event id. We then
-- confirm the caller is the reporter on the parent notifiable_events
-- row. This covers both files uploaded by the reporter themselves
-- and files uploaded by admins on the reporter's case — the latter
-- is a deliberate policy call so families can request supporting
-- documents from their filed case.
create policy notifiable_events_storage_reporter_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'notifiable-events'
    and exists (
      select 1
      from public.notifiable_events e
      where e.id::text = (storage.foldername(name))[1]
        and e.reported_by = auth.uid()
    )
  );

-- NO UPDATE / DELETE policies for notifiable-events storage objects
-- by design (append-only). The absence blocks mutations for both
-- anon and authenticated roles; only the service-role key can write,
-- and by convention (see src/app/api/candour/[id]/attachment/route.ts)
-- it only ever uploads.
