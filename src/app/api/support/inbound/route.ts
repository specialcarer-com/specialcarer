import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestIp } from "@/lib/rate-limit";
import { verifyInboundSupportSignature } from "@/lib/support/verify-inbound-hmac";
import { check as rlCheck } from "@/lib/rate-limit/distributed";
import { rateLimitHeaders } from "@/lib/rate-limit/headers";
import { supportInboundVendor } from "@/lib/rate-limit/keys";

export const dynamic = "force-dynamic";

/** 30 deliveries per minute per vendor — preserves PR #199's ceiling. */
const VENDOR_LIMIT_PER_MIN = 30;
const MIN_SEC = 60;

/** Vendor label from the signed request (falls back to "unknown"). Keeps
 *  key builders happy without leaking IP into vendor keyspace. */
function vendorLabel(req: Request): string {
  return req.headers.get("x-sc-vendor") ?? "default";
}

/**
 * POST /api/support/inbound
 *
 * Trusted-relay ingest for inbound support emails / forwarded tickets.
 * Accepts JSON: { from_email, subject, body, channel?, priority? }
 *
 * Auth: the caller MUST provide
 *   x-sc-timestamp: <unix seconds>
 *   x-sc-signature: <hex hmac-sha256 over "${ts}.${rawBody}" with
 *                    SUPPORT_INBOUND_HMAC_SECRET>
 *
 * If the shared secret is not configured the route fails closed (503) —
 * a misconfigured deployment must never accept unsigned traffic.
 *
 * Rate-limited per vendor label (`x-sc-vendor` header) via the shared
 * distributed limiter (PR C2). Preserves PR #199's 30/min per-vendor ceiling.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  // Verify signature FIRST — before touching Supabase, before parsing the
  // body as JSON. That keeps unsigned/replayed traffic from consuming any
  // downstream capacity.
  const verification = verifyInboundSupportSignature({
    rawBody,
    signatureHeader: req.headers.get("x-sc-signature"),
    timestampHeader: req.headers.get("x-sc-timestamp"),
  });
  if (!verification.valid) {
    // Fail-closed for missing secret — treat as a hard configuration bug
    // so ops notice, rather than returning 401 which looks like normal
    // caller error.
    if (verification.reason === "secret_missing") {
      console.error(
        "[support.inbound] FATAL: SUPPORT_INBOUND_HMAC_SECRET missing — route disabled",
      );
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    console.warn("[support.inbound] rejected:", verification.reason);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const fromEmail =
    typeof p.from_email === "string" ? p.from_email.toLowerCase() : "";
  const subject = typeof p.subject === "string" ? p.subject.trim() : "";
  const text = typeof p.body === "string" ? p.body.trim() : "";
  const channel = typeof p.channel === "string" ? p.channel : "email";
  const priority = typeof p.priority === "string" ? p.priority : "normal";
  if (!subject || !text) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Distributed limiter (PR C2): per-vendor bucket, 30/min. Replaces the
  // bespoke per-IP + per-sender counters added in PR #199 — same ceiling,
  // one shared implementation across every public write endpoint.
  const vendor = vendorLabel(req);
  const ip = getRequestIp(req);
  const vendorCheck = await rlCheck({
    key: supportInboundVendor(vendor),
    limit: VENDOR_LIMIT_PER_MIN,
    windowSec: MIN_SEC,
  });
  if (!vendorCheck.ok) {
    console.warn(
      "[support.inbound] rate limited vendor:",
      vendor,
      "ip:",
      ip,
      "sender:",
      fromEmail,
    );
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(vendorCheck) },
    );
  }

  const admin = createAdminClient();

  let userId: string | null = null;
  if (fromEmail) {
    const { data } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    if (data?.users) {
      const match = data.users.find(
        (u) => (u.email ?? "").toLowerCase() === fromEmail,
      );
      if (match) userId = match.id;
    }
  }

  const { data: ticket, error } = await admin
    .from("support_tickets")
    .insert({
      subject: subject.slice(0, 200),
      user_id: userId,
      channel,
      priority: ["low", "normal", "high", "urgent"].includes(priority)
        ? priority
        : "normal",
    })
    .select("id, ticket_number")
    .single();
  if (error || !ticket) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await admin.from("support_messages").insert({
    ticket_id: ticket.id,
    author_id: null,
    author_role: "system",
    body: `Inbound from ${fromEmail || "unknown"}\n\n${text.slice(0, 10_000)}`,
    internal_note: false,
  });
  return NextResponse.json({ ticket });
}
