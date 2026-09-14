/**
 * Pure helpers for the Reg-9 review cadence.
 *
 * Kept import-free (no next/headers, no supabase, no server-only) so the
 * mobile client, admin table, cron worker, and unit tests can all share
 * one implementation. Every function is deterministic and side-effect
 * free — see reviews.test.ts.
 */

export type ReviewCadenceMonths = 3 | 6 | 12;

export type CarePlanReviewStatus =
  | "due"
  | "in_progress"
  | "completed"
  | "overdue"
  | "skipped";

export type CarePlanReviewRow = {
  id: string;
  care_plan_id: string;
  scheduled_for: string; // ISO date (yyyy-mm-dd)
  status: CarePlanReviewStatus;
  completed_at: string | null;
  completed_by: string | null;
  reviewer_notes: string | null;
  next_review_due: string | null;
  cadence_months: ReviewCadenceMonths;
  event_trigger:
    | "hospital_discharge"
    | "medication_change"
    | "safeguarding"
    | "other"
    | null;
  last_reminded_at: string | null;
  created_at: string;
  updated_at: string;
};

export const REVIEW_CADENCE_MONTHS: ReadonlyArray<ReviewCadenceMonths> = [
  3,
  6,
  12,
];

/**
 * Reminder lead times (days) before a scheduled review that the nightly
 * cron should emit an in-app + email nudge. Exported so tests + the cron
 * agree on a single source of truth.
 */
export const REVIEW_REMINDER_LEAD_DAYS: ReadonlyArray<number> = [14, 1];

// ---------------------------------------------------------------------------
// Cadence math
// ---------------------------------------------------------------------------

/**
 * Compute the next scheduled review date from a completion timestamp.
 *
 * We stay in UTC-noon to sidestep DST shifts, then coerce back to a
 * date-only value (yyyy-mm-dd) at the caller boundary.
 *
 * Edge case: end-of-month rollover. JS `setMonth` clamps 31-Jan + 1 month
 * to 28-Feb (or 29 in a leap year); the standard behaviour is fine for
 * cadence scheduling and matches how nurses talk about "monthly" reviews.
 */
export function computeNextReviewDate(
  completedAt: Date,
  cadenceMonths: ReviewCadenceMonths,
): Date {
  const source = new Date(
    Date.UTC(
      completedAt.getUTCFullYear(),
      completedAt.getUTCMonth(),
      completedAt.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
  source.setUTCMonth(source.getUTCMonth() + cadenceMonths);
  return source;
}

/**
 * A review is overdue if its scheduled date is strictly earlier than
 * today (comparing yyyy-mm-dd strings avoids TZ drift for the row's
 * `scheduled_for date` column).
 */
export function isReviewOverdue(scheduledFor: Date, now: Date): boolean {
  return toYmd(scheduledFor) < toYmd(now);
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type ReviewBadge = {
  label: string;
  tone: "neutral" | "info" | "warn" | "danger" | "success";
};

/**
 * Human-readable status badge for a review row. Callers use `tone` to
 * pick a colour class — the exact mapping lives in the UI shell so the
 * pure helper stays free of design tokens.
 */
export function reviewStatusBadge(
  review: Pick<CarePlanReviewRow, "status" | "scheduled_for">,
  now: Date,
): ReviewBadge {
  if (review.status === "completed") {
    return { label: "Completed", tone: "success" };
  }
  if (review.status === "skipped") {
    return { label: "Skipped", tone: "neutral" };
  }
  if (review.status === "in_progress") {
    return { label: "In progress", tone: "info" };
  }

  const scheduled = new Date(`${review.scheduled_for}T12:00:00Z`);
  if (review.status === "overdue" || isReviewOverdue(scheduled, now)) {
    return { label: "Overdue", tone: "danger" };
  }

  const daysUntil = daysBetween(now, scheduled);
  if (daysUntil <= 14) {
    return {
      label: daysUntil <= 1 ? "Due tomorrow" : `Due in ${daysUntil} days`,
      tone: "warn",
    };
  }
  return { label: `Due ${scheduled.toISOString().slice(0, 10)}`, tone: "info" };
}

// ---------------------------------------------------------------------------
// Small date helpers (deliberately not exported — implementation detail).
// ---------------------------------------------------------------------------

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromDate: Date, toDate: Date): number {
  const MS_PER_DAY = 86_400_000;
  const from = Date.UTC(
    fromDate.getUTCFullYear(),
    fromDate.getUTCMonth(),
    fromDate.getUTCDate(),
  );
  const to = Date.UTC(
    toDate.getUTCFullYear(),
    toDate.getUTCMonth(),
    toDate.getUTCDate(),
  );
  return Math.round((to - from) / MS_PER_DAY);
}
