/**
 * Organisation role authorisation (Phase D — PR D2).
 *
 * Pure functions for the type-level hierarchy plus a deploy-safe DB
 * helper that resolves the caller's role in a given org. All I/O
 * flows through an injected Supabase client — the type-level helpers
 * have no side effects and can be unit-tested in isolation.
 *
 * Hierarchy (higher wins):
 *
 *     owner      — full control (only the original signatory)
 *     admin      — everything except demote/remove owner
 *     booker  ┐
 *             ├─ parallel siblings; neither ranks above the other
 *     finance ┘
 *     viewer     — read-only
 *
 * The two "operator" roles (booker + finance) are deliberately
 * SIBLINGS — a booker cannot see finance invoices and a finance user
 * cannot create bookings. `roleAtLeast('booker', 'finance')` is
 * therefore FALSE (and vice versa) — the only relationship they share
 * is "both are above viewer, both are below admin". Higher-tier
 * roles (owner + admin) satisfy `roleAtLeast(_, 'booker')` and
 * `roleAtLeast(_, 'finance')` — a full admin can obviously book AND
 * see finance.
 *
 * The `canModifyMember` helper implements owner-protection: nobody
 * (including another admin) can change or remove the owner. This
 * matches the plan §D2 "owner protection" acceptance criterion.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

// ---------------------------------------------------------------------------
// Types + hierarchy
// ---------------------------------------------------------------------------

export type OrgRole = "owner" | "admin" | "booker" | "finance" | "viewer";

export const ORG_ROLES: readonly OrgRole[] = [
  "owner",
  "admin",
  "booker",
  "finance",
  "viewer",
] as const;

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

/**
 * Numeric rank for hierarchy comparisons. Higher = more privilege.
 * `booker` and `finance` share the same tier so `roleAtLeast('booker',
 * 'finance')` returns false — they are parallel siblings, not a chain.
 */
const ROLE_RANK: Readonly<Record<OrgRole, number>> = Object.freeze({
  owner: 4,
  admin: 3,
  booker: 2,
  finance: 2,
  viewer: 1,
});

// ---------------------------------------------------------------------------
// Pure predicates
// ---------------------------------------------------------------------------

/**
 * `true` when `role` is at least as privileged as `minRole`. See the
 * module header for the parallel-siblings rule between `booker` and
 * `finance`.
 *
 *   roleAtLeast('owner',   'viewer')   → true
 *   roleAtLeast('admin',   'admin')    → true
 *   roleAtLeast('booker',  'finance')  → false (parallel siblings)
 *   roleAtLeast('finance', 'booker')   → false (parallel siblings)
 *   roleAtLeast('viewer',  'booker')   → false
 */
export function roleAtLeast(role: OrgRole, minRole: OrgRole): boolean {
  // Same role always satisfies the constraint. Handles the sibling
  // case (booker vs booker, finance vs finance) trivially.
  if (role === minRole) return true;
  // Sibling case: booker and finance share a rank but do NOT satisfy
  // each other. Fall through to the strict rank comparison below
  // (which returns false because ranks are equal, not greater).
  const actual = ROLE_RANK[role];
  const required = ROLE_RANK[minRole];
  return actual > required;
}

/**
 * Owner-protection + admin/self modification rules for role changes
 * and member removals. Called by the PATCH and DELETE endpoints as a
 * pre-flight after the actor's role has been resolved.
 *
 * Rules:
 *   • The owner is untouchable — no other role can change the owner's
 *     role or remove the owner. Only the owner themselves could (and
 *     even that is out-of-scope for D2; owner transfer is a later PR).
 *   • Admin can do everything else — change any non-owner role,
 *     remove any non-owner member.
 *   • Booker / finance / viewer cannot modify anyone; they never reach
 *     this helper because `requireOrgRole('admin')` gates the routes.
 *
 * The action-specific handlers layer further checks on top (e.g. the
 * DELETE route also enforces last-admin protection to keep the org
 * manageable).
 */
export function canModifyMember(
  actorRole: OrgRole,
  targetRole: OrgRole,
  action: "change_role" | "remove",
): boolean {
  // Only owner + admin can modify members at all.
  if (!roleAtLeast(actorRole, "admin")) return false;

  // Owner is untouchable — regardless of the action or the actor.
  // If the actor is themselves the owner, they're trying to modify
  // themselves, which is also blocked by D2 (owner transfer is a
  // later PR).
  if (targetRole === "owner") return false;

  // Admin can change/remove any non-owner. Owner can also change/
  // remove any non-owner (the `roleAtLeast('admin')` gate above lets
  // both through — owner is strictly above admin).
  void action; // reserved for future action-specific rules (transfer, etc.)
  return true;
}

// ---------------------------------------------------------------------------
// DB helper — resolves caller's role in an org
// ---------------------------------------------------------------------------

export type RequireOrgRoleOk = { ok: true; role: OrgRole };
export type RequireOrgRoleErr = {
  ok: false;
  error: "not_a_member" | "insufficient_role" | "schema_not_ready";
};
export type RequireOrgRoleResult = RequireOrgRoleOk | RequireOrgRoleErr;

type PgError = { code?: string; message?: string } | null | undefined;

function isSchemaNotReady(err: PgError): boolean {
  const code = err?.code;
  return code === "42P01" || code === "42703";
}

/**
 * Resolve the caller's role for a given org and check it meets
 * `minRole`. Uses the injected client (in production this is a
 * service-role admin client so RLS doesn't hide the row before the
 * role is established — the route handlers have already authenticated
 * the user via createClient()).
 *
 * Deploy-safe: returns `{ok:false, error:'schema_not_ready'}` when
 * the underlying table hasn't been reached by the migration yet. The
 * calling route turns that into HTTP 202 with skippedReason. This
 * mirrors the D1 invitations-db pattern.
 */
export async function requireOrgRole(
  admin: AnyClient,
  userId: string,
  organizationId: string,
  minRole: OrgRole,
): Promise<RequireOrgRoleResult> {
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle<{ role: string }>();

  if (error) {
    if (isSchemaNotReady(error as PgError)) {
      return { ok: false, error: "schema_not_ready" };
    }
    // Any other DB error is treated as no membership — safer than
    // leaking a 500 with a stack trace to the client. The handler
    // turns this into 403.
    return { ok: false, error: "not_a_member" };
  }
  const raw = data?.role ?? null;
  if (raw == null) {
    return { ok: false, error: "not_a_member" };
  }
  if (!isOrgRole(raw)) {
    // Defensive: the CHECK constraint restricts this, but if a future
    // migration temporarily widens the CHECK before this file is
    // updated we treat unknown roles as "not a valid member" rather
    // than crashing.
    return { ok: false, error: "not_a_member" };
  }
  if (!roleAtLeast(raw, minRole)) {
    return { ok: false, error: "insufficient_role" };
  }
  return { ok: true, role: raw };
}
