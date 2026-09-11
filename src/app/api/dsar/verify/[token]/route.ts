/**
 * GET /api/dsar/verify/[token]
 *
 * Confirms subject ownership of the request's email. Flips state from
 * `verifying` to `in_progress`, at which point the fulfilment cron
 * (/api/cron/dsar-fulfil) becomes eligible to pick it up.
 *
 * The route renders a small HTML confirmation page — the subject clicks
 * a link in their email, they land here, they see a "we're preparing
 * your export" screen and close the tab.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashVerificationToken } from "@/lib/dsar/token";

export const dynamic = "force-dynamic";

// 24-hour TTL from issuance.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function html(status: "ok" | "expired" | "invalid" | "already"): string {
  const heading =
    status === "ok"
      ? "Request confirmed"
      : status === "already"
        ? "Already confirmed"
        : status === "expired"
          ? "Link expired"
          : "Invalid link";
  const body =
    status === "ok"
      ? "Thanks — we're preparing your export. You'll receive a download link by email within 30 minutes."
      : status === "already"
        ? "This request has already been confirmed. Check your email for the download link."
        : status === "expired"
          ? "This verification link is more than 24 hours old. Please submit a new request."
          : "This link is not recognised. Please submit a new request.";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${heading} — SpecialCarer</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f5f7f8;color:#1a1a1a;">
<div style="max-width:520px;margin:60px auto;padding:36px 28px;background:#ffffff;border-radius:14px;">
  <div style="color:#039EA0;font-weight:700;font-size:20px;margin-bottom:20px;">SpecialCarer</div>
  <h1 style="margin:0 0 12px 0;font-size:22px;color:#171E54;">${heading}</h1>
  <p style="margin:0;font-size:15px;line-height:1.55;color:#333;">${body}</p>
</div>
</body></html>`;
}

function respond(status: "ok" | "expired" | "invalid" | "already", code: number) {
  return new NextResponse(html(status), {
    status: code,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token || token.length < 20) {
    return respond("invalid", 400);
  }

  const hash = hashVerificationToken(token);
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("dsar_requests")
    .select(
      "id, state, verification_token_issued_at, verified_at",
    )
    .eq("verification_token_hash", hash)
    .maybeSingle();

  // Missing table (pre-migration) → treat as invalid so the subject
  // doesn't see a stacktrace. Behaviour indistinguishable from a stale
  // link, which is the safe default.
  if (error) {
    if (
      error.code === "42P01" ||
      /relation .* does not exist/i.test(error.message ?? "")
    ) {
      return respond("invalid", 404);
    }
    return respond("invalid", 500);
  }

  if (!row) {
    return respond("invalid", 404);
  }

  if (row.state === "in_progress" || row.state === "delivered") {
    return respond("already", 200);
  }
  if (row.state !== "verifying") {
    return respond("invalid", 400);
  }

  const issuedAt = row.verification_token_issued_at
    ? new Date(row.verification_token_issued_at).getTime()
    : 0;
  if (!issuedAt || Date.now() - issuedAt > TOKEN_TTL_MS) {
    return respond("expired", 410);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("dsar_requests")
    .update({
      state: "in_progress",
      verified_at: now,
      // Clear the hash so the token becomes single-use. Anyone who
      // finds the raw token in a browser history can't replay it.
      verification_token_hash: null,
    })
    .eq("id", row.id);

  if (updateError) {
    return respond("invalid", 500);
  }

  return respond("ok", 200);
}
