/**
 * Unit tests for the Mapbox Matrix client (E3).
 *
 * Cover the four hot paths:
 *   • stub mode returns deterministic minutes
 *   • cache hit returns the cached minutes without touching Mapbox
 *   • cache miss + real fetch writes back to cache and returns the
 *     Mapbox-derived minutes
 *   • daily cap: once the counter exceeds the cap the client falls
 *     back to the stub value and never calls Mapbox
 *
 * The Supabase admin client is faked with an in-memory shim (`makeFake`)
 * so we don't need a live DB for tests — same pattern the other
 * `src/lib/match/**` tests use.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  encodeGeohash,
  haversineKm,
  getCommuteMinutes,
} from "./matrix";

// ─── Fake admin client ─────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeFake(initial?: {
  commuteCache?: Array<Row>;
  matrixCounter?: Array<Row>;
}) {
  const state = {
    caregiver_commute_cache: [...(initial?.commuteCache ?? [])] as Row[],
    mapbox_matrix_daily_counter: [...(initial?.matrixCounter ?? [])] as Row[],
  };

  function from(table: keyof typeof state) {
    // Minimal query-builder shim covering the calls matrix.ts actually
    // makes: select().eq()...maybeSingle(), upsert(row).
    const builder: {
      _filters: Record<string, unknown>;
      _table: keyof typeof state;
      select: (_cols?: string) => typeof builder;
      eq: (col: string, val: unknown) => typeof builder;
      maybeSingle: () => Promise<{ data: Row | null; error: null }>;
      upsert: (
        row: Row | Row[],
        opts?: { onConflict?: string },
      ) => Promise<{ data: null; error: null }>;
    } = {
      _filters: {},
      _table: table,
      select() {
        return builder;
      },
      eq(col, val) {
        builder._filters[col] = val;
        return builder;
      },
      async maybeSingle() {
        const rows = state[builder._table];
        const hit = rows.find((r) =>
          Object.entries(builder._filters).every(([k, v]) => r[k] === v),
        );
        return { data: (hit as Row) ?? null, error: null };
      },
      async upsert(row, opts) {
        const rows = state[builder._table];
        const inputRows = Array.isArray(row) ? row : [row];
        const conflictKeys = (opts?.onConflict ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const r of inputRows) {
          if (conflictKeys.length) {
            const idx = rows.findIndex((existing) =>
              conflictKeys.every((k) => existing[k] === r[k]),
            );
            if (idx >= 0) rows[idx] = { ...rows[idx], ...r };
            else rows.push({ ...r });
          } else {
            rows.push({ ...r });
          }
        }
        return { data: null, error: null };
      },
    };
    return builder;
  }

  return {
    admin: { from } as unknown as ReturnType<
      // The real signature isn't needed here, we're only providing what
      // matrix.ts uses. Cast keeps TS happy for the injection.
      typeof import("@/lib/supabase/admin").createAdminClient
    >,
    state,
  };
}

const CARER = "00000000-0000-0000-0000-000000000001";
const ORIGIN = { lat: 51.5074, lng: -0.1276 }; // London
const DEST = { lat: 51.5307, lng: -0.1234 }; // ~2.6km N

// ─── Pure helpers ──────────────────────────────────────────────────────

describe("encodeGeohash", () => {
  it("returns a 6-character geohash by default", () => {
    const g = encodeGeohash(ORIGIN.lat, ORIGIN.lng);
    assert.equal(g.length, 6);
    assert.match(g, /^[0-9b-hjkmnp-z]{6}$/);
  });

  it("is deterministic and cell-based (same-neighbourhood coords collide)", () => {
    const g1 = encodeGeohash(51.5074, -0.1276);
    const g2 = encodeGeohash(51.5075, -0.1275); // tiny nudge
    assert.equal(g1, g2);
  });

  it("differs when coords move to a different cell", () => {
    const g1 = encodeGeohash(51.5, -0.1);
    const g2 = encodeGeohash(53.4, -2.2); // Manchester
    assert.notEqual(g1, g2);
  });
});

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    assert.equal(haversineKm(ORIGIN, ORIGIN), 0);
  });

  it("returns a plausible distance for London-Manchester (~260km)", () => {
    const d = haversineKm(
      { lat: 51.5074, lng: -0.1276 },
      { lat: 53.4808, lng: -2.2426 },
    );
    assert.ok(d > 240 && d < 280, `got ${d}`);
  });
});

// ─── Stub-mode path ────────────────────────────────────────────────────

describe("getCommuteMinutes — stub mode", () => {
  it("returns distance_km * 3 without touching the network", async () => {
    process.env.MAPBOX_MATRIX_STUB_MODE = "true";
    process.env.MAPBOX_SECRET_TOKEN = "";
    const { admin } = makeFake();
    let fetchCalls = 0;
    const fetchFn = (async () => {
      fetchCalls += 1;
      return new Response("nope", { status: 500 });
    }) as unknown as typeof fetch;

    const m = await getCommuteMinutes({
      carerId: CARER,
      origin: ORIGIN,
      destination: DEST,
      distanceKm: 4,
      admin,
      fetchFn,
    });
    assert.equal(m, 12);
    assert.equal(fetchCalls, 0);
    delete process.env.MAPBOX_MATRIX_STUB_MODE;
  });

  it("writes the stub result into the cache so a follow-up read is a hit", async () => {
    process.env.MAPBOX_MATRIX_STUB_MODE = "true";
    const { admin, state } = makeFake();
    await getCommuteMinutes({
      carerId: CARER,
      origin: ORIGIN,
      destination: DEST,
      distanceKm: 5,
      admin,
    });
    assert.equal(state.caregiver_commute_cache.length, 1);
    assert.equal(state.caregiver_commute_cache[0].carer_id, CARER);
    assert.equal(state.caregiver_commute_cache[0].minutes, 15);
    delete process.env.MAPBOX_MATRIX_STUB_MODE;
  });
});

// ─── Cache-hit path ────────────────────────────────────────────────────

describe("getCommuteMinutes — cache hit", () => {
  it("returns the cached value without calling Mapbox", async () => {
    process.env.MAPBOX_MATRIX_STUB_MODE = "false";
    process.env.MAPBOX_SECRET_TOKEN = "sk.real";
    const now = Date.parse("2026-09-14T10:00:00Z");
    const geohash = encodeGeohash(ORIGIN.lat, ORIGIN.lng, 6);
    const { admin } = makeFake({
      commuteCache: [
        {
          carer_id: CARER,
          origin_geohash6: geohash,
          minutes: 7.5,
          computed_at: new Date(now - 60_000).toISOString(),
        },
      ],
    });
    let fetchCalls = 0;
    const fetchFn = (async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ durations: [[600]] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const m = await getCommuteMinutes({
      carerId: CARER,
      origin: ORIGIN,
      destination: DEST,
      distanceKm: 3,
      admin,
      fetchFn,
      now,
    });
    assert.equal(m, 7.5);
    assert.equal(fetchCalls, 0);
    delete process.env.MAPBOX_SECRET_TOKEN;
  });

  it("ignores a cache entry older than the 30-day TTL", async () => {
    process.env.MAPBOX_MATRIX_STUB_MODE = "true"; // avoid live fetch
    const now = Date.parse("2026-09-14T10:00:00Z");
    const geohash = encodeGeohash(ORIGIN.lat, ORIGIN.lng, 6);
    const stale = now - 40 * 24 * 60 * 60 * 1000;
    const { admin } = makeFake({
      commuteCache: [
        {
          carer_id: CARER,
          origin_geohash6: geohash,
          minutes: 99,
          computed_at: new Date(stale).toISOString(),
        },
      ],
    });

    const m = await getCommuteMinutes({
      carerId: CARER,
      origin: ORIGIN,
      destination: DEST,
      distanceKm: 4,
      admin,
      now,
    });
    // Stub value, not the stale 99.
    assert.equal(m, 12);
    delete process.env.MAPBOX_MATRIX_STUB_MODE;
  });
});

// ─── Daily cap path ────────────────────────────────────────────────────

describe("getCommuteMinutes — daily cap", () => {
  it("falls back to stub once the counter meets the cap", async () => {
    process.env.MAPBOX_MATRIX_STUB_MODE = "false";
    process.env.MAPBOX_SECRET_TOKEN = "sk.real";
    process.env.MAPBOX_MATRIX_DAILY_CAP = "2";
    const now = Date.parse("2026-09-14T10:00:00Z");
    const dayIso = "2026-09-14";
    // Pre-seed the counter at 2 so the very next call would push to 3 (> cap).
    const { admin } = makeFake({
      matrixCounter: [{ day: dayIso, calls: 2 }],
    });
    let fetchCalls = 0;
    const fetchFn = (async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ durations: [[999]] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const originalWarn = console.warn;
    let warned = 0;
    console.warn = () => {
      warned += 1;
    };

    try {
      const m = await getCommuteMinutes({
        carerId: CARER,
        origin: ORIGIN,
        destination: DEST,
        distanceKm: 6,
        admin,
        fetchFn,
        now,
      });
      assert.equal(m, 18); // stub
      assert.equal(fetchCalls, 0); // never called Mapbox
      assert.ok(warned >= 1, "cap-exceeded warning should fire");
    } finally {
      console.warn = originalWarn;
      delete process.env.MAPBOX_MATRIX_DAILY_CAP;
      delete process.env.MAPBOX_SECRET_TOKEN;
    }
  });

  it("hits Mapbox when under the cap", async () => {
    process.env.MAPBOX_MATRIX_STUB_MODE = "false";
    process.env.MAPBOX_SECRET_TOKEN = "sk.real";
    process.env.MAPBOX_MATRIX_DAILY_CAP = "100";
    const now = Date.parse("2026-09-14T10:00:00Z");
    const { admin, state } = makeFake();
    let fetchCalls = 0;
    const fetchFn = (async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ durations: [[720]] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const m = await getCommuteMinutes({
      carerId: CARER,
      origin: ORIGIN,
      destination: DEST,
      distanceKm: 6,
      admin,
      fetchFn,
      now,
    });
    assert.equal(m, 12); // 720s / 60 = 12min
    assert.equal(fetchCalls, 1);
    // Counter row created and incremented.
    assert.equal(state.mapbox_matrix_daily_counter.length, 1);
    assert.equal(state.mapbox_matrix_daily_counter[0].calls, 1);
    delete process.env.MAPBOX_MATRIX_DAILY_CAP;
    delete process.env.MAPBOX_SECRET_TOKEN;
  });

  it("falls back to stub when Mapbox returns non-2xx", async () => {
    process.env.MAPBOX_MATRIX_STUB_MODE = "false";
    process.env.MAPBOX_SECRET_TOKEN = "sk.real";
    process.env.MAPBOX_MATRIX_DAILY_CAP = "100";
    const { admin } = makeFake();
    const fetchFn = (async () =>
      new Response("boom", { status: 500 })) as unknown as typeof fetch;

    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const m = await getCommuteMinutes({
        carerId: CARER,
        origin: ORIGIN,
        destination: DEST,
        distanceKm: 5,
        admin,
        fetchFn,
      });
      assert.equal(m, 15); // stub
    } finally {
      console.warn = originalWarn;
      delete process.env.MAPBOX_MATRIX_DAILY_CAP;
      delete process.env.MAPBOX_SECRET_TOKEN;
    }
  });
});
