/**
 * Pure handler for the refund reconciler cron (Phase A / A3).
 *
 * Two orphan classes need periodic recovery:
 *
 *   1. `pending_stripe` — the admin route claimed the booking (set
 *      refund_request_key + refund_status='pending_stripe') and then failed
 *      before Stripe returned success. Either Stripe accepted the refund and
 *      the response was lost, or the request never made it. We fetch Stripe's
 *      view of the world by the same idempotency key (refund_request_key)
 *      and complete or fail the claim accordingly.
 *
 *   2. `pending_db_reconciliation` — Stripe accepted the refund but the
 *      post-Stripe DB persist failed. The booking still has the request_key
 *      set. We fetch the refund from Stripe and copy its final state onto
 *      the booking row.
 *
 * Everything here is a pure orchestration function over a narrow client
 * surface so it can be unit-tested without hitting Supabase or Stripe.
 */

/**
 * A stuck refund claim seen from the database side. Whatever the DB thinks
 * about a request-key that hasn't reached a terminal state yet.
 */
export type StuckClaim = {
  bookingId: string;
  refundRequestKey: string;
  refundStatus: "pending_stripe" | "pending_db_reconciliation";
  ageMs: number;
};

/**
 * The subset of a Stripe Refund we care about for reconciliation. Kept as
 * a plain object so tests can construct one without a Stripe SDK type
 * pulled in.
 */
export type StripeRefundView = {
  id: string;
  status: "pending" | "succeeded" | "failed" | "canceled" | "requires_action";
  amountCents: number;
  paymentIntentId: string;
  createdAt: string; // ISO
  failureReason?: string | null;
};

/**
 * Outcome for a single stuck claim after we've resolved it.
 */
export type ReconcileOutcome =
  | { bookingId: string; kind: "completed"; refundId: string; amountCents: number }
  | { bookingId: string; kind: "failed_permanent"; reason: string }
  | { bookingId: string; kind: "still_pending"; reason: string }
  | { bookingId: string; kind: "error"; error: string };

/** Narrow client surface — the route wires this to Supabase + Stripe. */
export type ReconcilerClient = {
  /**
   * Return every booking whose refund is stuck in a non-terminal state
   * older than `staleAfterMs`. The DB-side filter is on `refund_status IN
   * ('pending_stripe','pending_db_reconciliation') AND refund_request_key
   * IS NOT NULL AND updated_at < now() - stale_after`.
   */
  findStuck(staleAfterMs: number): Promise<{
    claims: StuckClaim[];
    error: string | null;
  }>;

  /**
   * Look up the Stripe refund associated with `refund_request_key`. Stripe
   * indexes refunds by metadata but not by idempotency key server-side, so
   * we search by listing recent refunds and matching the metadata field
   * we set at creation time. Returns null if Stripe has no such refund.
   */
  findStripeRefundByKey(requestKey: string): Promise<{
    refund: StripeRefundView | null;
    error: string | null;
  }>;

  /**
   * Mark a claim `completed` — Stripe succeeded, DB now catches up.
   */
  markCompleted(input: {
    bookingId: string;
    requestKey: string;
    refund: StripeRefundView;
  }): Promise<{ error: string | null }>;

  /**
   * Mark a claim `failed_permanent` — Stripe rejected it (or told us it
   * never existed and we've waited long enough that it never will).
   */
  markFailed(input: {
    bookingId: string;
    requestKey: string;
    reason: string;
  }): Promise<{ error: string | null }>;
};

/**
 * How long a claim must sit in a non-terminal state before we touch it.
 * We do not want to race the happy path: the admin route can take a few
 * seconds to finish and the webhook may arrive shortly after. 10 minutes
 * is a safe floor that still catches genuine orphans within an hour.
 */
export const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * If a claim has sat unresolved for longer than this, and Stripe still
 * has no record of the refund, we call it permanently failed. Stripe
 * would have surfaced the refund by now if it were ever going to.
 */
export const DEFAULT_GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

export type ReconcileResult = {
  status: number;
  body:
    | {
        ok: true;
        scanned: number;
        completed: number;
        failed: number;
        still_pending: number;
        errors: number;
        outcomes: ReconcileOutcome[];
      }
    | { ok: false; error: string };
};

export async function reconcileStuckRefunds(
  client: ReconcilerClient,
  opts?: {
    staleAfterMs?: number;
    giveUpAfterMs?: number;
  },
): Promise<ReconcileResult> {
  const staleAfterMs = opts?.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const giveUpAfterMs = opts?.giveUpAfterMs ?? DEFAULT_GIVE_UP_AFTER_MS;

  const { claims, error } = await client.findStuck(staleAfterMs);
  if (error) {
    return { status: 500, body: { ok: false, error } };
  }

  const outcomes: ReconcileOutcome[] = [];
  for (const claim of claims) {
    outcomes.push(await resolveClaim(client, claim, giveUpAfterMs));
  }

  const summary = summarize(outcomes);
  return {
    status: 200,
    body: {
      ok: true,
      scanned: claims.length,
      completed: summary.completed,
      failed: summary.failed,
      still_pending: summary.stillPending,
      errors: summary.errors,
      outcomes,
    },
  };
}

/**
 * Resolve one stuck claim. Exported for unit tests.
 */
export async function resolveClaim(
  client: ReconcilerClient,
  claim: StuckClaim,
  giveUpAfterMs: number,
): Promise<ReconcileOutcome> {
  const { refund, error } = await client.findStripeRefundByKey(
    claim.refundRequestKey,
  );
  if (error) {
    return { bookingId: claim.bookingId, kind: "error", error };
  }

  // Stripe has never heard of this refund. Either the create call never
  // reached them or it errored so early no refund object was made.
  if (!refund) {
    if (claim.ageMs >= giveUpAfterMs) {
      const failMsg = "no_stripe_refund_after_give_up_window";
      const fail = await client.markFailed({
        bookingId: claim.bookingId,
        requestKey: claim.refundRequestKey,
        reason: failMsg,
      });
      if (fail.error) {
        return { bookingId: claim.bookingId, kind: "error", error: fail.error };
      }
      return { bookingId: claim.bookingId, kind: "failed_permanent", reason: failMsg };
    }
    return {
      bookingId: claim.bookingId,
      kind: "still_pending",
      reason: "no_stripe_refund_yet",
    };
  }

  switch (refund.status) {
    case "succeeded": {
      const done = await client.markCompleted({
        bookingId: claim.bookingId,
        requestKey: claim.refundRequestKey,
        refund,
      });
      if (done.error) {
        return { bookingId: claim.bookingId, kind: "error", error: done.error };
      }
      return {
        bookingId: claim.bookingId,
        kind: "completed",
        refundId: refund.id,
        amountCents: refund.amountCents,
      };
    }
    case "failed":
    case "canceled": {
      const reason = refund.failureReason ?? `stripe_${refund.status}`;
      const fail = await client.markFailed({
        bookingId: claim.bookingId,
        requestKey: claim.refundRequestKey,
        reason,
      });
      if (fail.error) {
        return { bookingId: claim.bookingId, kind: "error", error: fail.error };
      }
      return { bookingId: claim.bookingId, kind: "failed_permanent", reason };
    }
    case "pending":
    case "requires_action":
    default: {
      // Refund exists but hasn't settled. Do not touch the row — the
      // webhook or a later sweep will pick it up.
      return {
        bookingId: claim.bookingId,
        kind: "still_pending",
        reason: `stripe_${refund.status}`,
      };
    }
  }
}

function summarize(outcomes: ReconcileOutcome[]) {
  let completed = 0;
  let failed = 0;
  let stillPending = 0;
  let errors = 0;
  for (const o of outcomes) {
    if (o.kind === "completed") completed++;
    else if (o.kind === "failed_permanent") failed++;
    else if (o.kind === "still_pending") stillPending++;
    else errors++;
  }
  return { completed, failed, stillPending, errors };
}
