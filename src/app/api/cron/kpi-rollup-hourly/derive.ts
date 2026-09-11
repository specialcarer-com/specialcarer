/**
 * Pure derivation for /api/cron/kpi-rollup-hourly.
 *
 * Extracted from route.ts so it can be unit-tested with a stub client.
 * Removes the pre-B2 mock fallback: metrics without a real derivation now
 * return { state: 'error', errorCode: 'no_derivation_wired' } instead of a
 * plausible-looking synthetic number.
 */
import type { KpiMetric } from "@/lib/admin-ops/types";

export type BookingRow = {
  status?: string | null;
  total_cents?: number | null;
};

export type DeriveClient = {
  fetchBookingsForDay: (
    day: string,
  ) => Promise<{ rows: BookingRow[] | null; error?: string | null }>;
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

/**
 * Derive today's national rollup value for every KPI metric. Never
 * fabricates. If a metric has no derivation wired yet, returns
 * state='error' + errorCode='no_derivation_wired' so the dashboard
 * shows honestly and the fix is discoverable in Sentry / status rows.
 */
export async function deriveKpisForDay(
  day: string,
  client: DeriveClient,
): Promise<KpiDerivation[]> {
  const bookingsResult = await safeFetchBookings(client, day);

  return [
    deriveBookings(bookingsResult),
    deriveGmv(bookingsResult),
    unwired("nps"),
    unwired("repeat_rate"),
    unwired("fill_rate"),
    unwired("time_to_match_min"),
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
 * Metric that isn't derivable yet. This is intentional and preferred to
 * fabricating a number — the dashboard renders it as unavailable and
 * the status row is queryable for "which KPIs need wiring".
 */
function unwired(metric: KpiMetric): KpiDerivation {
  return {
    metric,
    state: "error",
    value: null,
    errorCode: "no_derivation_wired",
  };
}

// ── helpers ─────────────────────────────────────────────────────────

async function safeFetchBookings(
  client: DeriveClient,
  day: string,
): Promise<{ rows: BookingRow[] | null; error?: string | null }> {
  try {
    return await client.fetchBookingsForDay(day);
  } catch (e) {
    return { rows: null, error: (e as Error).message || "fetch_threw" };
  }
}

/** Compress a Postgres / Supabase error string into a short code. */
function shortErrorCode(msg: string): string {
  const s = msg.toLowerCase();
  if (/does not exist/.test(s)) return "schema_not_ready";
  if (/permission denied/.test(s)) return "permission_denied";
  if (/timeout|timed out/.test(s)) return "timeout";
  return "db_error";
}
