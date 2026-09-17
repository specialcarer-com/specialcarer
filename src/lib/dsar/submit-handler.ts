/**
 * Pure handler for POST /api/dsar/submit.
 *
 * Extracted from the route file so it can be unit-tested under
 * `node --test` without pulling in `next/server`. The route file wires
 * this up to the real Supabase clients + email transport.
 *
 * ---------------------------------------------------------------------------
 * F1d — SOFT PAUSE (17 Sep 2026):
 *
 * The automated DSAR exporter (`exporter_version: dsar-export/1.0.0`)
 * has schema drift and would deliver a JSON export missing 8 of 11
 * subject-data tables. See
 *   /home/user/workspace/phase_f/dsar_exporter_schema_drift_17sep.md
 *
 * Until the exporter fix ships (parallel PR), every submission — anonymous
 * OR authenticated — is routed to the new `awaiting_manual_fulfilment`
 * state. The dsar_requests row is still created (so the one-calendar-month
 * UK-GDPR Article 12(3) clock starts on submission) and the response is
 * still an HTTP 202, but:
 *
 *   * we do NOT send the verification email (nothing to verify — Ops
 *     will fulfil out-of-band),
 *   * we do NOT send the confirmation email on the fast-path (replaced
 *     by the same manual-fulfilment 202 body),
 *   * the /api/cron/dsar-fulfil sweeper skips the row (it only looks at
 *     state='in_progress'; this pause also adds an explicit filter
 *     defence),
 *   * Ops receive an alert to `ops@specialcarer.com` (or `OPS_ALERT_EMAIL`)
 *     so they know a row is waiting.
 *
 * When the exporter fix ships this branch should be REVERTED: submissions
 * return to state `verifying` (anonymous) or `in_progress` (fast-path) and
 * the verification/confirmation emails resume.
 * ---------------------------------------------------------------------------
 *
 * Pre-pause behaviour, for reference / revert:
 *
 *   1. **Anonymous** (or auth-uid ≠ subject_user_id, or auth-email ≠
 *      subject_email): insert row in state `verifying` with a
 *      verification token, and email the token to `subject_email`.
 *
 *   2. **Authenticated fast-path** — the caller is signed in, AND the
 *      body's `subject_user_id` matches `auth.uid()`, AND (case-
 *      insensitively) the body's `subject_email` matches
 *      `auth.user.email`. In this case ownership of the email is proven
 *      by the session; we skip the verification email, insert the row
 *      with `verified_at = now()` and state `in_progress`, and send a
 *      `renderDsarConfirmationEmail` "we received your request" mail.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// NOTE (F1d soft-pause): token generation and the verify/confirmation
// email renderers are intentionally NOT imported during the pause — no
// row is left awaiting a click, and Ops receive an out-of-band alert
// instead. When the exporter fix ships and this file is reverted, both
// imports (`generateVerificationToken`, `renderDsarVerifyEmail`,
// `renderDsarConfirmationEmail`) come back along with the pre-pause
// verifying/in_progress flow.

export const ALLOWED_TYPES = [
  "access",
  "erasure",
  "rectification",
  "portability",
] as const;
export type DsarRequestType = (typeof ALLOWED_TYPES)[number];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UNDEFINED_TABLE = "42P01";

/**
 * F1d soft-pause marker. When the exporter fix ships and this pause is
 * reverted, remove the constant and the code paths that reference it.
 * The constant is exported so the cron guard and any admin tooling can
 * refer to the same string without drift.
 */
export const MANUAL_FULFILMENT_STATE = "awaiting_manual_fulfilment";

/**
 * Copy for the row-level notes column. Kept as a single source of truth
 * so the admin queue and any tooling that greps for paused rows stay
 * aligned. `pauseReference` should be a link or PR number Ops can point
 * back to when they pick the row up.
 */
export function manualFulfilmentNotes(pauseReference: string): string {
  return `Automated exporter paused pending schema-drift fix — see ${pauseReference}. Fulfil manually via admin.`;
}

export const MANUAL_FULFILMENT_MESSAGE =
  "Your request has been received. Our team will process it and email you within 30 days.";

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
  /**
   * F1d soft-pause: mailbox alerted when a manual-fulfilment row lands.
   * Defaults to `OPS_ALERT_EMAIL` env var, then `ops@specialcarer.com`,
   * matching the convention used by the payout webhook and DBS crons.
   * Injectable for tests.
   */
  opsMailbox?: string;
  /**
   * F1d soft-pause: string embedded in the row's notes column so Ops
   * can trace back to the PR that introduced the pause. Defaults to a
   * generic marker; the route wrapper passes a more specific reference
   * where possible.
   */
  pauseReference?: string;
};

export type SubmitResult =
  | {
      status: 202;
      body:
        | {
            ok: true;
            id: string;
            manual_fulfilment: true;
            message: string;
          }
        // Pre-pause shape, retained so the revert PR does not have to
        // touch this union. During the soft-pause the handler never
        // returns this variant.
        | { ok: true; fast_path: boolean; id: string };
    }
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

  // Auth fast-path detection is retained even during the soft-pause:
  // it still governs whether we stamp `verified_at` and how we attribute
  // the row, and it lets Ops see in the audit trail that the session
  // had proven ownership at submission time. It no longer changes the
  // state — every path lands in `awaiting_manual_fulfilment`.
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

  // ------------------------------------------------------------------
  // F1d soft-pause: every submission — anonymous OR authenticated —
  // lands in `awaiting_manual_fulfilment`. We still populate
  // `verified_at` for the fast-path so the paper trail records that
  // the session had already proven ownership of the email address at
  // submission time. No verification token is issued (there's nothing
  // to click) and no verification / confirmation email is sent.
  //
  // Any human-supplied notes are preserved; the bot-generated pause
  // marker is appended so Ops can filter for these rows without
  // clobbering caller intent.
  // ------------------------------------------------------------------
  const pauseReference = deps.pauseReference ?? "the DSAR soft-pause PR";
  const pauseNote = manualFulfilmentNotes(pauseReference);
  const combinedNotes = notes ? `${notes}\n\n${pauseNote}` : pauseNote;

  const insertRow: Record<string, unknown> = {
    subject_user_id,
    subject_email: emailRaw,
    requested_by: deps.authedUser?.id ?? subject_user_id,
    request_type: type,
    notes: combinedNotes,
    state: MANUAL_FULFILMENT_STATE,
  };
  if (isFastPath) {
    insertRow.verified_at = nowIso;
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

  // ------------------------------------------------------------------
  // F1d soft-pause: alert Ops so someone actually picks the row up.
  // The subject-facing 202 promises a response within 30 days; without
  // this ping there is no trigger. Delivery failure is logged but does
  // NOT fail the request — the row exists, the statutory clock is
  // ticking, and the admin queue is the source of truth Ops audit
  // against anyway.
  // ------------------------------------------------------------------
  const opsMailbox =
    deps.opsMailbox ??
    process.env.OPS_ALERT_EMAIL ??
    "ops@specialcarer.com";
  const opsMail = renderDsarManualFulfilmentOpsAlert({
    id,
    subject_email: emailRaw,
    request_type: type,
    is_authenticated: isFastPath,
    submitted_at: nowIso,
    pause_reference: pauseReference,
  });
  try {
    const sent = await deps.sendEmail({
      to: opsMailbox,
      subject: opsMail.subject,
      html: opsMail.html,
      text: opsMail.text,
    });
    if (isEmailResult(sent) && !sent.ok) {
      console.error(
        "[dsar-submit] manual-fulfilment ops alert send failed",
        {
          rowId: id,
          to: opsMailbox,
          error: sent.error || "unknown_send_failure",
        },
      );
    }
  } catch (err) {
    console.error(
      "[dsar-submit] manual-fulfilment ops alert threw",
      {
        rowId: id,
        to: opsMailbox,
        error: err instanceof Error ? err.message : String(err),
      },
    );
  }

  return {
    status: 202,
    body: {
      ok: true,
      id,
      manual_fulfilment: true,
      message: MANUAL_FULFILMENT_MESSAGE,
    },
  };
}

/**
 * F1d soft-pause: minimal plain-text alert to the ops mailbox so a
 * human can fulfil the request manually while the exporter is paused.
 * The subject email address is included because Ops need it to run the
 * export by hand from Supabase; the row id is included so they can
 * flip the state to `delivered` (or `rejected`) from the admin queue
 * once done.
 *
 * Kept inline in this file rather than added to src/lib/dsar/emails.ts
 * so the whole soft-pause revert is confined to a handful of files —
 * the parallel exporter-fix PR will strip this helper along with the
 * rest of the pause code.
 */
export function renderDsarManualFulfilmentOpsAlert(args: {
  id: string;
  subject_email: string;
  request_type: string;
  is_authenticated: boolean;
  submitted_at: string;
  pause_reference: string;
}): { subject: string; html: string; text: string } {
  const source = args.is_authenticated ? "authenticated" : "anonymous";
  const subject = `[DSAR] Manual fulfilment needed — ${args.request_type} for ${args.subject_email}`;
  const text = `A DSAR request has landed while the automated exporter is paused.

Row id:      ${args.id}
Type:        ${args.request_type}
Subject:     ${args.subject_email}
Source:      ${source}
Submitted:   ${args.submitted_at}
Reference:   ${args.pause_reference}

Action: fulfil manually from the admin queue at /admin/compliance/dsar
(filter state=awaiting_manual_fulfilment). Statutory deadline is one
calendar month from the submitted timestamp above (UK GDPR Article 12(3)).

This alert fires on every submission until the exporter fix ships and
the soft-pause is reverted.`;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<p>A DSAR request has landed while the automated exporter is paused.</p>
<ul>
  <li><strong>Row id</strong>: <code>${esc(args.id)}</code></li>
  <li><strong>Type</strong>: ${esc(args.request_type)}</li>
  <li><strong>Subject</strong>: ${esc(args.subject_email)}</li>
  <li><strong>Source</strong>: ${source}</li>
  <li><strong>Submitted</strong>: ${esc(args.submitted_at)}</li>
  <li><strong>Reference</strong>: ${esc(args.pause_reference)}</li>
</ul>
<p>Fulfil manually from the admin queue at
<code>/admin/compliance/dsar</code> (filter
<code>state=awaiting_manual_fulfilment</code>). Statutory deadline is
one calendar month from the submitted timestamp above (UK GDPR Article
12(3)).</p>
<p>This alert fires on every submission until the exporter fix ships
and the soft-pause is reverted.</p>`;
  return { subject, html, text };
}
