/**
 * Pure derivation for /api/cron/kpi-rollup-hourly.
 *
 * Extracted from route.ts so it can be unit-tested with a stub client.
 *
 * B2 (2026-09-11): removed the pre-B2 mock fallback; metrics without a
 * real derivation return { state: 'error', errorCode: 'no_derivation_wired' }
 * instead of a plausible-looking synthetic number.
 *
 * E5 (2026-09-15): wired three of the four previously-unwired metrics
 * (`repeat_rate`, `fill_rate`, `avg_review_rating` — the latter renamed
 * from `nps`) using the bookings and reviews tables. Windowing rules:
 *
 *   - repeat_rate       → last 90 days ending on `day`
 *   - fill_rate         → last 30 days ending on `day`
 *   - avg_review_rating → last 30 days ending on `day`
 *
 * `time_to_match_min` stays unwired but now reports errorCode
 * `no_data_yet` (rather than `no_derivation_wired`) because the logic is
 * ready — it just needs `booking_match_offers` to have data.
 */
import type { KpiMetric } from "@/lib/admin-ops/types";

export type BookingRow = {
  status?: string | null;
  total_cents?: number | null;
};

export type BookingRangeRow = {
  id?: string | null;
  seeker_id?: string | null;
  caregiver_id?: string | null;
  created_at?: string | null;
  status?: string | null;
};

export type ReviewRow = {
  rating?: number | null;
  hidden_at?: string | null;
  created_at?: string | null;
};

export type DeriveClient = {
  fetchBookingsForDay: (
    day: string,
  ) => Promise<{ rows: BookingRow[] | null; error?: string | null }>;
  fetchBookingsForRange: (
    fromDay: string,
    toDay: string,
  ) => Promise<{ rows: BookingRangeRow[] | null; error?: string | null }>;
  fetchReviewsForRange: (
    fromDay: string,
    toDay: string,
  ) => Promise<{ rows: ReviewRow[] | null; error?: string | null }>;
};

export type KpiState = "ok" | "stale" | "error";

export type KpiDerivation = {
  metric: KpiMetric;
  state: KpiState;
  value: number | null;
  errorCode?: string;
};

/** Booking statuses that count towards GMV (cash actually taken). */
const PAIDISH = new Set(["paid", "in_progress", "completed", "paid_out"]);

/** Windowing constants (days). Centralised so tests can reference them. */
export const REPEAT_RATE_WINDOW_DAYS = 90;
export const FILL_RATE_WINDOW_DAYS = 30;
export const AVG_REVIEW_RATING_WINDOW_DAYS = 30;

/**
 * Derive today's national rollup value for every KPI metric. Never
 * fabricates. If a metric has no derivation wired yet, returns
 * state='error' + errorCode='no_data_yet' (or 'no_derivation_wired' if
 * the code path isn't even written) so the dashboard shows honestly and
 * the fix is discoverable in Sentry / status rows.
 */
export async function deriveKpisForDay(
  day: string,
  client: DeriveClient,
): Promise<KpiDerivation[]> {
  const bookingsResult = await safeFetchBookingsForDay(client, day);

  const repeatRateFrom = daysBefore(day, REPEAT_RATE_WINDOW_DAYS - 1);
  const fillRateFrom = daysBefore(day, FILL_RATE_WINDOW_DAYS - 1);
  const avgReviewFrom = daysBefore(day, AVG_REVIEW_RATING_WINDOW_DAYS - 1);

  const [repeatRateFetch, fillRateFetch, avgReviewFetch] = await Promise.all([
    safeFetchBookingsForRange(client, repeatRateFrom, day),
    // `fill_rate` uses the same shape as `repeat_rate`; if the two ranges
    // are equal (unlikely — 90 vs 30) the second call is still safe.
    safeFetchBookingsForRange(client, fillRateFrom, day),
    safeFetchReviewsForRange(client, avgReviewFrom, day),
  ]);

  return [
    deriveBookings(bookingsResult),
    deriveGmv(bookingsResult),
    deriveAvgReviewRating(avgReviewFetch),
    deriveRepeatRate(repeatRateFetch),
    deriveFillRate(fillRateFetch),
    deriveTimeToMatchMin(),
  ];
}

// ── per-metric derivations ──────────────────────────────────────────

function deriveBookings(
  b: { rows: BookingRow[] | null; error?: string | null },
): KpiDerivation {
  if (b.error) {
    return {
      metric: "bookings",
      state: "error",
      value: null,
      errorCode: shortErrorCode(b.error),
    };
  }
  if (b.rows == null) {
    return {
      metric: "bookings",
      state: "error",
      value: null,
      errorCode: "bookings_read_returned_null",
    };
  }
  return { metric: "bookings", state: "ok", value: b.rows.length };
}

function deriveGmv(
  b: { rows: BookingRow[] | null; error?: string | null },
): KpiDerivation {
  if (b.error) {
    return {
      metric: "gmv",
      state: "error",
      value: null,
      errorCode: shortErrorCode(b.error),
    };
  }
  if (b.rows == null) {
    return {
      metric: "gmv",
      state: "error",
      value: null,
      errorCode: "bookings_read_returned_null",
    };
  }
  let pence = 0;
  for (const r of b.rows) {
    const status = typeof r.status === "string" ? r.status : "";
    const cents = typeof r.total_cents === "number" ? r.total_cents : 0;
    if (PAIDISH.has(status)) pence += cents;
  }
  return { metric: "gmv", state: "ok", value: pence / 100 };
}

/**
 * `repeat_rate` — of seekers with ≥1 booking in the last 90 days ending
 * on `day`, the fraction with ≥2 bookings in the same window. Numerator
 * and denominator are computed over the same seeker set.
 */
export function deriveRepeatRate(b: {
  rows: BookingRangeRow[] | null;
  error?: string | null;
}): KpiDerivation {
  if (b.error) {
    return {
      metric: "repeat_rate",
      state: "error",
      value: null,
      errorCode: shortErrorCode(b.error),
    };
  }
  if (b.rows == null) {
    return {
      metric: "repeat_rate",
      state: "error",
      value: null,
      errorCode: "bookings_read_returned_null",
    };
  }
  if (b.rows.length === 0) {
    return {
      metric: "repeat_rate",
      state: "error",
      value: null,
      errorCode: "no_data_in_window",
    };
  }
  const counts = new Map<string, number>();
  for (const r of b.rows) {
    const sid = typeof r.seeker_id === "string" ? r.seeker_id : null;
    if (!sid) continue;
    counts.set(sid, (counts.get(sid) ?? 0) + 1);
  }
  const denom = counts.size;
  if (denom === 0) {
    // Rows exist but none carry a seeker_id — indistinguishable from
    // "no seekers", surface honestly.
    return {
      metric: "repeat_rate",
      state: "error",
      value: null,
      errorCode: "no_data_in_window",
    };
  }
  let numer = 0;
  for (const c of counts.values()) if (c >= 2) numer += 1;
  return { metric: "repeat_rate", state: "ok", value: numer / denom };
}

/**
 * `fill_rate` — bookings created in the last 30 days ending on `day`
 * with `caregiver_id` populated / all bookings created in the window.
 * Definition-of-done: caregiver_id populated at rollup time.
 */
export function deriveFillRate(b: {
  rows: BookingRangeRow[] | null;
  error?: string | null;
}): KpiDerivation {
  if (b.error) {
    return {
      metric: "fill_rate",
      state: "error",
      value: null,
      errorCode: shortErrorCode(b.error),
    };
  }
  if (b.rows == null) {
    return {
      metric: "fill_rate",
      state: "error",
      value: null,
      errorCode: "bookings_read_returned_null",
    };
  }
  if (b.rows.length === 0) {
    return {
      metric: "fill_rate",
      state: "error",
      value: null,
      errorCode: "no_data_in_window",
    };
  }
  let filled = 0;
  for (const r of b.rows) {
    if (typeof r.caregiver_id === "string" && r.caregiver_id.length > 0) {
      filled += 1;
    }
  }
  return { metric: "fill_rate", state: "ok", value: filled / b.rows.length };
}

/**
 * `avg_review_rating` — AVG(rating) over reviews created in the last 30
 * days ending on `day`, ignoring hidden reviews. Renamed from `nps` in
 * E5 because 1-5 stars is not NPS methodology.
 */
export function deriveAvgReviewRating(b: {
  rows: ReviewRow[] | null;
  error?: string | null;
}): KpiDerivation {
  if (b.error) {
    return {
      metric: "avg_review_rating",
      state: "error",
      value: null,
      errorCode: shortErrorCode(b.error),
    };
  }
  if (b.rows == null) {
    return {
      metric: "avg_review_rating",
      state: "error",
      value: null,
      errorCode: "reviews_read_returned_null",
    };
  }
  if (b.rows.length === 0) {
    return {
      metric: "avg_review_rating",
      state: "error",
      value: null,
      errorCode: "no_data_in_window",
    };
  }
  let sum = 0;
  let n = 0;
  for (const r of b.rows) {
    if (r.hidden_at != null) continue;
    if (typeof r.rating !== "number" || !Number.isFinite(r.rating)) continue;
    sum += r.rating;
    n += 1;
  }
  if (n === 0) {
    // All rows were hidden or malformed — no honest number to report.
    return {
      metric: "avg_review_rating",
      state: "error",
      value: null,
      errorCode: "no_data_in_window",
    };
  }
  return { metric: "avg_review_rating", state: "ok", value: sum / n };
}

/**
 * `time_to_match_min` — waiting on data.
 *
 * Will auto-wire once booking_match_offers has data. Formula:
 * AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))/60) for offers
 * accepted in window.
 */
function deriveTimeToMatchMin(): KpiDerivation {
  return {
    metric: "time_to_match_min",
    state: "error",
    value: null,
    errorCode: "no_data_yet",
  };
}

// ── helpers ─────────────────────────────────────────────────────────

async function safeFetchBookingsForDay(
  client: DeriveClient,
  day: string,
): Promise<{ rows: BookingRow[] | null; error?: string | null }> {
  try {
    return await client.fetchBookingsForDay(day);
  } catch (e) {
    return { rows: null, error: (e as Error).message || "fetch_threw" };
  }
}

async function safeFetchBookingsForRange(
  client: DeriveClient,
  fromDay: string,
  toDay: string,
): Promise<{ rows: BookingRangeRow[] | null; error?: string | null }> {
  try {
    return await client.fetchBookingsForRange(fromDay, toDay);
  } catch (e) {
    return { rows: null, error: (e as Error).message || "fetch_threw" };
  }
}

async function safeFetchReviewsForRange(
  client: DeriveClient,
  fromDay: string,
  toDay: string,
): Promise<{ rows: ReviewRow[] | null; error?: string | null }> {
  try {
    return await client.fetchReviewsForRange(fromDay, toDay);
  } catch (e) {
    return { rows: null, error: (e as Error).message || "fetch_threw" };
  }
}

/**
 * Return `day` shifted back by `n` calendar days as a YYYY-MM-DD string.
 * `day` is expected to be YYYY-MM-DD; parsed as UTC to avoid TZ drift.
 */
export function daysBefore(day: string, n: number): string {
  const [y, m, d] = day.split("-").map((x) => parseInt(x, 10));
  const utc = Date.UTC(y, m - 1, d) - n * 24 * 3600 * 1000;
  return new Date(utc).toISOString().slice(0, 10);
}

/** Compress a Postgres / Supabase error string into a short code. */
function shortErrorCode(msg: string): string {
  const s = msg.toLowerCase();
  if (/does not exist/.test(s)) return "schema_not_ready";
  if (/permission denied/.test(s)) return "permission_denied";
  if (/timeout|timed out/.test(s)) return "timeout";
  return "db_error";
}
