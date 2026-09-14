/**
 * Unit tests for the experiment readout math (E3).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeExperimentReadout,
  type DailyRollup,
} from "./readout";

function row(over: Partial<DailyRollup>): DailyRollup {
  return {
    day: "2026-09-13",
    variant: "control",
    n_offers: 0,
    n_accepted: 0,
    n_declined: 0,
    n_expired: 0,
    ...over,
  };
}

describe("computeExperimentReadout", () => {
  it("aggregates per-arm sums correctly", () => {
    const out = computeExperimentReadout([
      row({ variant: "control", n_offers: 10, n_accepted: 3, n_declined: 5, n_expired: 2 }),
      row({ variant: "control", day: "2026-09-14", n_offers: 5, n_accepted: 2, n_declined: 2, n_expired: 1 }),
      row({ variant: "treatment", n_offers: 20, n_accepted: 12, n_declined: 5, n_expired: 3 }),
    ]);
    assert.equal(out.arms.control.n_offers, 15);
    assert.equal(out.arms.control.n_accepted, 5);
    assert.equal(out.arms.control.denominator, 15);
    assert.equal(out.arms.control.accept_rate, 5 / 15);

    assert.equal(out.arms.treatment.n_offers, 20);
    assert.equal(out.arms.treatment.n_accepted, 12);
    assert.equal(out.arms.treatment.denominator, 20);
    assert.equal(out.arms.treatment.accept_rate, 12 / 20);
  });

  it("reports delta with a 95% CI when both arms have data", () => {
    const out = computeExperimentReadout([
      row({ variant: "control", n_offers: 100, n_accepted: 20, n_declined: 60, n_expired: 20 }),
      row({ variant: "treatment", n_offers: 100, n_accepted: 30, n_declined: 50, n_expired: 20 }),
    ]);
    assert.equal(out.delta.available, true);
    if (!out.delta.available) return;
    // control 20/100 = 0.20; treatment 30/100 = 0.30; delta 0.10.
    assert.ok(Math.abs(out.delta.value - 0.1) < 1e-9);
    // CI must bracket the point estimate.
    assert.ok(out.delta.ciLow < out.delta.value);
    assert.ok(out.delta.ciHigh > out.delta.value);
    // Sanity: interval width plausible (~0.12-0.14 for these Ns).
    const width = out.delta.ciHigh - out.delta.ciLow;
    assert.ok(width > 0.05 && width < 0.5, `unexpected CI width: ${width}`);
  });

  it("marks delta unavailable when one arm has no resolved offers", () => {
    const out = computeExperimentReadout([
      row({
        variant: "control",
        n_offers: 100,
        n_accepted: 20,
        n_declined: 60,
        n_expired: 20,
      }),
      // treatment: only pending (n_offers > 0 but 0 accepted/declined/expired)
      row({ variant: "treatment", n_offers: 5 }),
    ]);
    assert.equal(out.delta.available, false);
  });

  it("handles empty input gracefully", () => {
    const out = computeExperimentReadout([]);
    assert.equal(out.arms.control.n_offers, 0);
    assert.equal(out.arms.treatment.n_offers, 0);
    assert.equal(out.delta.available, false);
  });
});
