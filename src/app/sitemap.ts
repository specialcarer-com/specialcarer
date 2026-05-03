import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://specialcarer.com";
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = (
    [
      { url: `${base}/`, changeFrequency: "weekly", priority: 1.0 },
      { url: `${base}/find-care`, changeFrequency: "daily", priority: 0.9 },
      { url: `${base}/services/elderly-care`, changeFrequency: "monthly", priority: 0.8 },
      { url: `${base}/services/childcare`, changeFrequency: "monthly", priority: 0.8 },
      { url: `${base}/services/special-needs`, changeFrequency: "monthly", priority: 0.8 },
      { url: `${base}/services/postnatal`, changeFrequency: "monthly", priority: 0.8 },
      { url: `${base}/trust`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${base}/how-it-works`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${base}/become-a-caregiver`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${base}/employers`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${base}/employers/contact`, changeFrequency: "monthly", priority: 0.5 },
      { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
      { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
      { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.6 },
      { url: `${base}/login`, changeFrequency: "monthly", priority: 0.4 },
      { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
      { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.3 },
      { url: `${base}/cookies`, changeFrequency: "monthly", priority: 0.3 },
    ] as const
  ).map((e) => ({ ...e, lastModified: now }));

  const blogEntries: MetadataRoute.Sitemap = getAllPosts().map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: new Date(p.publishedAt),
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [...staticEntries, ...blogEntries];
}
