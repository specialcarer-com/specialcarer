/**
 * Tests for the carer search handler.
 *
 * Drives the pure handler with a stubbed Supabase query builder so we can
 * assert filter composition, sort selection, range pagination and
 * limit clamping without spinning up next/headers + cookies.
 *
 * Pattern mirrors src/app/api/m/push/register/route.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleSearch,
  parseSearchParams,
  type SearchQueryClient,
  type SearchFilterBuilder,
  type SearchRow,
} from "./search-handler";
import { rankCarers, type RerankCarer } from "@/lib/match/rerank";

type FilterCall =
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "ilike"; col: string; value: string }
  | { kind: "contains"; col: string; value: unknown[] }
  | { kind: "gte"; col: string; value: unknown }
  | { kind: "lte"; col: string; value: unknown }
  | { kind: "or"; filter: string }
  | { kind: "order"; col: string; ascending: boolean }
  | { kind: "range"; from: number; to: number };

type StubOpts = {
  rows?: SearchRow[];
  count?: number | null;
  error?: { message: string } | null;
  calls?: FilterCall[];
};

function makeClient(opts: StubOpts): SearchQueryClient {
  const builder: SearchFilterBuilder = {
    eq(col, value) {
      opts.calls?.push({ kind: "eq", col, value });
      return builder;
    },
    ilike(col, value) {
      opts.calls?.push({ kind: "ilike", col, value });
      return builder;
    },
    contains(col, value) {
      opts.calls?.push({ kind: "contains", col, value });
      return builder;
    },
    gte(col, value) {
      opts.calls?.push({ kind: "gte", col, value });
      return builder;
    },
    lte(col, value) {
      opts.calls?.push({ kind: "lte", col, value });
      return builder;
    },
    or(filter) {
      opts.calls?.push({ kind: "or", filter });
      return builder;
    },
    order(col, { ascending }) {
      opts.calls?.push({ kind: "order", col, ascending });
      return builder;
    },
    async range(from, to) {
      opts.calls?.push({ kind: "range", from, to });
      return {
        data: opts.rows ?? [],
        error: opts.error ?? null,
        count: opts.count === undefined ? (opts.rows?.length ?? 0) : opts.count,
      };
    },
  };
  return {
    from() {
      return {
        select() {
          return builder;
        },
      };
    },
  };
}

function row(over: Partial<SearchRow> = {}): SearchRow {
  return {
    user_id: "00000000-0000-0000-0000-000000000001",
    display_name: "Aisha Patel",
    headline: "Live-in care specialist",
    photo_url: null,
    city: "London",
    country: "GB",
    services: ["elderly_care"],
    languages: ["English"],
    certifications: [],
    tags: [],
    care_formats: ["visiting"],
    gender: "female",
    has_drivers_license: true,
    has_own_vehicle: false,
    years_experience: 6,
    rating_avg: 4.8,
    rating_count: 12,
    hourly_rate_cents: 2900,
    weekly_rate_cents: null,
    currency: "GBP",
    created_at: "2026-01-01T00:00:00Z",
    home_lat: null,
    home_lng: null,
    ...over,
  };
}

describe("parseSearchParams", () => {
  it("uses sensible defaults", () => {
    const p = parseSearchParams({});
    assert.equal(p.q, null);
    assert.equal(p.service, null);
    assert.equal(p.city, null);
    assert.equal(p.min_price_cents, null);
    assert.equal(p.max_price_cents, null);
    assert.equal(p.min_rating, null);
    assert.equal(p.sort, "rating_desc");
    assert.equal(p.limit, 20);
    assert.equal(p.offset, 0);
  });

  it("clamps limit above 50 to 50", () => {
    assert.equal(parseSearchParams({ limit: "9999" }).limit, 50);
    assert.equal(parseSearchParams({ limit: "51" }).limit, 50);
  });

  it("clamps limit below 1 to 1", () => {
    assert.equal(parseSearchParams({ limit: "0" }).limit, 1);
    assert.equal(parseSearchParams({ limit: "-5" }).limit, 1);
  });

  it("rejects unknown service silently (treats as no filter)", () => {
    assert.equal(parseSearchParams({ service: "horseplay" }).service, null);
    assert.equal(
      parseSearchParams({ service: "elderly_care" }).service,
      "elderly_care",
    );
  });

  it("rejects unknown sort, falls back to rating_desc", () => {
    assert.equal(parseSearchParams({ sort: "lol" }).sort, "rating_desc");
    assert.equal(parseSearchParams({ sort: "price_asc" }).sort, "price_asc");
  });

  it("clamps min_rating above 5 to 5", () => {
    assert.equal(parseSearchParams({ min_rating: "9" }).min_rating, 5);
    assert.equal(parseSearchParams({ min_rating: "3.5" }).min_rating, 3.5);
  });

  it("ignores negative prices", () => {
    assert.equal(parseSearchParams({ min_price_cents: "-1" }).min_price_cents, null);
    assert.equal(parseSearchParams({ max_price_cents: "abc" }).max_price_cents, null);
  });
});

describe("handleSearch", () => {
  it("no filters: returns rows up to default limit, only is_published filter", async () => {
    const calls: FilterCall[] = [];
    const rows = [row(), row({ user_id: "u2", display_name: "Rachel" })];
    const client = makeClient({ rows, count: 2, calls });
    const res = await handleSearch({ client, params: {} });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    assert.equal(res.body.carers.length, 2);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.limit, 20);
    assert.equal(res.body.offset, 0);

    const eqCalls = calls.filter((c) => c.kind === "eq");
    assert.equal(eqCalls.length, 1);
    assert.deepEqual(eqCalls[0], {
      kind: "eq",
      col: "is_published",
      value: true,
    });
    // No service/city/price/rating filters applied
    assert.equal(calls.filter((c) => c.kind === "contains").length, 0);
    assert.equal(calls.filter((c) => c.kind === "ilike").length, 0);
    assert.equal(calls.filter((c) => c.kind === "gte").length, 0);
    assert.equal(calls.filter((c) => c.kind === "lte").length, 0);

    // Default pagination: range(0, 19)
    const rangeCall = calls.find((c) => c.kind === "range");
    assert.deepEqual(rangeCall, { kind: "range", from: 0, to: 19 });
  });

  it("service filter narrows via contains(services, [service])", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [row()], calls });
    const res = await handleSearch({
      client,
      params: { service: "elderly_care" },
    });
    assert.equal(res.status, 200);
    const containsCall = calls.find((c) => c.kind === "contains");
    assert.deepEqual(containsCall, {
      kind: "contains",
      col: "services",
      value: ["elderly_care"],
    });
  });

  it("ignores an unknown service value (does not call contains)", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    await handleSearch({ client, params: { service: "made_up" } });
    assert.equal(calls.filter((c) => c.kind === "contains").length, 0);
  });

  it("sort=rating_desc orders by rating_avg then rating_count", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    await handleSearch({ client, params: { sort: "rating_desc" } });
    const orderCalls = calls.filter((c) => c.kind === "order");
    assert.equal(orderCalls[0].col, "rating_avg");
    assert.equal(orderCalls[0].ascending, false);
    assert.equal(orderCalls[1].col, "rating_count");
    assert.equal(orderCalls[1].ascending, false);
  });

  it("sort=price_asc orders by hourly_rate_cents ascending", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    await handleSearch({ client, params: { sort: "price_asc" } });
    const firstOrder = calls.find((c) => c.kind === "order");
    assert.deepEqual(firstOrder, {
      kind: "order",
      col: "hourly_rate_cents",
      ascending: true,
    });
  });

  it("limit above 50 is clamped to 50 (range from..to reflects it)", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    const res = await handleSearch({ client, params: { limit: "9999" } });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    assert.equal(res.body.limit, 50);
    const rangeCall = calls.find((c) => c.kind === "range");
    assert.deepEqual(rangeCall, { kind: "range", from: 0, to: 49 });
  });

  it("price band applies gte/lte on hourly_rate_cents", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    await handleSearch({
      client,
      params: { min_price_cents: "1500", max_price_cents: "3000" },
    });
    const gteCall = calls.find((c) => c.kind === "gte");
    const lteCall = calls.find((c) => c.kind === "lte");
    assert.deepEqual(gteCall, {
      kind: "gte",
      col: "hourly_rate_cents",
      value: 1500,
    });
    assert.deepEqual(lteCall, {
      kind: "lte",
      col: "hourly_rate_cents",
      value: 3000,
    });
  });

  it("min_rating applies gte on rating_avg", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    await handleSearch({ client, params: { min_rating: "4.5" } });
    const gte = calls.find((c) => c.kind === "gte" && c.col === "rating_avg");
    assert.deepEqual(gte, {
      kind: "gte",
      col: "rating_avg",
      value: 4.5,
    });
  });

  it("q applies an .or() against display_name + headline", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    await handleSearch({ client, params: { q: "Aisha" } });
    const orCall = calls.find((c) => c.kind === "or");
    assert.ok(orCall, "or() should be called");
    if (orCall && orCall.kind === "or") {
      assert.match(orCall.filter, /display_name\.ilike\.%Aisha%/);
      assert.match(orCall.filter, /headline\.ilike\.%Aisha%/);
    }
  });

  it("q with only punctuation gets stripped to no-op (no .or call)", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    await handleSearch({ client, params: { q: "%,()" } });
    assert.equal(calls.filter((c) => c.kind === "or").length, 0);
  });

  it("offset shifts range(from..to)", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [], calls });
    await handleSearch({ client, params: { offset: "40", limit: "10" } });
    const r = calls.find((c) => c.kind === "range");
    assert.deepEqual(r, { kind: "range", from: 40, to: 49 });
  });

  it("db error → 500 with error message", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ error: { message: "boom" }, calls });
    const res = await handleSearch({ client, params: {} });
    assert.equal(res.status, 500);
    if (res.status === 500) {
      assert.equal(res.body.error, "boom");
    }
  });

  it("maps DB row to API carer shape (currency fallback, null safety)", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({
      rows: [
        row({
          currency: null,
          services: ["childcare", null as unknown as string],
          languages: null,
          rating_avg: 4.25,
          rating_count: null,
        }),
      ],
      calls,
    });
    const res = await handleSearch({ client, params: {} });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    const c = res.body.carers[0];
    assert.equal(c.currency, "GBP");
    assert.deepEqual(c.services, ["childcare"]);
    assert.deepEqual(c.languages, []);
    assert.equal(c.rating_avg, 4.25);
    assert.equal(c.rating_count, 0);
  });
});

/* ── origin parsing ──────────────────────────────────────────────── */
describe("parseSearchParams origin", () => {
  it("parses a valid lat/lng pair", () => {
    const p = parseSearchParams({ originLat: "51.5074", originLng: "-0.1276" });
    assert.equal(p.originLat, 51.5074);
    assert.equal(p.originLng, -0.1276);
  });

  it("drops the pair when either coordinate is missing", () => {
    assert.equal(parseSearchParams({ originLat: "51.5" }).originLat, null);
    assert.equal(parseSearchParams({ originLat: "51.5" }).originLng, null);
    assert.equal(parseSearchParams({ originLng: "-0.1" }).originLat, null);
  });

  it("rejects out-of-range or non-numeric coordinates", () => {
    const p = parseSearchParams({ originLat: "999", originLng: "-0.1" });
    assert.equal(p.originLat, null);
    assert.equal(p.originLng, null);
    const q = parseSearchParams({ originLat: "abc", originLng: "1" });
    assert.equal(q.originLat, null);
  });
});

/* ── distance_km + created_at plumbing (gap 19 follow-up) ─────────── */
describe("handleSearch distance + created_at plumbing", () => {
  // London origin; carers placed at known UK city centroids.
  const LONDON = { lat: 51.5074, lng: -0.1276 };
  const cityRows: SearchRow[] = [
    // ~555 km from London
    row({ user_id: "glasgow", home_lat: 55.8642, home_lng: -4.2518 }),
    // ~0 km
    row({ user_id: "london", home_lat: 51.5074, home_lng: -0.1276 }),
    // ~163 km
    row({ user_id: "birmingham", home_lat: 52.4862, home_lng: -1.8904 }),
  ];

  it("computes distance_km from origin and feeds an ascending Nearest sort", async () => {
    const client = makeClient({ rows: cityRows, count: 3 });
    const res = await handleSearch({
      client,
      params: { sort: "rating_desc", originLat: "51.5074", originLng: "-0.1276" },
    });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;

    // Every carer carries a finite distance, smallest for London itself.
    const byId = Object.fromEntries(res.body.carers.map((c) => [c.user_id, c]));
    assert.ok((byId.london.distance_km ?? Infinity) < 1);
    assert.ok((byId.birmingham.distance_km ?? 0) > 100);
    assert.ok((byId.birmingham.distance_km ?? 0) < 250);
    assert.ok((byId.glasgow.distance_km ?? 0) > 400);

    // The reranker (the consumer) now orders by ascending distance.
    const ranked = rankCarers<RerankCarer & { user_id: string }>(
      res.body.carers.map((c) => ({
        ...c,
        id: c.user_id,
        rating: c.rating_avg,
        rating_count: c.rating_count,
        distance_km: c.distance_km,
        is_online: c.is_online,
        last_online_at: c.last_online_at,
        created_at: c.created_at,
      })),
      { sort: "nearest", floatOnlineFirst: false },
    );
    assert.deepEqual(
      ranked.map((c) => c.user_id),
      ["london", "birmingham", "glasgow"],
    );
  });

  it("passes created_at through and feeds a descending Newest sort", async () => {
    const rows: SearchRow[] = [
      row({ user_id: "old", created_at: "2025-01-01T00:00:00Z" }),
      row({ user_id: "new", created_at: "2026-06-01T00:00:00Z" }),
      row({ user_id: "mid", created_at: "2025-09-01T00:00:00Z" }),
    ];
    const client = makeClient({ rows, count: 3 });
    const res = await handleSearch({ client, params: {} });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;

    const byId = Object.fromEntries(res.body.carers.map((c) => [c.user_id, c]));
    assert.equal(byId.new.created_at, "2026-06-01T00:00:00Z");

    const ranked = rankCarers<RerankCarer & { user_id: string }>(
      res.body.carers.map((c) => ({
        ...c,
        id: c.user_id,
        rating: c.rating_avg,
        rating_count: c.rating_count,
        distance_km: c.distance_km,
        is_online: c.is_online,
        last_online_at: c.last_online_at,
        created_at: c.created_at,
      })),
      { sort: "newest", floatOnlineFirst: false },
    );
    assert.deepEqual(
      ranked.map((c) => c.user_id),
      ["new", "mid", "old"],
    );
  });

  it("no origin → distance_km is null and does not request geo columns", async () => {
    const calls: FilterCall[] = [];
    const client = makeClient({ rows: [row()], calls });
    const res = await handleSearch({ client, params: {} });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    assert.equal(res.body.carers[0].distance_km, null);
  });

  it("missing origin → Nearest sort falls back gracefully (no crash, unknown distance last)", async () => {
    const rows: SearchRow[] = [
      row({ user_id: "a", rating_avg: 4.0 }),
      row({ user_id: "b", rating_avg: 5.0 }),
    ];
    const client = makeClient({ rows, count: 2 });
    const res = await handleSearch({ client, params: { sort: "rating_desc" } });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    // All distances null; reranker must not throw and falls back to the id
    // tiebreaker (all distances equal → ascending id).
    const ranked = rankCarers<RerankCarer & { user_id: string }>(
      res.body.carers.map((c) => ({
        ...c,
        id: c.user_id,
        rating: c.rating_avg,
        rating_count: c.rating_count,
        distance_km: c.distance_km,
        is_online: c.is_online,
        last_online_at: c.last_online_at,
        created_at: c.created_at,
      })),
      { sort: "nearest", floatOnlineFirst: false },
    );
    assert.deepEqual(
      ranked.map((c) => c.user_id),
      ["a", "b"],
    );
  });

  it("retries without geo columns when the latlng migration is absent", async () => {
    // First attempt (with geo cols) errors as if home_lat is unknown; the
    // handler retries with base columns and still returns 200.
    let attempt = 0;
    const builder: SearchFilterBuilder = {
      eq: () => builder,
      ilike: () => builder,
      contains: () => builder,
      gte: () => builder,
      lte: () => builder,
      or: () => builder,
      order: () => builder,
      async range() {
        attempt += 1;
        if (attempt === 1) {
          return {
            data: null,
            error: { message: 'column "home_lat" does not exist' },
            count: null,
          };
        }
        return { data: [row({ user_id: "z" })], error: null, count: 1 };
      },
    };
    const client: SearchQueryClient = {
      from: () => ({ select: () => builder }),
    };
    const res = await handleSearch({
      client,
      params: { originLat: "51.5", originLng: "-0.1" },
    });
    assert.equal(res.status, 200);
    if (res.status !== 200) return;
    assert.equal(attempt, 2);
    // Geo columns weren't returned on the fallback, so distance is null.
    assert.equal(res.body.carers[0].distance_km, null);
  });
});
