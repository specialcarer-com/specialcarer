/**
 * Rate limits for /api/support/inbound.
 *
 * Two independent buckets so one abusive sender can't starve legitimate
 * traffic from another:
 *   - per source IP (broad blast protection)
 *   - per `from_email` (a single spoofed sender can't flood one user's
 *     ticket queue)
 *
 * Built on the process-local limiter in `@/lib/rate-limit` — sufficient
 * for a single Vercel region combined with HMAC verification. When the
 * relay is stable enough to trust a small allowlist we can tighten
 * further, but the HMAC secret is the primary control.
 */
import { rateLimit } from "@/lib/rate-limit";

/** Max deliveries per IP per minute. Chosen well above sane relay burst. */
export const IP_LIMIT_PER_MIN = 30;
/** Max deliveries per `from_email` per minute. */
export const SENDER_LIMIT_PER_MIN = 10;

export interface InboundRateLimitCheck {
  /** True if BOTH buckets have capacity. */
  allowed: boolean;
  /** Which bucket rejected the request, useful for logs/metrics. */
  reason?: "ip" | "sender";
}

export function checkInboundSupportRateLimit(
  ip: string,
  fromEmail: string,
): InboundRateLimitCheck {
  if (!rateLimit(`support-inbound:ip:${ip}`, {
    limit: IP_LIMIT_PER_MIN,
    windowMs: 60_000,
  })) {
    return { allowed: false, reason: "ip" };
  }
  // Empty from_email is common in transactional relays (bounces etc.) —
  // don't create a shared bucket, just skip the sender check in that case.
  if (fromEmail) {
    if (!rateLimit(`support-inbound:sender:${fromEmail}`, {
      limit: SENDER_LIMIT_PER_MIN,
      windowMs: 60_000,
    })) {
      return { allowed: false, reason: "sender" };
    }
  }
  return { allowed: true };
}
