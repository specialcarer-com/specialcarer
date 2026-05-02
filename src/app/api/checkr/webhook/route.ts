import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhook, isStubMode } from "@/lib/checkr/server";

export const runtime = "nodejs";

/**
 * POST /api/checkr/webhook
 *
 * Inbound webhook from Checkr. HMAC-verified. Updates background_checks rows
 * based on payload.type. Idempotent via checkr_webhook_events log.
 *
 * Checkr event types we care about:
 *   invitation.created
 *   invitation.completed
 *   report.created
 *   report.upgraded
 *   report.completed         (data.object.status: clear | consider | suspended)
 *   adverse_action.created
 *
 * Each report includes screenings; we map screenings to our check_type enum.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-checkr-signature");

  if (!isStubMode()) {
    if (!verifyWebhook(raw, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  type CheckrEvent = {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };

  let event: CheckrEvent;
  try {
    event = JSON.parse(raw) as CheckrEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId =
    event.id ||
    crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
  const type = event.type || "unknown";
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;

  const admin = createAdminClient();

  // Idempotency
  const { data: prior } = await admin
    .from("checkr_webhook_events")
    .select("id, processed_at")
    .eq("id", eventId)
    .maybeSingle();
  if (prior?.processed_at) {
    return NextResponse.json({ received: true, idempotent: true });
  }
  if (!prior) {
    await admin.from("checkr_webhook_events").insert({
      id: eventId,
      type,
      payload: event as unknown as Record<string, unknown>,
    });
  }

  try {
    const candidateId =
      (obj.candidate_id as string | undefined) ??
      (obj.candidate as string | undefined);

    if (candidateId) {
      // Map Checkr event → our enum status, applied to the bundle of rows
      let nextStatus: string | null = null;
      switch (type) {
        case "invitation.created":
          nextStatus = "invited";
          break;
        case "invitation.completed":
          nextStatus = "submitted";
          break;
        case "report.created":
          nextStatus = "in_progress";
          break;
        case "report.upgraded":
          nextStatus = "in_progress";
          break;
        case "report.completed": {
          const status = (obj.status as string) || "";
          if (status === "clear") nextStatus = "cleared";
          else if (status === "consider") nextStatus = "consider";
          else if (status === "suspended") nextStatus = "failed";
          else nextStatus = "submitted";
          break;
        }
        case "adverse_action.created":
          nextStatus = "failed";
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
        if (typeof obj.id === "string") update.vendor_check_id = obj.id;

        // Update all rows for this candidate. If the event scopes to a specific
        // screening (e.g. a specific report contains 'national_criminal_search'
        // but not 'oig'), Checkr typically delivers one report.completed per
        // package status — we apply it to all rows and let later events refine.
        await admin
          .from("background_checks")
          .update(update)
          .eq("vendor_applicant_id", candidateId)
          .eq("vendor", "checkr");
      }
    }

    await admin
      .from("checkr_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error";
    await admin
      .from("checkr_webhook_events")
      .update({ error: message })
      .eq("id", eventId);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
