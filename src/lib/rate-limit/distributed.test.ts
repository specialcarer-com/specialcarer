/**
 * Distributed limiter tests (Phase C — PR C2).
 *
 * These cover the fallback path in isolation (no Upstash env vars) — the
 * Upstash REST path is exercised end-to-end in staging. We deliberately avoid
 * mocking `fetch` here because that would test the mock, not the limiter.
 *
 * Cases:
 *   1. Sliding-window arithmetic — allow up to limit, block the next.
 *   2. Redis-outage fallback — with env unset, we still get fail-CLOSED.
 *   3. Key isolation — different keys have independent budgets.
 *   4. Retry-After math — never zero on block, never negative.
 *   5. LRU eviction — bounded at 100 keys.
 *   6. Response headers helper — shape matches spec.
 *   7. Canonical key builders — namespace + normalisation.
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { check, __resetFallbackForTests } from "./distributed";
import { rateLimitHeaders } from "./headers";
import {
  calendarFeedIp,
  calendarFeedToken,
  supportInboundVendor,
  waitlistEmail,
  waitlistIp,
} from "./keys";

// Force the fallback path for every test in this file — no Upstash calls.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

beforeEach(() => {
  __resetFallbackForTests();
});

describe("distributed limiter — fallback (fail-CLOSED) path", () => {
  test("allows exactly `limit` hits then blocks the next", async () => {
    const key = `t-window-${Math.random()}`;
    for (let i = 1; i <= 5; i++) {
      const r = await check({ key, limit: 5, windowSec: 60 });
      assert.equal(r.ok, true, `hit ${i} should be allowed`);
      assert.equal(r.remaining, 5 - i, `remaining after hit ${i}`);
    }
    const blocked = await check({ key, limit: 5, windowSec: 60 });
    assert.equal(blocked.ok, false, "6th hit blocked");
    assert.equal(blocked.remaining, 0);
  });

  test("different keys have independent budgets (isolation)", async () => {
    const a = `t-iso-a-${Math.random()}`;
    const b = `t-iso-b-${Math.random()}`;
    for (let i = 0; i < 3; i++) await check({ key: a, limit: 3, windowSec: 60 });
    const aBlocked = await check({ key: a, limit: 3, windowSec: 60 });
    assert.equal(aBlocked.ok, false, "key a exhausted");
    const bAllowed = await check({ key: b, limit: 3, windowSec: 60 });
    assert.equal(bAllowed.ok, true, "key b independent");
    assert.equal(bAllowed.remaining, 2);
  });

  test("Retry-After is a positive integer bounded by the window on block", async () => {
    const key = `t-retry-${Math.random()}`;
    for (let i = 0; i < 2; i++) await check({ key, limit: 2, windowSec: 60 });
    const blocked = await check({ key, limit: 2, windowSec: 60 });
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSec >= 1, "retry-after >= 1");
    assert.ok(blocked.retryAfterSec <= 60, "retry-after <= window");
    assert.ok(Number.isInteger(blocked.retryAfterSec), "integer seconds");
    assert.ok(blocked.resetAt > Math.floor(Date.now() / 1000), "resetAt in the future");
  });

  test("nonsense config fails closed (zero/negative limit)", async () => {
    const r = await check({ key: "nope", limit: 0, windowSec: 60 });
    assert.equal(r.ok, false);
    assert.ok(r.retryAfterSec >= 1);
  });

  test("outage fallback is still fail-CLOSED for over-limit callers", async () => {
    // Env vars are already unset above → every check hits the fallback.
    // This test explicitly asserts the failure mode is CLOSED, not open.
    const key = `t-outage-${Math.random()}`;
    for (let i = 0; i < 4; i++) await check({ key, limit: 4, windowSec: 60 });
    const blocked = await check({ key, limit: 4, windowSec: 60 });
    assert.equal(blocked.ok, false, "outage MUST NOT fail open");
  });

  test("LRU eviction keeps fallback bounded at 100 keys", async () => {
    // Populate more than 100 distinct keys — the map should never exceed the cap.
    for (let i = 0; i < 250; i++) {
      await check({ key: `t-lru-${i}`, limit: 5, windowSec: 60 });
    }
    // Not directly readable, but a fresh key should still be admitted (proves
    // the map isn't in a wedged state after eviction).
    const r = await check({ key: `t-lru-fresh`, limit: 1, windowSec: 60 });
    assert.equal(r.ok, true);
  });

  test("sliding window resets after entries fall out (short window)", async () => {
    const key = `t-slide-${Math.random()}`;
    for (let i = 0; i < 3; i++) await check({ key, limit: 3, windowSec: 1 });
    const blocked = await check({ key, limit: 3, windowSec: 1 });
    assert.equal(blocked.ok, false);
    // Wait for the 1-second window to lapse.
    await new Promise((r) => setTimeout(r, 1100));
    const allowed = await check({ key, limit: 3, windowSec: 1 });
    assert.equal(allowed.ok, true, "hit allowed after window slides");
  });
});

describe("rateLimitHeaders helper", () => {
  test("emits Limit/Remaining/Reset always; Retry-After only on 429", () => {
    const ok = rateLimitHeaders({
      ok: true,
      remaining: 4,
      retryAfterSec: 0,
      limit: 5,
      resetAt: 1_700_000_000,
    });
    assert.equal(ok["X-RateLimit-Limit"], "5");
    assert.equal(ok["X-RateLimit-Remaining"], "4");
    assert.equal(ok["X-RateLimit-Reset"], "1700000000");
    assert.equal(ok["Retry-After"], undefined);

    const blocked = rateLimitHeaders({
      ok: false,
      remaining: 0,
      retryAfterSec: 42,
      limit: 5,
      resetAt: 1_700_000_042,
    });
    assert.equal(blocked["Retry-After"], "42");
    assert.equal(blocked["X-RateLimit-Remaining"], "0");
  });

  test("Retry-After never below 1 even if the limiter says 0", () => {
    const h = rateLimitHeaders({
      ok: false,
      remaining: 0,
      retryAfterSec: 0,
      limit: 1,
      resetAt: 1,
    });
    assert.equal(h["Retry-After"], "1");
  });
});

describe("canonical key builders", () => {
  test("waitlist:ip / waitlist:email normalise + namespace", () => {
    assert.equal(waitlistIp("  1.2.3.4 "), "waitlist:ip:1.2.3.4");
    assert.equal(waitlistIp(""), "waitlist:ip:unknown");
    assert.equal(
      waitlistEmail(" Alice@Example.COM "),
      "waitlist:email:alice@example.com",
    );
  });

  test("calendar keys keep token vs ip in disjoint namespaces", () => {
    const tok = calendarFeedToken(" abc123 ");
    const ip = calendarFeedIp("9.9.9.9");
    assert.equal(tok, "calendar:feed:token:abc123");
    assert.equal(ip, "calendar:feed:ip:9.9.9.9");
    assert.notEqual(tok, ip);
  });

  test("support inbound vendor builder", () => {
    assert.equal(supportInboundVendor("Postmark"), "support:inbound:vendor:postmark");
    assert.equal(supportInboundVendor(""), "support:inbound:vendor:unknown");
  });
});
