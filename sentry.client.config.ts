/**
 * Sentry browser SDK init.
 *
 * Loaded automatically by `@sentry/nextjs` on the client. When no DSN is set
 * (local dev without Sentry env vars) the SDK silently no-ops, so there is no
 * need to guard the call.
 *
 * PII policy: `sendDefaultPii: false` plus a `beforeSend` that runs the shared
 * scrubber over every outgoing event. See `src/lib/observability/scrub.ts`.
 *
 * Replay policy: Session Replay runs at a low site-wide sample rate but is
 * fully disabled on vetting and DBS routes, which render sensitive identity
 * documents we must never record.
 */
import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "@/lib/observability/scrub";

/**
 * Exported so it can be unit-tested in isolation. Strips PII from every event
 * before it leaves the browser. Returning the (mutated) event lets Sentry send
 * the scrubbed copy.
 */
export const beforeSend: NonNullable<
  NonNullable<Parameters<typeof Sentry.init>[0]>["beforeSend"]
> = (event) => scrubEvent(event);

/**
 * Routes where Session Replay must never run because they display identity
 * documents (DBS certificates, vetting evidence). Matched as path prefixes.
 */
const REPLAY_DENYLIST = [/^\/dashboard\/vetting(\/|$)/, /^\/m\/dbs(\/|$)/];

function isReplayDenied(): boolean {
  if (typeof window === "undefined") return true;
  const path = window.location.pathname;
  return REPLAY_DENYLIST.some((re) => re.test(path));
}

const isProd = process.env.NEXT_PUBLIC_APP_ENV === "production";
const replayDenied = isReplayDenied();

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Never let the SDK attach IP / cookies / headers automatically — our
  // scrubber is the only sanctioned path for any user-linked data.
  sendDefaultPii: false,
  // Vercel injects the commit SHA at build time; lets Sentry group by release.
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  environment: process.env.NEXT_PUBLIC_APP_ENV,
  tracesSampleRate: isProd ? 0.1 : 1.0,
  // Route events through our own origin to dodge ad-blockers that block
  // requests to sentry.io directly.
  tunnel: "/api/monitoring",
  // Replay: 10% of sessions site-wide, always on for sessions that error —
  // but zero on the denylisted vetting/DBS routes.
  replaysSessionSampleRate: replayDenied ? 0 : 0.1,
  replaysOnErrorSampleRate: replayDenied ? 0 : 1.0,
  integrations: replayDenied
    ? []
    : [
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
  beforeSend,
});
