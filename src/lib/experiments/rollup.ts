/**
 * Pure rollup handler for /api/cron/experiment-rollup (E3).
 *
 * Kept in a separate module so it can be exercised under the node
 * test runner without spinning up the Next.js route. The DB side is
 * injected via `ExperimentRollupClient`.
 */

export type RollupInputRow = {
  experiment_id: string;
  variant: string;
  status: string;
};

export type RollupOutputRow = {
  experiment_id: string;
  variant: string;
  n_offers: number;
  n_accepted: number;
  n_declined: number;
  n_expired: number;
};

export type ExperimentRollupClient = {
  listOffers: () => Promise<{
    rows: RollupInputRow[];
    error: string | null;
  }>;
  upsertRow: (
    row: RollupOutputRow,
  ) => Promise<{ error: string | null }>;
};

export type RollupResult =
  | { ok: true; scanned: number; upserted: number }
  | { ok: false; error: string; scanned: number; upserted: number };

/**
 * Group offers by (experiment_id, variant), count each status bucket,
 * and upsert one aggregate row per group. Idempotent — the caller's
 * upsertRow points at experiment_daily_rollup with an ON CONFLICT
 * clause on (experiment_id, variant, day).
 *
 * Statuses that don't fall into {accepted, declined, expired} still
 * count toward `n_offers` but no dedicated bucket — matches the accept
 * rate the admin surface renders:
 *
 *   accept_rate = n_accepted / (n_accepted + n_declined + n_expired)
 *
 * (rows in 'pending' / 'cancelled' / 'lost' are correctly excluded
 * from both numerator and denominator by that formula.)
 */
export async function aggregateExperimentOffers(
  client: ExperimentRollupClient,
): Promise<RollupResult> {
  const { rows, error } = await client.listOffers();
  if (error) {
    return { ok: false, error, scanned: 0, upserted: 0 };
  }

  const groups = new Map<string, RollupOutputRow>();
  for (const row of rows) {
    if (!row.experiment_id || !row.variant) continue;
    if (row.variant !== "control" && row.variant !== "treatment") continue;
    const key = `${row.experiment_id}::${row.variant}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = {
        experiment_id: row.experiment_id,
        variant: row.variant,
        n_offers: 0,
        n_accepted: 0,
        n_declined: 0,
        n_expired: 0,
      };
      groups.set(key, acc);
    }
    acc.n_offers += 1;
    if (row.status === "accepted") acc.n_accepted += 1;
    else if (row.status === "declined") acc.n_declined += 1;
    else if (row.status === "expired") acc.n_expired += 1;
    // pending / lost / cancelled don't get a bucket by design.
  }

  let upserted = 0;
  for (const g of groups.values()) {
    const { error: upErr } = await client.upsertRow(g);
    if (upErr) {
      return {
        ok: false,
        error: upErr,
        scanned: rows.length,
        upserted,
      };
    }
    upserted += 1;
  }

  return { ok: true, scanned: rows.length, upserted };
}
