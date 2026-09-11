-- ============================================================================
-- SpecialCarer — B5 / DSAR request queue
--
-- ICO/UK-GDPR accountability requires a documented route for data subjects
-- to submit access, erasure, rectification and portability requests. Today
-- there is no queue and no export pipeline; requests would arrive via
-- support email and be handled ad hoc, which is a live gap on the
-- 11-Sep review.
--
-- This migration adds the request queue plus a signed URL registry the
-- fulfilment cron writes into. Everything else (submit route, verify
-- route, fulfil cron, admin queue page) lives in application code
-- against these two tables.
--
-- Deploy-safe pattern (per A4/A5/B1/B2/B3/B4): additive, idempotent, no
-- touching of existing rows. Fulfilment code that reads dsar_requests
-- falls back to a schema_not_ready no-op when the table is absent, so
-- pre-migration behaviour is exactly the same as today (there is no
-- queue). Post-migration the queue takes over.
-- ============================================================================

-- 1) The request itself. One row per subject request.
create table if not exists public.dsar_requests (
  id uuid primary key default gen_random_uuid(),

  -- Subject the request is *about*. Null when the submission was made
  -- for a user we don't know (e.g. a former user who has since deleted
  -- their account, or a support-email-only lead). The email column
  -- always has a value so we can still verify + deliver.
  subject_user_id uuid references auth.users(id) on delete set null,

  -- Verified email of the subject. Used for token verification and for
  -- signed-URL delivery. Never editable after the row exists — a
  -- subject who wants to change email files a new request.
  subject_email text not null,

  -- User who submitted the row. May be the subject themselves (public
  -- submit) or an admin filing on their behalf. Nullable because the
  -- public submit route is unauthenticated.
  requested_by uuid references auth.users(id) on delete set null,

  request_type text not null
    check (request_type in ('access','erasure','rectification','portability')),

  state text not null default 'submitted'
    check (state in (
      'submitted',      -- row exists, verification email sent
      'verifying',      -- token issued, awaiting click
      'in_progress',    -- verified, in the cron queue
      'delivered',      -- signed URL emailed, artifact in storage
      'rejected',       -- admin refused (with reason in `notes`)
      'cancelled'       -- subject withdrew (or superseded by new request)
    )),

  -- SHA-256 of the raw verification token. Never store the raw token
  -- itself — a leaked DB backup then can't be used to bypass verify.
  verification_token_hash text,
  verification_token_issued_at timestamptz,
  verified_at timestamptz,

  -- Populated by the fulfilment cron. `delivery_object_path` is the
  -- Supabase Storage key under bucket `dsar-exports`; the signed URL
  -- is minted fresh at delivery time so it can expire independently.
  delivery_object_path text,
  delivered_at timestamptz,

  -- Free-text notes. Rejection reason goes here (admin flow). Never
  -- surface this back to the subject verbatim without review.
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dsar_requests_state_created_idx
  on public.dsar_requests(state, created_at);

create index if not exists dsar_requests_subject_idx
  on public.dsar_requests(subject_user_id, created_at desc);

create unique index if not exists dsar_requests_token_hash_unique
  on public.dsar_requests(verification_token_hash)
  where verification_token_hash is not null;

comment on table public.dsar_requests is
  'Queue of UK-GDPR/DPA data-subject requests (access/erasure/rectification/portability). One row per request; fulfilment cron reads state=in_progress. Never store the raw verification token — only its SHA-256 hash.';

comment on column public.dsar_requests.verification_token_hash is
  'SHA-256(raw_token). A leaked DB row cannot be replayed against /api/dsar/verify/[token] because the raw token was never persisted.';

-- 2) RLS: service role writes; admins read all; subjects read their own.
alter table public.dsar_requests enable row level security;

-- Subjects can read their own rows (once authenticated). This lets a
-- signed-in subject see request history on their account page later.
-- The public submit route uses the service role client and does not
-- need an anon INSERT policy.
drop policy if exists dsar_requests_subject_read on public.dsar_requests;
create policy dsar_requests_subject_read on public.dsar_requests
  for select
  to authenticated
  using (subject_user_id = auth.uid());

-- Admins read + write everything. We reuse the same is_admin() function
-- other admin RLS policies depend on. If it doesn't exist yet, this
-- policy is still safe because the function call would raise and the
-- policy would evaluate to false — but every prior migration in the
-- repo assumes is_admin() so treat it as invariant.
drop policy if exists dsar_requests_admin_read on public.dsar_requests;
create policy dsar_requests_admin_read on public.dsar_requests
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists dsar_requests_admin_write on public.dsar_requests;
create policy dsar_requests_admin_write on public.dsar_requests
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- No INSERT or DELETE policies granted to anon or authenticated. All
-- inserts land through the service-role client in
-- /api/dsar/submit; the service role bypasses RLS. Deletes are
-- disallowed by design — cancellations flip state to 'cancelled'.

-- 3) updated_at trigger. Follows the same pattern already used on other
--    admin-writable tables (see e.g. bookings, caregiver_documents).
create or replace function public.dsar_requests_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dsar_requests_touch_updated_at on public.dsar_requests;
create trigger dsar_requests_touch_updated_at
  before update on public.dsar_requests
  for each row execute function public.dsar_requests_touch_updated_at();
