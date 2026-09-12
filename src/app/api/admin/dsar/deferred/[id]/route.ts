/**
 * POST /api/admin/dsar/deferred/[id]
 *
 * Admin-only endpoint that lets the compliance officer take one of
 * two manual actions on a row in `public.dsar_deferred_erasure_queue`:
 *
 *   * `{"action":"retry"}` — reset an errored / abandoned row so the
 *     next `/api/cron/dsar-retention-sweep` tick picks it up again.
 *     Reserved for the case where the underlying cause has been
 *     fixed (missing migration re-applied, target table restored,
 *     etc.). Refuses if `retained_until` is still in the future.
 *
 *   * `{"action":"skip"}` — permanently mark a pending / errored row
 *     as skipped without running the queued action. Reserved for the
 *     case where the underlying record has already been removed
 *     through another channel and the queued action is no longer
 *     meaningful.
 *
 * Optional body field `notes` (0-500 chars) is captured on the paired
 * `admin_audit_log` row for the audit trail.
 *
 * All business logic lives in the pure handler
 * `src/lib/dsar/deferred-queue-action.ts` so it can be unit-tested
 * without a live DB.
 */

import { NextResponse } from "next/server";
import { logAdminAction, requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleDeferredQueueAction,
  isValidAction,
  normaliseNotes,
  type DeferredQueueAction,
  type DeferredQueueActionClient,
} from "@/lib/dsar/deferred-queue-action";
import type { DeferredQueueViewRow } from "@/lib/dsar/deferred-queue-view";

export const dynamic = "force-dynamic";

const QUEUE_TABLE = "dsar_deferred_erasure_queue";

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
  "last_attempt_at",
  "last_error",
  "completed_at",
  "created_at",
].join(", ");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  const rawAction =
    typeof body === "object" && body !== null && "action" in body
      ? (body as { action: unknown }).action
      : undefined;
  const notes =
    typeof body === "object" && body !== null && "notes" in body
      ? (body as { notes: unknown }).notes
      : null;

  if (!isValidAction(rawAction)) {
    return NextResponse.json(
      { ok: false, error: "invalid_action" },
      { status: 400 },
    );
  }
  const action: DeferredQueueAction = rawAction;
  const normalisedNotes = normaliseNotes(notes);

  const admin = createAdminClient();

  const client: DeferredQueueActionClient = {
    async fetchById(rowId) {
      const { data, error } = await admin
        .from(QUEUE_TABLE)
        .select(QUEUE_COLUMNS)
        .eq("id", rowId)
        .maybeSingle<DeferredQueueViewRow>();
      return {
        data: data ?? null,
        error: error
          ? { code: (error as { code?: string }).code, message: error.message }
          : null,
      };
    },

    async markRetry({ row_id, previous_state }) {
      const { data, error } = await admin
        .from(QUEUE_TABLE)
        .update({
          state: "pending",
          attempt_count: 0,
          last_attempt_at: null,
          last_error: null,
        })
        .eq("id", row_id)
        .eq("state", previous_state)
        .select("id")
        .maybeSingle();
      if (error) {
        return {
          ok: false,
          error: { message: error.message },
        };
      }
      // No row returned → the `.eq("state", previous_state)` guard
      // filtered us out. Signal concurrent_update by returning ok:false
      // with no error message.
      return { ok: Boolean(data) };
    },

    async markSkip({ row_id, reason, completed_at, previous_state }) {
      const { data, error } = await admin
        .from(QUEUE_TABLE)
        .update({
          state: "skipped",
          last_error: reason,
          completed_at,
        })
        .eq("id", row_id)
        .eq("state", previous_state)
        .select("id")
        .maybeSingle();
      if (error) {
        return {
          ok: false,
          error: { message: error.message },
        };
      }
      return { ok: Boolean(data) };
    },

    async logAction({ action: auditAction, row_id, dsar_request_id, subject_email, notes: auditNotes }) {
      await logAdminAction({
        admin: guard.admin,
        action: auditAction,
        targetType: "dsar_deferred_erasure_queue",
        targetId: row_id,
        details: {
          dsar_request_id,
          subject_email,
          notes: auditNotes ?? undefined,
        },
      });
    },
  };

  const result = await handleDeferredQueueAction(
    { row_id: id, action, notes: normalisedNotes },
    client,
  );

  if (result.ok) {
    return NextResponse.json(
      { ok: true, action: result.action, row_id: result.row_id },
      { status: 200 },
    );
  }
  return NextResponse.json(
    { ok: false, error: result.error, detail: result.detail },
    { status: result.status },
  );
}
