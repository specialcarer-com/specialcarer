-- ============================================================================
-- SpecialCarer — D1 / Organisation invitation model + acceptance flow
--
-- Phase D's first PR: gives organisation admins the ability to invite
-- teammates by email. Today `organization_members` only exists for the
-- original signatory who signed the contract; there is no path for a
-- second seat on any org to log in. The gap review calls this out as
-- P1 for the B2B motion (specialcarer_gap_review_11sep.md — "org
-- multi-seat non-sellable").
--
-- This migration adds:
--   1. `organization_invitations` — one row per pending / accepted /
--      cancelled invitation. Raw token never persists (only its
--      SHA-256 hash); the raw only lives in the email link. Expiry is
--      derived (not persisted) — a row is "expired" when `expires_at
--      < now()` and neither accepted_at nor cancelled_at is set. That
--      keeps state changes minimal and lets the daily cron be a
--      count-and-log observability probe rather than a mutating job.
--   2. Deterministic RLS: org admins see and manage their own org's
--      invites only, SpecialCarer admins see all, no anon read. Public
--      token validation happens via service_role in the route
--      handler — the sanctioned pattern already used by DSAR + candour
--      disclosure links.
--   3. `accept_organization_invitation` RPC — wraps the
--      `organization_members` insert + invitation state update in a
--      single transaction so a crash between the two can't leave a
--      half-accepted invite orphaned from the member row.
--
-- Freeze-respectful: additive only. No touch of existing tables. No
-- indexes on existing tables. `organization_members` schema is
-- unchanged — D2 (role hierarchy) will layer the CHECK expansion
-- (booker/finance/viewer) on top. For D1, the invitation row's `role`
-- CHECK is the enforcement surface for the new roles and
-- `organization_members.role` continues to accept the current allowed
-- values (`owner`, `admin`, `booker`, `viewer` per
-- 20260509091458_organizations_v1.sql). D1's accept path will only
-- INSERT roles that are in both allowed sets (`admin`, `booker`,
-- `viewer`) — `finance` invites will be created but rejected at
-- accept-time until D2 broadens the members CHECK. This is called out
-- in the route handler as a deliberate D1/D2 hand-off.
--
-- Deploy-safe: every route that queries this table catches PG error
-- codes `42P01` (undefined_table) and returns
-- `{ok:true, skippedReason:'schema_not_ready'}` on 202 so the code
-- can land before this migration reaches prod. Once
-- .github/workflows/supabase-migrations.yml auto-applies (destructive
-- pre-flight from PR #220 will pass — this migration is additive
-- only), the handlers start serving live rows.
-- ============================================================================

-- ── 1. Invitations table ────────────────────────────────────────────────────

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),

  -- The organisation this invitation seats a user into. Cascade delete
  -- so removing an org clears any never-accepted invites.
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  -- Invited email. Stored lower-cased so the pending-uniqueness
  -- partial index can match case-insensitively without needing a
  -- functional-index quirk on top of a partial predicate. Enforced by
  -- a CHECK constraint (email = lower(email)) — the route handler is
  -- the sole writer and it lower-cases before insert, but the CHECK
  -- keeps a stray future writer honest.
  email text not null check (email = lower(email)),

  -- Invitation role. Deliberately does NOT include `owner` — the
  -- original signatory is the only owner. Values match D2's future
  -- enum. `finance` will be accepted at invite time but will fail at
  -- accept-time until D2 broadens organization_members.role CHECK to
  -- include it; the accept handler explicitly rejects `finance` today
  -- with a distinct error so we don't insert a row that would fail
  -- against the members CHECK.
  role text not null
    check (role in ('admin', 'booker', 'finance', 'viewer')),

  -- Actor who created the invitation. Cascade would over-couple — if
  -- an admin leaves, historic invites should still exist for audit.
  invited_by uuid not null references auth.users(id),

  -- SHA-256 hex of the URL-safe raw token. Raw token is emailed once
  -- and never persisted. Timing-safe compare happens in the library.
  -- Unique — a hash collision would mean an existing invite could be
  -- overwritten silently.
  token_hash text not null,

  -- Expiry derived at query time (all reads filter expires_at > now()).
  -- Default 7 days from insert per plan §D1.
  expires_at timestamptz not null default (now() + interval '7 days'),

  -- Terminal-state timestamps + attribution. Both null means the
  -- invite is still pending (assuming expires_at > now()).
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),

  created_at timestamptz not null default now()
);

-- Prevent duplicate PENDING invites for the same email into the same
-- org. Partial predicate lets a cancelled invite for the same email
-- coexist with a fresh one — otherwise "cancel + reinvite" would fail
-- against the unique constraint.
create unique index if not exists organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and cancelled_at is null;

-- Token hash is the primary lookup key for the public
-- GET /api/invitations/[token] route. Unique because a collision
-- would let one invite's link accept a different invite.
create unique index if not exists organization_invitations_token_hash_idx
  on public.organization_invitations (token_hash);

-- Serve the daily expiry-observability cron: pending invites ordered
-- by expiry time so the cron can count-and-log without a table scan.
create index if not exists organization_invitations_expiry_idx
  on public.organization_invitations (expires_at)
  where accepted_at is null and cancelled_at is null;

comment on table public.organization_invitations is
  'D1 org invitations. Raw token never persisted — only SHA-256 hash. Expiry is derived from expires_at, never mutated to a terminal state; a row is pending when both accepted_at and cancelled_at are null and expires_at > now().';
comment on column public.organization_invitations.role is
  'D1 allowed values: admin, booker, finance, viewer. finance will fail at accept-time until D2 broadens organization_members.role CHECK. No owner — only the original signatory is owner.';
comment on column public.organization_invitations.token_hash is
  'SHA-256 hex of the URL-safe raw token generated in src/lib/org/invitation-token.ts. Raw token only lives in the email link.';

-- ── 2. Row Level Security ───────────────────────────────────────────────────

alter table public.organization_invitations enable row level security;

-- Org admins (role in owner/admin on the target org) read their own
-- org's invitations. `organization_members.role` today accepts
-- ('owner','admin','booker','viewer') per organizations_v1.sql — we
-- treat `owner` and `admin` as the admin surface. D2's RM extension
-- point flagged below.
-- TODO(rm-ni-split): expand to role in ('owner','admin','rm') once
-- the RM role lands. Same TODO applies to the two policies below.
create policy org_invitations_admin_read on public.organization_invitations
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_invitations.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  );

-- Same admin gate for INSERT; also require that the actor sets
-- invited_by = auth.uid() so we can't spoof attribution.
-- TODO(rm-ni-split): expand admin roles as above.
create policy org_invitations_admin_insert on public.organization_invitations
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_invitations.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  );

-- UPDATE policy for cancellations. RLS cannot enforce column-scope
-- (Postgres has no per-column USING/WITH CHECK), so the route handler
-- is the single writer and only ever sets cancelled_at + cancelled_by.
-- The USING clause restricts UPDATE to non-terminal rows (not already
-- accepted) so an admin can't retroactively "cancel" an accepted
-- invite. The WITH CHECK re-verifies admin membership on the post-
-- image row, matching the pattern from organizations_v1.sql.
-- TODO(rm-ni-split): expand admin roles as above.
create policy org_invitations_admin_cancel on public.organization_invitations
  for update to authenticated
  using (
    accepted_at is null
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_invitations.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_invitations.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  );

-- SpecialCarer platform admins see and manage everything. Same
-- `profiles.role='admin'` gate used elsewhere. Extension point for the
-- upcoming rm/ni split flagged for the RLS audit sweep in D4.
create policy org_invitations_sc_admin_all on public.organization_invitations
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- NO anon policy. Public token validation is service_role only; the
-- GET /api/invitations/[token] route uses createAdminClient() and
-- looks the row up by token_hash.

-- ── 3. Accept-invitation RPC (transaction wrapper) ─────────────────────────
--
-- The accept flow needs two writes:
--   (a) insert into organization_members (this table has NO INSERT RLS
--       per organizations_v1.sql — writes are service_role only)
--   (b) update organization_invitations row (accepted_at, accepted_by)
--
-- Running these as two separate queries risks a half-accepted invite
-- if the second write fails. Wrapping both in a SECURITY DEFINER RPC
-- gives us a single atomic transaction, and the route handler stays
-- readable. All input validation (expiry, cancellation,
-- already-accepted, email match, already-member, role compatibility)
-- happens in the route handler before this is called — the RPC is
-- purely the write path.

create or replace function public.accept_organization_invitation(
  p_invitation_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_role text,
  p_full_name text,
  p_work_email text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Insert the membership row. Uniqueness on (organization_id,
  -- user_id) means a duplicate raises unique_violation (23505); the
  -- route handler catches that and returns 409 already_member. We do
  -- NOT `on conflict do nothing` here — the caller has already
  -- verified non-membership and we want a duplicate to be a loud
  -- failure so the accepted_at update below can't silently succeed.
  insert into public.organization_members (
    organization_id, user_id, role, full_name, work_email, is_signatory
  ) values (
    p_organization_id, p_user_id, p_role, p_full_name, p_work_email, false
  );

  update public.organization_invitations
     set accepted_at = now(),
         accepted_by = p_user_id
   where id = p_invitation_id
     and accepted_at is null
     and cancelled_at is null;

  if not found then
    -- Someone else (or another tab) accepted or cancelled between the
    -- handler's validation query and this update — raise so the
    -- transaction rolls back the membership insert too.
    raise exception 'invitation not in acceptable state'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.accept_organization_invitation is
  'D1 accept-invitation RPC. Wraps organization_members insert + invitations state update in one transaction. SECURITY DEFINER so it can bypass the organization_members no-INSERT-policy surface without leaking service_role. Validation of expiry/cancellation/email happens in the route handler before calling.';

-- Restrict execute privilege. The route handler runs as service_role
-- via createAdminClient(), so nothing else needs to call this. Revoke
-- from PUBLIC and grant only to service_role (Supabase auto-grants
-- to authenticated on new functions; we tighten explicitly).
revoke execute on function public.accept_organization_invitation(uuid, uuid, uuid, text, text, text) from public;
revoke execute on function public.accept_organization_invitation(uuid, uuid, uuid, text, text, text) from authenticated;
grant execute on function public.accept_organization_invitation(uuid, uuid, uuid, text, text, text) to service_role;
