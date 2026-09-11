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
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderDsarDeliveredEmail } from "@/lib/dsar/emails";
import { exportSubject, type ExportAdminClient } from "@/lib/dsar/export";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 5;
const STORAGE_BUCKET = "dsar-exports";
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

type QueuedRequest = {
  id: string;
  subject_user_id: string | null;
  subject_email: string;
  request_type: string;
};

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();

  const { data: queue, error: queueError } = await admin
    .from("dsar_requests")
    .select("id, subject_user_id, subject_email, request_type")
    .eq("state", "in_progress")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (queueError) {
    if (
      queueError.code === "42P01" ||
      /relation .* does not exist/i.test(queueError.message ?? "")
    ) {
      return NextResponse.json({
        ok: true,
        skipped: "schema_not_ready",
        processed: 0,
      });
    }
    return NextResponse.json(
      { ok: false, error: queueError.message },
      { status: 500 },
    );
  }

  const rows = (queue ?? []) as QueuedRequest[];
  const results: Array<{
    id: string;
    status: "delivered" | "error" | "skipped_no_subject";
    reason?: string;
  }> = [];

  for (const row of rows) {
    // Without a user id we can't run the export. Rather than blocking
    // the queue, leave the row in place; a human will follow up (they
    // land in the admin queue as "no linked account").
    if (!row.subject_user_id) {
      results.push({ id: row.id, status: "skipped_no_subject" });
      continue;
    }

    try {
      const exportDoc = await exportSubject(admin as unknown as ExportAdminClient, {
        user_id: row.subject_user_id,
        email: row.subject_email,
      });

      const objectPath = `${row.id}/subject-export.json`;
      const body = new Blob(
        [JSON.stringify(exportDoc, null, 2)],
        { type: "application/json" },
      );
      const { error: uploadError } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, body, {
          contentType: "application/json",
          upsert: true,
        });
      if (uploadError) {
        results.push({
          id: row.id,
          status: "error",
          reason: `upload:${uploadError.message}`,
        });
        continue;
      }

      const { data: signed, error: signError } = await admin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed?.signedUrl) {
        results.push({
          id: row.id,
          status: "error",
          reason: `sign:${signError?.message ?? "unknown"}`,
        });
        continue;
      }

      const mail = renderDsarDeliveredEmail({
        subject_email: row.subject_email,
        request_type: row.request_type,
        signed_url: signed.signedUrl,
        expires_in_hours: SIGNED_URL_TTL_SECONDS / 3600,
        digest: exportDoc.subject.digest,
      });
      await sendEmail({
        to: row.subject_email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });

      const { error: updateError } = await admin
        .from("dsar_requests")
        .update({
          state: "delivered",
          delivered_at: new Date().toISOString(),
          delivery_object_path: objectPath,
        })
        .eq("id", row.id)
        .eq("state", "in_progress"); // guard against concurrent flip

      if (updateError) {
        results.push({
          id: row.id,
          status: "error",
          reason: `update:${updateError.message}`,
        });
        continue;
      }

      results.push({ id: row.id, status: "delivered" });
    } catch (err) {
      results.push({
        id: row.id,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    results,
  });
}
