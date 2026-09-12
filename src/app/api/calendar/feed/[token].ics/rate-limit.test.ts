/**
 * Per-swap-site test: calendar-feed rate-limit wiring (PR C2, Phase C).
 *
 * The feed route uses:
 *   - 60/hr per authorised token (known token bucket)
 *   - 6/hr per IP for UNKNOWN tokens (anti-enumeration)
 *
 * Test proves the ceiling holds for both buckets in fallback mode and that
 * they live in disjoint namespaces (token exhaustion does not affect the
 * per-IP unknown-token budget).
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { check, __resetFallbackForTests } from "@/lib/rate-limit/distributed";
import { calendarFeedIp, calendarFeedToken } from "@/lib/rate-limit/keys";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const KNOWN = 60;
const UNKNOWN_IP = 6;
const HOUR = 60 * 60;

beforeEach(() => __resetFallbackForTests());

describe("calendar-feed limiter wiring", () => {
  test("61st known-token pull inside 1h → blocked", async () => {
    const key = calendarFeedToken("abcd1234efgh5678");
    for (let i = 1; i <= KNOWN; i++) {
      await check({ key, limit: KNOWN, windowSec: HOUR });
    }
    const blocked = await check({ key, limit: KNOWN, windowSec: HOUR });
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSec >= 1);
  });

  test("7th unknown-token pull from one IP inside 1h → blocked", async () => {
    const key = calendarFeedIp("9.9.9.9");
    for (let i = 1; i <= UNKNOWN_IP; i++) {
      await check({ key, limit: UNKNOWN_IP, windowSec: HOUR });
    }
    const blocked = await check({ key, limit: UNKNOWN_IP, windowSec: HOUR });
    assert.equal(blocked.ok, false);
  });

  test("token bucket and unknown-IP bucket are isolated (disjoint namespaces)", async () => {
    const tokenKey = calendarFeedToken("abcd1234efgh5678");
    for (let i = 0; i < KNOWN; i++) {
      await check({ key: tokenKey, limit: KNOWN, windowSec: HOUR });
    }
    // Token bucket is now full — but IP-scoped unknown-token bucket for a
    // DIFFERENT client should still be untouched.
    const ipKey = calendarFeedIp("9.9.9.9");
    const r = await check({ key: ipKey, limit: UNKNOWN_IP, windowSec: HOUR });
    assert.equal(r.ok, true);
    assert.notEqual(tokenKey, ipKey);
  });
});
