/**
 * GET /api/cron/dsar-fulfil
 *
 * Runs every 15 minutes. Picks up dsar_requests in state `in_progress`
 * and (per request):
 *
 *   1. Runs the subject export via exportSubject(admin, ...).
 *   2. Serialises the result as UTF-8 JSON.
 *   3. Uploads it to Supabase Storage bucket `dsar-exports` at path
 *      `{request_id}/subject-export.json`.
 *   4. Creates a 24-hour signed URL.
 *   5. Emails the signed URL to the subject.
 *   6. Flips state → `delivered`, stamps `delivered_at` and the
 *      object path.
 *
 * Guarantees:
 *   - Idempotent: rerunning the cron against a `delivered` row is a
 *     no-op (the WHERE state='in_progress' filter excludes them).
 *   - Deploy-safe: if the table isn't yet present or the storage
 *     bucket isn't created, we return a JSON body listing the skip
 *     reason rather than throwing.
 *   - Bounded: we cap the number of requests processed per invocation
 *     at BATCH_LIMIT so a backlog doesn't blow the Vercel function
 *     timeout.
 *
 * F1a — anonymous-submit resolution + observability:
 *   Row-processing logic lives in ./fulfil-handler.ts and is unit
 *   tested there. This route file owns auth, batch fetch, and the
 *   summary log line at the end of the tick.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { MANUAL_FULFILMENT_STATE } from "@/lib/dsar/submit-handler";
import {
  processDsarQueue,
  tallyResults,
  type QueuedRequest,
} from "./fulfil-handler";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 5;

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();

  // The primary filter is `state = 'in_progress'`, so rows in the
  // F1d soft-pause state (`awaiting_manual_fulfilment`) are already
  // excluded. We ALSO add an explicit `.neq(state, ...)` guard so a
  // future refactor that widens the primary filter (e.g. to include a
  // retry state) cannot accidentally hand a paused row to the broken
  // exporter. Once the exporter fix ships and the soft-pause is
  // reverted, this neq guard can be removed alongside the constant.
  const { data: queue, error: queueError } = await admin
    .from("dsar_requests")
    .select("id, subject_user_id, subject_email, request_type, state")
    .eq("state", "in_progress")
    .neq("state", MANUAL_FULFILMENT_STATE)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (queueError) {
    if (
      queueError.code === "42P01" ||
      /relation .* does not exist/i.test(queueError.message ?? "")
    ) {
      console.log(
        "[cron.dsar-fulfil] scanned 0, delivered 0, resolved 0, skipped_no_user 0, errors 0 (schema_not_ready)",
      );
      return NextResponse.json({
        ok: true,
        skipped: "schema_not_ready",
        processed: 0,
      });
    }
    console.error("[cron.dsar-fulfil] queue fetch failed:", queueError.message);
    return NextResponse.json(
      { ok: false, error: queueError.message },
      { status: 500 },
    );
  }

  // Defensive in-memory filter: if a paused row ever slips past the
  // SQL filter (e.g. Supabase client changes semantics of chained
  // neq(), or the primary filter is widened), skip it here rather than
  // sending a broken export. Logged loudly so the on-call notices.
  const rawRows = (queue ?? []) as (QueuedRequest & { state?: string })[];
  const rows: QueuedRequest[] = [];
  for (const r of rawRows) {
    if (r.state === MANUAL_FULFILMENT_STATE) {
      console.warn(
        "[cron.dsar-fulfil] refusing to process manual-fulfilment row " +
          `(F1d soft-pause) id=${r.id}`,
      );
      continue;
    }
    rows.push({
      id: r.id,
      subject_user_id: r.subject_user_id,
      subject_email: r.subject_email,
      request_type: r.request_type,
    });
  }

  const results = await processDsarQueue(rows, {
    admin,
    sendEmail,
  });

  const tally = tallyResults(results);
  console.log(
    `[cron.dsar-fulfil] scanned ${tally.scanned}, delivered ${tally.delivered}, resolved ${tally.resolved}, skipped_no_user ${tally.skipped_no_user}, errors ${tally.errors}`,
  );

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    results,
  });
}
