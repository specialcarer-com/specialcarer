import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobsForSchedule, SCHEDULED_JOBS } from "./schedules";

// Step 1c: one-time coordinated cutover test for dbs-update-service-poll
// only. Not a dual-run like Step 1b's other two jobs - this job can send
// real emails on certain status transitions, so it requires Vercel's own
// cron for this exact path to be paused before this fires. See
// docs/cloudflare-hosting-portability.md, "Scheduler cutover".
const APPROVED_STEP_1C_PATH = "/api/cron/dbs-update-service-poll";

function getStep1cCrons(): string[] {
  const text = readFileSync("cloudflare/scheduler/wrangler.step1c-dbs.jsonc", "utf8");
  const stripped = text.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped).triggers.crons;
}

test("Step 1c's registered cron expressions resolve to exactly the one approved DBS-poll job, nothing more", () => {
  const crons = getStep1cCrons();
  const resolvedPaths = crons.flatMap((cron) => jobsForSchedule(cron));

  assert.deepEqual(
    resolvedPaths,
    [APPROVED_STEP_1C_PATH],
    "Step 1c's crons must resolve to exactly the one approved DBS-poll job - not more, not fewer",
  );
});

test("no financial or destructive job's cron expression appears in Step 1c's triggers, even indirectly", () => {
  const crons = new Set(getStep1cCrons());
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
      assert.ok(!crons.has(job.schedule), `Step 1c must never register "${job.schedule}", which fires "${job.path}"`);
    }
  }
});
