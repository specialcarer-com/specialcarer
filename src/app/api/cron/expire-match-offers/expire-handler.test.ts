/**
 * Tests for the expire-match-offers cron handler (gap 17 follow-up).
 *
 * Drives the pure pieces with no live DB:
 *   - authorize(): valid vs invalid CRON_SECRET → 200 vs 401 at the route level.
 *   - isExpiryEligible(): the RPC's WHERE predicate, over a mixed set of offers.
 *   - handleExpire(): success + error passthrough via a stub client.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authorize,
  handleExpire,
  isExpiryEligible,
  type ExpireClient,
  type OfferLike,
} from "./expire-handler";

const NOW = Date.parse("2026-06-10T12:00:00Z");
const PAST = new Date(NOW - 5 * 60 * 1000).toISOString();
const FUTURE = new Date(NOW + 5 * 60 * 1000).toISOString();

describe("authorize", () => {
  const SECRET = "s3cr3t";

  it("allows a matching Bearer token", () => {
    assert.equal(authorize(`Bearer ${SECRET}`, SECRET), true);
  });

  it("rejects a mismatched token", () => {
    assert.equal(authorize("Bearer wrong", SECRET), false);
  });

  it("rejects a missing header", () => {
    assert.equal(authorize(null, SECRET), false);
  });

  it("rejects a bare token without the Bearer scheme", () => {
    assert.equal(authorize(SECRET, SECRET), false);
  });

  it("allows any caller when no secret is configured (local/dev)", () => {
    assert.equal(authorize(null, undefined), true);
    assert.equal(authorize("Bearer whatever", ""), true);
  });
});

describe("isExpiryEligible", () => {
  // The brief's scenario: 5 offers with mixed expires_at + statuses. Only the
  // live (pending/accepted) rows whose window has passed should flip.
  const offers: Array<{ name: string; offer: OfferLike; expect: boolean }> = [
    { name: "pending + past", offer: { status: "pending", expires_at: PAST }, expect: true },
    { name: "accepted + past", offer: { status: "accepted", expires_at: PAST }, expect: true },
    { name: "pending + future", offer: { status: "pending", expires_at: FUTURE }, expect: false },
    { name: "declined + past", offer: { status: "declined", expires_at: PAST }, expect: false },
    { name: "already expired + past", offer: { status: "expired", expires_at: PAST }, expect: false },
  ];

  for (const { name, offer, expect } of offers) {
    it(`${name} → ${expect ? "expires" : "untouched"}`, () => {
      assert.equal(isExpiryEligible(offer, NOW), expect);
    });
  }

  it("flips exactly the eligible rows in the mixed set", () => {
    const eligible = offers.filter((o) => isExpiryEligible(o.offer, NOW));
    assert.equal(eligible.length, 2);
    assert.deepEqual(
      eligible.map((o) => o.name).sort(),
      ["accepted + past", "pending + past"],
    );
  });

  it("treats an unparseable expires_at as not eligible", () => {
    assert.equal(
      isExpiryEligible({ status: "pending", expires_at: "not-a-date" }, NOW),
      false,
    );
  });
});

describe("handleExpire", () => {
  it("returns 200 + expired_count on success", async () => {
    const client: ExpireClient = {
      async expireStale() {
        return { expiredCount: 3, error: null };
      },
    };
    const res = await handleExpire(client);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, expired_count: 3 });
  });

  it("returns 500 + error when the RPC fails", async () => {
    const client: ExpireClient = {
      async expireStale() {
        return { expiredCount: 0, error: "boom" };
      },
    };
    const res = await handleExpire(client);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { ok: false, error: "boom" });
  });
});
