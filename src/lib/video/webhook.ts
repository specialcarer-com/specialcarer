/**
 * Whereby webhook signature verification.
 *
 * Whereby signs webhook deliveries with an HMAC-SHA256 over the raw request
 * body using WHEREBY_WEBHOOK_SECRET. We verify in constant time and tolerate a
 * "sha256=" prefix on the provided signature (same convention as the uCheck
 * webhook).
 */
import crypto from "crypto";

export function verifyWherebySignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.WHEREBY_WEBHOOK_SECRET;
  if (!signature || !secret) return false;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const provided = signature.replace(/^sha256=/, "").toLowerCase();
  if (provided.length !== computed.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(provided, "hex"),
    Buffer.from(computed, "hex"),
  );
}

export const KNOWN_WEBHOOK_EVENTS = [
  "room.client.joined",
  "room.client.left",
  "recording.ready",
] as const;

export type WherebyWebhookEvent = (typeof KNOWN_WEBHOOK_EVENTS)[number];

export function isKnownWebhookEvent(
  type: string,
): type is WherebyWebhookEvent {
  return (KNOWN_WEBHOOK_EVENTS as readonly string[]).includes(type);
}
