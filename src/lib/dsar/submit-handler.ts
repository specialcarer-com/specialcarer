/**
 * Pure handler for POST /api/dsar/submit.
 *
 * Extracted from the route file so it can be unit-tested under
 * `node --test` without pulling in `next/server`. The route file wires
 * this up to the real Supabase clients + email transport.
 *
 * Two flows:
 *
 *   1. **Anonymous** (or auth-uid ≠ subject_user_id, or auth-email ≠
 *      subject_email): insert row in state `verifying` with a
 *      verification token, and email the token to `subject_email`.
 *      Unchanged from PR #210's shipping behaviour.
 *
 *   2. **Authenticated fast-path** — the caller is signed in, AND the
 *      body's `subject_user_id` matches `auth.uid()`, AND (case-
 *      insensitively) the body's `subject_email` matches
 *      `auth.user.email`. In this case the ownership of the email is
 *      already proven by the session; we skip the verification email,
 *      insert the row with `verified_at = now()` and state
 *      `in_progress` (so the /api/cron/dsar-fulfil sweeper picks it
 *      up on its next tick), and send a `renderDsarConfirmationEmail`
 *      "we received your request" mail instead of the "click to
 *      confirm" one.
 *
 * Mismatch handling (auth-uid ≠ body subject_user_id, OR auth-email ≠
 * body subject_email) deliberately falls through to the anonymous
 * verification path — treating it as a soft error rather than
 * returning 400 keeps the endpoint resilient to a signed-in user
 * pasting someone else's email address (they'll never see the
 * verification email because it goes to the OTHER address). This is
 * documented in the delivery report §7 and in the tests.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateVerificationToken } from "@/lib/dsar/token";
import {
  renderDsarVerifyEmail,
  renderDsarConfirmationEmail,
} from "@/lib/dsar/emails";

export const ALLOWED_TYPES = [
  "access",
  "erasure",
  "rectification",
  "portability",
] as const;
export type DsarRequestType = (typeof ALLOWED_TYPES)[number];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UNDEFINED_TABLE = "42P01";

export type AuthedUser = { id: string; email: string | null | undefined };

export type SubmitEmailResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

export type SubmitEmailFn = (args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<SubmitEmailResult | unknown>;

/**
 * The verification email path can fail after we've inserted the row
 * (invalid RESEND_API_KEY, provider outage, bad from-address). If we
 * ignore that, the row sits in state='verifying' forever with nothing
 * to signal it — this cost hours of prod debugging on 15 Sep 2026.
 * We treat any thrown error or ok:false result as a hard failure:
 * mark the row state='failed' and record the error in
 * verification_error (added by migration 20260915235500).
 *
 * The fast-path (authenticated) branch's confirmation email is
 * best-effort — the row is already in in_progress and the cron will
 * pick it up regardless, so a bounced "we received your request"
 * mail does not need to fail the request. We still log it.
 */
function isEmailResult(v: unknown): v is SubmitEmailResult {
  return (
    typeof v === "object" &&
    v !== null &&
    "ok" in (v as Record<string, unknown>) &&
    typeof (v as Record<string, unknown>).ok === "boolean"
  );
}

export type SubmitBody = {
  email?: unknown;
  type?: unknown;
  request_type?: unknown; // accepted alongside `type` for the settings/data client
  subject_email?: unknown; // accepted alongside `email`
  subject_user_id?: unknown;
  notes?: unknown;
};

export type SubmitDeps = {
  admin: Pick<SupabaseClient, "from">;
  authedUser: AuthedUser | null;
  sendEmail: SubmitEmailFn;
  origin: string;
  now?: () => Date;
};

export type SubmitResult =
  | { status: 202; body: { ok: true; fast_path: boolean; id: string } }
  | { status: number; body: { ok: false; code: string } };

function readString(v: unknown, max = 320): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function normaliseEmail(v: unknown): string {
  return readString(v).trim().toLowerCase();
}

export async function handleDsarSubmit(
  body: SubmitBody,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  const now = deps.now?.() ?? new Date();
  const emailRaw =
    normaliseEmail(body.email) || normaliseEmail(body.subject_email);
  const type = readString(body.type) || readString(body.request_type);
  const notes =
    typeof body.notes === "string" ? body.notes.slice(0, 2000) : null;

  if (!EMAIL_RE.test(emailRaw)) {
    return { status: 400, body: { ok: false, code: "invalid_email" } };
  }
  if (!ALLOWED_TYPES.includes(type as DsarRequestType)) {
    return { status: 400, body: { ok: false, code: "invalid_type" } };
  }

  // Auth fast-path detection. We require BOTH id AND email match so a
  // signed-in user can't request an export of someone else's data by
  // typing the other person's email in the form.
  const claimedUserId =
    typeof body.subject_user_id === "string" && body.subject_user_id.length > 0
      ? body.subject_user_id
      : null;
  const authedEmail = normaliseEmail(deps.authedUser?.email ?? "");
  const isFastPath = Boolean(
    deps.authedUser &&
      claimedUserId &&
      claimedUserId === deps.authedUser.id &&
      authedEmail &&
      authedEmail === emailRaw,
  );

  const admin = deps.admin;

  // Resolve subject_user_id for storage. On fast-path we already have
  // it; on anonymous, best-effort lookup by email.
  let subject_user_id: string | null = null;
  if (isFastPath) {
    subject_user_id = deps.authedUser!.id;
  } else {
    const { data: profile } = await (admin
      .from("profiles")
      .select("id")
      .eq("email", emailRaw)
      .maybeSingle() as unknown as Promise<{
      data: { id: string } | null;
    }>);
    subject_user_id = profile?.id ?? null;
  }

  const nowIso = now.toISOString();

  const insertRow: Record<string, unknown> = {
    subject_user_id,
    subject_email: emailRaw,
    // Best-effort attribution. On fast-path this is the caller;
    // on anonymous flow this is whatever profile-lookup returned
    // (nulls are fine).
    requested_by: deps.authedUser?.id ?? subject_user_id,
    request_type: type,
    notes,
  };

  let raw = ""; // filled only on the anonymous path
  if (isFastPath) {
    insertRow.state = "in_progress";
    insertRow.verified_at = nowIso;
  } else {
    const token = generateVerificationToken();
    raw = token.raw;
    insertRow.state = "verifying";
    insertRow.verification_token_hash = token.hash;
    insertRow.verification_token_issued_at = nowIso;
  }

  const insertRes = (await (admin
    .from("dsar_requests")
    .insert(insertRow)
    .select("id")
    .single() as unknown as Promise<{
    data: { id: string } | null;
    error: { code?: string; message?: string } | null;
  }>));

  if (insertRes.error) {
    const code = insertRes.error.code;
    if (
      code === UNDEFINED_TABLE ||
      /relation .* does not exist/i.test(insertRes.error.message ?? "")
    ) {
      return { status: 503, body: { ok: false, code: "schema_not_ready" } };
    }
    return { status: 500, body: { ok: false, code: "insert_failed" } };
  }

  const id = insertRes.data?.id ?? "";

  if (isFastPath) {
    const mail = renderDsarConfirmationEmail({
      subject_email: emailRaw,
      request_type: type,
    });
    await deps.sendEmail({
      to: emailRaw,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } else {
    const verify_url = `${deps.origin.replace(/\/$/, "")}/api/dsar/verify/${raw}`;
    const mail = renderDsarVerifyEmail({
      subject_email: emailRaw,
      request_type: type,
      verify_url,
    });
    let sendError: string | null = null;
    try {
      const result = await deps.sendEmail({
        to: emailRaw,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      if (isEmailResult(result) && !result.ok) {
        // `SubmitEmailResult` permits `error: ""`. An empty string
        // would be falsy below and silently skip the failure branch,
        // returning 202 with a row permanently stuck in `verifying`.
        // Fall back to a non-empty message so the failure path always
        // fires and admins have something to grep for.
        sendError = result.error || "unknown_send_failure";
      }
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
      if (!sendError) sendError = "unknown_send_failure";
    }

    if (sendError) {
      // Row is stuck in state='verifying' with no way for the subject
      // to complete the flow. Flip to state='failed' and stamp the
      // reason so the admin queue can surface it. Capture the update
      // result — Supabase can resolve with { error } and if we ignore
      // it we recreate the very stuck-row condition this change is
      // supposed to prevent.
      const updateRes = (await (admin
        .from("dsar_requests")
        .update({
          state: "failed",
          verification_error: sendError.slice(0, 500),
        })
        .eq("id", id) as unknown as Promise<{
        error: { message?: string; code?: string } | null;
      }>));
      if (updateRes.error) {
        // The row is still in `verifying`. Log loudly so the on-call
        // has a searchable signal and can manually reconcile.
        console.error(
          "[dsar-submit] CRITICAL: failed to mark row as failed after send failure",
          {
            rowId: id,
            sendError,
            updateError: updateRes.error.message ?? String(updateRes.error),
          },
        );
        return {
          status: 502,
          body: {
            ok: false,
            code: "verification_email_failed_and_row_update_failed",
          },
        };
      }
      return {
        status: 502,
        body: { ok: false, code: "verification_email_failed" },
      };
    }
  }

  return { status: 202, body: { ok: true, fast_path: isFastPath, id } };
}
