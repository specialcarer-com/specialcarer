> **Merge note:** insert this content into `docs/cloudflare-hosting-portability.md`,
> in the "## Scheduler cutover" section, replacing/extending the existing
> "Step 1c - dbs-update-service-poll" block (currently ends at the
> "deferred deliberately, not blocked-and-forgotten" paragraph). Delete
> this file once merged.

**Step 1c blocker investigation (30 September) - grounded in a direct
code read, not just the earlier summary.** Re-read `src/lib/dbs/vendor.ts`,
`src/app/api/cron/dbs-update-service-poll/route.ts`, `src/lib/email/smtp.ts`,
and `src/lib/cron/auth.ts` before writing a plan for the three blockers
noted above. They are not three equivalent "provision a secret" tasks -
one is a real gate, two are ordinary provisioning work.

**1. `DBS_VENDOR` - the real critical-path gate, not a config flip.**
`getDbsVendor()` selects `DbsRestVendor` when `DBS_VENDOR=rest`/`ucheck`,
otherwise the in-memory mock. `DbsRestVendor` is reasonably defensive on
its own terms (10s timeout, exponential-backoff retry on 5xx, fail-fast
on 4xx, and - importantly for a safeguarding gate - unrecognised status
codes default to `in_progress`/`change_pending`, never silently to
`clear`/`approved`). But the file's own header comment is explicit: it is
built against an **assumed** endpoint contract, because "the detailed
endpoint contract is only released under a partner onboarding agreement
(≈8-12 weeks) - there is no public OpenAPI spec," with a standing
`TODO(dbs-partner-docs)` on the status-code maps (`mapDbsStatus`,
`mapDbsUpdateServiceStatus`). Setting `DBS_VENDOR=rest` today would point
real safeguarding checks at an integration nobody has verified against
the actual partner - not a decision to make casually. The real sequence:
(a) the DBS partner onboarding agreement itself is the critical-path
item, outside this repo's or this migration's control; (b) once sandbox
docs/credentials exist, confirm `vendor.ts`'s request/response shapes and
status maps against them and fix any mismatch; (c) only then set
`DBS_API_KEY`/`DBS_API_BASE`/`DBS_VENDOR=rest` on `specialcarer-preview`,
sandbox host first, production host only once approved.

**2. Email transport - ordinary provisioning, one real consequence to
name.** `sendEmail()` (`src/lib/email/smtp.ts`) tries Resend
(`RESEND_API_KEY`) first, falls back to IONOS SMTP
(`IONOS_SMTP_USER`/`PASS`), and otherwise returns `{ok: false}` silently
- exactly the gap the original prerequisite investigation found (the DBS
notification wrappers in `route.ts` don't check that return value).
Assuming a production Resend or IONOS account already exists, this is
genuinely just adding the existing production credential to
`specialcarer-preview`'s Cloudflare secrets - no new vendor relationship
needed, unlike item 1. One consequence worth naming explicitly:
`specialcarer-preview` is bound to the **same live Supabase project** as
production, so once real transport is configured there, any DBS
notification this Worker sends during the eventual Step 1c cutover test
will reach a real admin inbox or a real carer - that is the intended
verification signal for that step (the same standard Step 1b's real-data
dual-run and Phase 2's coordinated cutover tests already use), not a
side effect to guard against separately.

**3. `CRON_SECRET` - needs a copy of the existing value, not a new one.**
`requireCronAuth` (`src/lib/cron/auth.ts`) checks a single `CRON_SECRET`
env var on the app via `timingSafeEqual` against the request's bearer
token. `specialcarer-preview` already has a working value - it's what
the two live Step 1b jobs (`kpi-rollup-hourly`, `experiment-rollup`)
authenticate with right now. Step 1c's Worker
(`wrangler.step1c-dbs.jsonc`) talks to that *same* app via the same
service binding, so it needs the *same* secret value, not a new or
rotated one. The actual blocker isn't generating a secret - it's that
the existing value was never recorded anywhere retrievable (Cloudflare
secrets are write-only once set, and Step 1b's was deliberately
generated in-memory and never retained, per this doc's own Phase 2 Step
A entry). The correct fix: whoever set `specialcarer-preview`'s
`CRON_SECRET` originally, or holds it saved securely, copies that *exact*
value into the new `specialcarer-scheduler-step1c-dbs` Worker's own
secret store (`wrangler secret put CRON_SECRET --config
cloudflare/scheduler/wrangler.step1c-dbs.jsonc`, or the dashboard
equivalent) - no change to the app's own secret at all, so the two live
Step 1b schedules are never touched. Rotating the app's `CRON_SECRET`
(and both live Step 1b Worker secrets in the same window) is the riskier
fallback, warranted only if that original value is genuinely
unrecoverable.

`cloudflare/scheduler/wrangler.step1c-dbs.jsonc` and the
`specialcarer-scheduler-step1c-dbs` Worker do not exist yet; creating
them is part of the pending Step 1c build-out, which this addendum
does not document.

**Net effect on sequencing:** items 2 and 3 can be done independently,
at any time, by whoever holds the relevant credentials/values - neither
blocks or is blocked by the other. Item 1 is the actual gate on Step 1c
starting at all, and depends on a partner contract outside this repo,
not on anything resolvable through further code investigation.
