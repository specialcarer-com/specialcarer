/**
 * Tests for the carer earnings dashboard handler (gap 36).
 *
 *   - totals: gross/fee/net summed from persisted booking columns
 *   - delta: % change of net vs the equivalent prior period; null when
 *     no prior data
 *   - period windowing: this_week / this_month / last_month / all_time
 *     (drives the period switcher's data set)
 *   - upcoming tile: confirmed-but-not-completed sum + count
 *   - pagination: page size + cursor
 *   - seekerLabel privacy formatting
 *
 * Drives the pure handler with a stub EarningsQueryClient (same pattern
 * as upcoming-handler.test.ts) so no Supabase/next machinery is pulled in.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleEarnings,
  computeDeltaPct,
  sumTotals,
  periodWindows,
  parsePeriod,
  parsePageSize,
  seekerLabel,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type CompletedBookingRow,
  type UpcomingBookingRow,
  type EarningsQueryClient,
  type ApiEarningsResponse,
} from "@/lib/earnings/dashboard-handler";

const CARER = "carer-1";
const NOW = new Date("2026-06-15T12:00:00.000Z"); // a Monday

function completed(p: {
  id: string;
  at: string;
  seeker_id?: string | null;
  status?: string;
  subtotal?: number;
  fee?: number;
  hours?: number;
  service?: string;
}): CompletedBookingRow {
  return {
    id: p.id,
    seeker_id: p.seeker_id === undefined ? "seeker-1" : p.seeker_id,
    status: p.status ?? "completed",
    shift_completed_at: p.at,
    service_type: p.service ?? "companionship",
    hours: p.hours ?? 2,
    starts_at: null,
    ends_at: null,
    subtotal_cents: p.subtotal ?? 4000,
    platform_fee_cents: p.fee ?? 1000,
    currency: "gbp",
  };
}

function makeClient(opts: {
  completed?: CompletedBookingRow[];
  upcoming?: UpcomingBookingRow[];
  profiles?: { id: string; full_name: string | null }[];
  completedError?: { message: string } | null;
  upcomingError?: { message: string } | null;
  profilesError?: { message: string } | null;
}): EarningsQueryClient {
  return {
    async completedBookings() {
      if (opts.completedError)
        return { data: null, error: opts.completedError };
      return { data: opts.completed ?? [], error: null };
    },
    async upcomingBookings() {
      if (opts.upcomingError) return { data: null, error: opts.upcomingError };
      return { data: opts.upcoming ?? [], error: null };
    },
    async seekerProfiles(ids) {
      if (opts.profilesError) return { data: null, error: opts.profilesError };
      const data = (opts.profiles ?? []).filter((p) => ids.includes(p.id));
      return { data, error: null };
    },
  };
}

describe("parsePeriod", () => {
  it("defaults to this_month for missing/garbage", () => {
    assert.equal(parsePeriod(null), "this_month");
    assert.equal(parsePeriod("nonsense"), "this_month");
  });
  it("accepts each valid period", () => {
    assert.equal(parsePeriod("this_week"), "this_week");
    assert.equal(parsePeriod("this_month"), "this_month");
    assert.equal(parsePeriod("last_month"), "last_month");
    assert.equal(parsePeriod("all_time"), "all_time");
  });
});

describe("parsePageSize", () => {
  it("defaults and caps", () => {
    assert.equal(parsePageSize(null), DEFAULT_PAGE_SIZE);
    assert.equal(parsePageSize("0"), DEFAULT_PAGE_SIZE);
    assert.equal(parsePageSize("-3"), DEFAULT_PAGE_SIZE);
    assert.equal(parsePageSize("999"), MAX_PAGE_SIZE);
    assert.equal(parsePageSize("5"), 5);
  });
});

describe("sumTotals", () => {
  it("sums gross/fee and derives net", () => {
    const t = sumTotals([
      completed({ id: "a", at: "2026-06-10T00:00:00Z", subtotal: 4000, fee: 1000 }),
      completed({ id: "b", at: "2026-06-11T00:00:00Z", subtotal: 6000, fee: 1500 }),
    ]);
    assert.deepEqual(t, { gross: 10000, fee: 2500, net: 7500 });
  });
  it("clamps negative/missing amounts to zero", () => {
    const t = sumTotals([
      { ...completed({ id: "x", at: "2026-06-10T00:00:00Z" }), subtotal_cents: null, platform_fee_cents: null },
    ]);
    assert.deepEqual(t, { gross: 0, fee: 0, net: 0 });
  });
});

describe("computeDeltaPct", () => {
  it("computes a positive delta", () => {
    assert.equal(computeDeltaPct(15000, 10000), 50);
  });
  it("computes a negative delta", () => {
    assert.equal(computeDeltaPct(7500, 10000), -25);
  });
  it("rounds to one decimal", () => {
    assert.equal(computeDeltaPct(10000, 3000), 233.3);
  });
  it("returns null when prior is null (all_time / no history)", () => {
    assert.equal(computeDeltaPct(10000, null), null);
  });
  it("returns null when prior earned nothing (avoid infinity)", () => {
    assert.equal(computeDeltaPct(10000, 0), null);
  });
});

describe("seekerLabel", () => {
  it("first name + last initial", () => {
    assert.equal(seekerLabel("Margaret Thatcher"), "Margaret T.");
  });
  it("single name passes through", () => {
    assert.equal(seekerLabel("Cher"), "Cher");
  });
  it("falls back to Client when empty/null", () => {
    assert.equal(seekerLabel(null), "Client");
    assert.equal(seekerLabel("   "), "Client");
  });
});

describe("periodWindows", () => {
  it("this_month spans the calendar month and prior is the month before", () => {
    const { current, prior } = periodWindows("this_month", NOW);
    assert.equal(current.start?.toISOString(), "2026-06-01T00:00:00.000Z");
    assert.equal(current.end.toISOString(), "2026-07-01T00:00:00.000Z");
    assert.equal(prior?.start?.toISOString(), "2026-05-01T00:00:00.000Z");
    assert.equal(prior?.end.toISOString(), "2026-06-01T00:00:00.000Z");
  });
  it("last_month current is May, prior is April", () => {
    const { current, prior } = periodWindows("last_month", NOW);
    assert.equal(current.start?.toISOString(), "2026-05-01T00:00:00.000Z");
    assert.equal(current.end.toISOString(), "2026-06-01T00:00:00.000Z");
    assert.equal(prior?.start?.toISOString(), "2026-04-01T00:00:00.000Z");
  });
  it("this_week is Monday-based and prior is the week before", () => {
    const { current, prior } = periodWindows("this_week", NOW);
    assert.equal(current.start?.toISOString(), "2026-06-15T00:00:00.000Z");
    assert.equal(current.end.toISOString(), "2026-06-22T00:00:00.000Z");
    assert.equal(prior?.start?.toISOString(), "2026-06-08T00:00:00.000Z");
  });
  it("all_time is unbounded with no prior period", () => {
    const { current, prior } = periodWindows("all_time", NOW);
    assert.equal(current.start, null);
    assert.equal(prior, null);
  });
});

describe("handleEarnings — totals + delta over period windows", () => {
  it("scopes totals to this_month and computes delta vs last month", async () => {
    const client = makeClient({
      completed: [
        // this month (June): net 4500 + 4500 = 9000
        completed({ id: "j1", at: "2026-06-02T10:00:00Z", subtotal: 4000, fee: 1000 }), // net 3000
        completed({ id: "j2", at: "2026-06-10T10:00:00Z", subtotal: 8000, fee: 2000 }), // net 6000
        // last month (May): net 4500
        completed({ id: "m1", at: "2026-05-20T10:00:00Z", subtotal: 6000, fee: 1500 }), // net 4500
      ],
      profiles: [{ id: "seeker-1", full_name: "Jane Doe" }],
    });
    const r = await handleEarnings({
      carerId: CARER,
      period: "this_month",
      pageSize: 20,
      client,
      now: NOW,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.body.totals, {
      gross: 12000,
      fee: 3000,
      net: 9000,
      currency: "GBP",
    });
    // net 9000 vs prior 4500 = +100%
    assert.equal(r.body.deltaPct, 100);
    assert.equal(r.body.bookings.length, 2);
    assert.equal(r.body.bookings[0].id, "j2"); // newest first
    assert.equal(r.body.bookings[0].seekerLabel, "Jane D.");
  });

  it("all_time totals include everything and delta is null", async () => {
    const client = makeClient({
      completed: [
        completed({ id: "a", at: "2026-06-02T10:00:00Z", subtotal: 4000, fee: 1000 }),
        completed({ id: "b", at: "2026-01-02T10:00:00Z", subtotal: 4000, fee: 1000 }),
      ],
    });
    const r = await handleEarnings({
      carerId: CARER,
      period: "all_time",
      pageSize: 20,
      client,
      now: NOW,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.body.totals.net, 6000);
    assert.equal(r.body.deltaPct, null);
  });

  it("delta is null when there were no prior-period earnings", async () => {
    const client = makeClient({
      completed: [
        completed({ id: "j1", at: "2026-06-02T10:00:00Z", subtotal: 4000, fee: 1000 }),
      ],
    });
    const r = await handleEarnings({
      carerId: CARER,
      period: "this_month",
      pageSize: 20,
      client,
      now: NOW,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.body.deltaPct, null);
  });
});

describe("handleEarnings — upcoming tile", () => {
  it("sums confirmed-but-not-completed bookings regardless of period", async () => {
    const client = makeClient({
      completed: [],
      upcoming: [
        { status: "accepted", subtotal_cents: 5000, platform_fee_cents: 1250 },
        { status: "in_progress", subtotal_cents: 3000, platform_fee_cents: 750 },
        { status: "paid", subtotal_cents: 2000, platform_fee_cents: 500 },
        // ignored — not an upcoming status
        { status: "pending", subtotal_cents: 9999, platform_fee_cents: 0 },
      ],
    });
    const r = await handleEarnings({
      carerId: CARER,
      period: "this_week",
      pageSize: 20,
      client,
      now: NOW,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.body.upcoming.count, 3);
    assert.equal(r.body.upcoming.gross, 10000);
    assert.equal(r.body.upcoming.net, 7500);
  });
});

describe("handleEarnings — pagination", () => {
  it("returns one page + hasMore + cursor, then the next page via cursor", async () => {
    const rows: CompletedBookingRow[] = [];
    // 3 bookings in June, descending timestamps.
    for (let i = 1; i <= 3; i++) {
      rows.push(
        completed({
          id: `b${i}`,
          at: `2026-06-0${i}T10:00:00Z`,
          subtotal: 4000,
          fee: 1000,
        }),
      );
    }
    const client = makeClient({ completed: rows });
    const first = await handleEarnings({
      carerId: CARER,
      period: "this_month",
      pageSize: 2,
      client,
      now: NOW,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.deepEqual(first.body.bookings.map((b) => b.id), ["b3", "b2"]);
    assert.equal(first.body.pagination.hasMore, true);
    assert.equal(first.body.pagination.nextCursor, "2026-06-02T10:00:00Z");

    const second = await handleEarnings({
      carerId: CARER,
      period: "this_month",
      pageSize: 2,
      cursor: first.body.pagination.nextCursor,
      client,
      now: NOW,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.deepEqual(second.body.bookings.map((b) => b.id), ["b1"]);
    assert.equal(second.body.pagination.hasMore, false);
    assert.equal(second.body.pagination.nextCursor, null);
  });
});

describe("handleEarnings — errors", () => {
  it("propagates a completed-bookings DB error as 500", async () => {
    const client = makeClient({ completedError: { message: "boom" } });
    const r = await handleEarnings({
      carerId: CARER,
      period: "this_month",
      pageSize: 20,
      client,
      now: NOW,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 500);
  });
});
