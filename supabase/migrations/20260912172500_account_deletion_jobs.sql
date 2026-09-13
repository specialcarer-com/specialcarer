-- ============================================================================
-- SpecialCarer — Phase C5 / Self-service account-deletion jobs table
--
-- One row per user-initiated GDPR Article-17 deletion. The row is the
-- durable state carrier for a multi-stage flow:
--
--   submitted        → row created, verification email sent
--   verifying        → same as submitted, kept explicit so the state
--                      machine reads as a chain rather than a bag
--   blocked_*        → the eligibility check flagged an unresolved
--                      obligation (active booking, open dispute, open
--                      candour case, unpaid payout) either at submit
--                      time or at token-verify time
--   in_progress      → verified, cron worker owns the row
--   deferred         → cron hit a transient error; retry_count < 5 and
--                      resume_after is set to the next attempt time
--   complete         → erasure handler returned success, audit_digest
--                      written
--   cancelled        → user cancelled before verification (or admin
--                      force-cancelled)
--
-- Reuses PR #210's erasure handler (src/lib/dsar/erase.ts) and audit
-- table (dsar_erasure_audit). This migration adds only the queue table
-- for self-service deletion — nothing else needs to move.
--
-- Additive-only. No DROP POLICY (workflow #220 gate). Handler + route
-- code catches 42P01 and degrades to schema_not_ready so pre-migration
-- environments behave as today (no deletion route).
--
-- TODO(rm-ni-split): the admin_write policy currently binds to
-- profiles.role='admin'. When Relationship Manager (RM) and Nominated
-- Individual (NI) roles land, extend the WHERE clause via a follow-up
-- migration — RM should be able to force-cancel / override, NI should
-- co-sign complete transitions for high-risk categories.
-- ============================================================================

create table if not exists public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),

  -- The subject. ON DELETE CASCADE means if the auth.users row is
  -- torn down for any other reason (admin hard-delete, GDPR reject),
  -- the queue row disappears with it — a dangling queue row would
  -- otherwise let the worker try to erase a non-existent subject and
  -- fail loudly forever.
  user_id uuid not null references public.profiles(id) on delete cascade,

  requested_at timestamptz not null default now(),

  -- SHA-256 of the token embedded in the verification email. Raw
  -- token is never persisted — mirrors src/lib/dsar/token.ts. Nullable
  -- after successful verification so the token cannot be replayed even
  -- if the DB is later exfiltrated.
  verification_token_hash text not null,

  -- 24 hours after requested_at. Enforced in application code; the
  -- column exists so the worker + UI can render "expires in Xh".
  verification_token_expires_at timestamptz not null,

  verified_at timestamptz,

  state text not null default 'submitted' check (state in (
    'submitted',
    'verifying',
    'blocked_active_booking',
    'blocked_active_dispute',
    'blocked_open_notifiable_event',
    'blocked_outstanding_payout',
    'blocked_other',
    'in_progress',
    'deferred',
    'complete',
    'cancelled'
  )),

  -- Populated on any transition into a blocked_* state. Multiple
  -- blockers can co-exist; state stores the primary one (used for
  -- the page copy), blocker_codes stores all of them for the UI list.
  blocker_codes text[],

  -- Free text. For blocked_* rows: a plain-English message the UI
  -- can render verbatim. For deferred rows on error: error.message
  -- truncated to 500 chars. Also carries the sentinel
  -- 'max_retries_exhausted' when retry_count >= 5.
  blocked_reason text,

  -- Worker skip-until timestamp. Rows with resume_after in the
  -- future are skipped by the batch query. NULL means "eligible
  -- now".
  resume_after timestamptz,

  retry_count integer not null default 0,

  -- The retention-manifest fingerprint recorded by the erasure
  -- handler (see erase.ts). Persisted here so the user's completion
  -- notice can quote it back — matches the DSAR audit-digest pattern.
  manifest_version text,

  -- SHA-256 short digest of the audit rows the handler emitted.
  -- Matches DsarErasureResult.digest. Used in the completion email.
  audit_digest text,

  completed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_deletion_jobs is
  'One row per user-initiated Article-17 account deletion. Durable state carrier for the submit → verify → cron-worker pipeline. Reuses PR #210 (dsar/erase.ts + dsar_erasure_audit) for the actual data-erasure step.';

comment on column public.account_deletion_jobs.state is
  'State machine: submitted → verifying → (in_progress | blocked_*) → (complete | deferred | cancelled). deferred can loop back to in_progress via resume_after, or terminate permanently with blocked_reason=max_retries_exhausted.';

comment on column public.account_deletion_jobs.blocker_codes is
  'All blocker codes surfaced by src/lib/gdpr/deletion-eligibility.ts. Populated on blocked_* transitions; NULL otherwise. First code is echoed into state; full list drives the UI list.';

comment on column public.account_deletion_jobs.verification_token_hash is
  'SHA-256 of the token mailed to the user. Raw token never stored. Nullable at verification time so a leaked backup cannot be replayed to complete a queued job.';

comment on column public.account_deletion_jobs.audit_digest is
  'Short SHA-256 digest returned by handleDsarErase. Written on the state=complete transition. Users can quote this back if they claim the erasure summary was tampered with.';

-- ── Indexes ───────────────────────────────────────────────────────────────

-- User sees their own history sorted newest-first on the danger-zone page.
create index if not exists account_deletion_jobs_user_idx
  on public.account_deletion_jobs (user_id, requested_at desc);

-- Cron pickup index. Partial index over the only two states the worker
-- looks at, so the scan cost stays constant as complete/cancelled rows
-- accumulate. NULLS FIRST puts rows without resume_after ahead of
-- scheduled retries, which is exactly the priority the worker wants.
create index if not exists account_deletion_jobs_worker_idx
  on public.account_deletion_jobs (state, resume_after nulls first, requested_at)
  where state in ('in_progress', 'deferred');

-- Token lookup for GET /api/account/delete/verify/[token].
create index if not exists account_deletion_jobs_verification_idx
  on public.account_deletion_jobs (verification_token_hash);

-- ── Row Level Security ────────────────────────────────────────────────────

alter table public.account_deletion_jobs enable row level security;

-- SELECT: user reads only their own rows. The danger-zone page uses
-- this to render the status tracker.
create policy account_deletion_jobs_user_read on public.account_deletion_jobs
  for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: submit endpoint runs under the user's session; enforce the
-- row belongs to them. The route uses createAdminClient() today but
-- the policy is defensive against a future switch to the user client.
create policy account_deletion_jobs_user_insert on public.account_deletion_jobs
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE (user cancellation): authenticated user can UPDATE their own
-- row. Postgres RLS cannot cleanly express "only when OLD.state is in
-- (submitted, verifying) AND NEW.state = cancelled" — that guard is
-- enforced in the cancel route handler (see
-- src/app/api/account/delete/cancel/route.ts). This policy is the
-- backstop that keeps a user from mutating anyone else's row.
create policy account_deletion_jobs_user_cancel on public.account_deletion_jobs
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admin read: full visibility for compliance staff triaging deferred
-- rows.
-- TODO(rm-ni-split): widen `is_admin(auth.uid())` to accept RM / NI.
create policy account_deletion_jobs_admin_read on public.account_deletion_jobs
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- Admin write: force-cancel or override deferrals. Same TODO applies.
-- TODO(rm-ni-split): widen `is_admin(auth.uid())` to accept RM / NI.
create policy account_deletion_jobs_admin_write on public.account_deletion_jobs
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- No DELETE policy for anyone. Complete / cancelled rows sit for the
-- audit period; hard-delete is a separate retention-sweep concern.
-- Service-role client (createAdminClient in the cron worker) bypasses
-- RLS entirely, so no explicit worker policy is required — mirrors
-- the payout_alerts + stripe_dispute_cases pattern.
