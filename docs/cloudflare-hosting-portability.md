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
Sharp ships per-platform native binaries; bundling that reference (rather
than leaving it as an external, unresolved require) made esbuild try to
statically resolve those binaries during Cloudflare bundling and fail, even
though the code path is never actually reached here. `serverExternalPackages:
["sharp"]` (Cloudflare build only) tells Next.js's own bundler to leave
`sharp` as an external require instead of inlining it — the documented fix
for this class of native-dependency bundling failure. Confirmed against a
real `cf:build` run (heap raised to 8 GiB; see the build log from that run)
that this was the actual reported error, not a guess.

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
5. Separately design monitoring and deployment CI. Client-IP trust for the
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
