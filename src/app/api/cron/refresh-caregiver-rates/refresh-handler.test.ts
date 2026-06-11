/**
 * Tests for the refresh-caregiver-rates cron handler.
 *
 * Drives the pure pieces with no live DB:
 *   - authorize(): valid vs invalid CRON_SECRET → 200 vs 401 at the route level.
 *   - handleRefresh(): success (updated count + duration) + error passthrough
 *     via a stub client and an injected clock.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authorize,
  handleRefresh,
  type RefreshClient,
} from "./refresh-handler";

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

  it("allows any caller when no secret is configured (local/dev)", () => {
    assert.equal(authorize(null, undefined), true);
    assert.equal(authorize("Bearer whatever", ""), true);
  });
});

describe("handleRefresh", () => {
  it("reports the updated count and elapsed duration on success", async () => {
    let t = 1000;
    const client: RefreshClient = {
      refreshRates: async () => ({ updated: 42, error: null }),
      now: () => {
        const cur = t;
        t += 250; // first call (start) 1000, second (end) 1250
        return cur;
      },
    };
    const res = await handleRefresh(client);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, updated: 42, duration_ms: 250 });
  });

  it("passes a refresh error through as a 500", async () => {
    const client: RefreshClient = {
      refreshRates: async () => ({ updated: 0, error: "boom" }),
    };
    const res = await handleRefresh(client);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { ok: false, error: "boom" });
  });

  it("never reports a negative duration", async () => {
    const client: RefreshClient = {
      refreshRates: async () => ({ updated: 0, error: null }),
      now: () => 5000, // start == end
    };
    const res = await handleRefresh(client);
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
    assert.ok(res.body.duration_ms >= 0);
  });
});
