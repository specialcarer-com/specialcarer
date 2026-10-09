/**
 * Regression test for a real Rules-of-Hooks bug: useCountdown() used to be
 * called only inside the "pending" render branch, after an early return for
 * approved/disputed timesheets. If a mounted card's status ever changed
 * between renders, that mismatched hook count between renders is exactly
 * what React's Rules of Hooks exist to prevent — at best a hard "Rendered
 * fewer hooks than expected" error, at worst silently misattributed hook
 * state. The fix moves the hook call above the early return so it runs
 * unconditionally on every render.
 *
 * NOTE: unlike this repo's hosting/* tests (which use only Node builtins),
 * the render checks below need the real `react` and `react-dom` packages
 * installed to execute — this still cannot be run in the sandbox that
 * authored it (no node_modules there). The first version of this file had
 * two real bugs, both found and fixed after an actual run reported them:
 * a path relative to the test file's own directory instead of the repo
 * root (this project's established convention), and a missing `React`
 * import in TimesheetReviewCard.tsx itself (needed because this file has
 * no automatic-JSX-runtime import, so running it outside Next's own build
 * — e.g. directly via tsx/esbuild — falls back to the classic transform,
 * which needs React in scope; see the import in TimesheetReviewCard.tsx
 * for the full explanation). Please actually run this again and confirm a
 * real pass — don't take this fix as verified until it's been executed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimesheetReviewCard, type TimesheetRow } from "./TimesheetReviewCard";

function makeRow(overrides: Partial<TimesheetRow>): TimesheetRow {
  return {
    id: "ts_1",
    booking_id: "bk_1",
    booking_source: "seeker",
    status: "pending_approval",
    submitted_at: "2026-09-18T10:00:00.000Z",
    actual_start: "2026-09-18T08:00:00.000Z",
    actual_end: "2026-09-18T10:00:00.000Z",
    actual_minutes: 120,
    booked_minutes: 120,
    hourly_rate_cents: 1500,
    currency: "GBP",
    overage_minutes: 0,
    overage_cents: 0,
    overage_requires_approval: false,
    overage_cap_reason: null,
    overtime_minutes: 0,
    overtime_cents: 0,
    gps_verified: true,
    forced_check_in: false,
    forced_check_out: false,
    tasks_completed: null,
    carer_notes: null,
    carer_photos: null,
    auto_approve_at: "2026-09-20T10:00:00.000Z",
    approved_at: null,
    dispute_reason: null,
    dispute_opened_at: null,
    pending_adjustment_id: null,
    ...overrides,
  };
}

const baseProps = {
  pendingAdjustment: null,
  isOrgView: false,
  onChanged: () => {},
};

test("useCountdown is called unconditionally, above the early return — not inline in the pending-only branch", () => {
  const source = readFileSync("src/app/m/_components/TimesheetReviewCard.tsx", "utf8");
  const hookCallIndex = source.indexOf("useCountdown(ts.auto_approve_at)");
  const earlyReturnIndex = source.indexOf("if (!isPending)");
  assert.ok(hookCallIndex > -1, "useCountdown call site not found");
  assert.ok(earlyReturnIndex > -1, "early return not found");
  assert.ok(
    hookCallIndex < earlyReturnIndex,
    "useCountdown must be called before the early return, not after it in the pending-only branch",
  );
});

test("renders without throwing for an approved (early-return) row", () => {
  const row = makeRow({ status: "approved" });
  assert.doesNotThrow(() => renderToStaticMarkup(h(TimesheetReviewCard, { ts: row, ...baseProps })));
});

test("renders without throwing for a disputed (early-return) row", () => {
  const row = makeRow({ status: "disputed", dispute_reason: "Hours don't match" });
  assert.doesNotThrow(() => renderToStaticMarkup(h(TimesheetReviewCard, { ts: row, ...baseProps })));
});

test("renders without throwing for a pending row (the branch that always called the hook)", () => {
  const row = makeRow({ status: "pending_approval" });
  assert.doesNotThrow(() => renderToStaticMarkup(h(TimesheetReviewCard, { ts: row, ...baseProps })));
});
