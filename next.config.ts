import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Points next-intl at the request config that resolves the active locale.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // US spelling alias for the organisations marketing page.
      { source: "/organizations", destination: "/organisations", permanent: true },
      { source: "/organizations/:path*", destination: "/organisations/:path*", permanent: true },
      // Catch the common 'business' path that some procurement teams
      // search for.
      { source: "/business", destination: "/organisations", permanent: true },
      // The multi-step /m/org/register flow is retired in favour of the
      // single-page /signup/organisation flow. Permanently redirect the old
      // entry point and every step (step-1 … step-9, step-7-5) so external
      // bookmarks and emails referencing the old URLs keep working. The route
      // files are kept in place; these redirects intercept before they render.
      { source: "/m/org/register", destination: "/signup/organisation", permanent: true },
      { source: "/m/org/register/:path*", destination: "/signup/organisation", permanent: true },
    ];
  },
};

export default withSentryConfig(
  withNextIntl(withBundleAnalyzer(nextConfig)),
  {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Only emit upload logs in CI; keep local builds quiet.
    silent: !process.env.CI,
    // Upload a wider set of client bundles so stack traces resolve cleanly.
    widenClientFileUpload: true,
    // Serve Sentry ingest through our own origin to bypass ad-blockers. Next
    // generates the route handler for this path automatically.
    tunnelRoute: "/api/monitoring",
    // Source maps are uploaded then deleted from the deployed bundle so they
    // aren't publicly served.
    sourcemaps: { deleteSourcemapsAfterUpload: true },
    // Auth token for source-map upload is read from SENTRY_AUTH_TOKEN in the
    // environment; never inline it here.
    disableLogger: true,
  },
);
