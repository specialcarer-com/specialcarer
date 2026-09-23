# Hosting portability: local implementation and environment contract

Status: local changes only; no deployment, credentials, DNS or schedules activated.
The previous uploaded compatibility build predates these changes. A new local
Node 22 synthetic OpenNext build, Wrangler dry-run, full post-build typecheck
and hosting tests have passed; this candidate is not deployed or configured
for production. Vercel remains the production host and scheduler.

## Bounded changes

### Immutable contracts

`src/contracts/*.md` remains the authoritative, versioned legal text. The
build-time `scripts/sync-contracts.mjs` writes `markdown.generated.ts` with
deterministically ordered UTF-8 strings; it does not normalise newlines, Unicode
or whitespace. `registry.ts` performs validated in-memory lookup. The existing
server-only entry point, versions, types and labels are retained.

```sh
npm run contracts:sync   # after intentionally adding/changing a source version
npm run contracts:check  # read-only; rejects missing/stale generated content
npm run test:hosting
```

Commit/review the generated file alongside its sources. Do not modify historical
contract versions in place. `prebuild` and `cf:build` check freshness; generation
does not run silently during a build. Tests compare every contract's exact bytes.
There is no longer a runtime filesystem dependency for contract Markdown.

### Provider-neutral production policy

Both existing production-only gates (`/m/dev/cards` and the onboarding design
review bypass) use `src/lib/hosting/environment.ts`. This changes no product
layout or production authorisation flow.

| Variable | When supplied | Meaning |
| --- | --- | --- |
| `APP_ENV` | App runtime, server-only | Explicit `production`, `preview` or `development`; overrides `VERCEL_ENV`. Checked-in app Wrangler config is `preview`. |
| `VERCEL_ENV` | Existing Vercel runtime | Fallback when `APP_ENV` is absent/empty; existing production stays closed and explicit previews remain distinct. |
| `NODE_ENV` | Framework build/runtime | Only fallback local `development`/`test` permits development UI. Missing or other values fail closed as production. A production build can still be an explicit preview. |
| `NEXT_PUBLIC_APP_ENV` | Next build | Existing client-facing flag; **not** the server deployment policy. |

Unknown non-empty `APP_ENV`/`VERCEL_ENV` values fail closed. Do not set
`APP_ENV=development` on a production deployment; `.env.example` is a local
example, not a production configuration.

### Static delivery

`public/_headers` gives only `/_next/static/*` browser caching of
`public, max-age=31536000, immutable`. It does not change app/API HTML, public
unversioned media, private content or server cache behaviour.
`public/.assetsignore` excludes `**/*.map`. OpenNext copies these controls into
its assets output; Wrangler interprets them during upload.

A direct-API uploader must also honour exclusions and pass the raw `_headers`
text as `metadata.assets.config._headers`. Uploading the control files as
ordinary assets is not equivalent. The rebuilt local output has both controls
verified; the previously uploaded bundle is unchanged.

### Separate, disabled scheduler

`cloudflare/scheduler/schedules.ts` explicitly lists the **existing 26**
`vercel.json` paths across **21** distinct UTC expressions. Its test enforces
exact equality, including shared expressions. The seven other cron route files
are deliberately not added.

`cloudflare/scheduler/worker.ts` uses only the `APP` service binding, not public
network `fetch`, to issue GETs with `Authorization: Bearer <CRON_SECRET>`.
Redirects are not followed. The HTTP handler always returns 404 and cannot
trigger jobs. No application route or business logic is changed.

| Scheduler setting | Required for a future approved activation |
| --- | --- |
| `APP_ENV` | Exactly `production`; no Vercel fallback for this separate Worker. |
| `SCHEDULER_ENABLED` | Exactly the string `true`; defaults off. |
| `APP` | Explicit service binding to the approved application Worker. Checked-in destination is the isolated `specialcarer-preview`. |
| `APP_ORIGIN` | Exact HTTPS origin, without trailing slash/path/query/credentials, e.g. `https://www.specialcarer.com`; maintains the app's URL context. Requests still use the service binding, not DNS. |
| `CRON_SECRET` | Runtime secret matching the application's runtime `CRON_SECRET`; never a plain-text var or build input. Missing/invalid configuration fails closed. |
| Cron triggers | **None checked in.** Expressions must be installed separately only after a single-scheduler cutover decision. A map is not an active trigger. |

Concurrency is bounded to two requests **per invocation**, not globally.
Each request has a 330-second abort deadline; the largest group has three jobs.
No dispatcher retries, replay mechanism or persistence is introduced. A timeout
does not prove the application stopped or did not commit a side effect.
Overlapping cron invocations still require the existing route-specific
claim/idempotency controls; do not assume this dispatcher provides a global lock.
Before activation, validate service-binding cancellation, scheduled-event wall
time/CPU and trigger-count limits on the intended account/plan.

Logs contain only fixed allowlisted paths, outcome labels and HTTP status (or
null). They do not include request headers, secrets, URLs, response bodies or
exception text. Non-2xx/transport/configuration failures mark the scheduled event
failed with a generic error. A 2xx result is a transport result, **not** proof that
every business operation succeeded; reconcile existing job ledgers separately.

`cloudflare/scheduler/wrangler.jsonc` has `workers_dev=false`,
`preview_urls=false`, `APP_ENV=preview`, `SCHEDULER_ENABLED=false` and an empty
cron list. No deploy command is added to the app build. Do not enable deletion,
payroll, payout, refund or other jobs as part of a preview smoke test.

### Trusted client IP

`src/lib/hosting/client-ip.ts` replaces six duplicated inline readers of
`x-forwarded-for` (admin audit logging, org/agency contract-signing audit
trails, reference-consent records, timesheet-approval records, and the
marketing-form rate limiter). Vercel's edge sets `x-forwarded-for` itself, so
trusting its first entry was safe there; Cloudflare does not rewrite a
client-supplied `X-Forwarded-For` the same way; it appends the real IP rather
than replacing what the client sent, so a client could otherwise spoof any IP
in these audit trails and rate-limit buckets. The shared helper trusts
`CF-Connecting-IP` first — set by Cloudflare's edge and not forgeable by the
client — falling back to `X-Forwarded-For`'s first entry, then `X-Real-IP`,
so existing Vercel behaviour is unchanged. `src/lib/hosting/client-ip.test.ts`
asserts the spoofing scenario directly and that no call site re-parses the
header itself. This is address-selection only; it does not add IP-based
blocking, geolocation or new logging destinations.

### Persistent incremental cache

`wrangler.jsonc` binds a Workers KV namespace (`NEXT_INC_CACHE_KV`) created
directly in the same `bthogroup` account as `specialcarer-preview`, and
`open-next.config.ts` selects OpenNext's KV-backed `incrementalCache`
override. Previously the config used OpenNext's default (effectively no
persistent ISR/data cache on Workers — every isolate/cold start recomputed
what Vercel would have served from cache). This reuses the existing
`WORKER_SELF_REFERENCE` service binding that OpenNext's KV cache re-render
path requires; no new service binding was added.

This is the incremental cache only. Tag cache (for on-demand
`revalidateTag`/`revalidatePath`) and the background revalidation queue are
separate OpenNext config options, currently unset, meaning they fall back to
OpenNext's built-in defaults rather than a Cloudflare-native implementation
(D1/Durable-Object-backed tag cache, queue-backed background revalidation).
Decide and configure those as their own bounded change if the app relies on
on-demand revalidation; do not assume this change covers them. Workers KV is
eventually consistent (up to ~60s propagation on the default TTL), which is
unchanged from Vercel's own ISR staleness window in most configurations but
should be verified against this app's actual `revalidate` usage.

No other Cloudflare resource (R2, D1, Durable Objects, Queues) was
provisioned. The KV namespace was created directly via the Cloudflare
account's API; it is empty until first written to by a request.

### Image optimization (deliberately deferred, not missing)

Cloudflare has no bundled equivalent of Vercel's built-in Next.js image
optimization. Two real options exist: bind Cloudflare Images (a separate
paid product — per-stored-image and per-transformation billing) via an
`IMAGES` binding, or serve images unoptimized. This change takes the
zero-cost option for now: `next.config.ts` sets `images.unoptimized = true`,
but only when `CLOUDFLARE_BUILD=1` is set — which `cf:build` and
`cf:preview` now set — so Vercel's build is completely unaffected and keeps
using Next's default built-in optimizer.

This is a placeholder, not a final decision. Revisit before go-live: if
image-heavy pages (caregiver profile photos, in particular) need
optimization on Cloudflare, switch to the Cloudflare Images binding then,
once real traffic/cost tradeoffs can be weighed. No Cloudflare Images
product was enabled and no related cost was incurred by this change.

Setting `images.unoptimized` does not remove Next's built-in image-
optimization route handler from the build — OpenNext's Cloudflare adapter
still includes it (to serve images unchanged), and that handler has a
conditional `require("sharp")` for the case where optimization *is* wanted.
Sharp ships per-platform native `.node` binaries; a real `cf:build` run
(heap raised to 8 GiB to get past an unrelated Next.js compilation OOM)
confirmed this fails OpenNext's Cloudflare bundling step (esbuild) with
"No loader is configured for '.node' files" and unresolved
`sharp-*.node`/`sharp-wasm32-*.node` requires — not a guess.

The first fix attempted, `serverExternalPackages: ["sharp"]`, did **not**
work — confirmed against another real `cf:build` run, same failure,
unchanged. That config only affects Next's Server Components bundling
boundary; the built-in image route is not a Server Component, so it was
never in scope. The actual fix: `images.loader = "custom"` with a no-op
loader (`cloudflare-image-loader.ts`, returns the source URL unmodified).
A custom loader means Next calls the loader function directly and never
generates or proxies through the built-in `/_next/image` route at all, so
sharp is never part of the Cloudflare build — not merely marked external,
genuinely absent from that code path. Functionally this is the same "serve
as-is, no optimization" outcome `unoptimized: true` was meant to provide.

Still to confirm with a real `cf:build` run: whether removing sharp from
this path is sufficient for the Cloudflare bundling step to complete
end-to-end, or whether something else surfaces next.

### Email transport — SMTP fallback guarded, not fixed

`src/lib/email/smtp.ts`'s SMTP fallback (used only when `RESEND_API_KEY` is
missing) relies on nodemailer's SMTP transport, which requires raw TCP/TLS
sockets. This is a fundamental Cloudflare Workers runtime limitation, not a
missing config value — Workers does not provide raw sockets the way Node.js
does, so nodemailer's SMTP transport cannot function there regardless of
configuration. Separately, nodemailer has a known history of breaking
Workers' build step entirely in some versions/bundler combinations (imports
of Node built-ins without the `node:` prefix); this repo has not run an
actual `cf:build` to confirm whether that specific issue affects this
dependency's pinned version, since sandbox review has no network access to
install dependencies or run a real build.

This change: adds `src/lib/hosting/runtime.ts` (`isCloudflareWorkersRuntime()`,
using Cloudflare's own documented `navigator.userAgent === "Cloudflare-Workers"`
detection) and uses it in `getSmtp()` to skip the SMTP path entirely on
Cloudflare, logging once and returning `null` so `sendEmail()` falls through
to its existing "no transport configured" result rather than attempting a
socket connection that cannot succeed. Also changes the top-level
`import nodemailer from "nodemailer"` to a dynamic `await import("nodemailer")`
inside the branch that never executes on Cloudflare, which is the correct
direction for avoiding nodemailer's own code in that runtime's bundle, though
whether OpenNext/Wrangler's single-file Worker bundling actually tree-shakes
it out is exactly the kind of thing that needs a real `cf:build` to confirm,
not something resolvable by static review alone.

**Practical implication**: as long as `RESEND_API_KEY` is configured for the
Cloudflare deployment (as it already is intended to be — see the environment
variable inventory), this fallback is never exercised and email sending
works normally. The residual risk is specifically the scenario where Resend
is ever misconfigured *and* the Cloudflare build either fails outright or
throws at runtime because of nodemailer — this change eliminates the runtime
half of that risk; the build-time half needs `npm run cf:build` run for real
before this is fully closed out.

## Build-time versus runtime integration configuration

- All client-used `NEXT_PUBLIC_*` values are build inputs and may be inlined
  into browser/server bundles. Changing runtime bindings does not reliably
  replace them. Rebuild with approved isolated values for Supabase URL/anon key,
  Stripe publishable key, public origins and feature flags before test traffic.
- Keep private provider credentials in approved server runtime secrets:
  Supabase service role, Stripe private/webhook credentials, email credentials,
  verification providers and other existing integrations. No values are copied
  by these changes. Do not pass private runtime secrets to client/build code.
- The app's existing `CRON_SECRET` gate returns 500 when unconfigured and 401
  for absent/wrong bearer authentication. Provision matching secrets to app
  and scheduler only through an approved process at the appropriate stage.
- Retain existing deletion, payment, email and other business safety flags.
  No migration-specific boolean is permission to enable a product feature.
- Sentry build upload authentication/release information is separate from
  runtime DSN/reporting; source-map exclusion here controls public static
  delivery and does not configure private Sentry uploads.
- Check every provider's allowlisted origins, auth callbacks and webhook
  signature behaviour in the isolated Workers runtime before traffic cutover.
  These changes retain providers and do not claim runtime compatibility.

### Requiredness is flow-specific, not the number of hidden variables

| Classification | Verified source behaviour / migration decision |
| --- | --- |
| Core auth/data build inputs | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are passed directly to the browser/server client constructors (`src/lib/supabase/client.ts`, `server.ts`). Use the intended project values for a functional candidate; the synthetic bundle is not an auth test. |
| Privileged data flows | `SUPABASE_SERVICE_ROLE_KEY` is checked by `src/lib/supabase/admin.ts` when that helper is used. Required for flows using that client, not evidence that every page or Worker startup needs it. |
| Payments | `src/lib/stripe/server.ts` deliberately initialises lazily and throws for a missing `STRIPE_SECRET_KEY` only when Stripe is accessed. A blank payment secret does not itself block a bundle-acceptance smoke test; checkout/webhook/payout parity needs a verified same-account, same-mode key/price/webhook configuration. |
| Email | `src/lib/email/smtp.ts` chooses Resend when configured, otherwise IONOS; without either it reports that email was not sent. Required for mail-producing workflows, not equivalent to a universal startup requirement. |
| Optional/gated identity | `src/lib/identity/flag.ts` requires `IDENTITY_VERIFICATION_ENABLED=true`; keep it off until Veriff credentials and callbacks are proven. `veriff.ts` checks credentials on use. |
| Video/provider-specific flows | `src/lib/video/whereby.ts` checks `WHEREBY_API_KEY` on use. Test the existing video feature before enabling its traffic; do not categorise its key as necessary for all routes. |
| Distributed protection | `src/lib/rate-limit/distributed.ts` uses an in-memory fallback without the Upstash pair. Absence does not imply startup failure, but cross-instance protection parity remains unresolved and is not waived for production. |
| Observability | Sentry DSN/release/build-upload settings are distinct from auth/payment inputs. Validate delivery and release mapping separately; a missing private upload token is not proof the application cannot start. |
| Scheduling | `CRON_SECRET` is required to authorise jobs, not to activate them. The new scheduler additionally needs every explicit activation gate above. |

This is a verified classification of these code paths, not a complete per-route
startup audit or proof that other secrets are optional. A count of readable or
hidden Vercel entries is not a count of deployment blockers. Provider-original
retrieval/transfer remains the orchestrator's responsibility; this work reads
names and source references only.

For the next full candidate, record a non-secret build manifest with source
commit, Node/Next/OpenNext/Wrangler versions, bundle/asset hashes, configured
public origin and intended Supabase project, payment mode/account validation
status, public feature-flag choices, and the names of runtime bindings expected.
Require an explicit `synthetic=false` decision after approved inputs are
provided; do not merely relabel the current placeholder build or print secret
values. The orchestrator reports an unresolved Stripe public/private/account
alignment question, so payment readiness must stay unproven until reconciled.

## Bundle size — accepted risk, monitored

The built Worker (`sc-cloudflare-preview` @ `b2222c5`, verified via the
`Cloudflare compatibility (one-shot)` and manual bundle-analysis CI runs)
is **10,089.80 KiB gzip against Cloudflare's 10,240 KiB (10 MiB) Workers
Paid plan hard limit** — 98.5% full, ~150 KiB of headroom.

Root cause: React Server Components client-reference-manifest data.
`load-manifest.external.js` (9.7 MiB) and 392 separate per-route manifest
modules (24.3 MiB) together account for 58% of the bundle. This app has 675
route entries; per-route manifest cost scales at roughly 64 KiB/route. This
is a documented, currently-unresolved upstream limitation
([opennextjs/opennextjs-cloudflare#1294](https://github.com/opennextjs/opennextjs-cloudflare/issues/1294),
closed without a changelog fix as of adapter 1.20.6, the version pinned
here) in how the OpenNext Cloudflare adapter inlines RSC manifests, not a
bug in this app's code, and not something safely fixable by patching our
own source.

**Decision (deliberate, not a default):** accept the current risk rather
than take on a Multi-Worker split now. Two real options were considered:

1. **Accept and monitor** (chosen): ship as-is, watch for an upstream fix,
   and fail the build automatically if headroom shrinks further.
2. **Split into multiple Workers**: OpenNext's documented Multi-Worker
   setup (e.g. moving `/admin/*` into its own Worker) removes the ceiling
   structurally, but is a real routing/deployment architecture change, not
   a patch — deferred as a deliberate scope decision, not an oversight.

**Safeguard implemented**: `scripts/check-cloudflare-bundle-size.mjs`,
wired into `cf:dry-run` via `scripts/cf-dry-run-with-size-check.sh`, parses
wrangler's own `Total Upload: ... / gzip: ...` line and:
- **warns** (build still passes) above 9,933 KiB (97% of the cap) — the
  current size already triggers this warning, deliberately, so it's
  visible on every dry-run rather than silent;
- **fails the build** above 10,137.6 KiB (99% of the cap, ≈9.9 MiB) — this
  is the trigger to act (free up headroom or finally do the Multi-Worker
  split), not a threshold to quietly raise;
- **fails safe** if wrangler's output format ever changes such that the
  size line can't be parsed at all, rather than silently passing an
  unmeasured build.

This check runs wherever `cf:dry-run` runs, including inside the locked
`Cloudflare compatibility (one-shot)` workflow. Verified locally against
the exact real reported string (10,089.80 KiB → warns, passes) and against
a synthetic smaller value (5,000 KiB → passes cleanly) before landing.

**Practical implication for future work on this app**: every new route
added costs real, scarce headroom (~64 KiB). Removing an unused route
frees roughly the same. This is worth knowing before adding routes
casually once this is closer to go-live.

## Monitoring — Sentry, verified compatible

Checked Sentry's own "Next.js on Cloudflare" guide before assuming either
compatibility or incompatibility, the same way nodemailer and Sharp were
checked rather than guessed at. Unlike those two, **no wrangler or code
change was needed for the core setup**: Sentry states two prerequisites —
the `nodejs_compat` compatibility flag and a `compatibility_date` of
2025-08-16 or later — and this app's `wrangler.jsonc` already satisfies
both (`compatibility_date: 2026-09-17`). Reviewed all three Sentry config
files (`sentry.server.config.ts`, `sentry.edge.config.ts`,
`sentry.client.config.ts`) for anything Node-specific that could still
trip Cloudflare's bundler the way Sharp did (native modules, profiling
integrations); found none — this is a clean, dependency-light setup with
good existing PII-scrubbing discipline.

One real gap found and fixed: both server and edge configs tagged Sentry
events with `release: process.env.VERCEL_GIT_COMMIT_SHA`, a Vercel-only
variable that is simply undefined on Cloudflare (nothing sets it there).
Not a crash — Sentry just omits release tagging — but every
Cloudflare-originated error would have silently lost commit-level
attribution, which matters during actual incident triage.
`src/lib/hosting/release.ts` (`resolveReleaseSha()`) now checks
`VERCEL_GIT_COMMIT_SHA` first (unchanged Vercel behaviour), falling back to
`GITHUB_SHA` (set by both `.github/workflows/cloudflare-compatibility.yml`
and `pr-checks.yml`, since this app's Cloudflare build runs via GitHub
Actions). If the Cloudflare build/deploy path ever moves off GitHub
Actions, this fallback will need updating — it is not a generic
"any CI" detector.

**Not yet addressed**: `sentry.client.config.ts` tags releases via
`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, a client-exposed variable that must be
inlined into the browser bundle at *build* time (unlike server/edge, which
read `process.env` at runtime). Fixing this for Cloudflare needs a
build-time-injected `NEXT_PUBLIC_` equivalent, not just a runtime fallback
like the one added here — left as an open, separately-scoped item rather
than bundled into this change.

## Scheduler cutover — staged by risk, Phase 1 in progress

Cutting the scheduler over from Vercel's 26 cron jobs to Cloudflare's is
staged by risk rather than done as one switch, because the same job firing
from both providers simultaneously would double-execute it — harmless for
an idempotent aggregation, potentially serious for a payout.

- **Phase 1 (in progress)**: shadow-run three read/aggregation-only jobs
  (`kpi-rollup-hourly`, `experiment-rollup`, `dbs-update-service-poll`) —
  each confirmed to have a cron expression no other job shares, so
  registering only these three schedules structurally prevents any other
  job, including the dangerous ones, from ever firing here regardless of
  the enable flag. `cloudflare/scheduler/rehearsal.test.ts` asserts this
  mechanically (exact job set, no shared expressions, explicit denylist of
  financial/destructive paths) rather than relying on manual review holding
  forever.
- **Phase 2 (not started)**: user-facing reminder jobs. Requires pausing
  Vercel's cron for those specific paths before enabling Cloudflare's —
  not a dual-run — to avoid double-sending real users the same message.
- **Phase 3 (not started)**: financial and destructive jobs (payouts,
  payroll, refund reconciliation, account deletion, DSAR fulfilment,
  Stripe webhook recovery). Instantaneous cutover only, never overlapping;
  requires confirming existing idempotency/claim safeguards per job before
  moving, not assuming they hold.

**Step 1a of Phase 1 — complete and confirmed** (mechanism-only, no real
secrets, no real data):
`cloudflare/scheduler/wrangler.rehearsal.jsonc` defines a separate,
dedicated `specialcarer-scheduler-rehearsal` Worker — not a change to
`specialcarer-scheduler-preview` — with `APP_ENV=production` and
`SCHEDULER_ENABLED=true` on the *scheduler* Worker only, service-bound to
the *existing* `specialcarer-preview` app (which holds no real database
credentials). This tests only whether Cloudflare's own cron trigger
mechanism correctly invokes this Worker's `scheduled()` handler — the
dispatcher's own logic (auth header, timeout, retry behaviour) is already
fully covered by `cloudflare/scheduler/worker.test.ts`. Any dispatched
request either fails cleanly at the app (missing DB credentials, secret
mismatch) or is a genuine no-op; no real job execution is possible via
this Worker as configured. A wrong/placeholder `CRON_SECRET` is
acceptable here specifically because an auth failure is a safe, expected
outcome for this step — it still proves the platform mechanism reached
the app.

**Confirmed result** (19–20 September, `specialcarer-scheduler-rehearsal`,
deployed and torn down deliberately for this test): all three schedules
fired naturally at their expected times (hourly KPI at 23:05 BST,
experiment rollup at 06:00 BST, DBS poll at 07:23 BST) and each correctly
dispatched to its expected endpoint via the service binding. Each returned
HTTP 500; the cause was not established. This confirms scheduled
invocation and dispatch, not successful business-job execution.
Triggers were removed after confirmation (verified via a
fresh API read showing an empty schedule list); the Worker, its secrets,
and both existing preview Workers were left untouched.
`wrangler.rehearsal.jsonc`'s `triggers.crons` is deliberately emptied back
to `[]` now that this step is done — re-populate only when deliberately
resuming rehearsal or starting Step 1b.

**Step 1b — approved, in progress**. The earlier plan here (a new,
dedicated *app* Worker) was reconsidered once the Phase 1 investigation
established two things: (1) `specialcarer-preview` already holds real
`SUPABASE_SERVICE_ROLE_KEY`/`EMAIL_FROM` secrets — contrary to this
document's own earlier, incorrect claim that it held no real credentials
(corrected; see the commit that fixed that wording) — and (2) none of this
migration's CI workflows ever actually deploy to the live
`specialcarer-preview` Worker: `cf:build` only builds locally, and
`wrangler deploy --dry-run` never calls Cloudflare's deploy API at all.
The live Worker has sat untouched since 18 September. Given that, deploying
an entire second full Next.js app just to add one missing secret is
disproportionate — the actual gap is only a missing `CRON_SECRET`.

Scope, narrowed from the original three-job plan: **`kpi-rollup-hourly`
and `experiment-rollup` only.** `dbs-update-service-poll` is deliberately
excluded — re-reading its actual code during this planning step showed it
can send real emails to real carers/admins on certain status transitions
(`carerInvalidated`, `adminChangePending`, `adminInvalidated`), which is
not idempotent the way its database writes are. Handling it is a separate,
later decision (a read-only pre-check for due rows, or Phase 2-style
coordinated cutover rather than a dual-run) — not folded into Step 1b.

`cloudflare/scheduler/wrangler.step1b.jsonc` defines a new scheduler
Worker (`specialcarer-scheduler-step1b`), service-bound to the *existing*
`specialcarer-preview` app, with `triggers.crons` restricted to just the
two approved schedules. Unlike Phase 1's Step 1a, this `CRON_SECRET` must
genuinely match the value added directly to `specialcarer-preview` itself
— Step 1a's mismatched placeholder was deliberate (an auth failure was the
desired safe outcome); Step 1b's entire point is that authentication
succeeds and the jobs actually run against real data, dual-run alongside
Vercel's still-active cron for the same two jobs, with no coordination
needed since both are confirmed idempotent.
`cloudflare/scheduler/step1b.test.ts` asserts the approved job set exactly,
and explicitly denylists `dbs-update-service-poll` by name (not merely by
omission) so it can't be silently reintroduced without that decision being
revisited, plus the same financial/destructive denylist as Phase 1.

**Step 1c — dbs-update-service-poll, one-time coordinated cutover test
(deferred until closer to go-live)**. Excluded from Step 1b's dual-run
because its code (`src/app/api/cron/dbs-update-service-poll/{route,poll-handler}.ts`)
has no locking/idempotency guard on its notification path: rows become
"due" purely by `update_service_last_checked_at` being older than 23
hours, so if Vercel and Cloudflare both ran this job on the identical
`23 6 * * *` schedule, they'd fire at the same wall-clock minute — and on
the (rare) day this job finds a genuine status change, both could
independently see the same row as due and each send the resulting email
(`adminChangePending`, `adminInvalidated`, or `carerInvalidated` — the
last reaches an actual carer). The database writes themselves are
idempotent (applying a status change twice doesn't compound the harm);
the real, avoidable cost is one duplicate email landing on a real person.

Plan: pause Vercel's own cron for this one path, let
`cloudflare/scheduler/wrangler.step1c-dbs.jsonc` (a new, one-off scheduler
Worker, service-bound to `specialcarer-preview`, triggers restricted to
only this job's schedule) fire naturally in Vercel's place, observe via
the same log-tail + before/after database technique already proven in
Step 1b, then re-enable Vercel's cron and tear down or disable this
Worker again — a one-time test, not an ongoing dual-run.
`cloudflare/scheduler/step1c-dbs.test.ts` asserts this Worker can only
ever fire this one job, plus the same financial/destructive denylist used
throughout. The exact mechanism for pausing only this one Vercel cron
path (edit `vercel.json` and redeploy, vs. an app-level feature flag
matching the `FEATURE_BACS18_EXPORT_ENABLED` pattern used elsewhere in
this app) is still to be determined — needs real Vercel dashboard/config
access this sandbox doesn't have.

**Blockers found during prerequisite investigation (21 September) —
why this is deferred, not just unscheduled**: as of the last live check,
`specialcarer-preview` has no `DBS_VENDOR` set, meaning `getDbsVendor()`
resolves to the mock provider, whose default result (`clear`) would
silently advance real carers' safeguarding-check timestamps without any
genuine DBS check ever occurring — a false safeguarding record, not
merely an unhelpful test result. Hard blocker, not a prerequisite to
schedule around. Separately, `RESEND_API_KEY` and IONOS SMTP credentials
are both absent, so `sendEmail()`'s no-transport path would return
`{ok: false}` silently — and the DBS notification wrappers don't check
that return value, so job completion wouldn't prove a notification was
actually sent either. A read-only check on 21 September also found zero
currently-due DBS records, meaning even fully unblocked, that day
wouldn't have exercised the vendor-check or notification paths at all.
Fixing this properly means provisioning real third-party DBS vendor and
email credentials onto `specialcarer-preview` — a materially bigger step
than the original "pause one Vercel cron entry" plan, and not worth doing
until closer to actual go-live. Decision recorded here rather than left
implicit: deferred deliberately, not blocked-and-forgotten.

**Phase 2 (user-facing reminders) — scoping started, Step A config
ready, not yet deployed or triggered.** Re-reading each of the five
jobs' actual route code (not just their names) before writing any config
surfaced two things the original three-phase plan hadn't distinguished:

1. Idempotency varies. `timesheet-reminders` (`reminder_sent_at`,
   checked-before/marked-after) and `care-plan-review-reminder`
   (`last_reminded_at`, day-granularity) each have a guard that narrows a
   duplicate to a tight race window. `booking-reminders` and
   `payout-digest-weekly` have no guard at all — the former's own code
   comment admits "a stricter dedupe via a reminder_sent_at column is a
   follow-up" that was never done, and the latter recomputes a fresh
   rolling 7-day window every run with no "sent" marker. Either would
   duplicate deterministically on any overlap, not just in a race.
2. `reference-reminders` shares its exact cron expression, `0 9 * * *`,
   with `run-monthly-payroll` — confirmed directly via
   `jobsForSchedule("0 9 * * *")`, which returns both paths. The
   dispatcher resolves every job matching a fired cron string with no
   per-Worker path scoping, so a naive cutover Worker registered at that
   trigger would silently also invoke a Phase 3 financial job on every
   firing. None of Phase 1/Step 1b hit this because those jobs' cron
   strings happened to be unique. Needs an offset trigger time (or a
   dispatcher change) before this job can be touched at all — not folded
   into the same batch as the other four.

Given that, `cloudflare/scheduler/wrangler.phase2a.jsonc` scopes a first
batch to only `care-plan-review-reminder` and `timesheet-reminders` —
the two with an existing partial guard and no cron collision. Like
Step 1c, this is framed explicitly as a **one-time coordinated cutover
test, not a dual-run**: both jobs send real emails/notifications against
the same live Supabase project `specialcarer-preview` is bound to, so
leaving this Worker's triggers active alongside Vercel's matching crons
would double-notify real users on every firing, not just occasionally.
Vercel's own crons for these two exact paths must be paused first, this
Worker fired once and observed, then either torn down or the cutover
made permanent. `cloudflare/scheduler/phase2a.test.ts` asserts the exact
two-job resolution, denylists the three not-yet-handled Phase 2 jobs by
name (not merely by omission), and reuses the standing
financial/destructive denylist. `booking-reminders` and
`payout-digest-weekly` need a zero-tolerance pause-then-cutover moment of
their own (no code-level safety net at all); `reference-reminders` needs
its schedule collision resolved first. Neither started yet.

**Phase 2 Step A prerequisite checks (22 September).** Before pausing
anything, we checked whether today would actually exercise either job's
processing logic, not just its dispatch path. Both came back negative in
different ways:

- Zero rows are currently eligible for either job (`shift_timesheets`
  pending >24h with no reminder; `care_plan_reviews` due at the 14-day or
  1-day lead mark). A pause-and-fire test today would only prove
  dispatch/auth, the same limited result Step 1a already gave.
- `care-plan-review-reminder` is additionally gated by
  `NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED`, which the deployed
  `specialcarer-preview` build did not have set — confirmed by the
  build's recorded environment (the flag absent) and by the compiled
  server bundle, which retains `process.env.NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED
  === "true"` as a literal runtime read rather than a build-time-inlined
  constant. This corrects an earlier assumption in this doc that a
  `NEXT_PUBLIC_*` var would need a full rebuild to change - for this
  OpenNext/Cloudflare build path it's read at request time, same as
  every other env var this Worker already uses.

Given that evidence, we set `NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED: "true"`
on `specialcarer-preview` only (never on Vercel, where the flag stays off
by its own separate config, and where turning it off would additionally
blank the live seeker/admin review UI - the wrong tool for this job even
setting the rebuild question aside). Applied via the Cloudflare dashboard's
settings-only variable action after a TLS verification failure blocked the
API/wrangler path; confirmed live by dashboard readback (version
`b9cbc146`) and mirrored into the checked-in `wrangler.jsonc`
(commit `9b304bca2bdf3ce9cab09182d0e721892398e92f`).

We deliberately did not go further and invoke the route live to observe
the response body. The matching `CRON_SECRET` needed to authenticate the
request was generated in-memory during Step 1b and never retained, and
Cloudflare secrets aren't retrievable once set - the only way to test the
real route today would be to deploy `specialcarer-scheduler-phase2a` (which
would need its own fresh `CRON_SECRET` reused-or-rotated to match) or to
rotate `specialcarer-preview`'s existing `CRON_SECRET`, which the two
already-live Step 1b schedules (`kpi-rollup-hourly`, `experiment-rollup`)
also depend on matching. Rotating it for a verification-only check risked
breaking a confirmed-good dual-run for no real gain, so we didn't.

Evidentiary standard accepted here, consistent with the DBS
binding/HTTP-500 investigation: the flag is **strongly supported as live
and functional, not route-level confirmed**. Full end-to-end confirmation
will happen naturally as part of the real Stage B pause-and-fire test,
when `phase2a`'s secret is provisioned properly as part of that
deployment anyway - not forced early via a separate, riskier path. A
lightweight daily read-only check for eligible rows (mirroring
`experiment-rollup`'s monitoring, no deadline) continues in the
background; Stage B is written up once either job shows a non-zero
count.

**Phase 2 Step B (22 September) — scoping and config ready for
`booking-reminders` and `payout-digest-weekly`, not deployed.** These
are the two Phase 2 jobs with no idempotency guard at all, confirmed by
reading both routes directly rather than trusting the earlier
"not dangerous, just annoying" framing:

- `booking-reminders` calls `dispatch()`, which unconditionally writes a
  real row via `createNotification` before it even attempts push
  delivery - wrapped in a swallow-all `try/catch` by design ("a failed
  notification must never break the booking write that fired it"). Push
  delivery itself goes through Expo's public HTTP endpoint (native
  `fetch`, no SDK, `EXPO_ACCESS_TOKEN` optional), so a real push can also
  reach a real device with zero credential provisioning needed. There is
  no missing-dependency safety net for this job at all on
  `specialcarer-preview`.
- `payout-digest-weekly` recomputes a fresh rolling 7-day window every
  run with no "sent" marker. Its email step currently no-ops on
  `specialcarer-preview` only because `RESEND_API_KEY` /
  `IONOS_SMTP_USER`+`PASS` are absent there (the same gap identified as
  a Step 1c blocker) - an incidental, fragile protection that
  disappears the moment those creds are added for any other reason, not
  a substitute for actually pausing Vercel.

Also corrected a stale comment in `booking-reminders/route.ts` claiming
its schedule still needed adding to `vercel.json` - confirmed directly
against the live-mirrored `vercel.json` that it's already registered
and has been all along; the comment was just never cleaned up after
that follow-up PR landed.

`cloudflare/scheduler/wrangler.phase2b.jsonc` and `phase2b.test.ts`
follow the same shape as Step A: exact two-job resolution, the three
other Phase 2 jobs denylisted by name, plus the standing
financial/destructive denylist. Framed with the same one-time
coordinated cutover language as Step A, but with explicit zero-tolerance
wording given neither job has any guard to fall back on. Not deployed;
no secrets changed; no Vercel changes.

**Phase 2 Step C (22 September) — dispatcher change, not just config,
for `reference-reminders`.** This corrects something stated earlier in
this doc: the collision with `run-monthly-payroll` (both
`"0 9 * * *"`) was described as fixable with "an offset schedule (or a
dispatcher change)". Direct testing showed the offset half of that
doesn't exist - `jobsForSchedule()` resolves purely by matching the
firing cron string against each job's own canonical Vercel schedule in
`schedules.ts`; a Worker registered at any other time resolves to
nothing at all (`unknown_schedule`), not to `reference-reminders`
selectively. The only real fix was a dispatcher change.

Added `DISPATCH_PATH_ALLOWLIST` to `worker.ts`'s `SchedulerEnv` -
optional, comma-separated job paths. Absent (every Worker before this
one: rehearsal, Step 1b, Step 1c, Phase 2 Steps A and B), behaviour is
provably unchanged - confirmed by running all 23 pre-existing scheduler
tests unmodified after the change, all still passing. Present, the
result is intersected with `jobsForSchedule()`'s resolution rather than
trusted outright, so a misconfigured allowlist can only narrow dispatch,
never add a path that wasn't already legitimately resolved for that
cron string - and a fully-filtered-out result surfaces as
`unknown_schedule`, which `scheduled()` already treats as a failed
invocation, so a misconfiguration fails closed and visibly rather than
silently dispatching nothing.

`wrangler.phase2c.jsonc` sets `DISPATCH_PATH_ALLOWLIST` to just
`/api/cron/reference-reminders` and registers the trigger at the real
`"0 9 * * *"` (no artificial time-shift needed now that dispatch is
filtered, not merely cron-matched). `phase2c.test.ts` asserts the raw
collision still exists (so this doesn't silently become unnecessary and
go unnoticed), that the allowlist resolves it down to exactly one path,
and that `run-monthly-payroll` is never actually dispatched despite
sharing the raw cron string. `worker.test.ts` gained direct unit tests
for `restrictToAllowlist` covering the no-op-when-absent case, the
intersection-not-trust property, the concrete
reference-reminders/run-monthly-payroll scenario, and the fail-closed
behaviour on a fully-filtered result.

`reference-reminders` sends real emails; its `markSent` write uses a
compare-and-swap on `reminder_stage`, but the email dispatch happens
before that check runs (see `processReferenceReminders`), so it carries
the same narrow race-window duplicate risk as Phase 2 Step A's two jobs,
not Step B's zero-guard category. Same one-time-coordinated-cutover
framing as the other two batches. Not deployed; no secrets changed; no
Vercel changes.

A separate, unrelated observation from reading this route: `auth.ts` in
the same directory (`authoriseReferenceReminderCron`) is dead
application code - it has its own unit test but is never imported by
`route.ts`, which uses the shared `requireCronAuth` instead. Left
alone in this patch to keep it scoped to the collision fix; worth a
follow-up cleanup at some point.

**Typecheck fix (23 September).** Patch 0023 passed all 71 local hosting
tests but failed CI's `tsc --noEmit` with 8 `TS2345`/`TS4104` errors, all
the same root cause: `jobsForSchedule()` returns `readonly JobPath[]`,
but `restrictToAllowlist()`'s parameter and one internal return path
were typed as the mutable `JobPath[]`. `node --test` with `tsx`'s type
stripping doesn't run real type checking, so this passed locally and
only surfaced in CI. Fixed by accepting `readonly JobPath[]` as the
parameter and copying (`[...paths]`) in the early-return branch rather
than returning the readonly reference directly; the other return path
(`paths.filter(...)`) already produced a genuinely mutable array.
Confirmed clean via a real local `tsc --noEmit` run this time (not just
`node --test`), with the remaining local errors traced individually and
confirmed pre-existing and unrelated (a handful of `TS2345`s elsewhere
in the app, and a flood of `TS2591`s from this sandbox's own missing
`@types/node`, not present in the app's real dependency tree).

### Phase 2 Stage B execution runbooks (prepared 23 September, not yet run)

Written ahead of time so that whenever a monitor reports eligible rows,
execution can start immediately rather than needing another round of
clarifying questions. Nothing below has been performed; all three
batches remain dormant. Common shape for all three:

1. **Immediate pre-flight.** Re-run the eligibility query one more time,
   right before pausing anything - the monitor's last report may be
   hours old. If the count has dropped back to zero, stop and wait for
   the monitor again rather than proceeding on stale evidence.
2. **Pause Vercel.** Remove the batch's specific `path`/`schedule`
   entries from `vercel.json`'s `crons` array (leave every other entry
   untouched) and redeploy production. Confirm via Vercel's deployment
   log that the *live* deployment (not just the repo file) no longer
   lists those paths - `vercel.json` only takes effect on the deployment
   that ships it.
3. **Deploy the Cloudflare Worker.** `wrangler deploy --config
   cloudflare/scheduler/wrangler.phase2X.jsonc` (X = a/b/c). Confirm the
   dashboard shows the expected trigger(s) live and `SCHEDULER_ENABLED`/
   `APP_ENV`/`DISPATCH_PATH_ALLOWLIST` (Step C only) match the checked-in
   config exactly.
4. **Wait for the natural firing(s)** - see per-batch cadence below. Do
   not manually trigger; natural firing is what's been used throughout
   this whole cutover (Step 1a/1b/1c).
5. **Observe** - see per-batch queries below. Distinguish "ran and found
   zero eligible rows at that moment" from "didn't run" the same way
   Step 1b's `experiment-rollup` result was reported.
6. **Restore Vercel.** Re-add the removed `crons` entries exactly as
   they were, redeploy, confirm the live deployment lists them again.
7. **Return the Cloudflare Worker to dormant** (`triggers.crons: []`,
   matching the rehearsal Worker's pattern) unless the observation was
   clean and permanent cutover is explicitly decided separately - that
   is a distinct decision from "did the test work," not an automatic
   follow-on.
8. **Write up the result** in this doc, in the same evidentiary style as
   Step 1b/1c (real counts, real timestamps, what was and wasn't
   confirmed).

**Step A - `care-plan-review-reminder` + `timesheet-reminders`.**
Cadence: `care-plan-review-reminder` fires once daily at 06:00 UTC;
`timesheet-reminders` fires four times daily at :30 past 00/06/12/18
UTC. A ~24-25h window catches at least one of each.
- `care_plan_reviews`: check `last_reminded_at` advancing (from null or
  a prior date to today) for rows that were eligible pre-fire (`status
  = 'due'`, `scheduled_for` = today+14 or today+1).
- `shift_timesheets`: check `reminder_sent_at` advancing from null to
  non-null for rows eligible pre-fire (`status = 'pending_approval'`,
  `submitted_at` >24h old). Also check `notifications` for new rows with
  `kind = 'timesheet_reminder'` around the fire time.

**Step B - `booking-reminders` + `payout-digest-weekly`.** Cadence:
`booking-reminders` fires daily at 08:00 UTC; `payout-digest-weekly`
fires only on Mondays at 08:00 UTC. If the eligible-rows monitor reports
a positive `payout_alerts` count on a non-Monday, the actual fire is up
to 6 days away - re-check the count hasn't reset to zero before that
day arrives, per step 1 above, rather than assuming it holds.
- `bookings`/`notifications`: check for new `notifications` rows with
  `type = 'booking.reminder_24h'` (note: this job's dispatch path uses
  the `type` field, not `kind` - a real inconsistency in this codebase,
  not a typo in this runbook) for both the seeker and caregiver of each
  eligible booking.
- `payout_alerts`: this table has no "sent" marker at all (confirmed
  during Phase 2 Step B scoping) - the only signal is whether the digest
  email itself was sent, which currently no-ops on `specialcarer-preview`
  for lack of transport creds (see Step B's entry above). If those creds
  are still absent when this runs, expect a real scan (`carer_id`
  buckets computed correctly) but a silently-failed send - confirm the
  scan logic via logs, not via an email that was never going to arrive.

**Step C - `reference-reminders`.** Cadence: fires once daily at 09:00
UTC (same real Vercel time; the allowlist filters `run-monthly-payroll`
out of that same trigger, so no time-shift is needed). Additionally,
per the earlier caution in this doc: confirm `kpi-rollup-hourly` and
`experiment-rollup` (Step 1b, sharing `worker.ts` with this Worker) are
still firing normally on their next natural occurrence after this
Worker is deployed - not because deploying `phase2c` should affect them,
but because it's a real opportunity to confirm the shared dispatcher
change hasn't regressed anything live, cheaply, in passing.
- `carer_references`: check `reminder_stage` advancing (0→1, 1→2, or
  2→3) and `last_reminder_at` updating for rows eligible pre-fire
  (`status = 'invited'`, `token_expires_at` in the future,
  `reminder_stage < 3`, aged past the 3/7/12-day thresholds in
  `REFERENCE_REMINDER_DAYS`). A `markSent` failure
  ("Reference reminder was already updated") would appear in the route's
  JSON response `errors` array, not as a thrown exception - check that
  array specifically, don't rely only on the HTTP status.

## Remaining gates and next order

1. The orchestrator now reports user confirmation of the destination account.
   Preserve that explicit target approval. The visible account had no accessible
   SpecialCarer zone; domain onboarding/DNS handover is a separate unresolved
   gate, not permission to change the app's live domains.
2. Review these local changes and the completed synthetic rebuild evidence.
   Before a functional candidate, rebuild with approved public build inputs;
   recheck module size, asset metadata and reproducibility.
3. The outside-repository direct-transfer helper has now been re-audited and
   explicitly repinned for this synthetic bundle, raw asset-header metadata
   and local ignore controls. It remains private-preview-only, and rejects
   changed artifacts or unreviewed bindings. Any configured rebuild needs a
   fresh audit and pin; do not relax safety checks just to upload.
4. After account confirmation, obtain isolated runtime acceptance and test
   authentication, contract rendering, asset headers, PDFs, integrations and
   webhooks. Existing consent-PDF logo filesystem fallback remains outside
   this narrow change.
5. Deployment CI now exists (`.github/workflows/pr-checks.yml`: lint,
   typecheck, `test:hosting` on relevant PRs/pushes; the locked one-shot
   workflow for full `cf:build`/`cf:dry-run` verification). Monitoring
   (Sentry) is verified compatible, with one real gap fixed (see above) and
   one documented open item (client-side release tagging). Client-IP trust
   for the six existing audit/rate-limit call sites is now handled by
   six existing audit/rate-limit call sites is now handled by
   `src/lib/hosting/client-ip.ts` (see above); this does not cover any
   future call site added without using that helper, and does not add
   distributed (cross-instance) rate limiting. The incremental cache now
   persists via Workers KV (see above); tag cache and the background
   revalidation queue are still unresolved and default to OpenNext's
   built-in behaviour, not a Cloudflare-native implementation. Image
   optimization is deliberately deferred to unoptimized (see above) pending
   a real cost/traffic decision on Cloudflare Images. The SMTP fallback is
   now guarded off on Cloudflare (see above) rather than left to fail at
   request time; whether it also affects the build itself is still
   unconfirmed pending a real `cf:build` run.
6. Plan and rehearse a monitored, single-scheduler handover with rollback.
   Preserve original schedules; deletion remains subject to its own approval.
7. Reproduce canonical host redirects and preserve mail/verification DNS before
   any separately authorised domain cutover. Keep Vercel rollback access.

For the prior build evidence and general migration gates, see
[`cloudflare-migration.md`](./cloudflare-migration.md).
