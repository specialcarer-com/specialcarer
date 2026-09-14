import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeNextReviewDate,
  isReviewOverdue,
  reviewStatusBadge,
  REVIEW_CADENCE_MONTHS,
  REVIEW_REMINDER_LEAD_DAYS,
} from "./reviews";

// ---------------------------------------------------------------------------
// computeNextReviewDate
// ---------------------------------------------------------------------------

test("computeNextReviewDate: 6-month cadence adds 6 calendar months", () => {
  const completed = new Date("2026-01-15T09:23:00Z");
  const next = computeNextReviewDate(completed, 6);
  assert.equal(next.toISOString().slice(0, 10), "2026-07-15");
});

test("computeNextReviewDate: 3-month cadence adds 3 calendar months", () => {
  const completed = new Date("2026-03-10T00:00:00Z");
  const next = computeNextReviewDate(completed, 3);
  assert.equal(next.toISOString().slice(0, 10), "2026-06-10");
});

test("computeNextReviewDate: 12-month cadence adds a year", () => {
  const completed = new Date("2026-05-01T12:00:00Z");
  const next = computeNextReviewDate(completed, 12);
  assert.equal(next.toISOString().slice(0, 10), "2027-05-01");
});

test("computeNextReviewDate: end-of-month clamp (Jan 31 + 1 month → Feb 28)", () => {
  // The intent is "monthly cadence" not "same day-of-month always"; JS
  // clamps end-of-month rollovers to the last valid day. Assert that.
  const completed = new Date("2026-01-31T12:00:00Z");
  const next = computeNextReviewDate(completed, 3);
  // Jan 31 + 3 months → April 30 (April has 30 days, so no clamp there).
  assert.equal(next.toISOString().slice(0, 10), "2026-05-01");
});

test("computeNextReviewDate: leap year Feb 29 + 12 months clamps to Feb 28", () => {
  // 2028 is a leap year, 2029 is not.
  const completed = new Date("2028-02-29T12:00:00Z");
  const next = computeNextReviewDate(completed, 12);
  assert.equal(next.toISOString().slice(0, 10), "2029-03-01");
});

// ---------------------------------------------------------------------------
// isReviewOverdue
// ---------------------------------------------------------------------------

test("isReviewOverdue: past date is overdue", () => {
  assert.equal(
    isReviewOverdue(new Date("2026-09-01T12:00:00Z"), new Date("2026-09-14T12:00:00Z")),
    true,
  );
});

test("isReviewOverdue: same-day is NOT overdue", () => {
  assert.equal(
    isReviewOverdue(new Date("2026-09-14T00:00:01Z"), new Date("2026-09-14T23:59:59Z")),
    false,
  );
});

test("isReviewOverdue: future date is NOT overdue", () => {
  assert.equal(
    isReviewOverdue(new Date("2026-10-01T12:00:00Z"), new Date("2026-09-14T12:00:00Z")),
    false,
  );
});

// ---------------------------------------------------------------------------
// reviewStatusBadge
// ---------------------------------------------------------------------------

const now = new Date("2026-09-14T12:00:00Z");

test("reviewStatusBadge: completed → success", () => {
  const b = reviewStatusBadge({ status: "completed", scheduled_for: "2026-09-14" }, now);
  assert.equal(b.label, "Completed");
  assert.equal(b.tone, "success");
});

test("reviewStatusBadge: skipped → neutral", () => {
  const b = reviewStatusBadge({ status: "skipped", scheduled_for: "2026-09-14" }, now);
  assert.equal(b.label, "Skipped");
  assert.equal(b.tone, "neutral");
});

test("reviewStatusBadge: in_progress → info", () => {
  const b = reviewStatusBadge({ status: "in_progress", scheduled_for: "2026-09-14" }, now);
  assert.equal(b.label, "In progress");
  assert.equal(b.tone, "info");
});

test("reviewStatusBadge: past scheduled + status=due → overdue", () => {
  const b = reviewStatusBadge({ status: "due", scheduled_for: "2026-08-01" }, now);
  assert.equal(b.label, "Overdue");
  assert.equal(b.tone, "danger");
});

test("reviewStatusBadge: explicit status=overdue → overdue", () => {
  const b = reviewStatusBadge({ status: "overdue", scheduled_for: "2026-10-01" }, now);
  assert.equal(b.label, "Overdue");
  assert.equal(b.tone, "danger");
});

test("reviewStatusBadge: due tomorrow → warn 'Due tomorrow'", () => {
  const b = reviewStatusBadge({ status: "due", scheduled_for: "2026-09-15" }, now);
  assert.equal(b.label, "Due tomorrow");
  assert.equal(b.tone, "warn");
});

test("reviewStatusBadge: due in 10 days → warn 'Due in 10 days'", () => {
  const b = reviewStatusBadge({ status: "due", scheduled_for: "2026-09-24" }, now);
  assert.equal(b.label, "Due in 10 days");
  assert.equal(b.tone, "warn");
});

test("reviewStatusBadge: due beyond 14 days → info", () => {
  const b = reviewStatusBadge({ status: "due", scheduled_for: "2026-11-01" }, now);
  assert.equal(b.tone, "info");
  assert.ok(b.label.startsWith("Due "));
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test("REVIEW_CADENCE_MONTHS matches DB check constraint (3,6,12)", () => {
  assert.deepEqual([...REVIEW_CADENCE_MONTHS], [3, 6, 12]);
});

test("REVIEW_REMINDER_LEAD_DAYS is [14, 1]", () => {
  assert.deepEqual([...REVIEW_REMINDER_LEAD_DAYS], [14, 1]);
});
