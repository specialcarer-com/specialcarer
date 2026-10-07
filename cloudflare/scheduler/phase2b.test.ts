import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobsForSchedule, SCHEDULED_JOBS } from "./schedules";

// Phase 2 Step B: one-time coordinated cutover test for the two Phase 2
// jobs with NO idempotency guard at all. Zero tolerance for overlap with
// Vercel - not a dual-run. See wrangler.phase2b.jsonc and
// docs/cloudflare-hosting-portability.md, "Scheduler cutover".
const APPROVED_PHASE2B_PATHS = [
  "/api/cron/booking-reminders",
  "/api/cron/payout-digest-weekly",
] as const;

// Deliberately excluded, not merely absent - each already has, or needs,
// separate handling:
//   - care-plan-review-reminder, timesheet-reminders: handled in Phase 2
//     Step A instead (partial idempotency guard, different batch).
//   - reference-reminders: shares its exact cron expression, "0 9 * * *",
//     with run-monthly-payroll (a Phase 3 financial job) - needs an
//     offset schedule before it can be touched at all.
const DELIBERATELY_EXCLUDED_PATHS = [
  "/api/cron/care-plan-review-reminder",
  "/api/cron/timesheet-reminders",
  "/api/cron/reference-reminders",
] as const;

function getPhase2bCrons(): string[] {
  const text = readFileSync("cloudflare/scheduler/wrangler.phase2b.jsonc", "utf8");
  const stripped = text.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped).triggers.crons;
}

test("Phase 2 Step B's registered cron expressions resolve to exactly the two approved zero-guard jobs, nothing more", () => {
  const crons = getPhase2bCrons();
  const resolvedPaths = crons.flatMap((cron) => jobsForSchedule(cron));

  assert.deepEqual(
    [...resolvedPaths].sort(),
    [...APPROVED_PHASE2B_PATHS].sort(),
    "Phase 2 Step B's crons must resolve to exactly the two approved jobs - not more, not fewer",
  );
});

test("none of the three jobs handled elsewhere are reachable from Phase 2 Step B, even indirectly via a shared cron expression", () => {
  const crons = getPhase2bCrons();
  for (const cron of crons) {
    const paths = jobsForSchedule(cron);
    for (const excluded of DELIBERATELY_EXCLUDED_PATHS) {
      assert.ok(
        !paths.includes(excluded),
        `cron "${cron}" fires "${excluded}", which belongs to a different batch ` +
          `(see docs/cloudflare-hosting-portability.md, "Scheduler cutover")`,
      );
    }
  }
});

test("no financial or destructive job's cron expression appears in Phase 2 Step B's triggers, even indirectly", () => {
  const crons = new Set(getPhase2bCrons());
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
        `Phase 2 Step B must never register "${job.schedule}", which fires "${job.path}"`,
      );
    }
  }
});
