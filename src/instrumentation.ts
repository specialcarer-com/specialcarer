/**
 * Next.js instrumentation hook. Loads the correct Sentry init for whichever
 * runtime the server is booting in. The config files live at the repo root
 * (the convention `@sentry/nextjs` expects).
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Captures errors thrown in React Server Components / route handlers so they
 * reach Sentry with request context. Provided by the SDK.
 */
export const onRequestError = Sentry.captureRequestError;
