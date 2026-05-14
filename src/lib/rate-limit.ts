/**
 * Tiny in-memory IP rate limiter for marketing/contact form endpoints.
 *
 * Designed for the low-volume "form spammer" case — keeps a per-IP hit
 * counter in a process-local Map. Sufficient for a single Vercel region
 * (each lambda instance has its own counter, so a determined attacker
 * cycling cold starts could exceed the limit; that's acceptable for
 * contact forms because we still validate downstream and notify ops).
 *
 * For higher-stakes endpoints (auth, billing) swap this for an Upstash
 * Redis sliding-window limiter — the public function signature here is
 * intentionally compatible so the call sites won't have to change.
 *
 * @example
 * ```ts
 * import { rateLimit, getRequestIp } from "@/lib/rate-limit";
 *
 * export async function POST(req: Request) {
 *   const ip = getRequestIp(req);
 *   if (!rateLimit(`employers-lead:${ip}`, { limit: 5, windowMs: 60_000 * 60 })) {
 *     return NextResponse.json({ error: "rate_limited" }, { status: 429 });
 *   }
 *   // …
 * }
 * ```
 */

type Bucket = { count: number; reset: number };

const HITS = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Maximum hits per window. Default 5. */
  limit?: number;
  /** Rolling window in milliseconds. Default 1 hour. */
  windowMs?: number;
}

/**
 * Returns `true` if the request is allowed, `false` if it exceeds the quota.
 * Caller is responsible for namespacing the key (e.g. `"endpoint:1.2.3.4"`)
 * so different forms get independent budgets.
 */
export function rateLimit(key: string, opts: RateLimitOptions = {}): boolean {
  const limit = opts.limit ?? 5;
  const windowMs = opts.windowMs ?? 60 * 60 * 1000;
  const now = Date.now();
  const cur = HITS.get(key);
  if (!cur || cur.reset < now) {
    HITS.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

/**
 * Best-effort extraction of the client IP from a Vercel/Node request.
 * Falls back to "unknown" so the bucket key is still stable.
 */
export function getRequestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
