import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobsForSchedule, SCHEDULED_JOBS } from "./schedules";

// Phase 2 Step A: one-time coordinated cutover test for the two Phase 2
// jobs confirmed to have at least a partial idempotency guard
// (reminder_sent_at / last_reminded_at) and a cron expression not shared
// with any other job. Not a dual-run - Vercel's own crons for these two
// exact paths must be paused before this fires. See
// docs/cloudflare-hosting-portability.md, "Scheduler cutover".
const APPROVED_PHASE2A_PATHS = [
  "/api/cron/care-plan-review-reminder",
  "/api/cron/timesheet-reminders",
] as const;

// Deliberately excluded, not merely absent - each needs separate handling
// before it can be added to a batch like this one:
//   - booking-reminders: no idempotency guard at all (route.ts's own
//     comment admits it - a follow-up dedupe column was never added).
//   - payout-digest-weekly: no idempotency guard at all (recomputes a
//     fresh rolling 7-day window every run, no "sent" marker).
//   - reference-reminders: shares its exact cron expression, "0 9 * * *",
//     with run-monthly-payroll (a Phase 3 financial job) - jobsForSchedule
//     resolves every job sharing a cron string, so registering this
//     trigger as-is would silently also invoke payroll. Needs an offset
//     schedule (or a dispatcher change) before it can be touched at all.
// These tests guard against any of the three being added back here
// without that decision being revisited.
const DELIBERATELY_EXCLUDED_PATHS = [
  "/api/cron/booking-reminders",
  "/api/cron/payout-digest-weekly",
  "/api/cron/reference-reminders",
] as const;

function getPhase2aCrons(): string[] {
  const text = readFileSync("cloudflare/scheduler/wrangler.phase2a.jsonc", "utf8");
  const stripped = text.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped).triggers.crons;
}

test("Phase 2 Step A's registered cron expressions resolve to exactly the two approved reminder jobs, nothing more", () => {
  const crons = getPhase2aCrons();
  const resolvedPaths = crons.flatMap((cron) => jobsForSchedule(cron));

  assert.deepEqual(
    [...resolvedPaths].sort(),
    [...APPROVED_PHASE2A_PATHS].sort(),
    "Phase 2 Step A's crons must resolve to exactly the two approved jobs - not more, not fewer",
  );
});

test("none of the three deliberately-excluded Phase 2 jobs are reachable from Phase 2 Step A, even indirectly via a shared cron expression", () => {
  const crons = getPhase2aCrons();
  for (const cron of crons) {
    const paths = jobsForSchedule(cron);
    for (const excluded of DELIBERATELY_EXCLUDED_PATHS) {
      assert.ok(
        !paths.includes(excluded),
        `cron "${cron}" fires "${excluded}", which was deliberately excluded from Phase 2 Step A ` +
          `(see docs/cloudflare-hosting-portability.md, "Scheduler cutover")`,
      );
    }
  }
});

test("no financial or destructive job's cron expression appears in Phase 2 Step A's triggers, even indirectly", () => {
  const crons = new Set(getPhase2aCrons());
  const dangerousPaths = [
    "/api/cron/release-payouts",
    "/api/cron/release-org-payouts",
    "/api/cron/run-monthly-payroll",
    "/api/cron/refund-reconciler",
    "/api/cron/refund-reconciliation",
    "/api/cron/account-deletion-worker",
    "/api/cron/dsar-fulfil",
    "/api/cron/stripe-webhook-recovery",
  ];
  for (const job of SCHEDULED_JOBS) {
    if (dangerousPaths.includes(job.path)) {
      assert.ok(
        !crons.has(job.schedule),
        `Phase 2 Step A must never register "${job.schedule}", which fires "${job.path}"`,
      );
    }
  }
});
