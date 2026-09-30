import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { jobsForSchedule, SCHEDULED_JOBS } from "./schedules";
import { restrictToAllowlist } from "./worker";

// Phase 3 Step A: the five financial/destructive jobs confirmed (by direct
// code read, 30 September) to carry a real claim/idempotency guard -
// release-payouts, release-org-payouts, refund-reconciler,
// refund-reconciliation, finalise-org-invoices. Framed and tested the same
// conservative way as Phase 2 Step A/B (one-time coordinated cutover test,
// not yet approved as a true dual-run) pending explicit sign-off to
// reclassify - see wrangler.phase3a.jsonc and
// docs/cloudflare-hosting-portability.md, "Scheduler cutover".
const APPROVED_PHASE3A_PATHS = [
  "/api/cron/release-payouts",
  "/api/cron/release-org-payouts",
  "/api/cron/refund-reconciler",
  "/api/cron/refund-reconciliation",
  "/api/cron/finalise-org-invoices",
] as const;

// Deliberately excluded, not merely absent - each shares an exact cron
// expression with one of these five and is filtered out only by this
// Worker's DISPATCH_PATH_ALLOWLIST, not by anything in the shared
// schedule map:
//   - stripe-webhook-recovery and dsar-fulfil share "*/15 * * * *" with
//     refund-reconciler.
//   - account-deletion-worker shares "0 * * * *" with
//     refund-reconciliation, and performs real erasure when its feature
//     flag is on.
// None of the three has been cleared for Phase 3 yet. Phase 2 Step C
// already established DISPATCH_PATH_ALLOWLIST as a real mechanism (for
// the single-path reference-reminders/run-monthly-payroll collision) -
// this is the first config carrying more than one path and resolving
// more than one collision at once, not the first time the allowlist is
// used at all. These tests prove it really does the filtering job its
// config comment claims, the same way phase2c.test.ts did for its one
// path.
const DELIBERATELY_EXCLUDED_PATHS = [
  "/api/cron/stripe-webhook-recovery",
  "/api/cron/dsar-fulfil",
  "/api/cron/account-deletion-worker",
] as const;

// Still not cleared at all, and not reachable via any of these five
// crons anyway - the same standing financial/destructive denylist used
// by every prior phase's test file.
const DANGEROUS_PATHS = [
  "/api/cron/release-payouts",
  "/api/cron/release-org-payouts",
  "/api/cron/run-monthly-payroll",
  "/api/cron/refund-reconciler",
  "/api/cron/refund-reconciliation",
  "/api/cron/account-deletion-worker",
  "/api/cron/dsar-fulfil",
  "/api/cron/stripe-webhook-recovery",
  "/api/cron/dsar-retention-sweep",
] as const;

function getPhase3aConfig(): { crons: string[]; allowlist: string | undefined } {
  const text = readFileSync("cloudflare/scheduler/wrangler.phase3a.jsonc", "utf8");
  const stripped = text.replace(/^\s*\/\/.*$/gm, "");
  const parsed = JSON.parse(stripped);
  return { crons: parsed.triggers.crons, allowlist: parsed.vars.DISPATCH_PATH_ALLOWLIST };
}

test("Phase 3 Step A's registered cron expressions, resolved and allowlist-filtered exactly as the Worker would at runtime, produce exactly the five approved jobs - not more, not fewer", () => {
  const { crons, allowlist } = getPhase3aConfig();
  const resolvedPaths = crons.flatMap((cron) => restrictToAllowlist(jobsForSchedule(cron), allowlist));

  assert.deepEqual(
    [...new Set(resolvedPaths)].sort(),
    [...APPROVED_PHASE3A_PATHS].sort(),
    "Phase 3 Step A's crons, after allowlist filtering, must resolve to exactly the five approved jobs",
  );
});

test("without the allowlist, the raw cron expressions would ALSO resolve the three excluded jobs - proving the allowlist is load-bearing here, not redundant", () => {
  const { crons } = getPhase3aConfig();
  const rawResolvedPaths = crons.flatMap((cron) => jobsForSchedule(cron));
  for (const excluded of DELIBERATELY_EXCLUDED_PATHS) {
    assert.ok(
      rawResolvedPaths.includes(excluded),
      `expected "${excluded}" to share a cron expression with one of the five approved jobs ` +
        "(if this assumption no longer holds, the allowlist requirement should be re-reviewed, " +
        "not just left in place out of habit)",
    );
  }
});

test("with the allowlist applied, none of the three jobs sharing a cron expression with this batch are reachable, even indirectly", () => {
  const { crons, allowlist } = getPhase3aConfig();
  for (const cron of crons) {
    const paths = restrictToAllowlist(jobsForSchedule(cron), allowlist);
    for (const excluded of DELIBERATELY_EXCLUDED_PATHS) {
      assert.ok(
        !paths.includes(excluded),
        `cron "${cron}" resolves "${excluded}" even after allowlist filtering - the allowlist in ` +
          "wrangler.phase3a.jsonc no longer matches what its own comment claims",
      );
    }
  }
});

test("no not-yet-cleared financial or destructive job's cron expression appears in Phase 3 Step A's triggers, even indirectly", () => {
  const { crons } = getPhase3aConfig();
  const cronSet = new Set(crons);
  const approvedSet = new Set<string>(APPROVED_PHASE3A_PATHS);
  for (const job of SCHEDULED_JOBS) {
    if (DANGEROUS_PATHS.includes(job.path as (typeof DANGEROUS_PATHS)[number]) && !approvedSet.has(job.path)) {
      assert.ok(
        !cronSet.has(job.schedule),
        `Phase 3 Step A must never register "${job.schedule}", which fires "${job.path}"`,
      );
    }
  }
});
