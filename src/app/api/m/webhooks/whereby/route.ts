import { NextResponse } from "next/server";
import {
  verifyWherebySignature,
  isKnownWebhookEvent,
} from "@/lib/video/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/m/webhooks/whereby
 *
 * Inbound Whereby webhook. The Whereby-Signature header (t=<unix_s>,v1=<hex>)
 * is HMAC-SHA256 verified against WHEREBY_WEBHOOK_SECRET over `${t}.${body}`.
 * Known events (room.client.joined, room.client.left, room.session.started,
 * room.session.ended, recording.finished) are logged only for now —
 * persistence/alerting is a follow-up. Unknown events are acknowledged with
 * 200 so Whereby does not retry. Invalid signatures return 401.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("whereby-signature");

  if (!verifyWherebySignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string };
  try {
    event = JSON.parse(raw) as { type?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = event.type ?? "unknown";
  if (isKnownWebhookEvent(type)) {
    console.info(`[whereby] webhook event: ${type}`);
  } else {
    console.info(`[whereby] ignoring unknown webhook event: ${type}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
