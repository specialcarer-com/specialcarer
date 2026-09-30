> **Merge note:** insert this content into `docs/cloudflare-hosting-portability.md`,
> in the "## Scheduler cutover" section, immediately after the existing
> "Step C - `reference-reminders`" block and before "## Remaining gates and
> next order". Delete this file once merged.

**Phase 3 Step A — five confirmed-idempotent jobs, config ready, not yet
deployed or triggered (30 September).** Re-reading all ten Phase 3
candidate routes' actual code (not just their names) before writing any
config found real claim/idempotency guards on five of them:

- `release-payouts`: a conditional-UPDATE claim
  (`paymentCaptureClaimFilter()`) runs before any Stripe capture; a second
  invocation finds nothing left to claim.
- `release-org-payouts`: does not move money at all - assembles
  `org_carer_payouts` batch rows via an idempotent upsert on
  `(carer_id, period_start)` only. The actual BACS transfer is manual,
  done by finance.
- `refund-reconciler`: sweeps stuck refund claims back to a terminal
  state; its secondary ledger/cache discrepancy check only logs, never
  auto-corrects ("ledger is authoritative, cache is stale").
- `refund-reconciliation`: a distinct job from `refund-reconciler` above -
  folds `refund_ledger` events into a separate `refund_reconciliation`
  state-machine table, with deploy-safe handling for a not-yet-migrated
  schema (Postgres `42P01`/`42703`).
- `finalise-org-invoices`: a `finalising` intermediate state guards
  against double-finalizing the same invoice batch, with revert-on-error.

Two of these five share an exact cron expression with a job that has
**not** been cleared: `refund-reconciler`'s `*/15 * * * *` is also
`stripe-webhook-recovery`'s and `dsar-fulfil`'s; `refund-reconciliation`'s
`0 * * * *` is also `account-deletion-worker`'s (which performs real
erasure when `NEXT_PUBLIC_SELF_SERVICE_DELETION_ENABLED` is on).
`DISPATCH_PATH_ALLOWLIST` isn't new here - Phase 2 Step C already used it
for the single-path `reference-reminders`/`run-monthly-payroll` collision
- but this is the first config where it carries more than one path and
resolves more than one collision at once.
`cloudflare/scheduler/wrangler.phase3a.jsonc` sets the allowlist to
exactly the five approved paths; `phase3a.test.ts` proves mechanically
that the allowlist is doing real filtering work (asserts the three
excluded jobs *would* leak through without it, and confirms they don't
with it applied), the same way `phase2c.test.ts` did for its one path.

**Open decision, not yet made: dual-run or coordinated cutover.** This
document's existing Phase 3 policy above reads "instantaneous cutover
only, never overlapping" for the whole financial/destructive category -
written before any Phase 3 job's code had been read line-by-line. Having
now read these five, each does appear to tolerate a genuine overlap
safely on its own merits, the same way Step 1b's two jobs did. That is a
**proposed** reclassification, not a decision taken here:
`wrangler.phase3a.jsonc` is deliberately framed and tested the same
conservative way as Phase 2 Step A/B (pause Vercel's matching cron paths
first, fire this Worker once, observe, then either make it permanent or
tear it down) rather than registered as an ongoing dual-run, until a
human explicitly signs off on treating these five as dual-run-safe
instead - see the file's own header comment for the full per-job
reasoning. Not deployed or triggered as of this commit.

**Not included in this batch, on purpose:** the other five Phase 3 jobs
(`run-monthly-payroll`, `stripe-webhook-recovery`,
`account-deletion-worker`, `dsar-fulfil`, `dsar-retention-sweep`) still
need their own review before any Cloudflare config is written for them -
`dsar-retention-sweep` in particular performs hard deletes/nulls on
production tables with no visible claim/lock pattern and needs its own
hardening step, not folding into a later batch by default.
