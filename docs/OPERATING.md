# Operating notes

Working rules for anyone, human or AI, changing this repo. Kept short on purpose.

## Changes

- Work on a branch and open a PR. The owner reviews and merges.
- Required checks on `main`: Vercel, CodeRabbit, typecheck, no-bespoke-limiters, test. Six known failing tests are allow-listed; do not add to that list without saying so in the PR.
- `typescript.ignoreBuildErrors` is still true in `next.config.ts` because of an earlier Vercel type-check hang. Run `tsc` yourself; the build will not catch type errors.
- Keep PRs small and say in the description what was verified and how.

## Database migrations

They apply automatically when merged to main.

- Check column and table names against the live schema before writing SQL.
- Destructive SQL needs `Allow-Destructive: true` in the PR so the preflight lets it through.
- Do not use `DROP POLICY IF EXISTS`. Do not use `||` inside DDL string literals.
- Roles are only `seeker`, `caregiver`, `admin`. Code marked `TODO(rm-ni-split)` is waiting on a later decision.

## Personal data

- `src/lib/dsar/data-map.ts` records a decision for every table: exported, deferred, excluded or not personal. Add a row when you add a table.
- The subject access export lives in `src/lib/dsar/export.ts`. Bump its version when its output changes.
- Retention for minors' safeguarding records is undecided. Do not build erasure for them until it is.

## Scheduled jobs

- Jobs are listed in `vercel.json`. `cloudflare/scheduler/schedules.ts` mirrors them for a possible move; a test fails if they differ.
- A job file existing in `src/app/api/cron` does not mean it runs. Only listed jobs run.
- The four `ai-*` jobs are deliberately not registered.
- Avoid sharing a cron expression with a job from another phase, because Cloudflare fans one expression out to every job on it.

## Feature flags

Several features are behind `NEXT_PUBLIC_*` flags. The live values are in Vercel, not in this repo. Check them there before saying a feature is on or off. Do not read secret values.

## Money

- Platform fee is 30%.
- Stripe production may still be in test mode. Check before describing payments as live.

## Things not to do without the owner saying so

Change DNS or nameservers; rotate or revoke credentials; merge; delete production data; enable a paid tier; add write access for any connector.
