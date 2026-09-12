/**
 * Pure handler for the admin "manual queue action" endpoint (C1.4).
 *
 * Backs POST /api/admin/dsar/deferred/[id] with two actions:
 *
 *   1. `retry`   — reset an errored / abandoned queue row so the next
 *                  cron tick picks it up again. Reserved for the case
 *                  where an admin has fixed the underlying cause
 *                  (e.g., re-applied a missed migration, restored a
 *                  Supabase RLS policy, unblocked a target table).
 *
 *   2. `skip`    — permanently mark a queue row as skipped without
 *                  executing it. Reserved for the case where the
 *                  underlying record has already been removed
 *                  through another channel, so the queued action is
 *                  no longer meaningful.
 *
 * Both actions:
 *   * Require the row to exist (404 not_found).
 *   * Require the row's state to be eligible for the action
 *     (409 wrong_state).
 *   * For `retry`, require `retained_until <= today` so the admin
 *     cannot short-circuit a legally required retention window
 *     (409 retention_active).
 *   * Write a paired admin_audit_log entry via the injected
 *     `logAction` callback.
 *   * Are safe to double-fire — the state guard on the UPDATE means
 *     the second call returns 409 concurrent_update.
 */

import {
  canManuallyRetry,
  canManuallySkip,
  type DeferredQueueViewRow,
} from "./deferred-queue-view";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeferredQueueAction = "retry" | "skip";

export type DeferredQueueActionInput = {
  row_id: string;
  action: DeferredQueueAction;
  /** Optional operator notes (audit-only, max 500 chars). */
  notes?: string | null;
  /** Injected clock; defaults to `new Date()`. */
  now?: Date;
};

export type DeferredQueueActionClient = {
  fetchById(
    rowId: string,
  ): Promise<{
    data: DeferredQueueViewRow | null;
    error: { code?: string; message: string } | null;
  }>;

  /**
   * Reset an errored row to `pending` so the cron picks it up.
   *
   *   UPDATE dsar_deferred_erasure_queue
   *      SET state='pending',
   *          attempt_count=0,
   *          last_attempt_at=NULL,
   *          last_error=NULL
   *    WHERE id=$1 AND state=$2
   *    RETURNING id
   *
   * The `state=$2` guard prevents overwriting a row that flipped to
   * 'processing' in the meantime.
   */
  markRetry(input: {
    row_id: string;
    previous_state: "error" | "skipped";
  }): Promise<{ ok: boolean; error?: { code?: string; message: string } }>;

  /**
   * Flip a pending / errored row to `skipped` without running the
   * queued action.
   *
   *   UPDATE dsar_deferred_erasure_queue
   *      SET state='skipped',
   *          last_error=$2,
   *          completed_at=$3
   *    WHERE id=$1 AND state=$4
   *    RETURNING id
   */
  markSkip(input: {
    row_id: string;
    reason: string;
    completed_at: string;
    previous_state: "pending" | "error";
  }): Promise<{ ok: boolean; error?: { code?: string; message: string } }>;

  /**
   * Records the action in `admin_audit_log`. Best-effort — a failure
   * here is logged to console but the primary UPDATE is not rolled
   * back (the state change is the source of truth for the cron).
   */
  logAction(input: {
    action: "dsar_deferred_queue_retry" | "dsar_deferred_queue_skip";
    row_id: string;
    dsar_request_id: string;
    subject_email: string;
    notes?: string | null;
  }): Promise<void>;
};

export type DeferredQueueActionResult =
  | { ok: true; action: DeferredQueueAction; row_id: string }
  | { ok: false; error: DeferredQueueActionError; status: number; detail?: string };

export type DeferredQueueActionError =
  | "invalid_id"
  | "invalid_action"
  | "not_found"
  | "wrong_state"
  | "retention_active"
  | "concurrent_update"
  | "read_failed"
  | "write_failed"
  | "schema_not_ready";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Rough uuid check. The DB is the ultimate arbiter; we just want
 * to reject obviously malformed input before a round-trip.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidRowId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

export function isValidAction(action: unknown): action is DeferredQueueAction {
  return action === "retry" || action === "skip";
}

/**
 * Notes are audit-only. We accept 0-500 chars, trimmed. Anything
 * else is silently dropped rather than raising — a missing note is
 * not a client error.
 */
export function normaliseNotes(notes: unknown): string | null {
  if (typeof notes !== "string") return null;
  const trimmed = notes.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 500);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** Timezone-safe `YYYY-MM-DD` for London civil time. */
function londonTodayIso(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Distinguish "underlying table doesn't exist yet" from ordinary
 * read/write errors. Mirrors the retention-sweep classification so
 * the pre-migration environment returns a diagnostic instead of a
 * 500. See PostgREST error reference for PGRST106 / PGRST205 /
 * PostgreSQL 42P01.
 */
function isSchemaNotReady(
  err: { code?: string; message: string } | null | undefined,
): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  if (code === "PGRST205" || code === "PGRST106" || code === "42P01") {
    return true;
  }
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("relation \"dsar_deferred_erasure_queue\"") ||
    msg.includes("could not find the table")
  );
}

export async function handleDeferredQueueAction(
  input: DeferredQueueActionInput,
  client: DeferredQueueActionClient,
): Promise<DeferredQueueActionResult> {
  if (!isValidRowId(input.row_id)) {
    return { ok: false, error: "invalid_id", status: 400 };
  }
  if (!isValidAction(input.action)) {
    return { ok: false, error: "invalid_action", status: 400 };
  }

  const now = input.now ?? new Date();
  const today = londonTodayIso(now);
  const notes = normaliseNotes(input.notes);

  const fetched = await client.fetchById(input.row_id);
  if (fetched.error) {
    if (isSchemaNotReady(fetched.error)) {
      return {
        ok: false,
        error: "schema_not_ready",
        status: 503,
        detail: fetched.error.message,
      };
    }
    return {
      ok: false,
      error: "read_failed",
      status: 500,
      detail: fetched.error.message,
    };
  }
  const row = fetched.data;
  if (!row) {
    return { ok: false, error: "not_found", status: 404 };
  }

  if (input.action === "retry") {
    if (row.state !== "error" && row.state !== "skipped") {
      return {
        ok: false,
        error: "wrong_state",
        status: 409,
        detail: `current state: ${row.state}`,
      };
    }
    if (!canManuallyRetry(row, today)) {
      return {
        ok: false,
        error: "retention_active",
        status: 409,
        detail: `retained_until=${row.retained_until}, today=${today}`,
      };
    }
    const write = await client.markRetry({
      row_id: row.id,
      previous_state: row.state,
    });
    if (!write.ok) {
      if (isSchemaNotReady(write.error ?? null)) {
        return {
          ok: false,
          error: "schema_not_ready",
          status: 503,
          detail: write.error?.message,
        };
      }
      // If no error is returned but ok is false, the state guard
      // failed — someone else changed the row underneath us.
      if (!write.error) {
        return { ok: false, error: "concurrent_update", status: 409 };
      }
      return {
        ok: false,
        error: "write_failed",
        status: 500,
        detail: write.error?.message,
      };
    }
  } else {
    // action === 'skip'
    if (!canManuallySkip(row)) {
      return {
        ok: false,
        error: "wrong_state",
        status: 409,
        detail: `current state: ${row.state}`,
      };
    }
    const write = await client.markSkip({
      row_id: row.id,
      reason: notes ?? "Manually skipped by admin.",
      completed_at: now.toISOString(),
      previous_state: row.state as "pending" | "error",
    });
    if (!write.ok) {
      if (isSchemaNotReady(write.error ?? null)) {
        return {
          ok: false,
          error: "schema_not_ready",
          status: 503,
          detail: write.error?.message,
        };
      }
      if (!write.error) {
        return { ok: false, error: "concurrent_update", status: 409 };
      }
      return {
        ok: false,
        error: "write_failed",
        status: 500,
        detail: write.error?.message,
      };
    }
  }

  // Best-effort audit log. A failure here does not roll back the
  // state change — the state change itself is the record of truth
  // for the cron. We swallow the error and let the caller record it
  // in its own logs.
  try {
    await client.logAction({
      action:
        input.action === "retry"
          ? "dsar_deferred_queue_retry"
          : "dsar_deferred_queue_skip",
      row_id: row.id,
      dsar_request_id: row.dsar_request_id,
      subject_email: row.subject_email,
      notes,
    });
  } catch {
    // Deliberate — see comment above.
  }

  return { ok: true, action: input.action, row_id: row.id };
}
