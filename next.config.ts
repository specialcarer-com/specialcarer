import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Points next-intl at the request config that resolves the active locale.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Set by the `cf:build` script (see package.json) — not by `next build` run
// directly or via Vercel. Used to scope Cloudflare-only config below without
// affecting the existing Vercel build path.
const isCloudflareBuild = process.env.CLOUDFLARE_BUILD === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // TEMPORARY UNBLOCK (see PR #187 typecheck hang):
  // On Vercel every production build since PR #187 (7fc85b4, 2026-08-22)
  // hangs indefinitely at `Linting and checking validity of types...` and is
  // eventually flipped to Error at the 45-minute build ceiling. Locally the
  // exact same commit passes `tsc --noEmit` cleanly in ~40s and `next build`
  // completes its type-check step in ~1min. A `--generateTrace` sweep found
  // no pathological type inference in any file (all PR #187 files check in
  // <1s each; total 60s / ~2GB memory). See `pr187_typecheck_diagnosis.md`
  // for the full workspace diagnosis.
  //
  // Because the type-checker is verified green locally we skip the
  // in-build re-run to restore deployability. Type safety is still enforced
  // via `npm run typecheck` (developer machines + any future CI job).
  // TODO(#187): remove once the Vercel-side hang is understood or the build
  // image change that regressed it is rolled back. Track with an incident
  // ticket before this flag becomes load-bearing.
  typescript: {
    ignoreBuildErrors: true,
  },
  // No ESLint config exists in this repo; `next build`'s ESLint step is a
  // silent no-op today. Set explicitly so the behaviour stays deterministic
  // regardless of what future Next.js versions do when config is missing.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Cloudflare has no bundled equivalent of Vercel's built-in image
  // optimization service. Two real options exist — bind Cloudflare Images
  // (a separate paid product, billed per stored/transformed image) or serve
  // images unoptimized. Deliberately choosing the zero-cost option for now;
  // this is a decision to revisit before go-live, not an oversight. Vercel
  // is completely unaffected (images stays unset there, i.e. Next's default
  // built-in optimizer).
  images: isCloudflareBuild ? { unoptimized: true } : undefined,
  // sharp is only ever reached through Next's built-in image-optimization
  // route handler, which OpenNext's Cloudflare adapter still includes even
  // with images.unoptimized above — the route must exist to serve images
  // unchanged. sharp ships per-platform native binaries; bundling it
  // (rather than leaving it as an external require) makes esbuild try to
  // statically resolve those binaries and fail. This is never actually
  // invoked on Cloudflare (images are unoptimized there), so externalizing
  // it is safe — it just stops the bundler from trying. Scoped to the
  // Cloudflare build only; Vercel's own image pipeline is unaffected.
  ...(isCloudflareBuild ? { serverExternalPackages: ["sharp"] } : {}),
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
