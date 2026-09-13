/**
 * D5 — overdue-invoice booking block helpers (server + test-safe).
 *
 * These live in `src/lib/org/` (not the route file) so that:
 *   • The D5 test suite can import them without pulling in
 *     `next/server` or any `"server-only"` boundary.
 *   • Any future route that creates org bookings can share the
 *     same block semantics without duplicating the sentinel string
 *     or the RPC name.
 *
 * The sentinel prefix `ORG_HAS_OVERDUE_INVOICES:` is what the
 * SECURITY DEFINER RPC + trigger raise from within postgres — see
 * the D5 migration for the raise site.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/**
 * Pattern-matches the `ORG_HAS_OVERDUE_INVOICES:` sentinel prefix
 * that the RPC + trigger raise. The prefix is checked instead of
 * the Postgres error code because P0001 (raise_exception) is used
 * by many other business-rule guards across the codebase — the
 * prefix is the specific signal.
 */
export function isOverdueInvoiceError(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return msg.includes("ORG_HAS_OVERDUE_INVOICES");
}

export type OverdueCheckResult = {
  blocked: boolean;
  reason?: "schema_not_ready" | "query_error";
};

/**
 * Wraps the has_overdue_invoices(uuid) helper. Returns
 *   { blocked: true }  — org has ≥ 1 overdue invoice.
 *   { blocked: false } — org is current OR the helper is missing
 *                        (deploy-safe pre-migration; treat as not
 *                        blocked so preview environments still
 *                        accept bookings).
 *
 * Uses whatever supabase-js client is passed in. Callers typically
 * pass an admin (service-role) client so RLS on org_invoices
 * doesn't hide rows during the check.
 */
export async function checkOverdueInvoices(
  admin: AnyClient,
  organizationId: string,
): Promise<OverdueCheckResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("has_overdue_invoices", {
    p_organization_id: organizationId,
  });
  if (error) {
    if (error.code === "42883" || error.code === "42P01") {
      // 42883 undefined_function / 42P01 undefined_table — pre-D5
      // schema state. Fall through as "not blocked".
      return { blocked: false, reason: "schema_not_ready" };
    }
    return { blocked: false, reason: "query_error" };
  }
  return { blocked: data === true };
}
