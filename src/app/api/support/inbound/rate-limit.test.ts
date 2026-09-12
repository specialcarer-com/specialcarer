/**
 * Per-swap-site test: support-inbound rate-limit wiring (PR C2, Phase C).
 *
 * The route now uses the shared distributed limiter with `supportInboundVendor`
 * as the key, preserving PR #199's 30/min per-vendor ceiling. This test proves
 * the ceiling still holds and that different vendor labels get disjoint
 * budgets (one noisy relay can't starve another).
 */
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { check, __resetFallbackForTests } from "@/lib/rate-limit/distributed";
import { supportInboundVendor } from "@/lib/rate-limit/keys";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const LIMIT = 30;
const MIN = 60;

beforeEach(() => __resetFallbackForTests());

describe("support-inbound limiter wiring (PR #199 ceiling preserved)", () => {
  test("31st delivery from one vendor inside 60s → blocked", async () => {
    const key = supportInboundVendor("postmark");
    for (let i = 1; i <= LIMIT; i++) {
      const r = await check({ key, limit: LIMIT, windowSec: MIN });
      assert.equal(r.ok, true, `delivery ${i}`);
    }
    const blocked = await check({ key, limit: LIMIT, windowSec: MIN });
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSec >= 1);
    assert.ok(blocked.retryAfterSec <= MIN);
  });

  test("different vendors get independent budgets", async () => {
    const postmark = supportInboundVendor("postmark");
    const sendgrid = supportInboundVendor("sendgrid");
    for (let i = 0; i < LIMIT; i++) {
      await check({ key: postmark, limit: LIMIT, windowSec: MIN });
    }
    assert.equal(
      (await check({ key: postmark, limit: LIMIT, windowSec: MIN })).ok,
      false,
      "postmark exhausted",
    );
    assert.equal(
      (await check({ key: sendgrid, limit: LIMIT, windowSec: MIN })).ok,
      true,
      "sendgrid still has budget",
    );
  });
});
