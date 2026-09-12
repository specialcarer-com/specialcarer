/**
 * Pure helpers for the admin "Deferred erasure queue" page (C1.4).
 *
 * The C1 erasure handler queues rows into
 * `public.dsar_deferred_erasure_queue` whenever UK law requires a
 * record to be kept past the moment an Article-17 request was
 * fulfilled — payroll (HMRC 6y), care records (NHSX 6y), minors'
 * records (until 25th birthday / 75y), etc. The C1.1 nightly cron
 * (`/api/cron/dsar-retention-sweep`) walks the queue and executes the
 * queued DELETE / SET-NULL when `retained_until` passes.
 *
 * The compliance officer needs a view into that queue so they can:
 *
 *   1. See what's overdue and stuck (`state='error'`).
 *   2. See what's been permanently skipped (`state='skipped'` after
 *      MAX_ATTEMPTS=7 failures).
 *   3. Manually retry a stuck row after fixing the underlying cause,
 *      or manually mark it 'skipped' if the record is now genuinely
 *      inapplicable (schema migrated, row already gone, etc.).
 *   4. See what's coming up — pending rows in the next 30 days — so
 *      the on-call rota knows to expect the cron traffic.
 *
 * All rendering / filtering logic lives here so the page can be a
 * thin server component and the tests can enforce every rule without
 * a React runtime.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The subset of `dsar_deferred_erasure_queue` columns the admin view
 * reads. Full schema:
 * `supabase/migrations/20260912010000_dsar_erasure_audit.sql`.
 */
export type DeferredQueueViewRow = {
  id: string;
  dsar_request_id: string;
  subject_email: string;
  subject_user_id: string | null;
  table_name: string;
  owner_column: string;
  owner_value: string;
  column_name: string | null; // null → whole-row DELETE
  retained_until: string; // 'YYYY-MM-DD'
  state:
    | "pending"
    | "processing"
    | "completed"
    | "skipped"
    | "error";
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
};

/** Filter chip state the URL query string represents. */
export type DeferredQueueFilter = {
  /**
   * Multi-select of states to show. Empty means "all". Duplicates and
   * unknown values are filtered out.
   */
  states: ReadonlyArray<DeferredQueueViewRow["state"]>;
  /**
   * "overdue" — retained_until <= today AND state IN (pending,error).
   * "upcoming" — retained_until between (today, today+30d] AND state='pending'.
   * "all" — no due-date filter.
   */
  due: "overdue" | "upcoming" | "all";
  /**
   * Free-text substring match against subject_email, table_name, and
   * dsar_request_id. Case-insensitive, trimmed. Empty → no filter.
   */
  q: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of rows the page renders per request. */
export const DEFERRED_QUEUE_PAGE_SIZE = 100;

/** Every state, in the order they appear in the filter chip row. */
export const DEFERRED_QUEUE_STATES: ReadonlyArray<
  DeferredQueueViewRow["state"]
> = ["pending", "processing", "error", "skipped", "completed"] as const;

/**
 * Number of days ahead of today a `pending` row counts as "upcoming"
 * so the on-call rota knows what the cron will process next.
 */
export const DEFERRED_QUEUE_UPCOMING_WINDOW_DAYS = 30;

/**
 * MAX_ATTEMPTS mirror. Kept in sync with `DEFAULT_MAX_ATTEMPTS` in
 * `./retention-sweep.ts`; the view uses it to badge rows as
 * "abandoned" once attempts hit the ceiling AND state='skipped'.
 */
export const DEFERRED_QUEUE_MAX_ATTEMPTS = 7;

// ---------------------------------------------------------------------------
// Filter parsing
// ---------------------------------------------------------------------------

/**
 * Parse a Next.js `searchParams` blob (values may be string / string[]
 * / undefined) into a normalised filter. Unknown values are dropped
 * rather than raising — the URL is user-editable and we want the page
 * to render on any input.
 */
export function parseDeferredQueueFilter(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): DeferredQueueFilter {
  const rawStates = searchParams["state"];
  const stateList = Array.isArray(rawStates)
    ? rawStates
    : typeof rawStates === "string"
      ? rawStates.split(",")
      : [];
  const valid = new Set<DeferredQueueViewRow["state"]>(
    DEFERRED_QUEUE_STATES,
  );
  const states = Array.from(
    new Set(
      stateList
        .map((s) => s.trim())
        .filter((s): s is DeferredQueueViewRow["state"] =>
          valid.has(s as DeferredQueueViewRow["state"]),
        ),
    ),
  );

  const rawDue = searchParams["due"];
  const due: DeferredQueueFilter["due"] =
    rawDue === "overdue" || rawDue === "upcoming" || rawDue === "all"
      ? rawDue
      : "all";

  const rawQ = searchParams["q"];
  const q =
    typeof rawQ === "string"
      ? rawQ.trim()
      : Array.isArray(rawQ) && typeof rawQ[0] === "string"
        ? rawQ[0].trim()
        : "";

  return { states, due, q };
}

/**
 * Serialise a filter back to a URL query string (without leading `?`).
 * Empty filter → empty string, so the "clear filters" link is a bare
 * URL rather than one with a stray `?`.
 */
export function serialiseDeferredQueueFilter(
  filter: DeferredQueueFilter,
): string {
  const parts: string[] = [];
  if (filter.states.length > 0) {
    parts.push(`state=${encodeURIComponent(filter.states.join(","))}`);
  }
  if (filter.due !== "all") {
    parts.push(`due=${filter.due}`);
  }
  if (filter.q) {
    parts.push(`q=${encodeURIComponent(filter.q)}`);
  }
  return parts.join("&");
}

// ---------------------------------------------------------------------------
// Row classification (used by badges + action eligibility)
// ---------------------------------------------------------------------------

export type DeferredRowBadge =
  | "pending"
  | "processing"
  | "overdue"
  | "error"
  | "abandoned"
  | "completed"
  | "skipped";

/**
 * Classify a row into the badge the UI should show. `overdue` and
 * `abandoned` are UI-only synthetic states derived from
 * (state, attempt_count, retained_until, today).
 */
export function classifyDeferredRow(
  row: DeferredQueueViewRow,
  today: string,
): DeferredRowBadge {
  if (row.state === "completed") return "completed";
  if (row.state === "processing") return "processing";
  if (row.state === "skipped") {
    return row.attempt_count >= DEFERRED_QUEUE_MAX_ATTEMPTS
      ? "abandoned"
      : "skipped";
  }
  if (row.state === "error") return "error";
  // state === 'pending'
  if (row.retained_until <= today) return "overdue";
  return "pending";
}

/**
 * Whether the admin may click "Retry now" on this row.
 *
 * Rules:
 *   * `state IN ('error','skipped')` — a completed / processing /
 *     pending-future row has nothing to retry.
 *   * `retained_until <= today` — retrying before the retention
 *     window ends would violate the legal basis the row was queued
 *     under.
 */
export function canManuallyRetry(
  row: DeferredQueueViewRow,
  today: string,
): boolean {
  if (row.state !== "error" && row.state !== "skipped") return false;
  return row.retained_until <= today;
}

/**
 * Whether the admin may click "Skip permanently" on this row.
 *
 * Rules:
 *   * `state IN ('pending','error')` — completed / skipped /
 *     processing rows have nothing to skip.
 *   * Any retained_until is allowed — the admin may want to skip a
 *     future row because the underlying record has already been
 *     hard-deleted through another channel (schema migration, ROPA
 *     cleanup, etc.).
 */
export function canManuallySkip(row: DeferredQueueViewRow): boolean {
  return row.state === "pending" || row.state === "error";
}

// ---------------------------------------------------------------------------
// Counts + summary (for the header bar on the queue page)
// ---------------------------------------------------------------------------

export type DeferredQueueSummary = {
  total: number;
  overdue: number;
  upcoming_30d: number;
  error: number;
  abandoned: number;
  completed: number;
  skipped: number;
  pending_future: number;
};

/**
 * Aggregate counts across the visible rows. Used to render the
 * summary strip above the table.
 */
export function summariseDeferredQueue(
  rows: ReadonlyArray<DeferredQueueViewRow>,
  today: string,
): DeferredQueueSummary {
  const summary: DeferredQueueSummary = {
    total: rows.length,
    overdue: 0,
    upcoming_30d: 0,
    error: 0,
    abandoned: 0,
    completed: 0,
    skipped: 0,
    pending_future: 0,
  };
  const upcomingCutoff = addDaysIso(today, DEFERRED_QUEUE_UPCOMING_WINDOW_DAYS);
  for (const row of rows) {
    const badge = classifyDeferredRow(row, today);
    switch (badge) {
      case "overdue":
        summary.overdue += 1;
        break;
      case "error":
        summary.error += 1;
        break;
      case "abandoned":
        summary.abandoned += 1;
        break;
      case "completed":
        summary.completed += 1;
        break;
      case "skipped":
        summary.skipped += 1;
        break;
      case "pending":
        summary.pending_future += 1;
        if (row.retained_until <= upcomingCutoff) {
          summary.upcoming_30d += 1;
        }
        break;
      case "processing":
        // Live cron work — no separate bucket in the summary strip.
        break;
    }
  }
  return summary;
}

/**
 * Add `days` calendar days to a `YYYY-MM-DD` date, returning the
 * same format. Pure — no timezone conversion (the input is already
 * a date-only value from the DB).
 */
export function addDaysIso(dateIso: string, days: number): string {
  // Split rather than `new Date(dateIso)` — the latter interprets a
  // bare YYYY-MM-DD as UTC and adds a spurious host-timezone offset
  // when toISOString() is called later.
  const [y, m, d] = dateIso.split("-").map((n) => Number(n));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Render today's date in `YYYY-MM-DD` in the London civil timezone.
 * The cron runs at 04:00 UTC and the queue's `retained_until` is a
 * bare date, so cutting off at midnight UK is the correct semantics
 * for "overdue".
 */
export function londonTodayIso(now: Date = new Date()): string {
  // Intl handles BST / GMT for us; we compose YYYY-MM-DD by hand to
  // avoid locale-specific separators.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}
