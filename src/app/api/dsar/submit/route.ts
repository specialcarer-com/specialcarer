/**
 * POST /api/dsar/submit
 *
 * Public, unauthenticated. Accepts a UK-GDPR data-subject request,
 * writes a `dsar_requests` row in state `submitted`, and mails a
 * one-time verification link to the submitted email. State only
 * advances to `in_progress` after the recipient clicks that link
 * (see /api/dsar/verify/[token]).
 *
 * Deploy-safe: if the `dsar_requests` table is not yet present
 * (migration deferred), the route responds 503
 * `{ ok:false, code:'schema_not_ready' }` rather than throwing.
 */

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, getRequestIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderDsarVerifyEmail } from "@/lib/dsar/emails";
import { generateVerificationToken } from "@/lib/dsar/token";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = [
  "access",
  "erasure",
  "rectification",
  "portability",
] as const;
type RequestType = (typeof ALLOWED_TYPES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNDEFINED_TABLE = "42P01";

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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_json" },
      { status: 400 },
    );
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const type = typeof body.type === "string" ? body.type : "";
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) : null;

  if (!EMAIL_RE.test(emailRaw)) {
    return NextResponse.json(
      { ok: false, code: "invalid_email" },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.includes(type as RequestType)) {
    return NextResponse.json(
      { ok: false, code: "invalid_type" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Look up the subject user id, if any, so admin queue can see them
  // linked. `.maybeSingle()` — nulls are fine, we still accept the
  // submission.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", emailRaw)
    .maybeSingle();
  const subject_user_id = profile?.id ?? null;

  const token = generateVerificationToken();

  const insertRes = await admin
    .from("dsar_requests")
    .insert({
      subject_user_id,
      subject_email: emailRaw,
      requested_by: subject_user_id, // best-effort attribution
      request_type: type,
      state: "verifying",
      verification_token_hash: token.hash,
      verification_token_issued_at: new Date().toISOString(),
      notes,
    })
    .select("id")
    .single();

  if (insertRes.error) {
    const code = insertRes.error.code;
    if (
      code === UNDEFINED_TABLE ||
      /relation .* does not exist/i.test(insertRes.error.message ?? "")
    ) {
      return NextResponse.json(
        { ok: false, code: "schema_not_ready" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, code: "insert_failed" },
      { status: 500 },
    );
  }

  // Compose the verification link. Prefer NEXT_PUBLIC_APP_URL, then the
  // request's own origin as fallback.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    new URL(req.url).origin;
  const verify_url = `${origin}/api/dsar/verify/${token.raw}`;

  const mail = renderDsarVerifyEmail({
    subject_email: emailRaw,
    request_type: type,
    verify_url,
  });
  await sendEmail({
    to: emailRaw,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  // Deliberately return the same shape whether or not a matching profile
  // was found — response must not reveal whether an email has an account.
  return NextResponse.json({ ok: true }, { status: 202 });
}
