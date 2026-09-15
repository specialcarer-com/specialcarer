/**
 * Unit tests for the pure toneForMinutes() thresholding.
 *
 * getKpiFreshness itself needs an admin client + Supabase mock, which
 * lives in the end-to-end cron test — but the tone thresholds are the
 * decision-making bit that drives the UI banner, so we cover them here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toneForMinutes } from "./kpi-freshness";

describe("toneForMinutes — E5 freshness thresholds", () => {
  it("null → unknown", () => {
    assert.equal(toneForMinutes(null), "unknown");
  });

  it("< 90 → green", () => {
    assert.equal(toneForMinutes(0), "green");
    assert.equal(toneForMinutes(1), "green");
    assert.equal(toneForMinutes(65), "green");
    assert.equal(toneForMinutes(89), "green");
  });

  it("90..360 (inclusive) → amber", () => {
    assert.equal(toneForMinutes(90), "amber");
    assert.equal(toneForMinutes(150), "amber");
    assert.equal(toneForMinutes(360), "amber");
  });

  it("> 360 → red", () => {
    assert.equal(toneForMinutes(361), "red");
    assert.equal(toneForMinutes(3600), "red");
    assert.equal(toneForMinutes(60 * 24 * 30), "red");
  });
});
