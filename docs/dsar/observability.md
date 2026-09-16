# Cron observability convention

Every cron in `src/app/api/cron/**` must emit a summary log line at
the end of a tick, in the same shape as the working examples:

```text
[cron.<name>] scanned N, <verb1> M, <verb2> K, errors E
```

Examples in prod today (working):

- `[cron.refund-reconciler] scanned N, completed M, failed F, still_pending P, errors E`
- `[cron.stripe-webhook-recovery] scanned N, recovered M, still_failing F, poisoned P, errors E`
- `[cron.dsar-fulfil] scanned N, delivered M, resolved R, skipped_no_user K, errors E` — added in F1a (this PR)

Rationale: without a per-tick summary the only Vercel signal is HTTP
200 vs 500 on `/api/cron/<name>`. Debugging why a cron isn't making
progress — no rows to scan, all rows filtered by a stale branch,
downstream failure eating each row — takes hours. On 15 Sep 2026 a
missing log line on `dsar-fulfil` cost ~3 hours to diagnose a
one-line bug.

## Known silent offenders (do NOT fix in this PR)

The following crons currently emit no `[cron.<name>]` summary line
and should be brought into line in follow-up PRs (one per cron, or
grouped by domain). This PR is deliberately surgical and only fixes
`dsar-fulfil`. To reproduce the list, `grep -L "\[cron\." src/app/api/cron/*/route.ts`
against the schedules registered in `vercel.json`.

- `dsar-fulfil` — **fixed in F1a (this PR)**
- `dsar-retention-sweep`
- `account-deletion-worker`
- `dbs-change-allocations`
- `payout-digest-weekly`
- `care-plan-review-reminder`
- `expire-agency-optin-grace`
- `reference-reminders`
- `dbs-update-service-poll`
- `dbs-update-service-reminder`
- `kpi-rollup-hourly`

(11 offenders. Sourced from the F1 discovery pass; the working notes
for Phase F are kept outside the repository by the RI — mirror them
into `docs/roadmap/` or a GitHub issue when a follow-up PR is opened.)

## Style guide

- Use `console.log` for the summary; use `console.warn` /
  `console.error` for anomalies or failures inside the tick
- Prefix every log line the cron emits with `[cron.<name>]` so
  Vercel log filters catch them
- Tally from a single `results[]` array rather than counting inline
  so tests can assert the counts independently of the log line
- Emit the summary line **once per tick**, at the end of the GET
  handler, after the batch is processed — never per row
- Include a summary line even on the empty-queue path
  (`scanned 0, ...`) so absence of the line always means "cron
  didn't run" rather than "cron ran but found nothing"

## Related

- `docs/dsar/smoke-test.md` — how to verify the DSAR log line in prod
- Sentry alerting for `sendEmail` failures is a separate follow-up
  (see Phase F plan session-carried observability tracker item 1) —
  intentionally out of scope for this PR
