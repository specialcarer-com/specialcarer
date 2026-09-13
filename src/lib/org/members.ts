/**
 * Members management handlers (Phase D — PR D2).
 *
 * Pure handler layer for the three new /api/m/org/members* routes:
 *
 *   PATCH /api/m/org/members/[id]/role   (handleChangeRole)
 *   DELETE /api/m/org/members/[id]       (handleRemoveMember)
 *   GET  /api/m/org/members              (handleListMembers)
 *
 * All DB access flows through the injected `MembersDb` interface so
 * the routes stay wire-only and unit tests can use an in-memory fake.
 * All queries return `{schemaNotReady: true}` on PG 42P01 / 42703 —
 * handlers translate that to HTTP 202 with skippedReason.
 *
 * Owner protection is enforced here (nobody can change or remove the
 * owner). Last-admin protection is enforced here for the DELETE path
 * (an actor cannot remove themselves if that would leave the org
 * with zero admins/owners).
 *
 * Audit rows for the four lifecycle events (invited, accepted,
 * role_changed, removed) are inserted by these handlers via
 * `MembersDb.insertAudit()`. Failing to insert the audit row does
 * NOT block the mutation — audit is best-effort and logged. This
 * mirrors the pattern used elsewhere in the codebase for
 * observability side effects.
 */

import { canModifyMember, isOrgRole, roleAtLeast, type OrgRole } from "./authz";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Actor = { id: string; email: string | null };

export type SchemaNotReady = { schemaNotReady: true };

function isSchemaNotReady<T>(x: T | SchemaNotReady): x is SchemaNotReady {
  return typeof x === "object" && x !== null && "schemaNotReady" in x;
}

export type MemberRow = {
  id: string;
  user_id: string;
  organization_id: string;
  role: OrgRole;
  full_name: string | null;
  work_email: string | null;
  is_signatory: boolean;
  created_at: string;
};

/** Roles that can be assigned via the PATCH /role endpoint. Owner is
 * excluded — the endpoint returns 400 invalid_role for owner. */
export const ASSIGNABLE_ROLES: readonly OrgRole[] = [
  "admin",
  "booker",
  "finance",
  "viewer",
] as const;

export function isAssignableRole(v: unknown): v is (typeof ASSIGNABLE_ROLES)[number] {
  return typeof v === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Injected DB surface
// ---------------------------------------------------------------------------

export type AuditAction = "invited" | "accepted" | "role_changed" | "removed";

export type AuditRow = {
  organization_id: string;
  actor_user_id: string;
  target_user_id: string;
  action: AuditAction;
  from_role: string | null;
  to_role: string | null;
  metadata: Record<string, unknown> | null;
};

export interface MembersDb {
  /** Fetch a member row by its primary key. Null if absent. */
  findMemberById(
    id: string,
  ): Promise<{ ok: true; row: MemberRow | null } | SchemaNotReady>;

  /** Actor's role on the given org. Null if not a member. */
  findMyRole(
    userId: string,
    organizationId: string,
  ): Promise<{ ok: true; role: OrgRole | null } | SchemaNotReady>;

  /** UPDATE role on a member. Returns whether the row existed. */
  updateMemberRole(input: {
    id: string;
    role: OrgRole;
  }): Promise<{ ok: true; updated: boolean } | SchemaNotReady>;

  /** DELETE a member by id. Returns whether the row existed. */
  deleteMember(input: {
    id: string;
  }): Promise<{ ok: true; deleted: boolean } | SchemaNotReady>;

  /** List members of an org (public columns only). */
  listMembers(
    organizationId: string,
  ): Promise<{ ok: true; rows: MemberRow[] } | SchemaNotReady>;

  /** Count members with role in ('owner','admin') for an org. */
  countOrgAdmins(
    organizationId: string,
  ): Promise<{ ok: true; count: number } | SchemaNotReady>;

  /** Append an audit row. Best-effort — failures are logged. */
  insertAudit(row: AuditRow): Promise<{ ok: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// PATCH /api/m/org/members/[id]/role
// ---------------------------------------------------------------------------

export type ChangeRoleInput = {
  actor: Actor;
  memberId: string;
  role: unknown;
};

export type ChangeRoleResult =
  | {
      status: 200;
      body: { ok: true; id: string; from_role: OrgRole; to_role: OrgRole };
    }
  | { status: 202; body: { ok: true; skippedReason: "schema_not_ready" } }
  | { status: 400; body: { ok: false; error: "invalid_role" | "invalid_id" } }
  | { status: 401; body: { ok: false; error: "unauthenticated" } }
  | {
      status: 403;
      body: {
        ok: false;
        error: "insufficient_role" | "cannot_modify_owner" | "not_a_member";
      };
    }
  | { status: 404; body: { ok: false; error: "not_found" } };

export async function handleChangeRole(
  input: ChangeRoleInput,
  deps: { db: MembersDb },
): Promise<ChangeRoleResult> {
  if (!input.actor?.id) {
    return { status: 401, body: { ok: false, error: "unauthenticated" } };
  }
  if (typeof input.memberId !== "string" || input.memberId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_id" } };
  }
  if (!isAssignableRole(input.role)) {
    // Owner is deliberately excluded — the endpoint returns
    // invalid_role for `owner`, distinguishing it from "unknown role".
    return { status: 400, body: { ok: false, error: "invalid_role" } };
  }

  const targetLookup = await deps.db.findMemberById(input.memberId);
  if (isSchemaNotReady(targetLookup)) {
    return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
  }
  if (!targetLookup.row) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }
  const target = targetLookup.row;

  const actorRoleLookup = await deps.db.findMyRole(
    input.actor.id,
    target.organization_id,
  );
  if (isSchemaNotReady(actorRoleLookup)) {
    return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
  }
  const actorRole = actorRoleLookup.role;
  if (actorRole == null) {
    // Cross-org attempt — the actor isn't a member of the target's org.
    return { status: 403, body: { ok: false, error: "not_a_member" } };
  }
  if (!roleAtLeast(actorRole, "admin")) {
    return { status: 403, body: { ok: false, error: "insufficient_role" } };
  }
  if (!canModifyMember(actorRole, target.role, "change_role")) {
    return { status: 403, body: { ok: false, error: "cannot_modify_owner" } };
  }

  // If the role isn't changing, short-circuit — no update, no audit row.
  if (target.role === input.role) {
    return {
      status: 200,
      body: { ok: true, id: target.id, from_role: target.role, to_role: input.role },
    };
  }

  const upd = await deps.db.updateMemberRole({
    id: target.id,
    role: input.role,
  });
  if (isSchemaNotReady(upd)) {
    return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
  }
  if (!upd.updated) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }

  const audit = await deps.db.insertAudit({
    organization_id: target.organization_id,
    actor_user_id: input.actor.id,
    target_user_id: target.user_id,
    action: "role_changed",
    from_role: target.role,
    to_role: input.role,
    metadata: null,
  });
  if (!audit.ok) {
    console.warn("[org-members] audit insert failed", {
      action: "role_changed",
      organization_id: target.organization_id,
      member_id: target.id,
      error: audit.error,
    });
  }

  return {
    status: 200,
    body: { ok: true, id: target.id, from_role: target.role, to_role: input.role },
  };
}

// ---------------------------------------------------------------------------
// DELETE /api/m/org/members/[id]
// ---------------------------------------------------------------------------

export type RemoveInput = { actor: Actor; memberId: string };

export type RemoveResult =
  | { status: 200; body: { ok: true } }
  | { status: 202; body: { ok: true; skippedReason: "schema_not_ready" } }
  | { status: 400; body: { ok: false; error: "invalid_id" } }
  | { status: 401; body: { ok: false; error: "unauthenticated" } }
  | {
      status: 403;
      body: {
        ok: false;
        error:
          | "insufficient_role"
          | "cannot_modify_owner"
          | "not_a_member"
          | "last_admin";
      };
    }
  | { status: 404; body: { ok: false; error: "not_found" } };

export async function handleRemoveMember(
  input: RemoveInput,
  deps: { db: MembersDb },
): Promise<RemoveResult> {
  if (!input.actor?.id) {
    return { status: 401, body: { ok: false, error: "unauthenticated" } };
  }
  if (typeof input.memberId !== "string" || input.memberId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_id" } };
  }

  const targetLookup = await deps.db.findMemberById(input.memberId);
  if (isSchemaNotReady(targetLookup)) {
    return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
  }
  if (!targetLookup.row) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }
  const target = targetLookup.row;

  const actorRoleLookup = await deps.db.findMyRole(
    input.actor.id,
    target.organization_id,
  );
  if (isSchemaNotReady(actorRoleLookup)) {
    return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
  }
  const actorRole = actorRoleLookup.role;
  if (actorRole == null) {
    return { status: 403, body: { ok: false, error: "not_a_member" } };
  }
  if (!roleAtLeast(actorRole, "admin")) {
    return { status: 403, body: { ok: false, error: "insufficient_role" } };
  }
  if (!canModifyMember(actorRole, target.role, "remove")) {
    return { status: 403, body: { ok: false, error: "cannot_modify_owner" } };
  }

  // Last-admin protection: if the actor is removing themselves AND
  // they are the last remaining owner/admin on the org, block it.
  // The owner (role='owner') can never reach this point because
  // canModifyMember returns false for a target with role 'owner' —
  // so this branch only fires for a self-removing admin who is the
  // last admin AND the org has no owner (a corrupt state, but we
  // guard defensively).
  if (target.user_id === input.actor.id) {
    const adminCount = await deps.db.countOrgAdmins(target.organization_id);
    if (isSchemaNotReady(adminCount)) {
      return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
    }
    if (adminCount.count <= 1) {
      return { status: 403, body: { ok: false, error: "last_admin" } };
    }
  }

  const del = await deps.db.deleteMember({ id: target.id });
  if (isSchemaNotReady(del)) {
    return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
  }
  if (!del.deleted) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }

  const audit = await deps.db.insertAudit({
    organization_id: target.organization_id,
    actor_user_id: input.actor.id,
    target_user_id: target.user_id,
    action: "removed",
    from_role: target.role,
    to_role: null,
    metadata: null,
  });
  if (!audit.ok) {
    console.warn("[org-members] audit insert failed", {
      action: "removed",
      organization_id: target.organization_id,
      member_id: target.id,
      error: audit.error,
    });
  }

  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------------------
// GET /api/m/org/members
// ---------------------------------------------------------------------------

export type ListMembersInput = {
  actor: Actor;
  organizationId: string;
};

/**
 * Public member row exposed by the LIST endpoint. No phone, no
 * job_title_other, no PII beyond what the team page renders.
 */
export type PublicMember = {
  id: string;
  user_id: string;
  role: OrgRole;
  full_name: string | null;
  work_email: string | null;
  is_signatory: boolean;
  created_at: string;
};

export type ListMembersResult =
  | { status: 200; body: { ok: true; members: PublicMember[] } }
  | { status: 202; body: { ok: true; skippedReason: "schema_not_ready" } }
  | { status: 400; body: { ok: false; error: "invalid_organization_id" } }
  | { status: 401; body: { ok: false; error: "unauthenticated" } }
  | { status: 403; body: { ok: false; error: "not_a_member" } };

export async function handleListMembers(
  input: ListMembersInput,
  deps: { db: MembersDb },
): Promise<ListMembersResult> {
  if (!input.actor?.id) {
    return { status: 401, body: { ok: false, error: "unauthenticated" } };
  }
  if (
    typeof input.organizationId !== "string" ||
    input.organizationId.trim() === ""
  ) {
    return { status: 400, body: { ok: false, error: "invalid_organization_id" } };
  }

  const roleLookup = await deps.db.findMyRole(input.actor.id, input.organizationId);
  if (isSchemaNotReady(roleLookup)) {
    return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
  }
  if (roleLookup.role == null) {
    // Cross-org isolation: the actor isn't a member of the requested
    // org so we hide the list entirely (no 200-with-empty; 403 is
    // clearer for the client + doesn't leak "org exists").
    return { status: 403, body: { ok: false, error: "not_a_member" } };
  }

  const rows = await deps.db.listMembers(input.organizationId);
  if (isSchemaNotReady(rows)) {
    return { status: 202, body: { ok: true, skippedReason: "schema_not_ready" } };
  }

  const scoped: PublicMember[] = rows.rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    role: r.role,
    // Defensive scoping — the projection below is what the callers
    // see. Even if `MembersDb.listMembers` returned extra columns
    // (e.g. phone) they would be stripped here.
    full_name: r.full_name,
    work_email: r.work_email,
    is_signatory: r.is_signatory,
    created_at: r.created_at,
  }));

  return { status: 200, body: { ok: true, members: scoped } };
}

// ---------------------------------------------------------------------------
// Audit helpers for the D1 send + accept routes to call.
// ---------------------------------------------------------------------------

/**
 * Fire-and-log audit insert used by the D1 send + accept paths. Wraps
 * the MembersDb.insertAudit call with the standard warn-on-failure
 * behaviour so both callers stay tidy.
 */
export async function auditInvitationLifecycle(
  db: MembersDb,
  row: AuditRow,
): Promise<void> {
  const res = await db.insertAudit(row);
  if (!res.ok) {
    console.warn("[org-members] audit insert failed", {
      action: row.action,
      organization_id: row.organization_id,
      target_user_id: row.target_user_id,
      error: res.error,
    });
  }
}

/** Guard exported for tests. */
export function _isOrgRole(v: unknown): boolean {
  return isOrgRole(v);
}
