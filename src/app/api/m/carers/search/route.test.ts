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
