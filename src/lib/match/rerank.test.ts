/**
 * Tests for the smart-rerank scorer (gap 19).
 *
 * Pure + deterministic: `now` is injected so the recency/online windows are
 * stable. Eight mock carers exercise the fresh-online float, every sort key,
 * and the id tiebreaker. isFreshOnline edge cases are covered separately.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankCarers, isFreshOnline, type RerankCarer } from "./rerank";

const NOW = new Date("2026-06-09T12:00:00Z").getTime();
const MIN = 60 * 1000;

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

function carer(over: Partial<RerankCarer> & { id: string }): RerankCarer {
  return {
    rating: null,
    rating_count: null,
    distance_km: null,
    is_online: null,
    last_online_at: null,
    created_at: null,
    ...over,
  };
}

/* ── isFreshOnline ───────────────────────────────────────────────── */
describe("isFreshOnline", () => {
  it("false when is_online is not true", () => {
    assert.equal(isFreshOnline({ is_online: false, last_online_at: iso(0) }, NOW), false);
    assert.equal(isFreshOnline({ is_online: null, last_online_at: iso(0) }, NOW), false);
  });

  it("false when last_online_at is missing", () => {
    assert.equal(isFreshOnline({ is_online: true, last_online_at: null }, NOW), false);
  });

  it("true when online and pinged within 30 minutes", () => {
    assert.equal(isFreshOnline({ is_online: true, last_online_at: iso(5 * MIN) }, NOW), true);
    assert.equal(isFreshOnline({ is_online: true, last_online_at: iso(30 * MIN) }, NOW), true);
  });

  it("false when online flag is set but ping is stale (> 30 min)", () => {
    assert.equal(isFreshOnline({ is_online: true, last_online_at: iso(31 * MIN) }, NOW), false);
  });

  it("false when last_online_at is unparseable", () => {
    assert.equal(isFreshOnline({ is_online: true, last_online_at: "not-a-date" }, NOW), false);
  });
});

/* ── rankCarers: fresh-online float ──────────────────────────────── */
describe("rankCarers fresh-online float", () => {
  // A low-rated fresh-online carer should still beat a high-rated offline one
  // for every sort, because online floats first by default.
  const onlineLow = carer({
    id: "online-low",
    rating: 2.0,
    is_online: true,
    last_online_at: iso(2 * MIN),
  });
  const offlineHigh = carer({
    id: "offline-high",
    rating: 5.0,
    is_online: false,
    last_online_at: iso(2 * 24 * 60 * MIN),
  });

  for (const sort of ["best_match", "rating_desc", "nearest", "newest"] as const) {
    it(`floats fresh-online above offline for sort=${sort}`, () => {
      const ranked = rankCarers([offlineHigh, onlineLow], { sort, now: NOW });
      assert.equal(ranked[0].id, "online-low");
      assert.equal(ranked[1].id, "offline-high");
    });
  }

  it("does not float when floatOnlineFirst=false", () => {
    const ranked = rankCarers([onlineLow, offlineHigh], {
      sort: "rating_desc",
      floatOnlineFirst: false,
      now: NOW,
    });
    assert.equal(ranked[0].id, "offline-high");
    assert.equal(ranked[1].id, "online-low");
  });

  it("a stale online flag does NOT float (treated as offline)", () => {
    const staleOnline = carer({
      id: "stale",
      rating: 2.0,
      is_online: true,
      last_online_at: iso(90 * MIN),
    });
    const ranked = rankCarers([staleOnline, offlineHigh], {
      sort: "rating_desc",
      now: NOW,
    });
    assert.equal(ranked[0].id, "offline-high");
    assert.equal(ranked[1].id, "stale");
  });
});

/* ── rankCarers: secondary ordering within a group ───────────────── */
describe("rankCarers secondary ordering", () => {
  // Eight carers: 3 fresh-online, 5 offline, varied rating/distance/created.
  const carers: RerankCarer[] = [
    carer({ id: "on-a", rating: 3.0, distance_km: 8, created_at: iso(10 * 24 * 60 * MIN), is_online: true, last_online_at: iso(1 * MIN) }),
    carer({ id: "on-b", rating: 4.9, distance_km: 2, created_at: iso(1 * 24 * 60 * MIN), is_online: true, last_online_at: iso(3 * MIN) }),
    carer({ id: "on-c", rating: 4.0, distance_km: 5, created_at: iso(5 * 24 * 60 * MIN), is_online: true, last_online_at: iso(10 * MIN) }),
    carer({ id: "off-a", rating: 5.0, rating_count: 50, distance_km: 1, created_at: iso(2 * 24 * 60 * MIN), is_online: false }),
    carer({ id: "off-b", rating: 4.5, rating_count: 10, distance_km: 12, created_at: iso(20 * 24 * 60 * MIN), is_online: false }),
    carer({ id: "off-c", rating: 4.5, rating_count: 99, distance_km: 7, created_at: iso(40 * 24 * 60 * MIN), is_online: false }),
    carer({ id: "off-d", rating: null, distance_km: null, created_at: iso(3 * 24 * 60 * MIN), is_online: false }),
    carer({ id: "off-e", rating: 2.0, distance_km: 3, created_at: iso(100 * 24 * 60 * MIN), is_online: false }),
  ];

  function ids(sort: Parameters<typeof rankCarers>[1]["sort"]): string[] {
    return rankCarers(carers, { sort, now: NOW }).map((c) => c.id);
  }

  it("all three fresh-online carers occupy the top three slots", () => {
    for (const sort of ["best_match", "rating_desc", "nearest", "newest"] as const) {
      const top3 = new Set(ids(sort).slice(0, 3));
      assert.deepEqual(top3, new Set(["on-a", "on-b", "on-c"]), `sort=${sort}`);
    }
  });

  it("rating_desc orders the offline group by rating then count", () => {
    const offline = ids("rating_desc").slice(3);
    // off-a (5.0) > off-c (4.5, count 99) > off-b (4.5, count 10) > off-e (2.0) > off-d (null)
    assert.deepEqual(offline, ["off-a", "off-c", "off-b", "off-e", "off-d"]);
  });

  it("nearest orders the offline group by ascending distance, unknown last", () => {
    const offline = ids("nearest").slice(3);
    // off-a (1) < off-e (3) < off-c (7) < off-b (12) < off-d (null → last)
    assert.deepEqual(offline, ["off-a", "off-e", "off-c", "off-b", "off-d"]);
  });

  it("newest orders the offline group by most-recent created_at", () => {
    const offline = ids("newest").slice(3);
    // off-a (2d) > off-d (3d) > off-b (20d) > off-c (40d) > off-e (100d)
    assert.deepEqual(offline, ["off-a", "off-d", "off-b", "off-c", "off-e"]);
  });

  it("rating_desc within the online group orders by rating", () => {
    const online = ids("rating_desc").slice(0, 3);
    // on-b (4.9) > on-c (4.0) > on-a (3.0)
    assert.deepEqual(online, ["on-b", "on-c", "on-a"]);
  });

  it("nearest within the online group orders by distance", () => {
    const online = ids("nearest").slice(0, 3);
    // on-b (2) < on-c (5) < on-a (8)
    assert.deepEqual(online, ["on-b", "on-c", "on-a"]);
  });
});

/* ── rankCarers: determinism + match_score decoration ────────────── */
describe("rankCarers determinism", () => {
  it("equal keys fall back to id ascending", () => {
    const a = carer({ id: "zzz", rating: 4.0, is_online: false });
    const b = carer({ id: "aaa", rating: 4.0, is_online: false });
    const ranked = rankCarers([a, b], { sort: "rating_desc", now: NOW });
    assert.equal(ranked[0].id, "aaa");
    assert.equal(ranked[1].id, "zzz");
  });

  it("decorates every carer with a 0..100 match_score", () => {
    const ranked = rankCarers(
      [carer({ id: "x", rating: 5, distance_km: 0, is_online: true, last_online_at: iso(1 * MIN) })],
      { sort: "best_match", maxDistanceKm: 20, now: NOW },
    );
    assert.equal(typeof ranked[0].match_score, "number");
    assert.ok(ranked[0].match_score >= 0 && ranked[0].match_score <= 100);
  });

  it("returns a stable order regardless of input order", () => {
    const list: RerankCarer[] = [
      carer({ id: "c", rating: 3.0, is_online: false }),
      carer({ id: "a", rating: 5.0, is_online: false }),
      carer({ id: "b", rating: 4.0, is_online: false }),
    ];
    const first = rankCarers(list, { sort: "rating_desc", now: NOW }).map((c) => c.id);
    const reversed = rankCarers([...list].reverse(), { sort: "rating_desc", now: NOW }).map((c) => c.id);
    assert.deepEqual(first, reversed);
    assert.deepEqual(first, ["a", "b", "c"]);
  });
});
