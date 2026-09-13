-- ============================================================================
-- SpecialCarer — D2 / Role hierarchy expansion + membership audit
--
-- Phase D's second PR: broadens the org membership role vocabulary to
-- include `finance` (unblocks D1's invite → accept path for that role,
-- which is currently 409'd by the accept handler with the transitional
-- `role_pending_d2` error) and adds an append-only audit log for the
-- membership lifecycle (invited → accepted → role_changed → removed).
--
-- Prod verification (Sep 2026, via Supabase Management API):
--   • organization_members.role already has a CHECK constraint —
--     `CHECK (role = ANY (ARRAY['owner','admin','booker','viewer']))`
--     from 20260509091458_organizations_v1.sql.
--   • Only 2 rows in prod today, both role='owner' — no backfill needed.
--   • Unique constraint on (organization_id, user_id) already exists.
--
-- Two changes:
--   1. Replace the role CHECK to include `finance`. Requires
--      DROP CONSTRAINT + ADD CONSTRAINT — destructive per the preflight
--      regex, so the tip commit carries an `Allow-Destructive: true`
--      trailer (see PR description). The replacement is safe: every
--      existing value (`owner`) remains allowed under the new list.
--   2. New `org_membership_audit` table for the D2 seat-management UI
--      + future SC-admin timeline. Append-only via service_role — no
--      INSERT/UPDATE/DELETE RLS policies (route handlers write through
--      createAdminClient()). Two SELECT policies: org admins read their
--      own org's audit, SC platform admins read all.
--
-- Freeze-respectful: touches only two surfaces. `organization_members`
-- retains all existing indexes, RLS policies and unique constraints;
-- only the value-space of the `role` column widens by one element.
--
-- Deploy-safe: the D2 write paths (role change, remove, invite audit,
-- accept audit) all catch PG error codes `42P01` / `42703` and return
-- `{ok:true, skippedReason:'schema_not_ready'}` on HTTP 202 so the
-- code can land before this migration reaches prod.
-- ============================================================================

-- ── 1. Expand organization_members.role vocabulary ─────────────────────────

alter table public.organization_members
  drop constraint organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role = any (array['owner', 'admin', 'booker', 'finance', 'viewer']));

comment on column public.organization_members.role is
  'D2 allowed values: owner, admin, booker, finance, viewer. Hierarchy in src/lib/org/authz.ts: owner > admin > (booker | finance) > viewer. Only one owner per org (the original signatory).';

-- ── 2. Append-only audit table ─────────────────────────────────────────────

create table if not exists public.org_membership_audit (
  id uuid primary key default gen_random_uuid(),

  -- Which org the membership belongs to. Cascade delete so removing
  -- an org drops its audit trail — keep the audit tied to a live org
  -- for the read policies below.
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  -- Who performed the action. Never null — every write is attributed
  -- (route handlers only run this after resolving auth.uid()).
  actor_user_id uuid not null references auth.users(id),

  -- Whose membership was affected. Never null — the invited email
  -- gets resolved to a user id during accept; for the invited/removed
  -- rows the target is the actor id when there's no target user yet
  -- (the invited email → user resolution happens at accept).
  target_user_id uuid not null references auth.users(id),

  -- What happened. Constrained to the 4 lifecycle events tracked by
  -- the seat-management UI. Kept as a text CHECK rather than an enum
  -- so future events (e.g. `owner_transferred`) can be added
  -- additively via ADD CONSTRAINT replacement (single-value expansion
  -- has been done for role above and follows the same pattern).
  action text not null
    check (action in ('invited', 'accepted', 'role_changed', 'removed')),

  -- Previous role. Null for invited / accepted (no prior role) and
  -- populated for role_changed / removed.
  from_role text,

  -- New role. Null for removed (no next role) and populated for
  -- invited / accepted / role_changed.
  to_role text,

  -- Freeform structured context. Today: `{ invitation_id: uuid }` for
  -- invited + accepted rows so the UI can link the invite; a future
  -- SSO connector can add `{ sso_source: 'saml' }` without touching
  -- the schema.
  metadata jsonb,

  created_at timestamptz not null default now()
);

-- Serve the SC-admin timeline + org-admin history view: newest first,
-- scoped by org. Composite so the org filter uses the index directly.
create index if not exists org_membership_audit_org_created_idx
  on public.org_membership_audit (organization_id, created_at desc);

-- Reverse lookup: "when was this user seated / removed / role
-- changed?" — used by the SC-admin per-user overlay in later phases.
create index if not exists org_membership_audit_target_idx
  on public.org_membership_audit (target_user_id);

comment on table public.org_membership_audit is
  'D2 append-only audit log for org membership lifecycle events. Writes go through the D2 route handlers via createAdminClient() — no INSERT/UPDATE/DELETE RLS policies. Read policies below expose the log to org admins (own org) and SC platform admins (all orgs).';
comment on column public.org_membership_audit.action is
  'D2 allowed values: invited, accepted, role_changed, removed.';
comment on column public.org_membership_audit.metadata is
  'Structured context. D2 writes { invitation_id } on invited + accepted rows. Additive: new events (e.g. owner_transferred) can add new fields without a schema change.';

-- ── 3. Row Level Security ──────────────────────────────────────────────────

alter table public.org_membership_audit enable row level security;

-- Org admins (owner|admin on the same org) can read their own org's
-- audit trail. Same admin surface used by D1's org_invitations RLS.
-- TODO(rm-ni-split): expand admin roles to ('owner','admin','rm')
-- once the RM/NI split lands. This policy and the one below are the
-- two touch-points to update at that point.
create policy org_audit_admin_read on public.org_membership_audit
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = org_membership_audit.organization_id
        and om.user_id = (select auth.uid())
        and om.role in ('owner', 'admin')
    )
  );

-- SpecialCarer platform admins see every org's audit. Same
-- `profiles.role='admin'` gate used elsewhere in the codebase.
-- TODO(rm-ni-split): keep in sync with the sc-admin surface split.
create policy org_audit_sc_admin_read on public.org_membership_audit
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  );

-- No INSERT / UPDATE / DELETE policies on purpose. All writes flow
-- through createAdminClient() in the D2 route handlers. This keeps
-- the audit table demonstrably append-only from user-facing sessions:
-- an authenticated user (even an org owner) cannot forge, alter or
-- delete audit rows through the PostgREST API — only the service_role
-- key can, and that key only lives inside route handlers.
