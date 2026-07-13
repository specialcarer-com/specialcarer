-- GPS clock-in verification: geofence + photo (Sprint 4.5 v2).
--
-- Extends the Sprint 4 visit_events scaffold (20260712120000_visit_events_v1)
-- with two verification dimensions:
--
--   • Geofence — enforced HARD at 50 m in the clock API. The status + measured
--     distance are recorded here for audit; an admin-only override path records
--     who overrode and why.
--   • Photo — the carer's clock-in selfie is captured, stored in the private
--     `visit-photos` bucket, and its verification is left PENDING. The automated
--     face-match engine is DEFERRED (vendor/cost decision open — Veriff extension
--     vs in-house embedding), so for now ops review photos manually via the admin
--     "Mark verified / Mark failed" action. The verification columns and the
--     service-role write reservation are added now so the future edge function
--     needs no further schema change.
--
-- Additive + idempotent throughout (mirrors the repo migration conventions).

-- ── enum types ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'visit_photo_verification_status') then
    create type visit_photo_verification_status as enum (
      'pending',  -- captured, awaiting a match decision (automated or manual)
      'passed',   -- selfie matched the carer's reference photo
      'failed',   -- selfie did NOT match — advisory only, never blocks clock-in
      'skipped',  -- carer skipped capture (hardware unavailable) — flagged for ops
      'error'     -- capture/upload failed — flagged for ops
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'visit_geofence_status') then
    create type visit_geofence_status as enum (
      'passed',            -- carer within the threshold of the client address
      'failed',            -- outside the threshold (blocked at the API; here only for override audit)
      'no_client_address', -- client has no geocoded location on file (data-quality flag, not a block)
      'no_carer_location', -- no usable carer fix (should not occur — API requires coordinates)
      'override'           -- an admin overrode a geofence failure via the ops-only endpoint
    );
  end if;
end$$;

-- ── columns ───────────────────────────────────────────────────────────────────
-- `photo_url` already exists on visit_events (placeholder from the v1 scaffold);
-- it now stores the object PATH within the private `visit-photos` bucket,
-- i.e. `{carer_id}/{visit_id}/{event_id}.jpg`.
alter table public.visit_events
  add column if not exists photo_verification_status visit_photo_verification_status not null default 'pending',
  add column if not exists photo_similarity_score numeric(5, 4),
  add column if not exists photo_verification_checked_at timestamptz,
  add column if not exists geofence_status visit_geofence_status,
  add column if not exists distance_from_client_metres numeric,
  add column if not exists admin_override_by uuid references public.profiles(id) on delete set null,
  add column if not exists admin_override_reason text,
  add column if not exists admin_override_at timestamptz,
  -- Populated by the manual ops review action ("Mark verified / Mark failed")
  -- until the automated match engine ships.
  add column if not exists verified_by_admin_id uuid references public.profiles(id) on delete set null;

comment on column public.visit_events.photo_url is
  'Object path within the private visit-photos bucket: {carer_id}/{visit_id}/{event_id}.jpg. Null when the carer skipped capture or upload failed.';
comment on column public.visit_events.photo_verification_status is
  'Advisory photo-match state. Defaults to pending on insert; updated by the (future) service-role edge function or by an admin manual review. Never blocks clock-in.';
comment on column public.visit_events.photo_similarity_score is
  'Cosine similarity 0.0000-1.0000 from the automated match engine (DEFERRED — always null until it ships).';
comment on column public.visit_events.geofence_status is
  'Geofence outcome at clock-in. Required (app-enforced) on clock_in, left null on clock_out.';
comment on column public.visit_events.distance_from_client_metres is
  'Great-circle distance between the carer fix and the client address at clock-in, for audit. Null when the client has no geocoded location.';
comment on column public.visit_events.admin_override_by is
  'Admin who overrode a geofence failure via /api/admin/bookings/[id]/geofence-override. Null unless geofence_status = override.';
comment on column public.visit_events.verified_by_admin_id is
  'Admin who set photo_verification_status via the manual ops review action.';

-- Override reason is mandatory (>= 20 chars) whenever an override admin is set.
-- Named + guarded so re-running the migration does not error on an existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'visit_events_override_reason_ck'
  ) then
    alter table public.visit_events
      add constraint visit_events_override_reason_ck check (
        admin_override_by is null
        or (admin_override_reason is not null and length(admin_override_reason) >= 20)
      );
  end if;
end$$;

-- ── RLS: reserve verification-field writes for the service role ────────────────
-- visit_events has NO UPDATE policy for `authenticated`, so under RLS a carer
-- (or any signed-in user) cannot UPDATE any column — including the
-- photo_verification_* fields. Writes to those fields happen only through the
-- service-role client, which bypasses RLS:
--   • today: the admin manual-review route (/api/admin/visit-events/[id]/photo-review)
--   • future: the verify-visit-photo edge function
-- Postgres RLS is row-level, not column-level, so the "only these columns"
-- guarantee is enforced at the application layer (the routes above write only
-- photo_verification_status / photo_similarity_score /
-- photo_verification_checked_at / verified_by_admin_id). This comment documents
-- the intent; no authenticated UPDATE policy is added, which is what keeps
-- carers out. The existing INSERT / SELECT policies from v1 are unchanged.

-- ── storage bucket: visit-photos (private) ─────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', false)
on conflict (id) do nothing;

-- Carers upload only under their own {carer_id}/… prefix.
drop policy if exists "visit-photos carer upload own" on storage.objects;
create policy "visit-photos carer upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'visit-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Carers can read back their own uploads.
drop policy if exists "visit-photos carer read own" on storage.objects;
create policy "visit-photos carer read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'visit-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can read every visit photo.
drop policy if exists "visit-photos admin read all" on storage.objects;
create policy "visit-photos admin read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'visit-photos'
    and is_admin(auth.uid())
  );

-- Families can read photos for their own care recipient's visits. The path's
-- second segment is the visit (booking) id; the reader must own that booking.
drop policy if exists "visit-photos family read own recipient" on storage.objects;
create policy "visit-photos family read own recipient"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'visit-photos'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[2]
        and b.seeker_id = auth.uid()
    )
  );
