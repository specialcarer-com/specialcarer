/**
 * Distributed sliding-window rate limiter (Phase C — PR C2).
 *
 * One shared limiter used by every public write endpoint. Backed by Upstash
 * Redis (already provisioned for OTP throttling — same `UPSTASH_REDIS_REST_URL`
 * + `UPSTASH_REDIS_REST_TOKEN` env vars). Talks to the Upstash REST API with
 * plain `fetch`, so we don't need to add a new dependency to `package.json`.
 *
 * Algorithm: sliding-log window per key. We store one Redis sorted-set per
 * key where members are unique request ids and scores are unix-ms timestamps;
 * on each call we drop entries older than the window and count the rest. This
 * is exact rather than an approximation, at the cost of one pipelined round
 * trip per check — worth it for anti-abuse where the count MUST be right at
 * the boundary.
 *
 * Fail policy: fail-CLOSED on Redis outage. We fall back to a bounded
 * in-memory bucket (max 100 keys, 60s expiry, LRU eviction) so the limiter
 * still returns a truthful `ok=false` for over-limit callers on a single
 * lambda instance. A determined attacker cycling cold starts could still
 * exceed the bound during a full outage; that's an accepted tail risk versus
 * fail-open (which the 11-Sep gap review explicitly calls out as unsafe for
 * public write endpoints). If Upstash env vars are missing entirely we log a
 * warning and use the in-memory bucket from the first call — the site stays
 * up rather than 500ing.
 *
 * Public API:
 *   check({ key, limit, windowSec }) → { ok, remaining, retryAfterSec, limit, resetAt }
 *
 * See ./keys.ts for canonical key builders — callers must not hand-format.
 */

import { randomUUID } from "node:crypto";

export interface RateLimitCheckInput {
  /** Canonical key (build with `keys.ts`). */
  key: string;
  /** Max hits per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitCheckResult {
  /** True if the request is allowed. */
  ok: boolean;
  /** Requests remaining in the current window (clamped to >= 0). */
  remaining: number;
  /** Seconds until at least one slot frees up. 0 when `ok`. */
  retryAfterSec: number;
  /** Echo of the configured limit for header emission. */
  limit: number;
  /** Unix seconds when the current window ends. */
  resetAt: number;
}

// ---------------------------------------------------------------------------
// Bounded in-memory fallback (LRU, max 100 keys, 60s expiry).
// ---------------------------------------------------------------------------

const FALLBACK_MAX_KEYS = 100;
const FALLBACK_EXPIRY_MS = 60_000;

interface FallbackBucket {
  /** unix-ms timestamps within the window. */
  hits: number[];
  /** monotonic tick for LRU eviction. */
  touched: number;
}

const fallbackBuckets = new Map<string, FallbackBucket>();
let fallbackTick = 0;

function fallbackCheck(input: RateLimitCheckInput): RateLimitCheckResult {
  const now = Date.now();
  const windowMs = input.windowSec * 1000;
  const cutoff = now - windowMs;

  // Sweep expired buckets first so we don't count against the LRU cap.
  for (const [k, b] of fallbackBuckets) {
    if (b.hits.length === 0 || b.hits[b.hits.length - 1]! < now - FALLBACK_EXPIRY_MS) {
      fallbackBuckets.delete(k);
    }
  }

  let bucket = fallbackBuckets.get(input.key);
  if (!bucket) {
    // LRU-evict the least-recently-touched key when at capacity.
    if (fallbackBuckets.size >= FALLBACK_MAX_KEYS) {
      let oldestKey: string | null = null;
      let oldestTick = Infinity;
      for (const [k, b] of fallbackBuckets) {
        if (b.touched < oldestTick) {
          oldestTick = b.touched;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) fallbackBuckets.delete(oldestKey);
    }
    bucket = { hits: [], touched: 0 };
    fallbackBuckets.set(input.key, bucket);
  }

  // Drop hits outside the window.
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  bucket.touched = ++fallbackTick;

  const currentCount = bucket.hits.length;
  if (currentCount >= input.limit) {
    const oldest = bucket.hits[0]!;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      ok: false,
      remaining: 0,
      retryAfterSec,
      limit: input.limit,
      resetAt: Math.ceil((oldest + windowMs) / 1000),
    };
  }
  bucket.hits.push(now);
  return {
    ok: true,
    remaining: Math.max(0, input.limit - bucket.hits.length),
    retryAfterSec: 0,
    limit: input.limit,
    resetAt: Math.ceil((now + windowMs) / 1000),
  };
}

// Test-only reset hook so unit tests get a clean LRU + hit map.
export function __resetFallbackForTests(): void {
  fallbackBuckets.clear();
  fallbackTick = 0;
}

// ---------------------------------------------------------------------------
// Upstash REST client (no SDK — just fetch against the documented endpoint).
// ---------------------------------------------------------------------------

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

let missingEnvWarned = false;
function warnMissingEnvOnce(): void {
  if (missingEnvWarned) return;
  missingEnvWarned = true;
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — falling back to bounded in-memory limiter (fail-closed).",
  );
}

/**
 * Run the sliding-log check on Upstash via the pipeline endpoint. Returns
 * null on any network/parse failure so the caller can drop to the fallback.
 */
async function upstashCheck(
  input: RateLimitCheckInput,
  cfg: { url: string; token: string },
): Promise<RateLimitCheckResult | null> {
  const now = Date.now();
  const windowMs = input.windowSec * 1000;
  const cutoff = now - windowMs;
  const key = `rl:${input.key}`;
  const member = `${now}:${randomUUID()}`;

  // Sliding-log via pipeline:
  //   1. drop entries older than the window
  //   2. add this attempt
  //   3. count current entries
  //   4. get the oldest entry (for Retry-After math)
  //   5. set TTL a bit longer than the window so the key auto-cleans
  const commands: Array<Array<string | number>> = [
    ["ZREMRANGEBYSCORE", key, 0, cutoff],
    ["ZADD", key, now, member],
    ["ZCARD", key],
    ["ZRANGE", key, 0, 0, "WITHSCORES"],
    ["PEXPIRE", key, windowMs + 1000],
  ];

  let res: Response;
  try {
    res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      // Keep the tail-latency of a hot path bounded; Upstash REST is fast.
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(payload) || payload.length < 4) return null;

  // Each pipeline entry is `{result: ...}` or `{error: string}` per Upstash.
  const entry = (i: number): unknown => {
    const item = payload[i];
    if (item && typeof item === "object" && "error" in item) return null;
    return item && typeof item === "object" && "result" in item
      ? (item as { result: unknown }).result
      : null;
  };

  const cardRaw = entry(2);
  const oldestRaw = entry(3);
  const count = typeof cardRaw === "number" ? cardRaw : Number(cardRaw) || 0;

  let oldestScore = now;
  if (Array.isArray(oldestRaw) && oldestRaw.length >= 2) {
    const score = Number(oldestRaw[1]);
    if (Number.isFinite(score)) oldestScore = score;
  }

  const resetAt = Math.ceil((oldestScore + windowMs) / 1000);

  if (count > input.limit) {
    // Remove the attempt we just added so we don't count it against the caller
    // twice (and so Retry-After reflects the oldest legitimate hit).
    void fetch(`${cfg.url}/zrem/${encodeURIComponent(key)}/${encodeURIComponent(member)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(1000),
    }).catch(() => {});
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestScore + windowMs - now) / 1000),
    );
    return {
      ok: false,
      remaining: 0,
      retryAfterSec,
      limit: input.limit,
      resetAt,
    };
  }

  return {
    ok: true,
    remaining: Math.max(0, input.limit - count),
    retryAfterSec: 0,
    limit: input.limit,
    resetAt,
  };
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

/**
 * Check whether one hit against `key` is allowed under `limit` per
 * `windowSec` seconds. Consumes a slot on success. Always resolves — never
 * throws — so callers can gate a response without a try/catch.
 */
export async function check(
  input: RateLimitCheckInput,
): Promise<RateLimitCheckResult> {
  if (input.limit <= 0 || input.windowSec <= 0) {
    // Nonsense config — treat as always-blocked so misconfiguration is loud.
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, input.windowSec),
      limit: input.limit,
      resetAt: Math.ceil(Date.now() / 1000) + input.windowSec,
    };
  }

  const cfg = upstashConfig();
  if (!cfg) {
    warnMissingEnvOnce();
    return fallbackCheck(input);
  }

  const remote = await upstashCheck(input, cfg);
  if (remote) return remote;

  // Redis outage / transport error / bad response — fall back but stay closed.
  console.warn(
    `[rate-limit] Upstash unreachable for key=${input.key}, using in-memory fallback.`,
  );
  return fallbackCheck(input);
}
