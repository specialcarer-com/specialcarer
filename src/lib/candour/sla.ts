/**
 * SLA calculation helpers for duty-of-candour + notifiable-event casework
 * (Phase C — PR C3a).
 *
 * Two clocks per event, deliberately separate:
 *
 *   1. `regulatorNotifyTarget(discovered_at, type)` — CQC Reg 16 (death)
 *      and Reg 18 (other notifiable incidents) are legally "without delay".
 *      We model that as a same-working-day-if-discovered-before-5pm-London,
 *      otherwise next-working-day-09:00-London target. Returns `null` for
 *      type='other' — that bucket is RM-triaged and has no statutory clock.
 *
 *   2. `candourDisclosureTarget(discovered_at)` — CQC Reg 20 disclosure to
 *      the affected person / their representative is "as soon as reasonably
 *      practicable". Providers subject to the NHS Standard Contract have a
 *      maximum of 10 working days; we adopt 10 working days as an internal
 *      ceiling for all providers. NOT a statutory CQC-notification deadline.
 *
 * Both are targets, not hard deadlines. The UI (shipping in C3b) renders
 * "on time / due soon / overdue" badges from `slaBadge()`.
 *
 * Time-zone handling
 * ──────────────────
 * We deliberately avoid pulling a heavyweight tz library (luxon, date-fns-tz)
 * for one file. Instead we use `Intl.DateTimeFormat` with
 * `timeZone: 'Europe/London'` for the fields we care about (hour, weekday,
 * calendar date), then rebuild the target timestamp by iterating candidate
 * UTC instants until the London wall-clock matches the wanted (date, 09:00
 * or 17:00) pair. This handles the DST switchover naturally — on the
 * "spring forward" day the loop simply finds the correct UTC instant that
 * happens to be one hour further along the clock. See the test file's
 * 2027-03-27 case for the concrete verification.
 *
 * Bank holidays are baked in as a static list — see `UK_BANK_HOLIDAYS_2026_2027`
 * below. When the list needs extending, the compile-time test cases for
 * candourDisclosureTarget will still pass but real-world usage will drift.
 * There is a prominent comment on the list itself.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type NotifiableType =
  | "death"
  | "injury_serious"
  | "abuse_alleged"
  | "deprivation_of_liberty"
  | "incident_police_involved"
  | "service_stopped"
  | "other";

export type SlaBadge = "on-time" | "due-soon" | "overdue" | "na";

// ─── Static UK bank holiday list (England & Wales) ─────────────────────────

/**
 * Static list — update annually. Source: https://www.gov.uk/bank-holidays
 *
 * England-and-Wales bank holidays covering 2026-01-01 through 2027-12-31.
 * When 2027 is nearly over, extend this list forward and update the
 * comment. There is a lint-free way to fetch this dynamically (gov.uk
 * publishes JSON), but for a compliance-critical calculation we prefer
 * a hard-coded list so the values that go into a target timestamp are
 * always the values that were code-reviewed.
 *
 * Values are YYYY-MM-DD strings interpreted as London calendar dates.
 */
export const UK_BANK_HOLIDAYS_2026_2027: readonly string[] = [
  // 2026 — England and Wales
  "2026-01-01", // New Year's Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-04", // Early May bank holiday
  "2026-05-25", // Spring bank holiday
  "2026-08-31", // Summer bank holiday
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (substitute — 26 Dec is a Saturday)

  // 2027 — England and Wales
  "2027-01-01", // New Year's Day
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-05-03", // Early May bank holiday
  "2027-05-31", // Spring bank holiday
  "2027-08-30", // Summer bank holiday
  "2027-12-27", // Christmas Day (substitute — 25 Dec is a Saturday)
  "2027-12-28", // Boxing Day (substitute — 26 Dec is a Sunday)
];

const BANK_HOLIDAY_SET = new Set(UK_BANK_HOLIDAYS_2026_2027);

// ─── London-timezone helpers (no external dependency) ──────────────────────

/**
 * Return the London wall-clock fields for a UTC instant.
 *   { year, month, day, hour, minute, weekday }
 * weekday is 0-6 with 0 = Sunday, 6 = Saturday.
 */
function londonParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  ymd: string;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  // "24" surfaces on some Node versions for midnight — normalise to 0.
  const hourRaw = Number(get("hour"));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number(get("minute"));
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = weekdayMap[get("weekday")] ?? 0;
  const ymd = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, hour, minute, weekday, ymd };
}

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

function isBankHoliday(ymd: string): boolean {
  return BANK_HOLIDAY_SET.has(ymd);
}

function isWorkingDay(d: Date): boolean {
  const { weekday, ymd } = londonParts(d);
  return !isWeekend(weekday) && !isBankHoliday(ymd);
}

/**
 * Find the UTC Date whose London wall-clock reads (year, month, day, hour, 0).
 *
 * We start from a naive UTC guess for the given wall-clock time, then
 * probe ±1 hour steps (bounded to 4 iterations, enough to survive both
 * DST switches) until londonParts matches. This is intentionally
 * dumb-simple; it correctness-tests trivially and needs no tz DB.
 */
function londonWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
): Date {
  // First guess: treat the wall clock as if it were UTC, then correct.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  // Probe up to ±4 hours to handle any oddity.
  for (let delta = -4; delta <= 4; delta++) {
    const candidate = new Date(guess.getTime() + delta * 3600 * 1000);
    const parts = londonParts(candidate);
    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour
    ) {
      return candidate;
    }
  }
  // Fallback: return the naive guess. Should be unreachable in practice.
  return guess;
}

/**
 * Advance a Date by one calendar day in London (handles DST silently
 * because we ask Intl for the fresh wall-clock reading on each step).
 */
function londonAddDays(d: Date, days: number): Date {
  const { year, month, day, hour } = londonParts(d);
  // Move calendar day forward, then re-materialise the same hour in London.
  const asUtc = new Date(Date.UTC(year, month - 1, day + days, hour, 0, 0));
  const parts = londonParts(asUtc);
  return londonWallClockToUtc(parts.year, parts.month, parts.day, hour);
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Compute the regulator-notification target for a fresh event.
 *
 * Rule:
 *   - If London wall-clock hour < 17 on a working day → 17:00 London today.
 *   - Otherwise → 09:00 London on the next working day.
 *   - For type='other' → returns null (no statutory clock).
 *
 * Note on the "same day" case: we point at 17:00 London rather than
 * `discovered_at` because the operational meaning of "target" is "by
 * when we must have submitted the notification". A discovery at 09:00
 * that we target for the SAME instant would render as immediately-due,
 * which is not what the RM triage flow needs.
 */
export function regulatorNotifyTarget(
  discovered_at: Date,
  type: NotifiableType,
): Date | null {
  if (type === "other") return null;

  const parts = londonParts(discovered_at);

  // Case A: discovered before 17:00 London on a working day →
  //         target is 17:00 London the same day.
  if (parts.hour < 17 && isWorkingDay(discovered_at)) {
    return londonWallClockToUtc(parts.year, parts.month, parts.day, 17);
  }

  // Case B: otherwise the target is 09:00 London on the next working day.
  let cursor = londonAddDays(discovered_at, 1);
  while (!isWorkingDay(cursor)) {
    cursor = londonAddDays(cursor, 1);
  }
  const cursorParts = londonParts(cursor);
  return londonWallClockToUtc(
    cursorParts.year,
    cursorParts.month,
    cursorParts.day,
    9,
  );
}

/**
 * Compute the Reg 20 duty-of-candour disclosure target.
 *
 * Rule: `discovered_at` + 10 working days, skipping Saturdays, Sundays,
 * and England-and-Wales bank holidays. The target's time-of-day is the
 * same wall-clock hour as `discovered_at` in London — this preserves
 * "10 working days later, same time of day" as the intuitive meaning.
 *
 * Note the plus-10 semantics: if discovered_at is a Monday, we want
 * the target to be the Monday two weeks later (10 working days from
 * Tuesday of the same week). We advance the cursor by whole days
 * until 10 fresh working days have been counted.
 */
export function candourDisclosureTarget(discovered_at: Date): Date {
  const parts = londonParts(discovered_at);
  let cursor = londonAddDays(discovered_at, 1);
  let workingDays = 0;
  while (workingDays < 10) {
    if (isWorkingDay(cursor)) workingDays++;
    if (workingDays < 10) cursor = londonAddDays(cursor, 1);
  }
  const cursorParts = londonParts(cursor);
  return londonWallClockToUtc(
    cursorParts.year,
    cursorParts.month,
    cursorParts.day,
    parts.hour,
  );
}

/**
 * Render an SLA badge for the UI. Pure.
 *
 *   - `on-time`  → target is > 24 hours away
 *   - `due-soon` → target is within the next 24 hours but not past
 *   - `overdue`  → target is in the past
 *   - `na`       → target is null (no statutory clock)
 */
export function slaBadge(
  target_at: Date | null,
  now: Date = new Date(),
): SlaBadge {
  if (target_at === null) return "na";
  const nowMs = now.getTime();
  const targetMs = target_at.getTime();
  if (nowMs > targetMs) return "overdue";
  if (targetMs - nowMs <= 24 * 3600 * 1000) return "due-soon";
  return "on-time";
}
