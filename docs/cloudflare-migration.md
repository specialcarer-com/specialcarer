# SpecialCarer Cloudflare migration: preview scaffold

Status: DRAFT, NOT BUILD-VERIFIED. No Cloudflare deployment or production cutover has occurred.

## Scope

Replace Vercel hosting only. Keep Supabase, Stripe, Resend/IONOS, verification
providers, Mapbox, Whereby, Sentry and GitHub. Preserve existing app behaviour,
branding, payment controls and account-deletion flags.

This change adds OpenNext and Wrangler, pinned in the lockfile, plus an isolated
preview configuration. It does not change the existing Next.js build command or
the Vercel schedule. It does not implement the production scheduler migration.

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
An offline lockfile-only resolution succeeded. Neither the application build,
typecheck, Workers packaging nor runtime smoke tests has run successfully.
The six previously reported main-branch test failures were not investigated.
Do not describe this scaffold as a validated migration.

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
- Configure Cloudflare deployment access and approved secret provisioning.
  The currently connected DNS-oriented connector returned an auth-header error;
  dashboard access was available. Do not extract production environment secrets.
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
