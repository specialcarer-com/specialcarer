/**
 * E1 — Refund reconciliation state-machine cron (pure logic module).
 *
 * All I/O is confined to route.ts; this file is pure and unit-tested.
 *
 * Input: a set of refund_ledger events (raw Stripe refund payload in
 * `raw`), plus a map of payments keyed by stripe_charge_id. Output: an
 * array of refund_reconciliation upsert rows and a per-run counter
 * summary.
 *
 * Decision matrix (from PR E1 spec §3):
 *
 *   Group by stripe_refund_id, sum amount_cents where the ledger row's
 *   status is 'succeeded' → observed_amount_cents.
 *
 *   For each group:
 *     ┌ no matching payments row ─────────────────────────
 *     │   state = 'mismatch', mismatch_reason = 'orphan_refund'
 *     │
 *     ├ observed_amount_cents > payment.amount_cents ────
 *     │   state = 'mismatch', mismatch_reason = 'over_refunded'
 *     │
 *     ├ observed == expected AND latest status = succeeded
 *     │   state = 'reconciled', reconciled_at = now()
 *     │
 *     ├ observed < expected AND ≥1 event has status 'succeeded'
 *     │   state = 'partial'
 *     │
 *     └ else (observed == expected but not yet succeeded, or no
 *       succeeded events at all)
 *         state = 'initiated'
 *
 * The reason we care about "at least one succeeded event" for the
 * partial branch: multiple `charge.refund.updated` rows may show status
 * 'pending' or 'failed' before a `charge.refunded` with succeeded. We
 * treat 'partial' as a real money-moved state; 'initiated' is
 * "we've seen events but nothing moved yet".
 */

export type LedgerEvent = {
  stripe_refund_id: string;
  amount_cents: number;
  currency: string;
  status:
    | "succeeded"
    | "failed"
    | "pending"
    | "canceled"
    | "requires_action";
  event_type: string;
  booking_id: string;
  // From the ledger's raw jsonb — Stripe refund events include the charge
  // id at either raw.charge (Refund object) or raw.payment_intent depending
  // on which webhook fired. See extractChargeIdFromRaw() below.
  raw: unknown;
  created_at: string;
};

/**
 * A payments row snapshot the reconciliation logic needs — kept minimal
 * so tests don't have to build the full payments schema.
 */
export type PaymentSnapshot = {
  stripe_charge_id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  currency: string;
  status: string; // payment_status enum, e.g. 'succeeded' | 'refunded' | 'partially_refunded' | ...
};

export type ReconciliationRowUpsert = {
  booking_id: string;
  stripe_refund_id: string;
  stripe_payment_intent_id: string;
  expected_amount_cents: number;
  observed_amount_cents: number;
  currency: string;
  state:
    | "initiated"
    | "partial"
    | "fully_refunded"
    | "mismatch"
    | "reconciled";
  reconciled_at: string | null;
  mismatch_reason: string | null;
  raw: Record<string, unknown>;
};

export type ReconciliationSummary = {
  processed: number;
  reconciled: number;
  partial: number;
  initiated: number;
  mismatched: number;
};

/**
 * Extract the Stripe charge id from a ledger event's `raw` jsonb.
 *
 * `charge.refunded` fires with a Charge object → `raw.id` is the charge
 * itself (we don't take that path; the ledger writes per-refund rows
 * where raw is the Refund child). For a Refund payload the fields are
 * `charge` and `payment_intent` (both are Stripe id strings). Some
 * older API versions serialise objects instead of strings.
 */
export function extractChargeIdFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ch = r.charge;
  if (typeof ch === "string" && ch.length > 0) return ch;
  if (ch && typeof ch === "object" && "id" in ch) {
    const id = (ch as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}

/**
 * Group ledger events by stripe_refund_id and reduce each group to an
 * upsert row. Callers pass a payment lookup keyed on stripe_charge_id.
 *
 * `now` is injected for determinism in tests. In production it's
 * `new Date()`.
 */
export function reconcile(args: {
  events: LedgerEvent[];
  paymentsByChargeId: Map<string, PaymentSnapshot>;
  now: Date;
}): { rows: ReconciliationRowUpsert[]; summary: ReconciliationSummary } {
  const groups = new Map<string, LedgerEvent[]>();
  for (const e of args.events) {
    const list = groups.get(e.stripe_refund_id) ?? [];
    list.push(e);
    groups.set(e.stripe_refund_id, list);
  }

  const rows: ReconciliationRowUpsert[] = [];
  const summary: ReconciliationSummary = {
    processed: 0,
    reconciled: 0,
    partial: 0,
    initiated: 0,
    mismatched: 0,
  };

  for (const [refundId, groupEvents] of groups) {
    summary.processed += 1;
    // Sum only succeeded events into observed — pending/failed money did
    // not move. Same rule as refund-ledger.foldLedger().
    const observed = groupEvents
      .filter((e) => e.status === "succeeded")
      .reduce((acc, e) => acc + e.amount_cents, 0);

    const anySucceeded = groupEvents.some((e) => e.status === "succeeded");

    // Prefer the most recently created event for booking_id / charge id
    // extraction — the ledger appends and we want the latest snapshot of
    // what Stripe told us.
    const sorted = [...groupEvents].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const latest = sorted[sorted.length - 1]!;
    const chargeId = sorted
      .map((e) => extractChargeIdFromRaw(e.raw))
      .find((v): v is string => typeof v === "string" && v.length > 0);

    const payment = chargeId
      ? args.paymentsByChargeId.get(chargeId) ?? null
      : null;

    if (!payment) {
      rows.push({
        booking_id: latest.booking_id,
        stripe_refund_id: refundId,
        // No matching payment — carry a placeholder PI (empty string is
        // NOT NULL friendly, but we prefer the charge id if we have it
        // so the row is still linkable to the Stripe dashboard).
        stripe_payment_intent_id: chargeId ?? "",
        expected_amount_cents: 0,
        observed_amount_cents: observed,
        currency: latest.currency,
        state: "mismatch",
        reconciled_at: null,
        mismatch_reason: "orphan_refund",
        raw: { latest_event_type: latest.event_type },
      });
      summary.mismatched += 1;
      continue;
    }

    let state: ReconciliationRowUpsert["state"];
    let mismatch_reason: string | null = null;
    let reconciled_at: string | null = null;

    if (observed > payment.amount_cents) {
      state = "mismatch";
      mismatch_reason = "over_refunded";
      summary.mismatched += 1;
    } else if (
      observed === payment.amount_cents &&
      anySucceeded &&
      (payment.status === "refunded" || payment.status === "succeeded")
    ) {
      // Full refund AND payments row has advanced (either to
      // 'refunded' as the terminal state, or still 'succeeded'
      // pre-Stripe-webhook-mutation of payments.status by the main
      // handler). Treat as reconciled.
      state = "reconciled";
      reconciled_at = args.now.toISOString();
      summary.reconciled += 1;
    } else if (observed < payment.amount_cents && anySucceeded) {
      state = "partial";
      summary.partial += 1;
    } else {
      // observed == expected but no succeeded events yet, OR observed is
      // 0 with only pending/failed events.
      state = "initiated";
      summary.initiated += 1;
    }

    rows.push({
      booking_id: payment.stripe_payment_intent_id
        ? latest.booking_id
        : latest.booking_id,
      stripe_refund_id: refundId,
      stripe_payment_intent_id: payment.stripe_payment_intent_id,
      expected_amount_cents: payment.amount_cents,
      observed_amount_cents: observed,
      currency: payment.currency ?? latest.currency,
      state,
      reconciled_at,
      mismatch_reason,
      raw: {
        latest_event_type: latest.event_type,
        payment_status: payment.status,
      },
    });
  }

  return { rows, summary };
}
