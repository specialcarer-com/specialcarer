/**
 * Veriff webhook signature verification.
 *
 * Veriff signs webhook deliveries with the header
 *   X-HMAC-SIGNATURE: <hex_hmac>
 * where the HMAC-SHA256 is computed over the RAW request body using the shared
 * signature key (VERIFF_SIGNATURE_KEY). We verify in constant time and reject
 * deliveries whose header is missing, malformed, or mismatched.
 *
 * Unlike the Whereby scheme there is no timestamp / replay window in the
 * signature itself, so this is a pure HMAC-equality check (mirrors the Veriff
 * docs example which signs `raw body`).
 */
import crypto from "crypto";

export type WebhookVerification = {
  valid: boolean;
  payload: unknown;
};

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function verifyVeriffSignature(
  rawBody: string,
  signatureHeader: string | null,
): WebhookVerification {
  const payload = safeParse(rawBody);
  const secret = process.env.VERIFF_SIGNATURE_KEY;
  if (!signatureHeader || !secret) return { valid: false, payload };

  // Some Veriff docs show a "sha256=" prefix; tolerate it but the repo default
  // is bare hex (matches the client in veriff.ts).
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (provided.length !== computed.length) return { valid: false, payload };

  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(computed, "hex"),
    );
    return { valid, payload };
  } catch {
    // malformed hex in the provided signature
    return { valid: false, payload };
  }
}

/**
 * Veriff verification lifecycle statuses we persist on the
 * identity_verifications row. Mirrors the migration's CHECK domain.
 */
export const IDENTITY_STATUSES = [
  "created",
  "started",
  "submitted",
  "approved",
  "declined",
  "resubmission_requested",
  "review",
  "expired",
  "abandoned",
] as const;

export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export function isIdentityStatus(s: string): s is IdentityStatus {
  return (IDENTITY_STATUSES as readonly string[]).includes(s);
}

/**
 * Map a Veriff webhook/decision payload to one of our internal statuses.
 *
 * Veriff sends two webhook shapes:
 *   - Event webhooks:    { action: "started" | "submitted" | ... }
 *   - Decision webhooks: { verification: { status: "approved" | "declined" |
 *                          "resubmission_requested" | "review" | "expired" |
 *                          "abandoned" } }
 * Returns null when the payload carries no status we recognise.
 */
export function statusFromPayload(payload: unknown): IdentityStatus | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as {
    action?: unknown;
    verification?: { status?: unknown };
  };

  const verificationStatus = p.verification?.status;
  if (typeof verificationStatus === "string") {
    const mapped = mapVeriffStatus(verificationStatus);
    if (mapped) return mapped;
  }

  if (typeof p.action === "string") {
    const mapped = mapVeriffStatus(p.action);
    if (mapped) return mapped;
  }
  return null;
}

function mapVeriffStatus(raw: string): IdentityStatus | null {
  switch (raw) {
    // Veriff decision verification.status values
    case "approved":
      return "approved";
    case "declined":
      return "declined";
    case "resubmission_requested":
      return "resubmission_requested";
    case "review":
      return "review";
    case "expired":
      return "expired";
    case "abandoned":
      return "abandoned";
    // Veriff event "action" values
    case "started":
      return "started";
    case "submitted":
      return "submitted";
    case "created":
      return "created";
    default:
      return null;
  }
}
