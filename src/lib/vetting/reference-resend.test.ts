import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReferenceResendUpdate,
  decideReferenceResend,
  MAX_REFERENCE_RESENDS_PER_DAY,
} from "./reference-resend";

const NOW = new Date("2026-08-08T09:00:00.000Z");
const baseReference = {
  carer_id: "carer-1",
  status: "invited",
  resend_count: 0,
  last_resend_at: null,
};

describe("reference resend endpoint policy", () => {
  it("rejects a non-owner", () => {
    const result = decideReferenceResend({
      reference: baseReference,
      requesterCarerId: "another-carer",
      now: NOW,
    });
    assert.deepEqual(result, { ok: false, status: 403, error: "Forbidden" });
  });

  it("rejects submitted and verified references", () => {
    for (const status of ["submitted", "verified"] as const) {
      const result = decideReferenceResend({
        reference: { ...baseReference, status },
        requesterCarerId: "carer-1",
        now: NOW,
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, 400);
    }
  });

  it("enforces the three-resends-per-24-hours cap", () => {
    const result = decideReferenceResend({
      reference: {
        ...baseReference,
        resend_count: MAX_REFERENCE_RESENDS_PER_DAY,
        last_resend_at: "2026-08-08T08:59:59.000Z",
      },
      requesterCarerId: "carer-1",
      now: NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 429);
  });

  it("resets the counter after 24 hours and refreshes the token expiry", () => {
    const decision = decideReferenceResend({
      reference: {
        ...baseReference,
        resend_count: MAX_REFERENCE_RESENDS_PER_DAY,
        last_resend_at: "2026-08-07T08:59:59.000Z",
      },
      requesterCarerId: "carer-1",
      now: NOW,
    });
    assert.deepEqual(decision, { ok: true, nextResendCount: 1 });
    if (!decision.ok) return;
    const update = buildReferenceResendUpdate({
      nextResendCount: decision.nextResendCount,
      token: "fresh-token",
      now: NOW,
    });
    assert.equal(update.status, "invited");
    assert.equal(update.token, "fresh-token");
    assert.equal(update.token_expires_at, "2026-08-22T09:00:00.000Z");
    assert.equal(update.reminder_stage, 0);
  });
});
