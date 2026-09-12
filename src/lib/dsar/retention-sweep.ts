/**
 * Pure handler for the DSAR retention-sweep cron (C1.1).
 *
 * The C1 erasure handler (`handleDsarErase` in `./erase.ts`) writes rows
 * into `dsar_deferred_erasure_queue` for anything that couldn't be
 * hard-deleted at the moment of erasure because UK law requires it to
 * be kept for a defined period. Examples:
 *
 *   * Payroll rows      → HMRC / Companies Act, kept for 3–6 years.
 *   * Care records      → NHSX Records Management Code, 6 years.
 *   * Minors' records   → NHSX / IICSA, until 25th birthday / 75 years.
 *
 * This sweep runs nightly. It picks up rows where the retention
 * obligation has expired (`retained_until <= today`) and executes the
 * queued action — either a DELETE (whole-row) or an UPDATE ... SET x
 * = NULL (column-level tombstone). Every action is guarded against
 * repeat execution (`state IN ('pending','error')`), bounded by an
 * attempt cap, and reported per-row in the response body so the ops
 * dashboard can flag stuck rows.
 *
 * Design goals (documented so the tests can enforce them):
 *
 *   1. **Never touch a row whose retained_until is in the future.** A
 *      double-check inside the loop enforces this even if the SELECT
 *      predicate is somehow wrong.
 *   2. **Idempotent.** Rerunning against a `completed` row is a
 *      no-op (excluded by the WHERE state IN ('pending','error')).
 *   3. **Bounded batch size.** The cron cap (default 50) keeps the
 *      Vercel function under its 60s timeout even with a backlog.
 *   4. **Bounded retries.** After MAX_ATTEMPTS failures a row is
 *      flipped to state='skipped' and an admin_audit_log entry is
 *      filed via the injected `notifySkip` callback. The pure
 *      handler doesn't touch admin_audit_log directly — that stays
 *      in the route wrapper.
 *   5. **Schema-safe.** If the underlying deferred table isn't yet
 *      applied (42P01) the handler returns a first-class
 *      `skipped: 'schema_not_ready'` result rather than throwing.
 *   6. **Deploy-safe.** If a target row's owning table doesn't exist
 *      (e.g., a rename that hasn't been migrated), the per-row action
 *      is skipped with reason='target_schema_missing' and the queue
 *      row stays in `pending` for a human to reconcile.
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/**
 * The subset of `dsar_deferred_erasure_queue` columns this cron reads.
 * The schema lives in
 * `supabase/migrations/20260912010000_dsar_erasure_audit.sql`.
 */
export type DeferredQueueRow = {
  id: string;
  dsar_request_id: string;
  subject_email: string;
  subject_user_id: string | null;
  table_name: string;
  owner_column: string;
  owner_value: string;
  /**
   * If null → DELETE the whole row.
   * If set  → UPDATE ... SET column_name = NULL WHERE owner_column = owner_value.
   */
  column_name: string | null;
  retained_until: string; // 'YYYY-MM-DD'
  state: "pending" | "processing" | "completed" | "skipped" | "error";
  attempt_count: number;
};

export type RetentionSweepInput = {
  /** Injectable clock; defaults to `new Date()`. */
  now?: Date;
  /** Rows-per-invocation cap. */
  batch_limit?: number;
  /**
   * A row that has failed this many times is moved to state='skipped'
   * and reported via `notifySkip`. Default: 7 (retry nightly for a
   * week before giving up).
   */
  max_attempts?: number;
};

export type RetentionSweepResult = {
  ok: true;
  processed: number;
  results: RetentionSweepRowResult[];
  scanned_until: string; // ISO date of the sweep horizon
  skipped?: "schema_not_ready";
};

export type RetentionSweepRowResult = {
  id: string;
  dsar_request_id: string;
  action: "delete" | "null";
  status: "completed" | "future_retention" | "target_schema_missing" | "error" | "abandoned";
  reason?: string;
  rows_affected?: number;
  attempt_count?: number;
};

/**
 * Minimal client contract that mirrors the shape used by
 * `handleDsarErase`. The route wrapper adapts the real Supabase client;
 * tests pass a hand-rolled fake.
 */
export type RetentionSweepClient = {
  /** SELECT ... FROM dsar_deferred_erasure_queue for the batch. */
  listDueRows(
    horizon: string,
    limit: number,
  ): Promise<{
    data: DeferredQueueRow[] | null;
    error: { code?: string; message?: string } | null;
  }>;

  /**
   * UPDATE dsar_deferred_erasure_queue SET
   *   state=$1, attempt_count=$2, last_attempt_at=$3,
   *   last_error=$4, completed_at=$5
   * WHERE id=$6
   */
  updateRowState(input: {
    id: string;
    state: DeferredQueueRow["state"];
    attempt_count: number;
    last_attempt_at: string;
    last_error: string | null;
    completed_at: string | null;
  }): Promise<{ error: { message?: string } | null }>;

  /**
   * DELETE FROM {table} WHERE {owner_column} = {owner_value}.
   * Returns rows_affected on success.
   */
  hardDeleteRow(input: {
    table: string;
    owner_column: string;
    owner_value: string;
  }): Promise<{
    rows_affected: number;
    error: { code?: string; message?: string } | null;
  }>;

  /**
   * UPDATE {table} SET {column}=NULL WHERE {owner_column} = {owner_value}.
   */
  nullColumn(input: {
    table: string;
    column: string;
    owner_column: string;
    owner_value: string;
  }): Promise<{
    rows_affected: number;
    error: { code?: string; message?: string } | null;
  }>;

  /**
   * Optional side-channel: report a row that has been abandoned after
   * exhausting its retry budget. The route wrapper writes to
   * admin_audit_log. Tests capture calls.
   */
  notifySkip?(row: DeferredQueueRow, reason: string): Promise<void>;
};

// --------------------------------------------------------------------------
// Defaults
// --------------------------------------------------------------------------

const DEFAULT_BATCH_LIMIT = 50;
const DEFAULT_MAX_ATTEMPTS = 7;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function isoDate(d: Date): string {
  return `${d.getUTCFullYear().toString().padStart(4, "0")}-${(
    d.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${d.getUTCDate().toString().padStart(2, "0")}`;
}

/**
 * True iff the `retained_until` date is on-or-before the sweep horizon.
 * Both sides are `YYYY-MM-DD` strings so lexicographic order works.
 */
export function isDue(retained_until: string, horizon: string): boolean {
  return retained_until <= horizon;
}

function isSchemaNotReady(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "42P01") return true;
  return /relation .* does not exist/i.test(err.message ?? "");
}

// --------------------------------------------------------------------------
// The handler
// --------------------------------------------------------------------------

/**
 * Runs one sweep. Called by the cron route and directly by tests.
 *
 * The handler never throws for per-row problems — everything is
 * reported in `results[]`. It only rejects if the underlying client
 * itself is misconfigured (which is a bug the test suite catches).
 */
export async function handleRetentionSweep(
  client: RetentionSweepClient,
  input: RetentionSweepInput = {},
): Promise<RetentionSweepResult> {
  const now = input.now ?? new Date();
  const horizon = isoDate(now);
  const batchLimit = input.batch_limit ?? DEFAULT_BATCH_LIMIT;
  const maxAttempts = input.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
  const nowIso = now.toISOString();

  const listing = await client.listDueRows(horizon, batchLimit);
  if (listing.error) {
    if (isSchemaNotReady(listing.error)) {
      return {
        ok: true,
        processed: 0,
        results: [],
        scanned_until: horizon,
        skipped: "schema_not_ready",
      };
    }
    // Non-schema list errors are unusual (the underlying table exists
    // and is admin-read RLS). Report zero processed and let the caller
    // decide whether to alarm; we don't throw so a single blip doesn't
    // burn the whole cron slot.
    return {
      ok: true,
      processed: 0,
      results: [
        {
          id: "*",
          dsar_request_id: "*",
          action: "delete",
          status: "error",
          reason: `list:${listing.error.message ?? "unknown"}`,
        },
      ],
      scanned_until: horizon,
    };
  }

  const rows = listing.data ?? [];
  const results: RetentionSweepRowResult[] = [];

  for (const row of rows) {
    const action: "delete" | "null" = row.column_name === null ? "delete" : "null";

    // Safety valve — never touch a row whose retention obligation
    // hasn't expired, even if the SELECT predicate is wrong. This is
    // the guard the retention-map spec (§7 "hard rules") calls out.
    if (!isDue(row.retained_until, horizon)) {
      results.push({
        id: row.id,
        dsar_request_id: row.dsar_request_id,
        action,
        status: "future_retention",
        reason: `retained_until=${row.retained_until} > horizon=${horizon}`,
      });
      continue;
    }

    let rowsAffected = 0;
    let opError: { code?: string; message?: string } | null = null;

    if (action === "delete") {
      const del = await client.hardDeleteRow({
        table: row.table_name,
        owner_column: row.owner_column,
        owner_value: row.owner_value,
      });
      rowsAffected = del.rows_affected;
      opError = del.error;
    } else {
      const nulled = await client.nullColumn({
        table: row.table_name,
        column: row.column_name!,
        owner_column: row.owner_column,
        owner_value: row.owner_value,
      });
      rowsAffected = nulled.rows_affected;
      opError = nulled.error;
    }

    // The target table doesn't exist — likely a rename that hasn't
    // reached prod. Leave the row in state='pending' so a human can
    // reconcile; don't burn the attempt budget.
    if (isSchemaNotReady(opError)) {
      results.push({
        id: row.id,
        dsar_request_id: row.dsar_request_id,
        action,
        status: "target_schema_missing",
        reason: opError?.message ?? "relation not found",
      });
      continue;
    }

    const nextAttempt = row.attempt_count + 1;

    if (opError) {
      // Failure path — bump attempt_count, either retry-later or
      // abandon.
      const abandoning = nextAttempt >= maxAttempts;
      const upd = await client.updateRowState({
        id: row.id,
        state: abandoning ? "skipped" : "error",
        attempt_count: nextAttempt,
        last_attempt_at: nowIso,
        last_error: opError.message ?? "unknown error",
        completed_at: null,
      });
      results.push({
        id: row.id,
        dsar_request_id: row.dsar_request_id,
        action,
        status: abandoning ? "abandoned" : "error",
        reason: opError.message ?? "unknown error",
        attempt_count: nextAttempt,
      });
      // If the follow-up write itself failed there's nothing more to
      // do here — the next sweep will retry. Report loudly so it's
      // obvious.
      if (upd.error) {
        results[results.length - 1].reason =
          `${results[results.length - 1].reason} + update_state:${upd.error.message}`;
      }
      if (abandoning && client.notifySkip) {
        await client.notifySkip(row, opError.message ?? "unknown error");
      }
      continue;
    }

    // Success — mark completed.
    const upd = await client.updateRowState({
      id: row.id,
      state: "completed",
      attempt_count: nextAttempt,
      last_attempt_at: nowIso,
      last_error: null,
      completed_at: nowIso,
    });
    results.push({
      id: row.id,
      dsar_request_id: row.dsar_request_id,
      action,
      status: upd.error ? "error" : "completed",
      reason: upd.error ? `update_state:${upd.error.message}` : undefined,
      rows_affected: rowsAffected,
      attempt_count: nextAttempt,
    });
  }

  return {
    ok: true,
    processed: rows.length,
    results,
    scanned_until: horizon,
  };
}

// --------------------------------------------------------------------------
// Constants exposed for the route wrapper + tests
// --------------------------------------------------------------------------

export const RETENTION_SWEEP_CONSTANTS = {
  DEFAULT_BATCH_LIMIT,
  DEFAULT_MAX_ATTEMPTS,
  SWEEP_VERSION: "dsar-retention-sweep/1.0.0",
} as const;
