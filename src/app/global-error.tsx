"use client";

/**
 * App Router global error boundary. Reports uncaught React render errors to
 * Sentry (the SDK no-ops when no DSN is configured) and renders a minimal
 * fallback. This is the setup `@sentry/nextjs` recommends for capturing render
 * errors; it only renders when the whole app tree throws, so it introduces no
 * change to normal pages.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <p>Something went wrong. Please try again.</p>
      </body>
    </html>
  );
}
