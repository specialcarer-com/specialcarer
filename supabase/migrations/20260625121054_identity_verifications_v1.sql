-- ============================================================================
-- SpecialCarers — Identity Verifications v1 (Veriff identity verification)
--
-- Users (family + carer) verify their identity via Veriff's hosted flow. We
-- create a Veriff session on demand and persist its lifecycle here. The Veriff
-- session id is our join key; `vendor_data` echoes our internal user reference
-- back to us on webhooks.
--
-- Gated by the IDENTITY_VERIFICATION_ENABLED feature flag at the application
-- layer; with the flag off this table is simply never written to. Mirrors the
-- interview_rooms_v1 / care_journal conventions.
-- Idempotent: create-if-not-exists throughout.
-- ============================================================================

create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  veriff_session_id text not null unique,
  status text not null check (
    status in (
      'created',
      'started',
      'submitted',
      'approved',
      'declined',
      'resubmission_requested',
      'review',
      'expired',
      'abandoned'
    )
  ),
  decision_json jsonb,
  vendor_data text,                       -- our internal reference (user id)
  verification_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identity_verifications_user_idx
  on public.identity_verifications(user_id);
create index if not exists identity_verifications_session_idx
  on public.identity_verifications(veriff_session_id);

comment on table public.identity_verifications is
  'Veriff identity verification sessions + decisions. One row per Veriff session, joined on veriff_session_id. Only written when IDENTITY_VERIFICATION_ENABLED is on.';

-- ----------------------------------------------------------------------------
-- updated_at trigger (mirrors public.touch_journal_updated_at in care_journal)
-- ----------------------------------------------------------------------------
create or replace function public.touch_identity_verifications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_identity_verifications_touch
  on public.identity_verifications;
create trigger trg_identity_verifications_touch
  before update on public.identity_verifications
  for each row execute function public.touch_identity_verifications_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: a user may read their own rows. All writes go through the service-role
-- (admin) client from the API routes, which bypasses RLS — so there is
-- deliberately no INSERT/UPDATE policy for authenticated users.
-- ----------------------------------------------------------------------------
alter table public.identity_verifications enable row level security;

drop policy if exists "user can read own identity verification"
  on public.identity_verifications;
create policy "user can read own identity verification"
  on public.identity_verifications for select
  to authenticated
  using (auth.uid() = user_id);
