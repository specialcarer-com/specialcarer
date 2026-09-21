import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobsForSchedule, SCHEDULED_JOBS } from "./schedules";

// Step 1b: real secrets, real data, dual-run against Vercel with zero
// coordination needed — restricted to jobs confirmed purely idempotent
// with no external side effects (pure DB read+upsert, no emails, no
// vendor calls). See docs/cloudflare-hosting-portability.md, "Scheduler
// cutover".
const APPROVED_STEP_1B_PATHS = ["/api/cron/kpi-rollup-hourly", "/api/cron/experiment-rollup"] as const;

// Deliberately excluded, not merely absent: this job can send real emails
// to real carers/admins on certain status transitions, which is not
// idempotent the way a database upsert is. Excluding it from Step 1b is a
// decision, not an oversight — this test guards against it being added
// back here without that decision being revisited.
const DELIBERATELY_EXCLUDED_PATH = "/api/cron/dbs-update-service-poll";

function getStep1bCrons(): string[] {
  const text = readFileSync("cloudflare/scheduler/wrangler.step1b.jsonc", "utf8");
  const stripped = text.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped).triggers.crons;
}

test("Step 1b's registered cron expressions resolve to exactly the two approved idempotent jobs, nothing more", () => {
  const crons = getStep1bCrons();
  const resolvedPaths = crons.flatMap((cron) => jobsForSchedule(cron));

  assert.deepEqual(
    [...resolvedPaths].sort(),
    [...APPROVED_STEP_1B_PATHS].sort(),
    "Step 1b's crons must resolve to exactly the two approved jobs - not more, not fewer",
  );
});

test("dbs-update-service-poll is never reachable from Step 1b, even indirectly via a shared cron expression", () => {
  const crons = getStep1bCrons();
  for (const cron of crons) {
    const paths = jobsForSchedule(cron);
    assert.ok(
      !paths.includes(DELIBERATELY_EXCLUDED_PATH),
      `cron "${cron}" fires "${DELIBERATELY_EXCLUDED_PATH}", which was deliberately excluded from Step 1b ` +
        `(it can send real emails to real people - see docs/cloudflare-hosting-portability.md)`,
    );
  }
});

test("no financial or destructive job's cron expression appears in Step 1b's triggers, even indirectly", () => {
  const crons = new Set(getStep1bCrons());
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
      assert.ok(!crons.has(job.schedule), `Step 1b must never register "${job.schedule}", which fires "${job.path}"`);
    }
  }
});
