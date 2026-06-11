/**
 * Auth-guard tests for GET /api/m/earnings (gap 36).
 *
 * The route's carer gate is the pure `authorizeCarer` helper (so it can
 * be tested without next/headers + cookie machinery, matching the
 * handler-extraction pattern used elsewhere). Earnings are carer-only:
 *   - unauthenticated         → 401
 *   - authenticated non-carer → 403
 *   - authenticated carer     → ok
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authorizeCarer } from "@/lib/earnings/dashboard-handler";

describe("authorizeCarer", () => {
  it("401s when there is no signed-in user", () => {
    const r = authorizeCarer({ userId: null, hasCarerProfile: false });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 401);
  });

  it("403s when the user is signed in but not a carer", () => {
    const r = authorizeCarer({
      userId: "seeker-123",
      hasCarerProfile: false,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 403);
    assert.match(r.error, /carers only/i);
  });

  it("allows a signed-in carer", () => {
    const r = authorizeCarer({
      userId: "carer-123",
      hasCarerProfile: true,
    });
    assert.equal(r.ok, true);
  });

  it("403s even if undefined userId somehow pairs with a profile flag", () => {
    // Defensive: a carer profile flag must never authorise an absent user.
    const r = authorizeCarer({ userId: undefined, hasCarerProfile: true });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 401);
  });
});
