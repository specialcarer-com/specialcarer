/**
 * Whereby webhook signature verification.
 *
 * Whereby signs webhook deliveries with a "Whereby-Signature" header of the
 * form "t=<unix_seconds>,v1=<hex_hmac>". The HMAC-SHA256 is computed over
 * `${t}.${rawBody}` using WHEREBY_WEBHOOK_SECRET. We parse the t/v1 pair,
 * reject timestamps outside a 5-minute window (replay protection), then
 * compare the signature in constant time.
 */
import crypto from "crypto";

/**
 * Max allowed clock skew / replay window for Whereby webhook timestamps.
 * Whereby docs recommend a few minutes; we use 5.
 */
const MAX_TIMESTAMP_SKEW_SECONDS = 300;

export function verifyWherebySignature(
  rawBody: string,
  signatureHeader: string | null,
  now: number = Date.now(),
): boolean {
  const secret = process.env.WHEREBY_WEBHOOK_SECRET;
  if (!signatureHeader || !secret) return false;

  // Whereby format: "t=<unix_seconds>,v1=<hex_hmac>"
  const parts = signatureHeader.split(",").reduce<Record<string, string>>(
    (acc, part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return acc;
      acc[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
      return acc;
    },
    {},
  );

  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  // Replay protection: reject timestamps too far from now in either direction.
  const ts = Number.parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now / 1000 - ts) > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  const signedPayload = `${t}.${rawBody}`;
  const computed = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  if (v1.length !== computed.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(v1, "hex"),
      Buffer.from(computed, "hex"),
    );
  } catch {
    return false;
  }
}

export const KNOWN_WEBHOOK_EVENTS = [
  "room.client.joined",
  "room.client.left",
  "room.session.started",
  "room.session.ended",
  "recording.finished",
] as const;

export type WherebyWebhookEvent = (typeof KNOWN_WEBHOOK_EVENTS)[number];

export function isKnownWebhookEvent(
  type: string,
): type is WherebyWebhookEvent {
  return (KNOWN_WEBHOOK_EVENTS as readonly string[]).includes(type);
}
