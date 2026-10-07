/**
 * Sentry Node (server) SDK init. Wired via `instrumentation.ts`.
 *
 * Same PII guarantees as the client: `sendDefaultPii: false` and the shared
 * scrubber on `beforeSend`. No Replay on the server.
 */
import * as Sentry from "@sentry/nextjs";

import { resolveReleaseSha } from "@/lib/hosting/release";
import { scrubEvent } from "@/lib/observability/scrub";

const isProd = process.env.NEXT_PUBLIC_APP_ENV === "production";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  release: resolveReleaseSha(),
  environment: process.env.NEXT_PUBLIC_APP_ENV,
  tracesSampleRate: isProd ? 0.1 : 1.0,
  beforeSend: (event) => scrubEvent(event),
});
