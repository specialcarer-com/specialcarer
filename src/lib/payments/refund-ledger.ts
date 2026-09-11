/**
 * Append-only refund ledger.
 *
 * The old design tracked the refunded total on `bookings.refunded_amount_cents`
 * and overwrote it whenever a webhook arrived. That silently loses
 * information when there are multiple partials, when a refund fails, or
 * when Stripe re-delivers the same event.
 *
 * Since B4 the ledger is the source of truth:
 *   * Every Stripe refund lifecycle event that we handle
 *     (`charge.refunded`, `charge.refund.updated`, `refund.failed`) writes
 *     one row per (stripe_refund_id, event_type). The unique index makes
 *     replay a no-op.
 *   * `projectRefundState(bookingId)` folds the ledger into a small
 *     structured view: total refunded (succeeded events only), latest
 *     status, last event time, failed-refund count. The reconciler
 *     compares that to the cached counter and flags disagreement rather
 *     than let the last-write-wins cache silently drift.
 *
 * Deploy-safety: `recordRefundEvent` is written to no-op with
 * `{ok:true, skippedReason:'schema_not_ready'}` if the table doesn't yet
 * exist. This is important because the migration sits in-repo but
 * unapplied per the ongoing migration freeze — pre-migration, everything
 * behaves exactly as before (last-write-wins on the cache) and once the
 * migration lands the ledger takes over transparently.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type RefundEventType =
  | "charge.refunded"
  | "charge.refund.updated"
  | "refund.failed";

export type RefundStripeStatus =
  | "succeeded"
  | "failed"
  | "pending"
  | "canceled"
  | "requires_action";

/**
 * One row in `refund_ledger`. `amount_cents` is the amount of THIS event
 * (not cumulative). Fold with {@link foldLedger} to get totals.
 */
export type RefundLedgerRow = {
  id?: string;
  booking_id: string;
  stripe_refund_id: string;
  stripe_event_id: string | null;
  event_type: RefundEventType;
  amount_cents: number;
  currency: string;
  status: RefundStripeStatus;
  reason: string | null;
  raw: Record<string, unknown>;
  created_at?: string;
};

export type RecordRefundEventInput = Omit<
  RefundLedgerRow,
  "id" | "created_at"
>;

export type RecordRefundEventResult =
  | { ok: true; inserted: boolean }
  | { ok: true; inserted: false; skippedReason: "schema_not_ready" }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LedgerAdminClient = { from(table: string): any };

// ─── Pure evaluators (testable without a DB) ────────────────────────────────

/**
 * Projection of the ledger for a single booking. Callers should treat this
 * as the source of truth for refund state; the cached
 * `bookings.refunded_amount_cents` counter is best-effort.
 */
export type RefundProjection = {
  total_refunded_cents: number;
  latest_refund_status: RefundStripeStatus | null;
  latest_event_type: RefundEventType | null;
  last_event_at: string | null;
  failed_refund_count: number;
  event_count: number;
};

/**
 * Fold a set of ledger rows into a projection.
 *
 * Rules:
 *   * `total_refunded_cents` sums `amount_cents` only where
 *     `status === 'succeeded'`. Failed/pending events do NOT count
 *     towards the total — the money never moved.
 *   * `latest_*` reflects the event with the maximum `created_at`, so a
 *     later `refund.failed` correctly surfaces as the latest state even
 *     though it doesn't affect the total.
 *   * Rows without a parseable `created_at` are treated as older than
 *     any row that has one.
 */
export function foldLedger(rows: RefundLedgerRow[]): RefundProjection {
  if (rows.length === 0) {
    return {
      total_refunded_cents: 0,
      latest_refund_status: null,
      latest_event_type: null,
      last_event_at: null,
      failed_refund_count: 0,
      event_count: 0,
    };
  }

  let total = 0;
  let failed = 0;
  let latestMs = -Infinity;
  let latest: RefundLedgerRow | null = null;

  for (const row of rows) {
    if (row.status === "succeeded") {
      total += row.amount_cents;
    }
    if (row.event_type === "refund.failed" || row.status === "failed") {
      failed += 1;
    }
    const t = row.created_at ? Date.parse(row.created_at) : -Infinity;
    if (Number.isFinite(t) && t > latestMs) {
      latestMs = t;
      latest = row;
    }
  }

  return {
    total_refunded_cents: total,
    latest_refund_status: latest?.status ?? null,
    latest_event_type: latest?.event_type ?? null,
    last_event_at: latest?.created_at ?? null,
    failed_refund_count: failed,
    event_count: rows.length,
  };
}

/**
 * Compare the ledger projection to the cached counter on `bookings`.
 * Returns `null` when they agree; otherwise a structured discrepancy the
 * caller can log or alert on.
 *
 * A cache of `null` is treated as 0 (the counter has never been written).
 */
export type LedgerCacheDiscrepancy = {
  booking_id: string;
  ledger_total_cents: number;
  cache_total_cents: number;
  delta_cents: number;
};
export function detectLedgerCacheDiscrepancy(args: {
  bookingId: string;
  ledger: RefundProjection;
  cached_refunded_amount_cents: number | null;
}): LedgerCacheDiscrepancy | null {
  const cached = args.cached_refunded_amount_cents ?? 0;
  if (cached === args.ledger.total_refunded_cents) return null;
  return {
    booking_id: args.bookingId,
    ledger_total_cents: args.ledger.total_refunded_cents,
    cache_total_cents: cached,
    delta_cents: args.ledger.total_refunded_cents - cached,
  };
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

/** Postgres error code for "relation does not exist" (undefined_table). */
const PG_UNDEFINED_TABLE = "42P01";

/**
 * Record a refund event to the ledger. Idempotent via the
 * (stripe_refund_id, event_type) unique index — a duplicate insert is
 * silently no-oped.
 *
 * Deploy-safe: if the `refund_ledger` table doesn't exist yet (migration
 * not applied), returns `{ok:true, inserted:false,
 * skippedReason:'schema_not_ready'}`. Callers should not treat that as
 * an error.
 */
export async function recordRefundEvent(
  admin: LedgerAdminClient,
  input: RecordRefundEventInput,
): Promise<RecordRefundEventResult> {
  try {
    // upsert with onConflict on the unique index → duplicate delivery is
    // a no-op. We ignoreDuplicates so the client doesn't fetch back the
    // conflicting row.
    const { error } = await admin
      .from("refund_ledger")
      .upsert(input, {
        onConflict: "stripe_refund_id,event_type",
        ignoreDuplicates: true,
      });
    if (error) {
      if (
        (error as { code?: string }).code === PG_UNDEFINED_TABLE ||
        /refund_ledger.*does not exist/i.test(
          (error as { message?: string }).message ?? "",
        )
      ) {
        return {
          ok: true,
          inserted: false,
          skippedReason: "schema_not_ready",
        };
      }
      return {
        ok: false,
        error:
          (error as { message?: string }).message ??
          "unknown ledger insert error",
      };
    }
    return { ok: true, inserted: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Read the ledger for a booking and fold it into a projection.
 *
 * Deploy-safe: if the table doesn't exist yet, returns a zero
 * projection with `event_count: 0`. Callers can treat that identically
 * to "no refund activity yet".
 */
export async function projectRefundState(
  admin: LedgerAdminClient,
  bookingId: string,
): Promise<RefundProjection> {
  const { data, error } = await admin
    .from("refund_ledger")
    .select(
      "booking_id, stripe_refund_id, stripe_event_id, event_type, amount_cents, currency, status, reason, raw, created_at",
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  if (error) {
    if (
      (error as { code?: string }).code === PG_UNDEFINED_TABLE ||
      /refund_ledger.*does not exist/i.test(
        (error as { message?: string }).message ?? "",
      )
    ) {
      return foldLedger([]);
    }
    // On other DB errors return an empty projection — callers use this
    // as an advisory signal alongside the existing cache; a hard throw
    // here would break the webhook path.
    console.error("[refund-ledger] projectRefundState read failed", error);
    return foldLedger([]);
  }
  return foldLedger((data ?? []) as RefundLedgerRow[]);
}
