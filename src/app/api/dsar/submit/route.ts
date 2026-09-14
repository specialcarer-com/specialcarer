/**
 * POST /api/dsar/submit
 *
 * Accepts a UK-GDPR data-subject request. Two paths, decided by the
 * pure handler in `src/lib/dsar/submit-handler.ts`:
 *
 *   - **Anonymous**: writes a `dsar_requests` row in state
 *     `verifying`, emails a one-time verification link. State only
 *     advances to `in_progress` after the recipient clicks the link
 *     (see /api/dsar/verify/[token]). Unchanged from PR #210.
 *
 *   - **Authenticated fast-path** (added in PR E2): when the caller
 *     is signed in AND `body.subject_user_id` matches `auth.uid()`
 *     AND `body.subject_email` matches `auth.user.email` (case-
 *     insensitive), skip the email-verification round trip and go
 *     straight to `in_progress`, so the `dsar-fulfil` cron can pick
 *     it up on its next tick. Still emails a confirmation for the
 *     subject's records.
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

  // Deliberately return the same 202 whether or not a matching profile
  // was found for anonymous submissions — response must not reveal
  // whether an email has an account. For the fast-path we also return
  // 202 with `fast_path: true` so the client can render "we're already
  // processing this" rather than "check your email".
  return NextResponse.json(result.body, { status: result.status });
}
