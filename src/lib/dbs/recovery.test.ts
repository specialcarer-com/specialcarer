/**
 * Unit tests for DBS earnings recovery maths (PR-DBS-1).
 * Tests the pure computeRecovery() core.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeRecovery } from "./recovery";

describe("computeRecovery", () => {
  it("deducts 10% of the payout when above the £6 floor", () => {
    // 10% of £100 = £10 = 1000p
    const r = computeRecovery(10000, "pending", 0);
    assert.equal(r.deductedPence, 1000);
    assert.equal(r.newCollectedPence, 1000);
    assert.equal(r.newStatus, "recovering");
  });

  it("applies the £6 floor when 10% would be smaller", () => {
    // 10% of £40 = £4 = 400p, floored to £6 = 600p
    const r = computeRecovery(4000, "pending", 0);
    assert.equal(r.deductedPence, 600);
    assert.equal(r.newStatus, "recovering");
  });

  it("never deducts more than the payout itself", () => {
    // £6 floor but payout is only £3 → cap at the payout
    const r = computeRecovery(300, "recovering", 0);
    assert.equal(r.deductedPence, 300);
  });

  it("never deducts more than the remaining balance and completes at £60", () => {
    // £55 already recovered, big payout → only £5 left to take
    const r = computeRecovery(100000, "recovering", 5500);
    assert.equal(r.deductedPence, 500);
    assert.equal(r.newCollectedPence, 6000);
    assert.equal(r.newStatus, "recovered");
  });

  it("marks recovered exactly at the £60 target", () => {
    const r = computeRecovery(10000, "recovering", 5000);
    assert.equal(r.deductedPence, 1000);
    assert.equal(r.newStatus, "recovered");
  });

  it("skips carers who paid upfront", () => {
    const r = computeRecovery(10000, "paid_upfront", 0);
    assert.equal(r.deductedPence, 0);
    assert.equal(r.newStatus, "paid_upfront");
  });

  it("skips waived carers", () => {
    const r = computeRecovery(10000, "waived", 0);
    assert.equal(r.deductedPence, 0);
    assert.equal(r.newStatus, "waived");
  });

  it("is a no-op once already recovered", () => {
    const r = computeRecovery(10000, "recovered", 6000);
    assert.equal(r.deductedPence, 0);
    assert.equal(r.newStatus, "recovered");
  });

  it("returns recovered with no deduction if collected already at target while pending", () => {
    const r = computeRecovery(10000, "pending", 6000);
    assert.equal(r.deductedPence, 0);
    assert.equal(r.newStatus, "recovered");
  });
});
