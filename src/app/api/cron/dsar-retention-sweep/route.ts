/**
 * GET /api/cron/dsar-retention-sweep
 *
 * Nightly (04:00 UTC, off-peak — retention is date-based, not time-based).
 * Walks `dsar_deferred_erasure_queue` and executes any row whose
 * `retained_until` has passed. Each row is either a whole-row DELETE
 * or a column-level SET x = NULL, per what the C1 erasure handler
 * queued when it fulfilled the original Article-17 request.
 *
 * Guarantees:
 *   * Idempotent — SELECT filter is `state IN ('pending','error')`.
 *   * Safe under partial rollout — a missing target table produces a
 *     first-class 'target_schema_missing' skip, not a 500.
 *   * Bounded retries — a row that fails MAX_ATTEMPTS times is moved
 *     to state='skipped' and reported to admin_audit_log.
 *   * Bounded batch — 50 rows per invocation keeps us under the
 *     Vercel function timeout even with a backlog.
 *
 * The heavy lifting lives in the pure `handleRetentionSweep` handler
 * (`src/lib/dsar/retention-sweep.ts`) so it can be unit-tested without
 * a live DB.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleRetentionSweep,
  RETENTION_SWEEP_CONSTANTS,
  type DeferredQueueRow,
  type RetentionSweepClient,
} from "@/lib/dsar/retention-sweep";

export const dynamic = "force-dynamic";

const QUEUE_TABLE = "dsar_deferred_erasure_queue";
const AUDIT_TABLE = "admin_audit_log";

const QUEUE_COLUMNS = [
  "id",
  "dsar_request_id",
  "subject_email",
  "subject_user_id",
  "table_name",
  "owner_column",
  "owner_value",
  "column_name",
  "retained_until",
  "state",
  "attempt_count",
].join(", ");

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();

  const client: RetentionSweepClient = {
    async listDueRows(horizon, limit) {
      const { data, error } = await admin
        .from(QUEUE_TABLE)
        .select(QUEUE_COLUMNS)
        .in("state", ["pending", "error"])
        .lte("retained_until", horizon)
        .order("retained_until", { ascending: true })
        .limit(limit);
      return {
        data: (data ?? null) as DeferredQueueRow[] | null,
        error: error
          ? { code: (error as { code?: string }).code, message: error.message }
          : null,
      };
    },

    async updateRowState(input) {
      const { error } = await admin
        .from(QUEUE_TABLE)
        .update({
          state: input.state,
          attempt_count: input.attempt_count,
          last_attempt_at: input.last_attempt_at,
          last_error: input.last_error,
          completed_at: input.completed_at,
        })
        .eq("id", input.id);
      return {
        error: error ? { message: error.message } : null,
      };
    },

    async hardDeleteRow(input) {
      const q = admin
        .from(input.table)
        .delete({ count: "exact" })
        .eq(input.owner_column, input.owner_value);
      const res = await q;
      return {
        rows_affected: (res as { count?: number | null }).count ?? 0,
        error: res.error
          ? {
              code: (res.error as { code?: string }).code,
              message: res.error.message,
            }
          : null,
      };
    },

    async nullColumn(input) {
      const q = admin
        .from(input.table)
        .update({ [input.column]: null }, { count: "exact" })
        .eq(input.owner_column, input.owner_value);
      const res = await q;
      return {
        rows_affected: (res as { count?: number | null }).count ?? 0,
        error: res.error
          ? {
              code: (res.error as { code?: string }).code,
              message: res.error.message,
            }
          : null,
      };
    },

    async notifySkip(row, reason) {
      // A row that has exhausted its retry budget is filed for human
      // reconciliation. We write to admin_audit_log with a fixed
      // action name so ops can search for these easily.
      await admin.from(AUDIT_TABLE).insert({
        actor_type: "system",
        actor_id: null,
        action: "dsar.retention.abandoned",
        target_type: "dsar_deferred_erasure_queue",
        target_id: row.id,
        details: {
          dsar_request_id: row.dsar_request_id,
          subject_email: row.subject_email,
          table_name: row.table_name,
          owner_column: row.owner_column,
          column_name: row.column_name,
          retained_until: row.retained_until,
          reason,
          sweep_version: RETENTION_SWEEP_CONSTANTS.SWEEP_VERSION,
        },
      });
    },
  };

  const res = await handleRetentionSweep(client);

  if (res.skipped === "schema_not_ready") {
    console.warn("[cron.dsar-retention-sweep] schema not ready — skipping");
  } else {
    console.log(
      `[cron.dsar-retention-sweep] processed=${res.processed} horizon=${res.scanned_until}`,
    );
  }

  return NextResponse.json(res);
}
