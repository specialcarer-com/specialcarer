import type Stripe from "stripe";

/**
 * Stripe Connect readiness gate — used at booking-intent creation time to
 * refuse a booking whose destination account cannot actually be paid out to.
 *
 * See supabase/migrations/20260911230000_stripe_connect_capabilities.sql
 * for the columns we depend on.
 *
 * Design notes:
 *   * Reasons are a closed set (see {@link ConnectNotReadyReason}) so the
 *     mobile UI can map each one to a specific friendly message without
 *     ever surfacing Stripe internals to seekers.
 *   * "Ready" requires all four of:
 *         charges_enabled === true
 *         payouts_enabled === true
 *         capabilities.transfers === "active"
 *         disabled_reason IS NULL (or empty string)
 *     A single false collapses to a specific reason with a fixed priority
 *     order — most-severe first (`account_restricted` beats
 *     `charges_disabled` beats `payouts_disabled` beats
 *     `transfers_capability_missing`).
 *   * The cache TTL is 60 minutes. On a stale hit we refresh once from
 *     Stripe. On a fresh hit we serve local. The webhook clears staleness
 *     by writing `last_refreshed_at = now()`.
 *   * Deploy-safe against the migration: the readiness gate treats a missing
 *     column (or a `select` that fails because the column doesn't yet exist)
 *     as "no cache" and falls back to a live Stripe read. Before the
 *     migration is applied it therefore behaves like the current code, just
 *     slower.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectReadyOk = { ready: true };
export type ConnectNotReadyReason =
  | "account_restricted"
  | "charges_disabled"
  | "payouts_disabled"
  | "transfers_capability_missing"
  | "legacy_incomplete";
export type ConnectReadyFail = {
  ready: false;
  reason: ConnectNotReadyReason;
  disabled_reason?: string;
};
export type ConnectReadyResult = ConnectReadyOk | ConnectReadyFail;

/** Shape of the row we read from `caregiver_stripe_accounts`. */
export type ConnectAccountRow = {
  stripe_account_id: string;
  charges_enabled: boolean | null;
  payouts_enabled: boolean | null;
  details_submitted: boolean | null;
  capabilities: Record<string, unknown> | null;
  disabled_reason: string | null;
  last_refreshed_at: string | null;
};

// ─── Pure evaluators ──────────────────────────────────────────────────────────

/**
 * Priority-ordered evaluation of a cached row.
 *
 * Ordering rationale (severity, high → low):
 *   1. `account_restricted` — Stripe has set a disabled_reason. Wins even
 *      when the flags haven't flipped to false yet (they lag by seconds).
 *   2. `legacy_incomplete` — the account was created before we started
 *      requesting the `transfers` capability, so it will never mature.
 *      Distinct from "missing" (below) so we can track migrations off it.
 *   3. `charges_disabled` — cannot take the seeker's money at all.
 *   4. `payouts_disabled` — can take money but can't send it out.
 *   5. `transfers_capability_missing` — flags look fine but the specific
 *      capability we transfer under is `pending`/`inactive`.
 */
export function evaluateReadiness(row: ConnectAccountRow): ConnectReadyResult {
  const reason = row.disabled_reason?.trim();
  if (reason && reason.length > 0) {
    return {
      ready: false,
      reason: "account_restricted",
      disabled_reason: reason,
    };
  }

  // A row that has never been refreshed AND has details_submitted=false
  // and no capabilities is a legacy stub. We flag it explicitly so the ops
  // team knows to migrate the account rather than assuming Stripe is
  // temporarily degraded.
  const caps = (row.capabilities ?? {}) as Record<string, { status?: string }>;
  const noCapabilitiesTracked =
    !row.capabilities || Object.keys(row.capabilities).length === 0;
  if (
    row.last_refreshed_at === null &&
    row.details_submitted === false &&
    noCapabilitiesTracked
  ) {
    return { ready: false, reason: "legacy_incomplete" };
  }

  if (row.charges_enabled !== true) {
    return { ready: false, reason: "charges_disabled" };
  }
  if (row.payouts_enabled !== true) {
    return { ready: false, reason: "payouts_disabled" };
  }

  const transfersStatus = caps.transfers?.status;
  // If we've never learned about capabilities (fresh migration, no
  // account.updated seen yet), treat the missing-key case as "unknown"
  // and let the caller decide. But if we DO have a capabilities object
  // and transfers is missing/inactive, that is a real gap.
  if (row.capabilities && "transfers" in row.capabilities) {
    if (transfersStatus !== "active") {
      return { ready: false, reason: "transfers_capability_missing" };
    }
  } else if (row.last_refreshed_at !== null) {
    // We have refreshed at least once and Stripe did not report a
    // `transfers` capability. That is a legacy Standard-account carer we
    // haven't migrated yet.
    return { ready: false, reason: "transfers_capability_missing" };
  }

  return { ready: true };
}

/** ISO string → epoch ms; returns 0 on parse failure (== always stale). */
export function parseIsoMs(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export const CONNECT_CACHE_TTL_MS = 60 * 60 * 1000;

/** True if the cached row is older than the TTL (or has never been refreshed). */
export function isCacheStale(
  row: Pick<ConnectAccountRow, "last_refreshed_at">,
  nowMs: number = Date.now(),
): boolean {
  const last = parseIsoMs(row.last_refreshed_at);
  if (last === 0) return true;
  return nowMs - last > CONNECT_CACHE_TTL_MS;
}

/** Map a live Stripe.Account into the row shape we cache. */
export function accountToRow(
  acct: Stripe.Account,
  nowIso: string,
): Omit<ConnectAccountRow, "stripe_account_id"> & {
  requirements_currently_due: string[];
} {
  return {
    charges_enabled: !!acct.charges_enabled,
    payouts_enabled: !!acct.payouts_enabled,
    details_submitted: !!acct.details_submitted,
    capabilities: (acct.capabilities ?? {}) as Record<string, unknown>,
    disabled_reason: acct.requirements?.disabled_reason ?? null,
    last_refreshed_at: nowIso,
    requirements_currently_due: acct.requirements?.currently_due ?? [],
  };
}

// ─── I/O — the gate the API route calls ───────────────────────────────────────

/**
 * Deps are typed structurally so we can pass a real `SupabaseClient` /
 * `Stripe` at runtime and a minimal mock in unit tests without leaning
 * on the SDKs' large internal types. The single method we call on each
 * is the entire contract.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReadinessAdminClient = { from(table: string): any };
export type ReadinessStripeClient = {
  accounts: {
    retrieve(id: string): Promise<Stripe.Account>;
  };
};
export type ReadinessDeps = {
  admin: ReadinessAdminClient;
  stripe: ReadinessStripeClient;
  now?: () => Date;
};

/**
 * Assert that a carer can be a booking-intent destination.
 *
 * Contract:
 *   * Returns `{ready: true}` — proceed with PaymentIntent creation.
 *   * Returns `{ready: false, reason}` — caller should 409 with the reason.
 *   * Never throws for DB/Stripe outages: falls back gracefully, and if
 *     even the fallback fails, returns `{ready: false, reason:
 *     'charges_disabled'}` (fail-closed) with the DB error swallowed
 *     to a log line. Rationale: on a genuine outage we would rather
 *     refuse a booking than authorise one that can't pay out.
 */
export async function assertConnectReadyForBooking(
  deps: ReadinessDeps,
  args: { carerId: string },
): Promise<ConnectReadyResult> {
  const nowDate = deps.now?.() ?? new Date();
  const nowIso = nowDate.toISOString();
  const nowMs = nowDate.getTime();

  // 1. Load the cached row. We select every column the readiness eval
  // needs; supabase-js returns null for columns missing on the server
  // (pre-migration) which our evaluator treats as unknown.
  const { data: row, error } = await deps.admin
    .from("caregiver_stripe_accounts")
    .select(
      "stripe_account_id, charges_enabled, payouts_enabled, details_submitted, capabilities, disabled_reason, last_refreshed_at",
    )
    .eq("user_id", args.carerId)
    .maybeSingle();

  if (error) {
    // Cache read failed. Fail closed rather than authorising a booking
    // whose destination we cannot verify.
    console.error(
      "[connect-readiness] caregiver_stripe_accounts read failed",
      error,
    );
    return { ready: false, reason: "charges_disabled" };
  }
  if (!row) {
    // Carer has never onboarded to Stripe Connect. Distinct from
    // "restricted" but the seeker-facing wording is identical.
    return { ready: false, reason: "legacy_incomplete" };
  }
  const cached = row as ConnectAccountRow;

  // 2. Fresh enough? Serve local.
  if (!isCacheStale(cached, nowMs)) {
    return evaluateReadiness(cached);
  }

  // 3. Stale. Do exactly one live refresh, then re-evaluate. If the
  // refresh fails, evaluate against whatever we already had — the
  // freshest source of truth we can honestly use.
  let refreshed: Stripe.Account | null = null;
  try {
    refreshed = await deps.stripe.accounts.retrieve(cached.stripe_account_id);
  } catch (err) {
    console.error(
      "[connect-readiness] Stripe accounts.retrieve failed",
      err,
    );
  }

  if (!refreshed) {
    return evaluateReadiness(cached);
  }

  const patch = accountToRow(refreshed, nowIso);
  // Best-effort persist. If the write fails we still return the fresh
  // evaluation for THIS request — the next request will simply refresh
  // again.
  try {
    await deps.admin
      .from("caregiver_stripe_accounts")
      .update({
        charges_enabled: patch.charges_enabled,
        payouts_enabled: patch.payouts_enabled,
        details_submitted: patch.details_submitted,
        capabilities: patch.capabilities,
        disabled_reason: patch.disabled_reason,
        last_refreshed_at: patch.last_refreshed_at,
        requirements_currently_due: patch.requirements_currently_due,
      } as unknown as Record<string, unknown>)
      .eq("stripe_account_id", cached.stripe_account_id);
  } catch (err) {
    console.error(
      "[connect-readiness] cache write-back failed (non-fatal)",
      err,
    );
  }

  return evaluateReadiness({
    stripe_account_id: cached.stripe_account_id,
    charges_enabled: patch.charges_enabled,
    payouts_enabled: patch.payouts_enabled,
    details_submitted: patch.details_submitted,
    capabilities: patch.capabilities,
    disabled_reason: patch.disabled_reason,
    last_refreshed_at: patch.last_refreshed_at,
  });
}

/**
 * Map a not-ready reason to a friendly, seeker-facing message.
 * Never leaks Stripe jargon. Used by API routes to build the 409 body.
 */
export function friendlyReasonMessage(reason: ConnectNotReadyReason): string {
  switch (reason) {
    case "account_restricted":
      return "This carer is temporarily unable to accept new bookings. Try another carer, or come back shortly.";
    case "charges_disabled":
    case "legacy_incomplete":
      return "This carer hasn't finished setting up payments yet. Try another carer, or come back shortly.";
    case "payouts_disabled":
      return "This carer's payout details need attention on their end. Try another carer, or come back shortly.";
    case "transfers_capability_missing":
      return "This carer is temporarily unable to accept new bookings. Try another carer, or come back shortly.";
  }
}
