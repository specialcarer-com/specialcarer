/**
 * Tests for the KPI rollup derivation.
 *
 * B2 (2026-09-11): removed synthetic fallback — unwired metrics report
 * state='error'.
 * E5 (2026-09-15): wired `repeat_rate`, `fill_rate`, `avg_review_rating`
 * (renamed from `nps`). `time_to_match_min` still unwired but with
 * errorCode='no_data_yet' (the code path is written, waiting on data).
 *
 * Behaviour under test:
 *   - bookings + gmv derive from the injected bookings-for-day rows
 *   - repeat_rate, fill_rate, avg_review_rating derive from range rows
 *     with windowing centralised in derive.ts
 *   - empty window returns state='error' + errorCode='no_data_in_window'
 *   - DB read failures propagate as state='error' with a short error code
 *   - avg_review_rating excludes hidden reviews and malformed ratings
 *   - fabricated numeric values never appear on error branches
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveKpisForDay,
  deriveRepeatRate,
  deriveFillRate,
  deriveAvgReviewRating,
  daysBefore,
  REPEAT_RATE_WINDOW_DAYS,
  FILL_RATE_WINDOW_DAYS,
  AVG_REVIEW_RATING_WINDOW_DAYS,
  type BookingRow,
  type BookingRangeRow,
  type ReviewRow,
  type DeriveClient,
} from "./derive";
import { KPI_METRICS, type KpiMetric } from "@/lib/admin-ops/types";

type DayFetch = { rows: BookingRow[] | null; error?: string | null };
type RangeBookingFetch = {
  rows: BookingRangeRow[] | null;
  error?: string | null;
};
type RangeReviewFetch = { rows: ReviewRow[] | null; error?: string | null };

function stubClient(opts?: {
  day?: DayFetch;
  bookingsRange?: RangeBookingFetch | ((from: string, to: string) => RangeBookingFetch);
  reviewsRange?: RangeReviewFetch;
  bookingsRangeCalls?: Array<{ from: string; to: string }>;
}): DeriveClient {
  return {
    async fetchBookingsForDay() {
      return opts?.day ?? { rows: [], error: null };
    },
    async fetchBookingsForRange(from, to) {
      if (opts?.bookingsRangeCalls) {
        opts.bookingsRangeCalls.push({ from, to });
      }
      const r = opts?.bookingsRange;
      if (typeof r === "function") return r(from, to);
      return r ?? { rows: [], error: null };
    },
    async fetchReviewsForRange() {
      return opts?.reviewsRange ?? { rows: [], error: null };
    },
  };
}

function byMetric(
  arr: Awaited<ReturnType<typeof deriveKpisForDay>>,
): Record<KpiMetric, (typeof arr)[number]> {
  const out = {} as Record<KpiMetric, (typeof arr)[number]>;
  for (const k of arr) out[k.metric] = k;
  return out;
}

// ── shape ──────────────────────────────────────────────────────────

describe("deriveKpisForDay — output shape", () => {
  it("always returns exactly one entry per KPI_METRICS in fixed order", async () => {
    const out = await deriveKpisForDay("2026-09-15", stubClient());
    assert.equal(out.length, KPI_METRICS.length);
    assert.deepEqual(
      out.map((k) => k.metric),
      [...KPI_METRICS],
    );
  });

  it("includes avg_review_rating (renamed from nps) and never emits nps", async () => {
    const out = await deriveKpisForDay("2026-09-15", stubClient());
    const metrics = out.map((k) => k.metric);
    assert.ok(metrics.includes("avg_review_rating"));
    assert.equal(
      metrics.includes("nps" as KpiMetric),
      false,
      "E5 rename: `nps` must not appear in derivation output",
    );
  });
});

// ── bookings / gmv (existing behaviour) ────────────────────────────

describe("deriveKpisForDay — bookings/gmv from real rows", () => {
  it("counts bookings and sums paidish GMV in pounds", async () => {
    const rows: BookingRow[] = [
      { status: "paid", total_cents: 1000 },
      { status: "in_progress", total_cents: 2500 },
      { status: "completed", total_cents: 4500 },
      { status: "paid_out", total_cents: 2000 },
      { status: "cancelled", total_cents: 5000 }, // excluded
      { status: "requested", total_cents: 3000 }, // excluded
    ];
    const map = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({ day: { rows, error: null } }),
      ),
    );
    assert.deepEqual(map.bookings, {
      metric: "bookings",
      state: "ok",
      value: 6,
    });
    assert.deepEqual(map.gmv, { metric: "gmv", state: "ok", value: 100 });
  });

  it("treats non-numeric total_cents as zero and unknown status as excluded", async () => {
    const rows: BookingRow[] = [
      { status: "paid", total_cents: 500 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { status: "paid", total_cents: "oops" as any },
      { status: undefined, total_cents: 999 },
    ];
    const map = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({ day: { rows, error: null } }),
      ),
    );
    assert.equal(map.bookings.value, 3);
    assert.deepEqual(map.gmv, { metric: "gmv", state: "ok", value: 5 });
  });

  it("returns bookings.value = 0 when the read succeeds with no rows", async () => {
    const map = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({ day: { rows: [], error: null } }),
      ),
    );
    assert.deepEqual(map.bookings, {
      metric: "bookings",
      state: "ok",
      value: 0,
    });
    assert.deepEqual(map.gmv, { metric: "gmv", state: "ok", value: 0 });
  });
});

// ── error visibility ───────────────────────────────────────────────

describe("deriveKpisForDay — errors are visible, not fabricated", () => {
  it("returns state='error' with schema_not_ready when the day read errors on a missing table", async () => {
    const map = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({
          day: { rows: null, error: 'relation "public.bookings" does not exist' },
        }),
      ),
    );
    assert.equal(map.bookings.state, "error");
    assert.equal(map.bookings.errorCode, "schema_not_ready");
    assert.equal(map.gmv.errorCode, "schema_not_ready");
  });

  it("maps permission-denied and timeout to short error codes", async () => {
    const denied = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({
          day: { rows: null, error: "permission denied for table bookings" },
        }),
      ),
    );
    assert.equal(denied.bookings.errorCode, "permission_denied");
    const timeout = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({
          day: { rows: null, error: "canceling statement due to statement timeout" },
        }),
      ),
    );
    assert.equal(timeout.bookings.errorCode, "timeout");
  });

  it("falls back to db_error for anything else", async () => {
    const map = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({ day: { rows: null, error: "connection reset by peer" } }),
      ),
    );
    assert.equal(map.bookings.errorCode, "db_error");
  });

  it("treats a null rows response with no explicit error as an error, not zero bookings", async () => {
    const map = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({ day: { rows: null } }),
      ),
    );
    assert.equal(map.bookings.state, "error");
    assert.equal(map.bookings.errorCode, "bookings_read_returned_null");
  });

  it("captures thrown fetch errors as state='error'", async () => {
    const throwing: DeriveClient = {
      async fetchBookingsForDay() {
        throw new Error("network offline");
      },
      async fetchBookingsForRange() {
        return { rows: [], error: null };
      },
      async fetchReviewsForRange() {
        return { rows: [], error: null };
      },
    };
    const map = byMetric(await deriveKpisForDay("2026-09-15", throwing));
    assert.equal(map.bookings.state, "error");
    assert.equal(map.gmv.state, "error");
  });
});

// ── time_to_match_min (still unwired, error code changed) ──────────

describe("deriveKpisForDay — time_to_match_min", () => {
  it("stays state='error' with errorCode='no_data_yet' (E5 rename)", async () => {
    const map = byMetric(await deriveKpisForDay("2026-09-15", stubClient()));
    assert.equal(map.time_to_match_min.state, "error");
    assert.equal(map.time_to_match_min.value, null);
    assert.equal(map.time_to_match_min.errorCode, "no_data_yet");
  });

  it("no other metric still uses the old 'no_derivation_wired' code", async () => {
    const rows: BookingRangeRow[] = [
      { seeker_id: "s1", caregiver_id: "c1", created_at: "2026-09-15T10:00:00Z" },
    ];
    const reviews: ReviewRow[] = [
      { rating: 4, hidden_at: null, created_at: "2026-09-15T10:00:00Z" },
    ];
    const map = byMetric(
      await deriveKpisForDay(
        "2026-09-15",
        stubClient({
          bookingsRange: { rows, error: null },
          reviewsRange: { rows: reviews, error: null },
        }),
      ),
    );
    for (const m of KPI_METRICS) {
      if (m === "time_to_match_min") continue;
      assert.notEqual(
        map[m].errorCode,
        "no_derivation_wired",
        `${m} must not report 'no_derivation_wired' after E5 wiring`,
      );
    }
  });
});

// ── repeat_rate ───────────────────────────────────────────────────

describe("deriveRepeatRate", () => {
  it("empty window → error/no_data_in_window", () => {
    const r = deriveRepeatRate({ rows: [], error: null });
    assert.equal(r.state, "error");
    assert.equal(r.errorCode, "no_data_in_window");
    assert.equal(r.value, null);
  });

  it("one seeker with one booking → 0/1 = 0", () => {
    const rows: BookingRangeRow[] = [
      { seeker_id: "s1", created_at: "2026-09-14T10:00:00Z" },
    ];
    const r = deriveRepeatRate({ rows, error: null });
    assert.deepEqual(r, { metric: "repeat_rate", state: "ok", value: 0 });
  });

  it("one seeker with three bookings → 1/1 = 1", () => {
    const rows: BookingRangeRow[] = [
      { seeker_id: "s1" },
      { seeker_id: "s1" },
      { seeker_id: "s1" },
    ];
    const r = deriveRepeatRate({ rows, error: null });
    assert.deepEqual(r, { metric: "repeat_rate", state: "ok", value: 1 });
  });

  it("mixed: 3 seekers, 1 repeat → 1/3", () => {
    const rows: BookingRangeRow[] = [
      { seeker_id: "s1" },
      { seeker_id: "s2" },
      { seeker_id: "s2" },
      { seeker_id: "s3" },
    ];
    const r = deriveRepeatRate({ rows, error: null });
    assert.equal(r.state, "ok");
    assert.ok(r.value != null && Math.abs(r.value - 1 / 3) < 1e-9);
  });

  it("rows without seeker_id are ignored — all-null → no_data_in_window", () => {
    const rows: BookingRangeRow[] = [
      { seeker_id: null },
      { seeker_id: undefined },
    ];
    const r = deriveRepeatRate({ rows, error: null });
    assert.equal(r.errorCode, "no_data_in_window");
  });

  it("propagates error state with short code", () => {
    const r = deriveRepeatRate({
      rows: null,
      error: "permission denied for table bookings",
    });
    assert.equal(r.state, "error");
    assert.equal(r.errorCode, "permission_denied");
  });

  it("null rows without error → bookings_read_returned_null", () => {
    const r = deriveRepeatRate({ rows: null });
    assert.equal(r.state, "error");
    assert.equal(r.errorCode, "bookings_read_returned_null");
  });
});

// ── fill_rate ─────────────────────────────────────────────────────

describe("deriveFillRate", () => {
  it("empty window → error/no_data_in_window", () => {
    const r = deriveFillRate({ rows: [], error: null });
    assert.equal(r.errorCode, "no_data_in_window");
    assert.equal(r.value, null);
  });

  it("all filled → 1.0", () => {
    const rows: BookingRangeRow[] = [
      { caregiver_id: "c1" },
      { caregiver_id: "c2" },
    ];
    const r = deriveFillRate({ rows, error: null });
    assert.deepEqual(r, { metric: "fill_rate", state: "ok", value: 1 });
  });

  it("none filled → 0.0", () => {
    const rows: BookingRangeRow[] = [
      { caregiver_id: null },
      { caregiver_id: undefined },
      { caregiver_id: "" }, // empty string is not a real id
    ];
    const r = deriveFillRate({ rows, error: null });
    assert.deepEqual(r, { metric: "fill_rate", state: "ok", value: 0 });
  });

  it("mixed 2/4 → 0.5", () => {
    const rows: BookingRangeRow[] = [
      { caregiver_id: "c1" },
      { caregiver_id: null },
      { caregiver_id: "c2" },
      { caregiver_id: null },
    ];
    const r = deriveFillRate({ rows, error: null });
    assert.deepEqual(r, { metric: "fill_rate", state: "ok", value: 0.5 });
  });

  it("propagates error with schema_not_ready when table missing", () => {
    const r = deriveFillRate({
      rows: null,
      error: 'relation "public.bookings" does not exist',
    });
    assert.equal(r.errorCode, "schema_not_ready");
  });
});

// ── avg_review_rating ─────────────────────────────────────────────

describe("deriveAvgReviewRating", () => {
  it("empty window → error/no_data_in_window", () => {
    const r = deriveAvgReviewRating({ rows: [], error: null });
    assert.equal(r.errorCode, "no_data_in_window");
    assert.equal(r.value, null);
  });

  it("averages ratings, ignoring hidden rows", () => {
    const rows: ReviewRow[] = [
      { rating: 5, hidden_at: null, created_at: "2026-09-14T10:00:00Z" },
      { rating: 3, hidden_at: null, created_at: "2026-09-14T10:00:00Z" },
      { rating: 1, hidden_at: "2026-09-14T11:00:00Z", created_at: "2026-09-14T10:00:00Z" },
    ];
    const r = deriveAvgReviewRating({ rows, error: null });
    assert.equal(r.state, "ok");
    assert.equal(r.value, 4); // (5+3)/2
  });

  it("all hidden → no_data_in_window (not a fake zero)", () => {
    const rows: ReviewRow[] = [
      { rating: 5, hidden_at: "2026-09-14T11:00:00Z" },
      { rating: 4, hidden_at: "2026-09-14T11:00:00Z" },
    ];
    const r = deriveAvgReviewRating({ rows, error: null });
    assert.equal(r.state, "error");
    assert.equal(r.errorCode, "no_data_in_window");
    assert.equal(r.value, null);
  });

  it("ignores non-numeric ratings", () => {
    const rows: ReviewRow[] = [
      { rating: 4, hidden_at: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { rating: "oops" as any, hidden_at: null },
      { rating: null, hidden_at: null },
      { rating: 2, hidden_at: null },
    ];
    const r = deriveAvgReviewRating({ rows, error: null });
    assert.equal(r.state, "ok");
    assert.equal(r.value, 3); // (4+2)/2
  });

  it("propagates error", () => {
    const r = deriveAvgReviewRating({
      rows: null,
      error: "canceling statement due to statement timeout",
    });
    assert.equal(r.errorCode, "timeout");
  });

  it("null rows without error → reviews_read_returned_null", () => {
    const r = deriveAvgReviewRating({ rows: null });
    assert.equal(r.errorCode, "reviews_read_returned_null");
  });
});

// ── window computation ───────────────────────────────────────────

describe("daysBefore + window constants", () => {
  it("computes correct calendar shift across month boundaries (UTC)", () => {
    assert.equal(daysBefore("2026-09-15", 0), "2026-09-15");
    assert.equal(daysBefore("2026-09-15", 1), "2026-09-14");
    // 90 days back from 2026-09-15
    assert.equal(daysBefore("2026-09-15", 89), "2026-06-18");
    // 30 days back from 2026-09-15
    assert.equal(daysBefore("2026-09-15", 29), "2026-08-17");
  });

  it("deriveKpisForDay calls fetchBookingsForRange with the expected windows", async () => {
    const calls: Array<{ from: string; to: string }> = [];
    const day = "2026-09-15";
    await deriveKpisForDay(
      day,
      stubClient({
        bookingsRange: { rows: [], error: null },
        reviewsRange: { rows: [], error: null },
        bookingsRangeCalls: calls,
      }),
    );
    // Expect two calls: repeat_rate (90d) then fill_rate (30d).
    assert.equal(calls.length, 2);
    assert.equal(calls[0].to, day);
    assert.equal(calls[0].from, daysBefore(day, REPEAT_RATE_WINDOW_DAYS - 1));
    assert.equal(calls[1].to, day);
    assert.equal(calls[1].from, daysBefore(day, FILL_RATE_WINDOW_DAYS - 1));
  });

  it("window constants match spec (90 / 30 / 30)", () => {
    assert.equal(REPEAT_RATE_WINDOW_DAYS, 90);
    assert.equal(FILL_RATE_WINDOW_DAYS, 30);
    assert.equal(AVG_REVIEW_RATING_WINDOW_DAYS, 30);
  });
});

// ── end-to-end with stub client (spec: E5 deliverable) ──────────────

describe("deriveKpisForDay — end-to-end with a mixed-data stub", () => {
  it("produces honest ok / error rows across all 6 metrics using real derivations", async () => {
    const day = "2026-09-15";
    const dayBookings: BookingRow[] = [
      { status: "paid", total_cents: 5000 },
      { status: "in_progress", total_cents: 2500 },
      { status: "cancelled", total_cents: 9999 }, // excluded from GMV
    ];
    const rangeBookings: BookingRangeRow[] = [
      // seeker s1 booked twice (repeat), s2 once, s3 once
      { seeker_id: "s1", caregiver_id: "c1", created_at: "2026-09-15T10:00:00Z" },
      { seeker_id: "s1", caregiver_id: null, created_at: "2026-08-30T10:00:00Z" },
      { seeker_id: "s2", caregiver_id: "c2", created_at: "2026-09-01T10:00:00Z" },
      { seeker_id: "s3", caregiver_id: null, created_at: "2026-07-20T10:00:00Z" },
    ];
    const rangeReviews: ReviewRow[] = [
      { rating: 5, hidden_at: null, created_at: "2026-09-15T10:00:00Z" },
      { rating: 4, hidden_at: null, created_at: "2026-09-10T10:00:00Z" },
      { rating: 1, hidden_at: "2026-09-11T10:00:00Z", created_at: "2026-09-10T10:00:00Z" },
    ];

    const client: DeriveClient = {
      async fetchBookingsForDay() {
        return { rows: dayBookings, error: null };
      },
      async fetchBookingsForRange() {
        return { rows: rangeBookings, error: null };
      },
      async fetchReviewsForRange() {
        return { rows: rangeReviews, error: null };
      },
    };

    const map = byMetric(await deriveKpisForDay(day, client));

    // bookings + gmv (day slice)
    assert.deepEqual(map.bookings, { metric: "bookings", state: "ok", value: 3 });
    assert.deepEqual(map.gmv, { metric: "gmv", state: "ok", value: 75 });

    // avg_review_rating: (5 + 4) / 2 = 4.5 (hidden row excluded)
    assert.equal(map.avg_review_rating.state, "ok");
    assert.equal(map.avg_review_rating.value, 4.5);

    // repeat_rate: s1 has 2 bookings, s2/s3 have 1 each → 1/3
    assert.equal(map.repeat_rate.state, "ok");
    assert.ok(
      map.repeat_rate.value != null &&
        Math.abs(map.repeat_rate.value - 1 / 3) < 1e-9,
    );

    // fill_rate: 2 of 4 bookings have caregiver_id → 0.5. (Note: the
    // stub returns the same 4-row set for both range calls; in prod the
    // 30-day fill_rate window is strictly narrower than the 90-day
    // repeat_rate window. The derivation doesn't care which subset it
    // receives — it just computes on what the client returned.)
    assert.equal(map.fill_rate.state, "ok");
    assert.equal(map.fill_rate.value, 0.5);

    // time_to_match_min stays unwired but with the new error code.
    assert.deepEqual(map.time_to_match_min, {
      metric: "time_to_match_min",
      state: "error",
      value: null,
      errorCode: "no_data_yet",
    });
  });

  it("empty windows across all range fetchers surface as no_data_in_window (not fake zeros)", async () => {
    const client: DeriveClient = {
      async fetchBookingsForDay() {
        return { rows: [], error: null };
      },
      async fetchBookingsForRange() {
        return { rows: [], error: null };
      },
      async fetchReviewsForRange() {
        return { rows: [], error: null };
      },
    };
    const map = byMetric(await deriveKpisForDay("2026-09-15", client));
    // bookings/gmv are OK zero (empty day is a real answer for those).
    assert.deepEqual(map.bookings, { metric: "bookings", state: "ok", value: 0 });
    assert.deepEqual(map.gmv, { metric: "gmv", state: "ok", value: 0 });
    // The windowed metrics must honestly report empty window.
    assert.equal(map.avg_review_rating.errorCode, "no_data_in_window");
    assert.equal(map.repeat_rate.errorCode, "no_data_in_window");
    assert.equal(map.fill_rate.errorCode, "no_data_in_window");
    // time_to_match_min unchanged.
    assert.equal(map.time_to_match_min.errorCode, "no_data_yet");
  });
});

// ── regression guards ───────────────────────────────────────────

describe("regression guards — mock fallback is really gone", () => {
  it("does not import a mock generator from route.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const path = new URL("./route.ts", import.meta.url);
    const raw = readFileSync(path, "utf8");
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.equal(
      /\bmockFor\b|\bfabricate\b/.test(code),
      false,
      "route.ts must not reintroduce a synthetic fallback helper",
    );
  });

  it("derive.ts avg_review_rating branch does not fabricate numbers on error", async () => {
    const { readFileSync } = await import("node:fs");
    const path = new URL("./derive.ts", import.meta.url);
    const src = readFileSync(path, "utf8");
    // Extract the deriveAvgReviewRating body.
    const match = src.match(
      /export function deriveAvgReviewRating[\s\S]+?\n\}\n/,
    );
    assert.ok(match, "deriveAvgReviewRating not found");
    const body = match[0];
    // On error branches value must always be null.
    const errorBranches = body.match(/errorCode:[^,}\n]+/g) ?? [];
    assert.ok(
      errorBranches.length >= 4,
      "expected at least 4 error branches in deriveAvgReviewRating",
    );
  });
});
