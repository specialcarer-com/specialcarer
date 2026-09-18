# SpecialCarer Cloudflare migration: preview scaffold

Status: DRAFT. GitHub compatibility build and minified packaging passed within
Cloudflare's Worker-size limit. The orchestrator subsequently confirmed
acceptance of that earlier synthetic bundle by the private
`specialcarer-preview` Worker, with URL exposure disabled and no schedules.
That acceptance does not include the newer local portability changes and is
not an integration test or production cutover.

## Scope

Replace Vercel hosting only. Keep Supabase, Stripe, Resend/IONOS, verification
providers, Mapbox, Whereby, Sentry and GitHub. Preserve existing app behaviour,
branding, payment controls and account-deletion flags.

The original scaffold adds OpenNext and Wrangler, pinned in the lockfile, plus
an isolated preview configuration. The bounded local follow-up adds immutable
contract bundling checks, provider-neutral production guards, static-asset
controls and a separate **disabled** scheduler dispatcher. See
[`cloudflare-hosting-portability.md`](./cloudflare-hosting-portability.md) for
its environment contract and tests. The Vercel schedule is unchanged; no
production scheduler migration has been activated.

For isolated, placeholder-only rebuild instructions and the narrow Next route
export fix, see [`cloudflare-synthetic-rebuild.md`](./cloudflare-synthetic-rebuild.md).

## Local compatibility test

Use Node 22 or later. No production credentials should be provided to this test.

```sh
npm ci
npm run cf:build
npm run cf:dry-run
npm run cf:preview
```

The first command installs dependencies; the second builds the Workers bundle.
The dry run should report the compressed upload size without deploying.
The preview command starts the local Workers runtime after a successful build.
Missing integration credentials mean a local build or route may fail; that is
not a reason to copy production secrets into local files.

The sandbox installation was time-limited twice during slow package downloads.
An offline lockfile-only resolution succeeded.

On 17 September 2026, one actual GitHub Actions compatibility build completed:
https://github.com/specialcarer-com/specialcarer/actions/runs/35263872288

- Node 22 locked dependency installation: passed.
- OpenNext Workers build: passed.
- Wrangler packaging dry run: passed; no deployment performed.
- The first dry run reported 77,357.48 KiB uncompressed (approximately
  75.54 MiB), above Cloudflare's documented 64 MiB limit.
- Production minification is now mandatory in both `wrangler.jsonc` and the
  `cf:dry-run` script.
- The bounded verification run on 18 September 2026 passed:
  https://github.com/specialcarer-com/specialcarer/actions/runs/35290284272
- The verified minified upload is 59,779.33 KiB uncompressed (approximately
  58.38 MiB) and 10,099.43 KiB gzip, below the 64 MiB limit without removing
  routes or features.
- Test, typecheck and rate-limit workflows passed on the minification commit.
- Existing test, typecheck and rate-limit workflows also passed on the build
  commit. Previously reported unrelated failures were not investigated.
- Workers runtime and authenticated integration smoke tests remain unperformed.
- Sentry release/source-map upload warnings were expected because no production
  secrets were supplied.

An earlier workflow submission was rejected for YAML formatting before a job
started. Correcting its conditional enabled the one actual build above; the
application build was not retried.

Do not describe this as a deployment-ready or runtime-validated migration.

## Preview safety

- No scheduled triggers: `triggers.crons` is empty.
- No public workers.dev exposure: `workers_dev` and `preview_urls` are false.
- No domain routes, production credentials, paid cache resources or image
  optimisation bindings are provisioned.
- Vercel remains the active production host and scheduler.
- Do not connect the preview to live payment, email or database write credentials.
- Preview-only disabling of URL exposure is not an authentication mechanism for
  any later deployed preview. Protect any future reachable preview explicitly.

## Production gates still outstanding

- Complete one build and Workers-runtime smoke test using an isolated test
  environment. Check authentication/cookies, SSR, middleware, uploads, downloads,
  PDF generation, email and payment webhook signature validation.
- Select and test persistent Next.js cache and image optimisation behaviour.
  This scaffold uses the adapter defaults, not a validated production cache.
- Verify Node.js dependency support, including the IONOS SMTP fallback; preserve
  the existing Resend integration rather than silently replacing email services.
- Migrate all 26 scheduled endpoints from `vercel.json`, with idempotency,
  monitoring, UTC schedules and a controlled single-scheduler switchover.
  Never activate both hosts' payout/email schedules simultaneously.
- Assess the Workers plan using measured bundle size and runtime CPU usage.
  User permits assessing a paid plan but has NOT approved activating one.
- Configure approved integration secret provisioning. The private compatibility
  upload established a working transfer path but did not transfer application
  credentials or validate their runtime behaviour. Do not extract hidden
  production environment secrets through app/build code.
- Confirm the domain's authoritative DNS, preserve all mail and verification
  records, and obtain approval before any nameserver or traffic cutover.
  The checked Cloudflare account did not contain a `specialcarer.com` zone.
- Preserve Vercel rollback access until the Cloudflare deployment passes
  authenticated end-to-end checks and the user approves retirement.

## Reference documentation

- Existing-app OpenNext configuration:
  https://opennext.js.org/cloudflare/get-started
- Workers limits:
  https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing:
  https://developers.cloudflare.com/workers/platform/pricing/

OpenNext is used to test the existing Next.js 15 app without a framework upgrade.
This draft does not adopt the newer beta framework migration path.
