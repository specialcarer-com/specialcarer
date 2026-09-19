/**
 * Resolves the deployed commit SHA for Sentry release tagging, regardless
 * of hosting provider.
 *
 * `sentry.server.config.ts`/`sentry.edge.config.ts` previously read only
 * `VERCEL_GIT_COMMIT_SHA`, which Vercel auto-injects at build time. That
 * variable is simply undefined on Cloudflare (nothing sets it there), so
 * every Cloudflare-originated Sentry event would silently lose release
 * tagging — not a crash, but a real loss of "which exact deployed commit
 * produced this error" during triage, easy to miss until someone actually
 * needs it during an incident.
 *
 * `GITHUB_SHA` is checked as the Cloudflare-path fallback because this
 * app's Cloudflare build runs via GitHub Actions (see
 * .github/workflows/cloudflare-compatibility.yml and pr-checks.yml), which
 * always sets it. If the Cloudflare build/deploy path ever moves off GitHub
 * Actions, this will need a different fallback added here — it is not a
 * generic "any CI" detector.
 */
export function resolveReleaseSha(): string | undefined {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || undefined;
}
