/**
 * Sentry edge-runtime SDK init (middleware, edge routes). Wired via
 * `instrumentation.ts`. Same PII guarantees as the server config.
 */
import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "@/lib/observability/scrub";

const isProd = process.env.NEXT_PUBLIC_APP_ENV === "production";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.NEXT_PUBLIC_APP_ENV,
  tracesSampleRate: isProd ? 0.1 : 1.0,
  beforeSend: (event) => scrubEvent(event),
});
