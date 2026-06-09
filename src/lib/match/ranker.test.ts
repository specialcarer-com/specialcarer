/**
 * Unit tests for the pure auto-match ranker (gap 17).
 *
 * Only `rankCandidates` is exercised here — it's the pure, DB-free core.
 * `runAutoMatch` orchestration (RPC reads, upserts, push) is covered by the
 * find-matches route test + integration, not duplicated here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, type Candidate } from "./ranker";

const NOW = Date.parse("2026-06-09T12:00:00Z");

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    carer_id: "c-default",
    distance_km: 1,
    rating: 5,
    response_rate: 1,
    last_active_at: new Date(NOW).toISOString(),
    completion_rate: 1,
    ...over,
  };
}

describe("rankCandidates", () => {
  it("returns at most topN offers, sorted by score desc", () => {
    const candidates: Candidate[] = [
      candidate({ carer_id: "near", distance_km: 0 }),
      candidate({ carer_id: "mid", distance_km: 5 }),
      candidate({ carer_id: "far", distance_km: 9 }),
    ];
    const ranked = rankCandidates(candidates, 10, 2, NOW);
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0].carer_id, "near");
    assert.equal(ranked[1].carer_id, "mid");
    assert.ok(ranked[0].score >= ranked[1].score);
  });

  it("breaks ties deterministically by carer_id ascending", () => {
    const candidates: Candidate[] = [
      candidate({ carer_id: "bbb" }),
      candidate({ carer_id: "aaa" }),
    ];
    const ranked = rankCandidates(candidates, 10, 5, NOW);
    assert.equal(ranked[0].carer_id, "aaa");
    assert.equal(ranked[1].carer_id, "bbb");
    assert.equal(ranked[0].score, ranked[1].score);
  });

  it("empty pool returns empty", () => {
    assert.deepEqual(rankCandidates([], 10, 5, NOW), []);
  });

  it("topN of 0 returns empty", () => {
    assert.deepEqual(rankCandidates([candidate()], 10, 0, NOW), []);
  });

  it("includes the per-signal breakdown on each offer", () => {
    const ranked = rankCandidates([candidate({ carer_id: "x" })], 10, 5, NOW);
    assert.equal(ranked.length, 1);
    assert.ok(ranked[0].score_breakdown);
    assert.equal(ranked[0].score_breakdown.distance, 0.9); // 1km of 10km
  });

  it("higher rating outranks a marginally closer but unrated carer", () => {
    const candidates: Candidate[] = [
      candidate({
        carer_id: "close-unrated",
        distance_km: 0,
        rating: 0,
        response_rate: 0,
        completion_rate: 0,
      }),
      candidate({
        carer_id: "far-great",
        distance_km: 3,
        rating: 5,
        response_rate: 1,
        completion_rate: 1,
      }),
    ];
    const ranked = rankCandidates(candidates, 10, 5, NOW);
    assert.equal(ranked[0].carer_id, "far-great");
  });

  it("clamps negative topN to empty", () => {
    assert.deepEqual(rankCandidates([candidate()], 10, -3, NOW), []);
  });
});
