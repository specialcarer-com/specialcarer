/**
 * Unit tests for the shared match scorer (gap 17 / gap 19).
 *
 * Pure functions, no DB. `now` is injected for deterministic recency.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreCarer, SCORING_WEIGHTS, type ScoreSignals } from "./scoring";

const NOW = Date.parse("2026-06-09T12:00:00Z");
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function signals(over: Partial<ScoreSignals> = {}): ScoreSignals {
  return {
    distance_km: 0,
    max_distance_km: 10,
    rating: 5,
    response_rate: 1,
    last_active_at: new Date(NOW).toISOString(),
    completion_rate: 1,
    ...over,
  };
}

describe("SCORING_WEIGHTS", () => {
  it("sums to 1.0", () => {
    const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
  });
});

describe("scoreCarer", () => {
  it("perfect carer scores 100", () => {
    const { score, breakdown } = scoreCarer(signals(), NOW);
    assert.equal(score, 100);
    assert.equal(breakdown.distance, 1);
    assert.equal(breakdown.rating, 1);
    assert.equal(breakdown.response_rate, 1);
    assert.equal(breakdown.recency, 1);
    assert.equal(breakdown.completion_rate, 1);
  });

  it("worst-case carer (far, unrated, never active) scores low", () => {
    const { score } = scoreCarer(
      signals({
        distance_km: 10,
        rating: 0,
        response_rate: 0,
        last_active_at: null,
        completion_rate: 0,
      }),
      NOW,
    );
    // distance at max radius => 0 contribution; everything else 0.
    assert.equal(score, 0);
  });

  it("distance is linear over the radius", () => {
    const half = scoreCarer(
      signals({
        distance_km: 5,
        rating: 0,
        response_rate: 0,
        last_active_at: null,
        completion_rate: 0,
      }),
      NOW,
    );
    // 0.5 distance signal * 0.4 weight * 100 = 20
    assert.equal(half.breakdown.distance, 0.5);
    assert.equal(half.score, 20);
  });

  it("unknown distance is treated as neutral-low (0.3), not zero", () => {
    const { breakdown } = scoreCarer(
      signals({ distance_km: null }),
      NOW,
    );
    assert.equal(breakdown.distance, 0.3);
  });

  it("rating normalises against 5", () => {
    const { breakdown } = scoreCarer(signals({ rating: 2.5 }), NOW);
    assert.equal(breakdown.rating, 0.5);
  });

  it("null response_rate / completion_rate contribute zero", () => {
    const { breakdown } = scoreCarer(
      signals({ response_rate: null, completion_rate: null }),
      NOW,
    );
    assert.equal(breakdown.response_rate, 0);
    assert.equal(breakdown.completion_rate, 0);
  });

  it("recency is full within 30 min and zero past 7 days", () => {
    const fresh = scoreCarer(
      signals({ last_active_at: new Date(NOW - 10 * 60 * 1000).toISOString() }),
      NOW,
    );
    assert.equal(fresh.breakdown.recency, 1);

    const stale = scoreCarer(
      signals({
        last_active_at: new Date(NOW - 8 * 24 * 3600 * 1000).toISOString(),
      }),
      NOW,
    );
    assert.equal(stale.breakdown.recency, 0);
  });

  it("recency decays between 30 min and 7 days", () => {
    const mid = scoreCarer(
      signals({
        last_active_at: new Date(NOW - 3.5 * 24 * 3600 * 1000).toISOString(),
      }),
      NOW,
    );
    assert.ok(mid.breakdown.recency > 0 && mid.breakdown.recency < 1);
  });

  it("clamps out-of-range inputs", () => {
    const { breakdown } = scoreCarer(
      signals({ rating: 99, response_rate: 9, completion_rate: -3 }),
      NOW,
    );
    assert.equal(breakdown.rating, 1);
    assert.equal(breakdown.response_rate, 1);
    assert.equal(breakdown.completion_rate, 0);
  });

  it("score is rounded to 2 decimal places", () => {
    const { score } = scoreCarer(
      signals({ rating: 4.3, response_rate: 0.66, completion_rate: 0.33 }),
      NOW,
    );
    assert.equal(Math.round(score * 100) / 100, score);
  });
});

// Additional cases contributed by gap 19 (smart rerank). Kept in their own
// block so both suites run without name collisions; these exercise a non-zero
// blended score at a wider radius and the null-recency edge directly.
describe("scoreCarer (smart rerank / gap 19)", () => {
  it("distance is linear over a wider radius", () => {
    const half = scoreCarer(
      signals({ distance_km: 10, max_distance_km: 20 }),
      NOW,
    );
    // halfway distance → distance signal 0.5 (weight 0.4 → loses 0.2 → 80)
    assert.equal(half.breakdown.distance, 0.5);
    assert.equal(half.score, 80);
  });

  it("recency: full within 30 minutes, zero after 7 days or when null", () => {
    assert.equal(
      scoreCarer(signals({ last_active_at: iso(10 * MIN) }), NOW).breakdown.recency,
      1,
    );
    assert.equal(
      scoreCarer(signals({ last_active_at: iso(8 * DAY) }), NOW).breakdown.recency,
      0,
    );
    assert.equal(
      scoreCarer(signals({ last_active_at: null }), NOW).breakdown.recency,
      0,
    );
  });
});
