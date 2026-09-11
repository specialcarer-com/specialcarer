/**
 * HMAC verification for the /api/support/inbound webhook.
 *
 * The endpoint accepts inbound emails / forwarded tickets from a trusted
 * relay (e.g. Postmark inbound, Zapier, an internal script). Because the
 * route uses the Supabase service-role client to insert into
 * `support_tickets`, it must not be publicly writable.
 *
 * Delivery contract:
 *   - `x-sc-timestamp: <unix seconds>` — sender's clock; we require a
 *     match within +/- 5 minutes to blunt replay of captured deliveries.
 *   - `x-sc-signature: <hex hmac_sha256>` — HMAC over
 *     `${timestamp}.${rawBody}` using `SUPPORT_INBOUND_HMAC_SECRET`.
 *     Tolerate a leading `sha256=` prefix (mirrors the Veriff/Whereby
 *     verifiers so operators aren't surprised).
 *
 * The verifier is constant-time (`crypto.timingSafeEqual`) and returns
 * `{ valid, reason }` so the route can log/metric the reject reason
 * without leaking detail to the caller.
 */
import crypto from "crypto";

/** How far the sender's clock may drift from ours before we reject. */
export const REPLAY_WINDOW_SECONDS = 5 * 60;

export type VerifyResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "secret_missing"
        | "signature_missing"
        | "timestamp_missing"
        | "timestamp_malformed"
        | "timestamp_out_of_window"
        | "signature_malformed"
        | "signature_mismatch";
    };

export interface VerifyInput {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  /** UNIX seconds; injected in tests to freeze time. Defaults to now. */
  nowSeconds?: number;
  /** Injected in tests. Defaults to `process.env.SUPPORT_INBOUND_HMAC_SECRET`. */
  secret?: string;
}

/**
 * Verify an inbound support-ingest delivery.
 *
 * Fail-closed: missing secret is treated as a verification failure so a
 * misconfigured deployment cannot silently accept unsigned traffic.
 */
export function verifyInboundSupportSignature(input: VerifyInput): VerifyResult {
  const secret = input.secret ?? process.env.SUPPORT_INBOUND_HMAC_SECRET;
  if (!secret) return { valid: false, reason: "secret_missing" };
  if (!input.signatureHeader) return { valid: false, reason: "signature_missing" };
  if (!input.timestampHeader) return { valid: false, reason: "timestamp_missing" };

  const ts = Number.parseInt(input.timestampHeader, 10);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { valid: false, reason: "timestamp_malformed" };
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) {
    return { valid: false, reason: "timestamp_out_of_window" };
  }

  const provided = input.signatureHeader.startsWith("sha256=")
    ? input.signatureHeader.slice("sha256=".length)
    : input.signatureHeader;

  // Reject non-hex early so timingSafeEqual doesn't throw on Buffer.from.
  if (!/^[0-9a-fA-F]+$/.test(provided)) {
    return { valid: false, reason: "signature_malformed" };
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${input.rawBody}`)
    .digest("hex");

  if (provided.length !== computed.length) {
    return { valid: false, reason: "signature_mismatch" };
  }

  try {
    const equal = crypto.timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(computed, "hex"),
    );
    return equal
      ? { valid: true }
      : { valid: false, reason: "signature_mismatch" };
  } catch {
    return { valid: false, reason: "signature_malformed" };
  }
}
