import { rateLimit } from "@/lib/rate-limit";

/**
 * Per-user rate limit for 2FA code-verification attempts (gap 13).
 *
 * 5 attempts / minute / user, namespaced by the action so enrol-verify and the
 * sign-in challenge get independent budgets. Built on the process-local
 * in-memory limiter (src/lib/rate-limit.ts): this does NOT survive serverless
 * cold starts and is per-lambda-instance, so a determined attacker cycling
 * cold starts could exceed it. That's an accepted V1 trade-off — TODO: move to
 * an Upstash Redis sliding window for a shared, durable counter. Combined with
 * TOTP's own 6-digit/30s window and single-use recovery codes, the in-memory
 * net still meaningfully blunts online guessing.
 */
export function check2faRateLimit(action: string, userId: string): boolean {
  return rateLimit(`2fa:${action}:${userId}`, { limit: 5, windowMs: 60_000 });
}
