import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = "https://specialcarer.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/dashboard/",
          "/account/",
          "/onboarding",
          "/book/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
