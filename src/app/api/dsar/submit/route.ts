/**
 * POST /api/dsar/submit
 *
 * Accepts a UK-GDPR data-subject request. All routing logic lives in
 * the pure handler at `src/lib/dsar/submit-handler.ts`; this file wires
 * it up to the real Supabase clients + email transport.
 *
 * ------------------------------------------------------------------
 * F1d SOFT PAUSE (17 Sep 2026):
 *
 * The automated exporter (`dsar-export/1.0.0`) has schema drift and
 * would deliver a JSON export missing 8 of 11 subject-data tables.
 * Full finding:
 *   /home/user/workspace/phase_f/dsar_exporter_schema_drift_17sep.md
 *
 * Until the exporter fix ships in a parallel PR, EVERY submission
 * (anonymous or authenticated) is routed to the new
 * `awaiting_manual_fulfilment` state. The row is still created so the
 * UK-GDPR one-calendar-month clock starts (Article 12(3)), no
 * verification email is sent, and Ops receive an out-of-band alert to
 * fulfil manually from /admin/compliance/dsar. Response is:
 *   { ok: true, id, manual_fulfilment: true, message: "..." }
 *
 * When the exporter fix ships this pause should be reverted: the
 * handler returns to sending verification / confirmation emails and
 * inserting rows in `verifying` / `in_progress`.
 * ------------------------------------------------------------------
 *
 * Pre-pause behaviour, for reference / revert:
 *
 *   - **Anonymous**: row in state `verifying`, one-time verification
 *     link emailed. Advances to `in_progress` on click.
 *
 *   - **Authenticated fast-path** (PR E2): caller signed in AND
 *     `body.subject_user_id === auth.uid()` AND `body.subject_email ===
 *     auth.user.email` (case-insensitive) → skip verification, insert
 *     `in_progress`, send a confirmation email.
 *
 * Deploy-safe: if the `dsar_requests` table is not yet present
 * (migration deferred), the route responds 503
 * `{ ok:false, code:'schema_not_ready' }` rather than throwing.
 */

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, getRequestIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/smtp";
import {
  handleDsarSubmit,
  type SubmitBody,
} from "@/lib/dsar/submit-handler";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Rate limit: 5 submissions / hour / IP. Deliberately conservative —
  // legitimate volume is negligible, and a hostile actor spamming
  // requests generates outbound email to arbitrary addresses.
  const ip = getRequestIp(req);
  if (!rateLimit(`dsar-submit:${ip}`, { limit: 5, windowMs: 60 * 60_000 })) {
    return NextResponse.json(
      { ok: false, code: "rate_limited" },
      { status: 429 },
    );
  }

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_json" },
      { status: 400 },
    );
  }

  // Try to resolve a signed-in user. This is best-effort — failure
  // (or an anonymous request) simply routes to the anonymous flow.
  let authedUser: { id: string; email: string | null | undefined } | null =
    null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      authedUser = { id: data.user.id, email: data.user.email };
    }
  } catch {
    // Cookie-parsing / server-client failure — treat as anonymous.
    authedUser = null;
  }

  const admin = createAdminClient();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    new URL(req.url).origin;

  const result = await handleDsarSubmit(body, {
    admin,
    authedUser,
    sendEmail,
    origin,
  });

  // Response shape during F1d soft-pause: 202 with
  //   { ok: true, id, manual_fulfilment: true, message: "..." }
  // regardless of whether the caller is anonymous or authenticated,
  // and regardless of whether a matching profile exists. Uniformity
  // preserves the pre-pause property that the endpoint never reveals
  // whether an email address has an account.
  return NextResponse.json(result.body, { status: result.status });
}
