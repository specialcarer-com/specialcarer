/**
 * Pure handler for the DSAR fulfilment cron.
 *
 * Extracted from route.ts so it can be unit tested under `node --test`
 * without pulling in `next/server`. Mirrors the submit-handler shape
 * (see src/lib/dsar/submit-handler.ts).
 *
 * Anonymous-submit fix (F1a):
 *
 *   When a DSAR is filed via POST /api/dsar/submit without an auth
 *   session, we may not have been able to resolve the subject's
 *   `subject_user_id` at submission time (the profiles-table lookup
 *   returned nothing). Once the row lands in `in_progress`, this
 *   handler retries the resolution via `auth.users` (via the admin
 *   listUsers API), matching case-insensitively on email. If a user
 *   is found we backfill the row and continue with the export flow.
 *   If no user matches we leave the row and emit an explicit
 *   `skipped_no_matching_user` result (no more silent
 *   `skipped_no_subject`).
 *
 * Observability (F1a):
 *
 *   The route wrapper is responsible for emitting the summary log
 *   line — this handler only returns the tallied results. That keeps
 *   the pure function pure (no console noise inside tests).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportAdminClient } from "@/lib/dsar/export";
import { exportSubject } from "@/lib/dsar/export";
import { renderDsarDeliveredEmail } from "@/lib/dsar/emails";
import type { SendEmailInput, SendEmailResult } from "@/lib/email/smtp";

export const STORAGE_BUCKET = "dsar-exports";
export const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
export const LIST_USERS_PAGE_SIZE = 200;
export const LIST_USERS_MAX_PAGES = 10;

export type FulfilStatus =
  | "delivered"
  | "error"
  | "skipped_no_matching_user";

export type UserLookupOutcome =
  | { kind: "found"; id: string }
  | { kind: "not_found" }
  | { kind: "lookup_failed"; reason: string };

export type FulfilResult = {
  id: string;
  status: FulfilStatus;
  reason?: string;
  resolved_subject_user_id?: string;
};

export type QueuedRequest = {
  id: string;
  subject_user_id: string | null;
  subject_email: string;
  request_type: string;
};

// Narrow the sendEmail dep to the concrete result type. `SendEmailResult |
// unknown` collapses to `unknown` and would silently swallow ok:false.
export type FulfilSendEmail = (
  input: SendEmailInput,
) => Promise<SendEmailResult>;

export type FulfilAdmin = Pick<SupabaseClient, "from" | "storage" | "auth">;

export type FulfilDeps = {
  admin: FulfilAdmin;
  sendEmail: FulfilSendEmail;
  now?: () => Date;
};

/**
 * Look up an auth.users row by email (case-insensitive). Returns a
 * discriminated outcome so the caller can distinguish:
 *
 *   - `found`         — matched an existing auth.users row; use `id`.
 *   - `not_found`     — paging terminated naturally (short page or
 *                       reached the end) without a match. This means
 *                       no auth.users row exists for this email.
 *   - `lookup_failed` — listUsers returned an error, or we exhausted
 *                       LIST_USERS_MAX_PAGES without terminating
 *                       (i.e. more than 2,000 users exist and none
 *                       matched inside that window). The caller MUST
 *                       treat this as a transient error and retry on
 *                       the next cron tick, not downgrade it to
 *                       "user doesn't exist".
 *
 * The function does not throw so a single bad listUsers response
 * cannot take down a whole cron tick — the tick continues with the
 * next row.
 */
export async function resolveUserIdByEmail(
  admin: FulfilAdmin,
  email: string,
): Promise<UserLookupOutcome> {
  const target = email.trim().toLowerCase();
  if (!target) {
    return { kind: "lookup_failed", reason: "empty_email" };
  }
  let page = 1;
  for (let i = 0; i < LIST_USERS_MAX_PAGES; i++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PAGE_SIZE,
    });
    if (error || !data?.users) {
      return {
        kind: "lookup_failed",
        reason: `listUsers:${error?.message ?? "missing_users_payload"}`,
      };
    }
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target,
    );
    if (match) return { kind: "found", id: match.id };
    // A short page means Supabase returned fewer than perPage rows,
    // i.e. we've reached the end of the user table without a match.
    if (data.users.length < LIST_USERS_PAGE_SIZE) {
      return { kind: "not_found" };
    }
    page += 1;
  }
  // We paged all the way to LIST_USERS_MAX_PAGES without terminating
  // or matching. Treat this as a lookup failure (not a confirmed
  // no-match) so we retry on the next tick and surface it in the
  // errors count.
  return {
    kind: "lookup_failed",
    reason: `exceeded_max_pages:${LIST_USERS_MAX_PAGES}`,
  };
}

export async function processDsarQueue(
  rows: QueuedRequest[],
  deps: FulfilDeps,
): Promise<FulfilResult[]> {
  const results: FulfilResult[] = [];
  const now = deps.now?.() ?? new Date();

  for (const row of rows) {
    let subject_user_id: string | null = row.subject_user_id;
    let resolved: string | undefined;

    // F1a: retry auth.users lookup for anonymous submissions that
    // arrived with a null subject_user_id.
    if (!subject_user_id) {
      const outcome = await resolveUserIdByEmail(
        deps.admin,
        row.subject_email,
      );
      if (outcome.kind === "lookup_failed") {
        // Do NOT downgrade this to skipped_no_matching_user — that
        // would hide API failures and treat users beyond the lookup
        // window as non-existent. Surface as an error so the summary
        // log has the right tally and the row is retried next tick.
        results.push({
          id: row.id,
          status: "error",
          reason: `resolve:${outcome.reason}`,
        });
        continue;
      }
      if (outcome.kind === "not_found") {
        results.push({ id: row.id, status: "skipped_no_matching_user" });
        continue;
      }
      subject_user_id = outcome.id;
      resolved = outcome.id;

      // Backfill the row so the admin queue reflects the linkage. Not
      // fatal if this update fails; we still proceed with the export.
      const { error: backfillError } = await deps.admin
        .from("dsar_requests")
        .update({ subject_user_id: outcome.id })
        .eq("id", row.id)
        .eq("state", "in_progress");
      if (backfillError) {
        results.push({
          id: row.id,
          status: "error",
          reason: `backfill:${backfillError.message}`,
          resolved_subject_user_id: resolved,
        });
        continue;
      }
    }

    try {
      const exportDoc = await exportSubject(
        deps.admin as unknown as ExportAdminClient,
        {
          user_id: subject_user_id,
          email: row.subject_email,
        },
      );

      const objectPath = `${row.id}/subject-export.json`;
      const body = new Blob(
        [JSON.stringify(exportDoc, null, 2)],
        { type: "application/json" },
      );
      const { error: uploadError } = await deps.admin.storage
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
          resolved_subject_user_id: resolved,
        });
        continue;
      }

      const { data: signed, error: signError } = await deps.admin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed?.signedUrl) {
        results.push({
          id: row.id,
          status: "error",
          reason: `sign:${signError?.message ?? "unknown"}`,
          resolved_subject_user_id: resolved,
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
      // sendEmail does NOT throw on transport failure — it resolves
      // to { ok: false, error }. If we don't check .ok here we flip
      // the row to `delivered` with the subject never receiving the
      // signed URL. That is exactly the class of silent-failure bug
      // this PR is meant to fix, so replicating it in the cron would
      // defeat the purpose.
      const sent = await deps.sendEmail({
        to: row.subject_email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      if (!sent.ok) {
        results.push({
          id: row.id,
          status: "error",
          reason: `email:${sent.error || "unknown_send_failure"}`,
          resolved_subject_user_id: resolved,
        });
        // Do NOT flip to delivered. Leave the row in in_progress so
        // the next tick retries. The storage object is idempotent
        // (upsert:true), so a retry re-uploads and re-signs cleanly.
        continue;
      }

      const { error: updateError } = await deps.admin
        .from("dsar_requests")
        .update({
          state: "delivered",
          delivered_at: now.toISOString(),
          delivery_object_path: objectPath,
        })
        .eq("id", row.id)
        .eq("state", "in_progress"); // guard against concurrent flip

      if (updateError) {
        results.push({
          id: row.id,
          status: "error",
          reason: `update:${updateError.message}`,
          resolved_subject_user_id: resolved,
        });
        continue;
      }

      results.push({
        id: row.id,
        status: "delivered",
        resolved_subject_user_id: resolved,
      });
    } catch (err) {
      results.push({
        id: row.id,
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
        resolved_subject_user_id: resolved,
      });
    }
  }

  return results;
}

/**
 * Tally results by status. Used by the route wrapper to emit the
 * summary log line at the end of a tick.
 */
export function tallyResults(results: FulfilResult[]) {
  let delivered = 0;
  let resolved = 0;
  let skipped_no_user = 0;
  let errors = 0;
  for (const r of results) {
    if (r.status === "delivered") delivered += 1;
    else if (r.status === "skipped_no_matching_user") skipped_no_user += 1;
    else if (r.status === "error") errors += 1;
    if (r.resolved_subject_user_id) resolved += 1;
  }
  return {
    scanned: results.length,
    delivered,
    resolved,
    skipped_no_user,
    errors,
  };
}
