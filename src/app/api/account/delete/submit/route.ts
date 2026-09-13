/**
 * POST /api/account/delete/submit
 *
 * Authenticated user requests self-service GDPR Article-17 deletion.
 * Delegates to src/lib/gdpr/deletion-handlers.ts#handleSubmit for the
 * pure logic — this file only handles Next.js concerns (auth, rate
 * limit, response shaping, side-effectful email send).
 *
 * Deploy-safe: schema_not_ready → 503. Pre-existing hard-delete route
 * at /api/account/delete is untouched.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { check as rlCheck } from "@/lib/rate-limit/distributed";
import { rateLimitHeaders } from "@/lib/rate-limit/headers";
import { accountDeletionSubmitUser } from "@/lib/rate-limit/keys";
import { sendEmail } from "@/lib/email/smtp";
import { generateVerificationToken } from "@/lib/dsar/token";
import { renderAccountDeletionVerifyEmail } from "@/lib/gdpr/emails";
import { handleSubmit } from "@/lib/gdpr/deletion-handlers";

export const dynamic = "force-dynamic";

const HOUR_SEC = 60 * 60;
const USER_LIMIT = 5;

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SELF_SERVICE_DELETION_ENABLED === "true";
}

function jsonError(code: string, status: number) {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(req: NextRequest) {
  if (!featureEnabled()) return jsonError("feature_disabled", 404);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("unauthenticated", 401);
  if (!user.email) return jsonError("no_email_on_account", 400);

  const rl = await rlCheck({
    key: accountDeletionSubmitUser(user.id),
    limit: USER_LIMIT,
    windowSec: HOUR_SEC,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const admin = createAdminClient();
  const { raw, hash } = generateVerificationToken();
  const result = await handleSubmit(
    {
      user_id: user.id,
      user_email: user.email,
      raw_token: raw,
      token_hash: hash,
      now: new Date(),
    },
    { admin },
  );

  if (!result.ok) {
    if (result.code === "schema_not_ready") {
      return NextResponse.json(
        { ok: false, code: "schema_not_ready" },
        { status: 503, headers: rateLimitHeaders(rl) },
      );
    }
    return NextResponse.json(
      { ok: false, code: result.code },
      { status: 500, headers: rateLimitHeaders(rl) },
    );
  }

  // Email is fire-and-forget from the response's point of view — the
  // row is already persisted; the user can resend from the danger-zone
  // page if delivery hiccups.
  if (result.email_pending) {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      new URL(req.url).origin;
    const verify_url = `${origin}/settings/danger-zone?token=${encodeURIComponent(raw)}`;
    const email = renderAccountDeletionVerifyEmail({
      subject_email: user.email,
      verify_url,
    });
    try {
      await sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[account-deletion.submit] email send failed", err);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      job: result.job,
      eligibility: result.eligibility,
    },
    { status: 201, headers: rateLimitHeaders(rl) },
  );
}
