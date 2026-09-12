/**
 * Shared helper for emitting rate-limit response headers (Phase C — PR C2).
 *
 * All limiter-gated endpoints should call this so the header shape stays
 * consistent for ops (log dashboards look for `X-RateLimit-Reset` etc.).
 *
 * Headers set:
 *   - X-RateLimit-Limit      configured limit
 *   - X-RateLimit-Remaining  slots left in the current window
 *   - X-RateLimit-Reset      unix seconds when the window ends
 *   - Retry-After            (only on 429) seconds until a slot frees up
 */
import type { RateLimitCheckResult } from "./distributed";

export function rateLimitHeaders(
  result: RateLimitCheckResult,
): Record<string, string> {
  const h: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "X-RateLimit-Reset": String(result.resetAt),
  };
  if (!result.ok) {
    h["Retry-After"] = String(Math.max(1, result.retryAfterSec));
  }
  return h;
}

/**
 * Convenience: merge limiter headers into an existing headers object without
 * losing the caller's `Content-Type` etc.
 */
export function withRateLimitHeaders(
  base: Record<string, string> | undefined,
  result: RateLimitCheckResult,
): Record<string, string> {
  return { ...(base ?? {}), ...rateLimitHeaders(result) };
}
