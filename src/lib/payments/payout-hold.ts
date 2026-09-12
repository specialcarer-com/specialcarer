/**
 * Carer payout hold reason — write/clear API used by dispute lifecycle.
 *
 * The weekly payout cron (`/api/cron/release-payouts`) will skip any
 * booking whose `carer_payout_hold_reason` is non-null. This module is
 * the only writer for the value `'dispute_open'`; other reason strings
 * (e.g. `'dbs_expired'`) are owned by their respective feature modules
 * and are documented here so no writer accidentally clobbers another.
 *
 * Cardinal rules
 * ──────────────
 *   1. `setDisputeOpenHold` NEVER overwrites a hold set for a different
 *      reason. If the booking is already held for e.g. `'dbs_expired'`
 *      we leave that reason in place — the dispute is a stronger reason
 *      to hold in practice, but stacking is out of scope for C1 and the
 *      DBS-hold path already keeps its own bookkeeping.
 *   2. `clearDisputeOpenHold` ONLY clears if the current reason IS
 *      `'dispute_open'`. This preserves e.g. a `'dbs_expired'` hold that
 *      was set (by a different code path) after the dispute opened.
 *   3. On dispute LOST we do NOT clear the hold. Money moved out via
 *      Stripe's chargeback; the refund_ledger records a `'dispute_lost'`
 *      row and the operational decision about further payouts is left
 *      to admin.
 *
 * Deploy-safe: this module tolerates the `carer_payout_hold_reason`
 * column being absent (migration 20260912133500 unapplied) and returns
 * `{ok:true, skippedReason:"schema_not_ready"}` so the dispute handler
 * can no-op cleanly during the deploy window.
 */

// The reasons this module knows about. This is a documentation surface
// — the DB column has no CHECK constraint, so other feature modules
// can add reasons without a migration. When adding one here, add it in
// the corresponding feature module too so the writer stays discoverable.
export type CarerPayoutHoldReason =
  | "dispute_open"
  // documented but NOT owned by this module — the DBS-hold path owns writes/clears for this value.
  | "dbs_expired"
  // documented but NOT owned by this module — an ops-only manual hold reason.
  | "manual_review";

export type PayoutHoldResult =
  | { ok: true; changed: boolean }
  | { ok: true; changed: false; skippedReason: "schema_not_ready" }
  | { ok: true; changed: false; skippedReason: "other_reason_present"; currentReason: string }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PayoutHoldAdminClient = { from(table: string): any };

// Postgres error code for "undefined_column" — surfaced when the migration
// hasn't been applied yet. Also handle "42P01" (undefined_table) defensively
// so the module works if someone drops in a stub.
const PG_UNDEFINED_COLUMN = "42703";
const PG_UNDEFINED_TABLE = "42P01";

function isSchemaMissingError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  if (code === PG_UNDEFINED_COLUMN || code === PG_UNDEFINED_TABLE) return true;
  return (
    /column .*carer_payout_hold_reason.* does not exist/i.test(message) ||
    /relation .*bookings.* does not exist/i.test(message)
  );
}

/**
 * Set `carer_payout_hold_reason = 'dispute_open'` on the booking IFF the
 * booking currently has no hold reason. Never overwrites another reason.
 *
 * Idempotent: calling twice on the same booking is a no-op the second
 * time (the WHERE clause matches only rows where the reason is null).
 */
export async function setDisputeOpenHold(
  admin: PayoutHoldAdminClient,
  bookingId: string,
): Promise<PayoutHoldResult> {
  try {
    // First, read the current state — needed to distinguish "already
    // held for this reason (idempotent no-op)" from "held for a different
    // reason (don't touch)". A single UPDATE ... WHERE reason IS NULL
    // conflates the two, and we want the caller to know which.
    const { data: existing, error: readErr } = await admin
      .from("bookings")
      .select("carer_payout_hold_reason")
      .eq("id", bookingId)
      .maybeSingle();
    if (readErr) {
      if (isSchemaMissingError(readErr)) {
        return { ok: true, changed: false, skippedReason: "schema_not_ready" };
      }
      return {
        ok: false,
        error: (readErr as { message?: string }).message ?? "hold read failed",
      };
    }
    if (!existing) {
      return { ok: false, error: `booking ${bookingId} not found` };
    }
    const current = (existing as { carer_payout_hold_reason: string | null })
      .carer_payout_hold_reason;
    if (current === "dispute_open") {
      // Already held for this exact reason — no-op.
      return { ok: true, changed: false };
    }
    if (current !== null && current !== undefined) {
      // Held for a different reason — do not overwrite.
      return {
        ok: true,
        changed: false,
        skippedReason: "other_reason_present",
        currentReason: current,
      };
    }
    // No hold — set it.
    const { error: updateErr } = await admin
      .from("bookings")
      .update({ carer_payout_hold_reason: "dispute_open" })
      .eq("id", bookingId)
      .is("carer_payout_hold_reason", null); // guard against a race
    if (updateErr) {
      if (isSchemaMissingError(updateErr)) {
        return { ok: true, changed: false, skippedReason: "schema_not_ready" };
      }
      return {
        ok: false,
        error: (updateErr as { message?: string }).message ?? "hold write failed",
      };
    }
    return { ok: true, changed: true };
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return { ok: true, changed: false, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Clear the hold IFF the current reason is `'dispute_open'`.
 *
 * Called on dispute won. Deliberately preserves other reasons — a
 * `'dbs_expired'` hold set (by a different code path) after the dispute
 * opened must survive the dispute closing.
 */
export async function clearDisputeOpenHold(
  admin: PayoutHoldAdminClient,
  bookingId: string,
): Promise<PayoutHoldResult> {
  try {
    const { data: existing, error: readErr } = await admin
      .from("bookings")
      .select("carer_payout_hold_reason")
      .eq("id", bookingId)
      .maybeSingle();
    if (readErr) {
      if (isSchemaMissingError(readErr)) {
        return { ok: true, changed: false, skippedReason: "schema_not_ready" };
      }
      return {
        ok: false,
        error: (readErr as { message?: string }).message ?? "hold read failed",
      };
    }
    if (!existing) {
      return { ok: false, error: `booking ${bookingId} not found` };
    }
    const current = (existing as { carer_payout_hold_reason: string | null })
      .carer_payout_hold_reason;
    if (current === null || current === undefined) {
      return { ok: true, changed: false };
    }
    if (current !== "dispute_open") {
      // Different reason (e.g. 'dbs_expired') — preserve it.
      return {
        ok: true,
        changed: false,
        skippedReason: "other_reason_present",
        currentReason: current,
      };
    }
    const { error: updateErr } = await admin
      .from("bookings")
      .update({ carer_payout_hold_reason: null })
      .eq("id", bookingId)
      .eq("carer_payout_hold_reason", "dispute_open"); // guard: only if still ours
    if (updateErr) {
      if (isSchemaMissingError(updateErr)) {
        return { ok: true, changed: false, skippedReason: "schema_not_ready" };
      }
      return {
        ok: false,
        error: (updateErr as { message?: string }).message ?? "hold clear failed",
      };
    }
    return { ok: true, changed: true };
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return { ok: true, changed: false, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
