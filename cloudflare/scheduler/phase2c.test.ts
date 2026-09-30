import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobsForSchedule, SCHEDULED_JOBS } from "./schedules";
import { restrictToAllowlist } from "./worker";

// Phase 2 Step C: one-time coordinated cutover test for reference-reminders,
// the one Phase 2 job whose cron expression collides with a Phase 3
// financial job (run-monthly-payroll, both "0 9 * * *"). Uses
// DISPATCH_PATH_ALLOWLIST (worker.ts) to resolve that collision rather
// than an offset schedule, which the dispatcher's cron-string-based
// resolution makes impossible (see docs/cloudflare-hosting-portability.md,
// "Scheduler cutover").
const APPROVED_PHASE2C_PATHS = ["/api/cron/reference-reminders"] as const;

function getPhase2cConfig(): { crons: string[]; allowlist: string | undefined } {
  const text = readFileSync("cloudflare/scheduler/wrangler.phase2c.jsonc", "utf8");
  const parsed = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
  return { crons: parsed.triggers.crons, allowlist: parsed.vars.DISPATCH_PATH_ALLOWLIST };
}

test("Phase 2 Step C's cron genuinely collides with run-monthly-payroll at the raw jobsForSchedule level - this is the premise the allowlist exists to fix", () => {
  const { crons } = getPhase2cConfig();
  assert.deepEqual(crons, ["0 9 * * *"]);
  const rawResolution = crons.flatMap((cron) => jobsForSchedule(cron));
  assert.deepEqual(
    [...rawResolution].sort(),
    ["/api/cron/reference-reminders", "/api/cron/run-monthly-payroll"].sort(),
    "if this ever stops colliding, the allowlist may no longer be necessary - re-check before removing it",
  );
});

test("Phase 2 Step C's configured allowlist resolves that same cron down to exactly reference-reminders, nothing more", () => {
  const { crons, allowlist } = getPhase2cConfig();
  const resolvedPaths = crons.flatMap((cron) => restrictToAllowlist(jobsForSchedule(cron), allowlist));

  assert.deepEqual(
    [...resolvedPaths].sort(),
    [...APPROVED_PHASE2C_PATHS].sort(),
    "Phase 2 Step C must resolve to exactly reference-reminders once the allowlist is applied",
  );
});

test("run-monthly-payroll is never actually dispatched by Phase 2 Step C, even though its raw cron string is shared", () => {
  const { crons, allowlist } = getPhase2cConfig();
  for (const cron of crons) {
    const paths = restrictToAllowlist(jobsForSchedule(cron), allowlist);
    assert.ok(
      !paths.includes("/api/cron/run-monthly-payroll"),
      "run-monthly-payroll must never survive the allowlist filter for Phase 2 Step C",
    );
  }
});

test("no financial or destructive job's cron expression appears in Phase 2 Step C's triggers, even indirectly", () => {
  const { crons } = getPhase2cConfig();
  const cronSet = new Set(crons);
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
    if (dangerousPaths.includes(job.path) && job.path !== "/api/cron/run-monthly-payroll") {
      assert.ok(
        !cronSet.has(job.schedule),
        `Phase 2 Step C must never register "${job.schedule}", which fires "${job.path}"`,
      );
    }
  }
  // run-monthly-payroll is handled by the two tests above (it DOES share
  // the raw cron string by design - the allowlist is what excludes it).
});
