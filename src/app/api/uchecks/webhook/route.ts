import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhook, isStubMode } from "@/lib/uchecks/server";

export const runtime = "nodejs";

/**
 * POST /api/uchecks/webhook
 *
 * Inbound webhook from uCheck. HMAC-verified. Updates background_checks rows
 * based on payload. Idempotent via uchecks_webhook_events log.
 *
 * Expected event types (subset — others are logged and ignored):
 *   applicant.invited
 *   check.in_progress
 *   check.submitted
 *   check.completed         (with result: cleared | consider | failed)
 *   applicant.id_verified
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-ucheck-signature");

  // In stub mode (no real key/secret yet) we accept unsigned events so we
  // can simulate end-to-end. In production this branch is not taken.
  if (!isStubMode()) {
    if (!verifyWebhook(raw, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  type Payload = {
    event_id?: string;
    type?: string;
    applicant_id?: string;
    check_id?: string;
    check_type?: string;
    result?: string;
    outcome_summary?: string;
    issued_at?: string;
    expires_at?: string;
  };
  let event: Payload;
  try {
    event = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId =
    event.event_id ||
    crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
  const type = event.type || "unknown";

  const admin = createAdminClient();

  // Idempotency
  const { data: prior } = await admin
    .from("uchecks_webhook_events")
    .select("id, processed_at")
    .eq("id", eventId)
    .maybeSingle();
  if (prior?.processed_at) {
    return NextResponse.json({ received: true, idempotent: true });
  }
  if (!prior) {
    await admin.from("uchecks_webhook_events").insert({
      id: eventId,
      type,
      payload: event as unknown as Record<string, unknown>,
    });
  }

  try {
    if (event.applicant_id && event.check_type) {
      // Map uCheck status → our enum
      let nextStatus: string | null = null;
      switch (type) {
        case "applicant.invited":
          nextStatus = "invited";
          break;
        case "check.in_progress":
          nextStatus = "in_progress";
          break;
        case "check.submitted":
        case "applicant.id_verified":
          nextStatus = "submitted";
          break;
        case "check.pending_result":
          nextStatus = "pending_result";
          break;
        case "check.completed":
          if (event.result === "cleared") nextStatus = "cleared";
          else if (event.result === "consider") nextStatus = "consider";
          else if (event.result === "failed") nextStatus = "failed";
          break;
        case "check.expired":
          nextStatus = "expired";
          break;
        case "check.cancelled":
          nextStatus = "cancelled";
          break;
        default:
          nextStatus = null;
      }

      if (nextStatus) {
        const update: Record<string, unknown> = {
          status: nextStatus,
          raw: event as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        };
        if (event.outcome_summary) update.result_summary = event.outcome_summary;
        if (event.expires_at) update.expires_at = event.expires_at;
        if (event.issued_at) update.issued_at = event.issued_at;

        await admin
          .from("background_checks")
          .update(update)
          .eq("vendor_applicant_id", event.applicant_id)
          .eq("check_type", event.check_type);
      }
    }

    await admin
      .from("uchecks_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error";
    await admin
      .from("uchecks_webhook_events")
      .update({ error: message })
      .eq("id", eventId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
