/**
 * Carer earnings dashboard V1 (gap 36) — pure, testable handler.
 *
 * Computes the headline totals, a "vs prior period" delta, the
 * upcoming (confirmed-but-not-yet-earned) tile, and a paginated list of
 * recent completed bookings for the signed-in carer.
 *
 * Money semantics mirror the tax-export route, the single existing
 * source of per-booking truth:
 *   • gross = bookings.subtotal_cents   (carer's listed rate × hours, pre-fee)
 *   • fee   = bookings.platform_fee_cents
 *   • net   = gross − fee
 * We read the persisted columns rather than recomputing from the fee
 * percent so the dashboard always agrees with what the carer was paid,
 * even if the fee config changed between bookings.
 *
 * The handler is decoupled from @supabase/supabase-js: callers pass a
 * thin `EarningsQueryClient` so unit tests can drive it with stub rows
 * (same pattern as upcoming-handler.ts).
 */

export type EarningsPeriod =
  | "this_week"
  | "this_month"
  | "last_month"
  | "all_time";

/** Booking statuses that count as "completed / earned". */
export const COMPLETED_STATUSES: ReadonlyArray<string> = [
  "completed",
  "paid_out",
];

/**
 * Statuses that count as confirmed-but-not-yet-completed (upcoming).
 * Mirrors UPCOMING_STATUSES in bookings/upcoming-handler.ts.
 */
export const UPCOMING_EARNINGS_STATUSES: ReadonlyArray<string> = [
  "accepted",
  "paid",
  "in_progress",
];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export type CompletedBookingRow = {
  id: string;
  seeker_id: string | null;
  status: string;
  shift_completed_at: string | null;
  service_type: string | null;
  hours: number | null;
  starts_at: string | null;
  ends_at: string | null;
  subtotal_cents: number | null;
  platform_fee_cents: number | null;
  currency: string | null;
};

export type UpcomingBookingRow = {
  status: string;
  subtotal_cents: number | null;
  platform_fee_cents: number | null;
};

export type SeekerProfile = {
  id: string;
  full_name: string | null;
};

/**
 * Minimal query surface the handler needs. The real route adapts a
 * supabase admin client to this; tests pass an in-memory stub.
 */
export type EarningsQueryClient = {
  /**
   * All completed bookings for this carer, newest `shift_completed_at`
   * first. The handler does period-windowing + pagination in memory —
   * fine at carer-scale volumes (one carer's lifetime bookings).
   */
  completedBookings(carerId: string): Promise<{
    data: CompletedBookingRow[] | null;
    error: { message: string } | null;
  }>;
  /** Confirmed-but-not-completed bookings for this carer. */
  upcomingBookings(carerId: string): Promise<{
    data: UpcomingBookingRow[] | null;
    error: { message: string } | null;
  }>;
  /** Batch-resolve seeker display names for the rows we return. */
  seekerProfiles(ids: string[]): Promise<{
    data: SeekerProfile[] | null;
    error: { message: string } | null;
  }>;
};

export type ApiEarningsBooking = {
  id: string;
  completedAt: string | null;
  seekerLabel: string;
  serviceType: string;
  durationMinutes: number;
  gross: number;
  fee: number;
  net: number;
};

export type ApiEarningsResponse = {
  period: EarningsPeriod;
  totals: { gross: number; fee: number; net: number; currency: "GBP" };
  deltaPct: number | null;
  upcoming: { gross: number; net: number; count: number };
  bookings: ApiEarningsBooking[];
  pagination: { hasMore: boolean; nextCursor: string | null };
};

/**
 * Pure carer-authorization gate for the earnings endpoint.
 *
 *   • no signed-in user        → 401
 *   • signed in but not a carer → 403  (no caregiver_profiles row)
 *   • signed-in carer           → ok
 *
 * Earnings are carer-only; a seeker hitting this must be hard-failed.
 */
export function authorizeCarer(input: {
  userId: string | null | undefined;
  hasCarerProfile: boolean;
}): { ok: true } | { ok: false; status: 401 | 403; error: string } {
  if (!input.userId) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }
  if (!input.hasCarerProfile) {
    return {
      ok: false,
      status: 403,
      error: "Earnings are available to carers only.",
    };
  }
  return { ok: true };
}

export function parsePeriod(raw: string | null): EarningsPeriod {
  switch ((raw ?? "").toLowerCase()) {
    case "this_week":
      return "this_week";
    case "last_month":
      return "last_month";
    case "all_time":
      return "all_time";
    case "this_month":
    default:
      return "this_month";
  }
}

export function parsePageSize(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

type Window = { start: Date | null; end: Date };

/**
 * Half-open [start, end) window for the requested period, plus the
 * equivalent immediately-prior window used for the delta. `start: null`
 * means unbounded (all_time has no prior period).
 */
export function periodWindows(
  period: EarningsPeriod,
  now: Date,
): { current: Window; prior: Window | null } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  if (period === "all_time") {
    return { current: { start: null, end: now }, prior: null };
  }

  if (period === "this_month") {
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 1));
    const priorStart = new Date(Date.UTC(y, m - 1, 1));
    return {
      current: { start, end },
      prior: { start: priorStart, end: start },
    };
  }

  if (period === "last_month") {
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const priorStart = new Date(Date.UTC(y, m - 2, 1));
    return {
      current: { start, end },
      prior: { start: priorStart, end: start },
    };
  }

  // this_week — ISO week, Monday-based, in UTC.
  const day = now.getUTCDay() || 7; // Sun=0 → 7
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const priorMonday = new Date(monday);
  priorMonday.setUTCDate(monday.getUTCDate() - 7);
  return {
    current: { start: monday, end: nextMonday },
    prior: { start: priorMonday, end: monday },
  };
}

function inWindow(iso: string | null, w: Window): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (w.start && t < w.start.getTime()) return false;
  return t < w.end.getTime();
}

function gross(r: { subtotal_cents: number | null }): number {
  return Math.max(0, Math.round(r.subtotal_cents ?? 0));
}

function fee(r: { platform_fee_cents: number | null }): number {
  return Math.max(0, Math.round(r.platform_fee_cents ?? 0));
}

export function sumTotals(
  rows: CompletedBookingRow[],
): { gross: number; fee: number; net: number } {
  let g = 0;
  let f = 0;
  for (const r of rows) {
    g += gross(r);
    f += fee(r);
  }
  return { gross: g, fee: f, net: Math.max(0, g - f) };
}

/**
 * Percentage change of `current` vs `prior` net, rounded to one decimal.
 * Returns null when there's no prior period or the prior period earned
 * nothing (an "∞%" jump is meaningless to a carer — the UI shows "—").
 */
export function computeDeltaPct(
  currentNet: number,
  priorNet: number | null,
): number | null {
  if (priorNet === null || priorNet <= 0) return null;
  return Math.round(((currentNet - priorNet) / priorNet) * 1000) / 10;
}

function durationMinutes(r: CompletedBookingRow): number {
  if (typeof r.hours === "number" && Number.isFinite(r.hours) && r.hours > 0) {
    return Math.round(r.hours * 60);
  }
  if (r.starts_at && r.ends_at) {
    const ms = new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime();
    if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 60000);
  }
  return 0;
}

/**
 * Privacy-preserving seeker label: first name + last initial
 * ("Margaret T."). Falls back to "Client" when we have no name.
 * The platform convention (see /api/m/bookings counterparty handling)
 * is to surface enough to recognise a regular client without exposing
 * the full surname in list views.
 */
export function seekerLabel(fullName: string | null | undefined): string {
  const name = (fullName ?? "").trim();
  if (!name) return "Client";
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

export type HandleEarningsInput = {
  carerId: string;
  period: EarningsPeriod;
  pageSize: number;
  /** Opaque cursor: the `shift_completed_at` ISO of the last seen row. */
  cursor?: string | null;
  client: EarningsQueryClient;
  now?: Date;
};

export type HandleEarningsResult =
  | { ok: true; body: ApiEarningsResponse }
  | { ok: false; status: number; error: string };

/**
 * Core dashboard computation. Pure aside from the three client reads.
 */
export async function handleEarnings(
  input: HandleEarningsInput,
): Promise<HandleEarningsResult> {
  const { carerId, period, pageSize, client } = input;
  const now = input.now ?? new Date();

  const [completedRes, upcomingRes] = await Promise.all([
    client.completedBookings(carerId),
    client.upcomingBookings(carerId),
  ]);
  if (completedRes.error) {
    return { ok: false, status: 500, error: completedRes.error.message };
  }
  if (upcomingRes.error) {
    return { ok: false, status: 500, error: upcomingRes.error.message };
  }

  const allCompleted = (completedRes.data ?? [])
    .filter((r) => COMPLETED_STATUSES.includes(r.status))
    .slice()
    .sort((a, b) => {
      const av = a.shift_completed_at ?? "";
      const bv = b.shift_completed_at ?? "";
      return av < bv ? 1 : av > bv ? -1 : 0; // newest first
    });

  const { current, prior } = periodWindows(period, now);
  const currentRows = allCompleted.filter((r) =>
    inWindow(r.shift_completed_at, current),
  );
  const totals = sumTotals(currentRows);

  let deltaPct: number | null = null;
  if (prior) {
    const priorRows = allCompleted.filter((r) =>
      inWindow(r.shift_completed_at, prior),
    );
    deltaPct = computeDeltaPct(totals.net, sumTotals(priorRows).net);
  }

  // Upcoming tile — confirmed but not yet earned, all future regardless
  // of the selected period (carers care about the whole pipeline).
  const upcomingRows = (upcomingRes.data ?? []).filter((r) =>
    UPCOMING_EARNINGS_STATUSES.includes(r.status),
  );
  let upGross = 0;
  let upFee = 0;
  for (const r of upcomingRows) {
    upGross += gross(r);
    upFee += fee(r);
  }
  const upcoming = {
    gross: upGross,
    net: Math.max(0, upGross - upFee),
    count: upcomingRows.length,
  };

  // Paginate the completed list within the selected window. Cursor is
  // the last seen `shift_completed_at`; rows strictly older than it come
  // next. Ties on the exact timestamp are rare at carer scale; we accept
  // the edge by also skipping the cursor row id is unnecessary here.
  let windowRows = currentRows;
  if (input.cursor) {
    windowRows = windowRows.filter(
      (r) => (r.shift_completed_at ?? "") < input.cursor!,
    );
  }
  const page = windowRows.slice(0, pageSize);
  const hasMore = windowRows.length > pageSize;
  const nextCursor = hasMore
    ? page[page.length - 1]?.shift_completed_at ?? null
    : null;

  // Resolve seeker names for the page in one batch.
  const seekerIds = Array.from(
    new Set(
      page
        .map((r) => r.seeker_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  let nameById = new Map<string, string | null>();
  if (seekerIds.length > 0) {
    const profRes = await client.seekerProfiles(seekerIds);
    if (profRes.error) {
      return { ok: false, status: 500, error: profRes.error.message };
    }
    nameById = new Map(
      (profRes.data ?? []).map((p) => [p.id, p.full_name]),
    );
  }

  const bookings: ApiEarningsBooking[] = page.map((r) => {
    const g = gross(r);
    const f = fee(r);
    return {
      id: r.id,
      completedAt: r.shift_completed_at,
      seekerLabel: seekerLabel(
        r.seeker_id ? nameById.get(r.seeker_id) ?? null : null,
      ),
      serviceType: r.service_type ?? "",
      durationMinutes: durationMinutes(r),
      gross: g,
      fee: f,
      net: Math.max(0, g - f),
    };
  });

  return {
    ok: true,
    body: {
      period,
      totals: { ...totals, currency: "GBP" },
      deltaPct,
      upcoming,
      bookings,
      pagination: { hasMore, nextCursor },
    },
  };
}
