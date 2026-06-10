import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

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
    ];
  },
};

export default withNextIntl(withBundleAnalyzer(nextConfig));
