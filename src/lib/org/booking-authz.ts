/**
 * Booking-scoped authorisation helpers (Phase D — PR D3).
 *
 * Sits alongside `authz.ts` (which resolves an org role by
 * (userId, orgId)) and specialises it for the booking-create + booking-
 * read code paths.
 *
 *   requireBookerRole(admin, userId, orgId)
 *     — Guard for POST /api/m/org/bookings. Only owner|admin|booker
 *       may create bookings; finance + viewer are rejected. Returns
 *       the caller's `organization_members.id` (so the route can
 *       pass it into the RPC as booker_member_id) and their role.
 *
 *   getBookingVisibilityScope(admin, userId, bookingId)
 *     — Application-layer companion to `bookings_org_viewer_read_v2`.
 *       PostgreSQL RLS cannot restrict columns, so the API projection
 *       hides financial fields when this returns 'viewer'. Return
 *       `'none'` for the (frequent) case of a non-org booking or a
 *       caller who isn't in the org — the caller falls back to the
 *       consumer / seeker projection.
 *
 * Both helpers use the deploy-safe `42P01` / `42703` fallback and
 * translate DB errors to their result-type variant rather than
 * throwing — the route handlers already ship on-behalf schema-not-
 * ready 202 responses (see D1/D2) and this keeps the surface uniform.
 *
 * NOTE: `assertOrgBillingCurrent` is intentionally NOT implemented in
 * this file — the billing-guard drop-in lands in D5. The
 * create-booking route carries a `// TODO(d5-billing-guard):` marker
 * at the exact insertion point so the D5 patch is a clean diff.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrgRole, roleAtLeast, type OrgRole } from "./authz";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

type PgError = { code?: string; message?: string } | null | undefined;

function isSchemaNotReady(err: PgError): boolean {
  const code = err?.code;
  return code === "42P01" || code === "42703";
}

// ---------------------------------------------------------------------------
// requireBookerRole
// ---------------------------------------------------------------------------

export type RequireBookerRoleOk = {
  ok: true;
  memberId: string;
  role: OrgRole;
  fullName: string | null;
};
export type RequireBookerRoleErr = {
  ok: false;
  error:
    | "not_a_member"
    | "insufficient_role"
    | "schema_not_ready";
};
export type RequireBookerRoleResult =
  | RequireBookerRoleOk
  | RequireBookerRoleErr;

/**
 * Resolve the caller's `organization_members` row for the target org
 * and gate on booker-or-higher. Bookers are the operator role that
 * creates work on behalf of the org; finance handles invoices but does
 * not book, and viewers are read-only.
 *
 *   owner   → OK  (highest tier)
 *   admin   → OK  (can do anything below owner)
 *   booker  → OK  (the intended role)
 *   finance → REJECTED (`insufficient_role`) — finance sees books but
 *             doesn't create them
 *   viewer  → REJECTED (`insufficient_role`)
 *
 * The distinction between finance and booker is deliberate — see the
 * hierarchy header in `authz.ts` for the parallel-siblings rule.
 * `roleAtLeast('finance', 'booker')` is FALSE, so passing 'booker' as
 * the minRole rejects finance correctly.
 */
export async function requireBookerRole(
  admin: AnyClient,
  userId: string,
  organizationId: string,
): Promise<RequireBookerRoleResult> {
  const { data, error } = await admin
    .from("organization_members")
    .select("id, role, full_name")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string; role: string; full_name: string | null }>();

  if (error) {
    if (isSchemaNotReady(error as PgError)) {
      return { ok: false, error: "schema_not_ready" };
    }
    // Any other DB error → treat as "no membership". Safer than
    // leaking a 500 to a client that shouldn't be booking on behalf
    // of this org anyway.
    return { ok: false, error: "not_a_member" };
  }

  if (!data) {
    return { ok: false, error: "not_a_member" };
  }

  const raw = data.role;
  if (!isOrgRole(raw)) {
    // Defensive — the CHECK constraint restricts this, but if a
    // future migration widens it before this file is updated we
    // reject rather than crash.
    return { ok: false, error: "not_a_member" };
  }

  // owner, admin, booker → OK. finance + viewer → rejected.
  if (!roleAtLeast(raw, "booker")) {
    return { ok: false, error: "insufficient_role" };
  }

  return {
    ok: true,
    memberId: data.id,
    role: raw,
    fullName: data.full_name,
  };
}

// ---------------------------------------------------------------------------
// getBookingVisibilityScope
// ---------------------------------------------------------------------------

export type BookingVisibilityScope =
  | "admin"    // owner|admin of the org — sees every column
  | "booker"   // sees every column (needs financial context to book)
  | "finance"  // sees every column (handles invoices)
  | "viewer"   // sees rows but the API projection MUST hide financial columns
  | "none";    // not an org booking, or caller isn't in the org

/**
 * Resolve the caller's projection scope for a specific booking. Used
 * by the org-bookings list + detail routes to decide whether to
 * include financial columns in the JSON response.
 *
 * Returns `'none'` when the booking isn't org-linked (a plain seeker
 * booking) OR the caller isn't a member of the booking's org — in
 * both cases the caller should fall through to the seeker/consumer
 * projection (which does its own auth via seeker_id / caregiver_id).
 *
 * Deploy-safe: on `42P01`/`42703` returns 'none' — the caller then
 * falls back to the least-privileged projection, which is safe.
 */
export async function getBookingVisibilityScope(
  admin: AnyClient,
  userId: string,
  bookingId: string,
): Promise<BookingVisibilityScope> {
  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("organization_id")
    .eq("id", bookingId)
    .maybeSingle<{ organization_id: string | null }>();

  if (bErr) {
    if (isSchemaNotReady(bErr as PgError)) return "none";
    return "none";
  }
  if (!booking || !booking.organization_id) return "none";

  const { data: member, error: mErr } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", booking.organization_id)
    .eq("user_id", userId)
    .maybeSingle<{ role: string }>();

  if (mErr) {
    if (isSchemaNotReady(mErr as PgError)) return "none";
    return "none";
  }
  if (!member) return "none";

  if (!isOrgRole(member.role)) return "none";
  if (member.role === "owner" || member.role === "admin") return "admin";
  if (member.role === "booker") return "booker";
  if (member.role === "finance") return "finance";
  return "viewer";
}

// ---------------------------------------------------------------------------
// Financial-column projection helper
// ---------------------------------------------------------------------------

/**
 * The set of `bookings` columns that a `viewer` must NOT see in the
 * API response. Kept as a single source of truth so the list + detail
 * routes agree on the redaction set.
 *
 * Rationale:
 *   • carer_pay_total_cents — the platform's supplier-side pay is
 *     never exposed to the org anyway; but a viewer specifically
 *     should not even see the org-side price.
 *   • hourly_rate_cents / subtotal_cents / total_cents /
 *     org_charge_total_cents / platform_fee_cents — pricing.
 *   • stripe_invoice_id — links to the finance-only invoice detail.
 *
 * The list of fields matches the SELECT projection in
 * `src/app/api/m/org/bookings/route.ts` GET handler.
 */
export const VIEWER_HIDDEN_BOOKING_FIELDS: readonly string[] = Object.freeze([
  "hourly_rate_cents",
  "subtotal_cents",
  "total_cents",
  "platform_fee_cents",
  "org_charge_total_cents",
  "carer_pay_total_cents",
  "stripe_invoice_id",
]);

/**
 * Return a shallow copy of `row` with the financial columns nulled
 * (rather than deleted) so the shape of the response is stable for
 * viewer vs non-viewer callers — the client can render placeholders
 * ("—") without a per-column presence check.
 */
export function redactForViewer<T extends Record<string, unknown>>(
  row: T,
): T {
  const clone: Record<string, unknown> = { ...row };
  for (const key of VIEWER_HIDDEN_BOOKING_FIELDS) {
    if (key in clone) clone[key] = null;
  }
  return clone as T;
}

/**
 * Apply `redactForViewer` when the caller's scope is `viewer`. No-op
 * for admin/booker/finance/none. Callers use this to keep the branch
 * co-located with the projection.
 */
export function applyProjectionForScope<T extends Record<string, unknown>>(
  row: T,
  scope: BookingVisibilityScope,
): T {
  return scope === "viewer" ? redactForViewer(row) : row;
}

// ---------------------------------------------------------------------------
// Timesheet-route role gates (Phase D — PR D3)
// ---------------------------------------------------------------------------

/**
 * Roles allowed to approve / dispute / adjust an org booking's
 * timesheet. Bookers scheduled the shift and are the natural
 * counterparty to the carer's timesheet claim; finance handles
 * invoices AFTER resolution (they need to see the outcome, not
 * decide it); viewer is read-only.
 *
 * Kept as a single source of truth so the 3 route handlers agree.
 * The routes still spell the array inline for readability, but the
 * unit tests import this constant so a drift shows up as a test
 * failure rather than a subtle bug.
 */
export const TIMESHEET_ACT_ROLES: readonly OrgRole[] = Object.freeze([
  "owner",
  "admin",
  "booker",
]);

/**
 * Roles allowed to trigger payment actions on an org booking
 * timesheet (retry a failed PI, list pending confirmations, etc.).
 * Finance is the intended operator; owner + admin get access
 * because they can do everything below them. Bookers are
 * intentionally excluded — they see the schedule but not the money.
 */
export const TIMESHEET_PAYMENT_ROLES: readonly OrgRole[] = Object.freeze([
  "owner",
  "admin",
  "finance",
]);

/**
 * Small pure helper for tests. Returns true when the given role
 * appears in `allowed`. Not exported for route consumers (they
 * keep the inline array + membership check for readability) —
 * exists to make the test assertions less repetitive.
 */
export function isRoleAllowed(
  role: string,
  allowed: readonly OrgRole[],
): boolean {
  if (!isOrgRole(role)) return false;
  return (allowed as readonly string[]).includes(role);
}
