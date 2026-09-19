import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobsForSchedule, SCHEDULED_JOBS } from "./schedules";

// The three jobs approved for Phase 1 of the scheduler cutover rehearsal
// (see docs/cloudflare-hosting-portability.md, "Scheduler cutover").
// Read-only/pure-aggregation jobs only: firing twice (once from Vercel,
// once from this rehearsal Worker) causes no real-world harm. No
// financial or destructive job belongs in this list, ever.
const APPROVED_PHASE_1_PATHS = [
  "/api/cron/kpi-rollup-hourly",
  "/api/cron/experiment-rollup",
  "/api/cron/dbs-update-service-poll",
] as const;

function getRehearsalCrons(): string[] {
  const text = readFileSync("cloudflare/scheduler/wrangler.rehearsal.jsonc", "utf8");
  const stripped = text.replace(/^\s*\/\/.*$/gm, "");
  const config = JSON.parse(stripped);
  return config.triggers.crons;
}

test("the rehearsal Worker's registered cron expressions resolve to exactly the three approved Phase 1 jobs, nothing more", () => {
  const crons = getRehearsalCrons();
  const resolvedPaths = crons.flatMap((cron) => jobsForSchedule(cron));

  assert.deepEqual(
    [...resolvedPaths].sort(),
    [...APPROVED_PHASE_1_PATHS].sort(),
    "the rehearsal Worker's crons must resolve to exactly the approved Phase 1 jobs - not more, not fewer",
  );
});

test("none of the approved Phase 1 jobs' cron expressions are shared with any other (non-approved) job", () => {
  const crons = getRehearsalCrons();
  for (const cron of crons) {
    const paths = jobsForSchedule(cron);
    for (const path of paths) {
      assert.ok(
        (APPROVED_PHASE_1_PATHS as readonly string[]).includes(path),
        `cron "${cron}" also fires "${path}", which is not an approved Phase 1 job - ` +
          `registering this expression would activate an unapproved job too`,
      );
    }
  }
});

test("no financial or destructive job's cron expression appears in the rehearsal Worker's triggers, even indirectly", () => {
  const crons = new Set(getRehearsalCrons());
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
        `rehearsal Worker must never register "${job.schedule}", which fires the dangerous job "${job.path}"`,
      );
    }
  }
});
