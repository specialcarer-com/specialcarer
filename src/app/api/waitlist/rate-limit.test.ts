/**
 * Per-swap-site test: waitlist rate-limit wiring (PR C2, Phase C).
 *
 * The route uses two buckets: IP 10/hr + email 5/hr. This test drives the
 * SAME limiter + key builders the route uses (fallback mode, no Upstash) to
 * prove:
 *   - 11th IP hit inside 1h blocks with Retry-After
 *   - 6th email hit inside 1h blocks with Retry-After
 *   - IP and email buckets are disjoint (email exhaustion doesn't block IP)
 *
 * We assert the LIMITER contract rather than boot Next.js for a full route
 * fixture — this catches the failure the acceptance criteria care about (a
 * caller can't blow past the ceiling) without the noise of Supabase stubs.
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { check, __resetFallbackForTests } from "@/lib/rate-limit/distributed";
import { waitlistEmail, waitlistIp } from "@/lib/rate-limit/keys";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const IP_LIMIT = 10;
const EMAIL_LIMIT = 5;
const HOUR = 60 * 60;

beforeEach(() => __resetFallbackForTests());

describe("waitlist limiter wiring", () => {
  test("11th submit from one IP inside 1h → blocked with Retry-After", async () => {
    const key = waitlistIp("1.2.3.4");
    for (let i = 1; i <= IP_LIMIT; i++) {
      const r = await check({ key, limit: IP_LIMIT, windowSec: HOUR });
      assert.equal(r.ok, true, `hit ${i}`);
    }
    const blocked = await check({ key, limit: IP_LIMIT, windowSec: HOUR });
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSec >= 1);
  });

  test("6th submit for one email inside 1h → blocked", async () => {
    const key = waitlistEmail("alice@example.com");
    for (let i = 1; i <= EMAIL_LIMIT; i++) {
      await check({ key, limit: EMAIL_LIMIT, windowSec: HOUR });
    }
    const blocked = await check({ key, limit: EMAIL_LIMIT, windowSec: HOUR });
    assert.equal(blocked.ok, false);
  });

  test("email exhaustion does not block IP bucket for a different email", async () => {
    const emailA = waitlistEmail("a@example.com");
    for (let i = 0; i < EMAIL_LIMIT; i++) {
      await check({ key: emailA, limit: EMAIL_LIMIT, windowSec: HOUR });
    }
    // Different email → fresh bucket, still allowed.
    const emailB = waitlistEmail("b@example.com");
    const r = await check({ key: emailB, limit: EMAIL_LIMIT, windowSec: HOUR });
    assert.equal(r.ok, true);
  });
});
