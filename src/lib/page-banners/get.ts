import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type StoredBanner = {
  page_key: string;
  media_url: string;
  media_kind: "image" | "video";
  alt: string | null;
  focal_x: number;
  focal_y: number;
  poster_url: string | null;
  storage_path: string | null;
  active: boolean;
  updated_at: string;
};

/**
 * Server-only loader. Used by marketing pages to fetch their hero banner.
 * Cached in Next's data cache and tagged so admin saves can revalidate.
 *
 * Uses the admin (service-role) client so unauthenticated marketing pages
 * can still read banners regardless of RLS state.
 */
export const getBanner = unstable_cache(
  async (pageKey: string): Promise<StoredBanner | null> => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("page_hero_banners")
      .select(
        "page_key, media_url, media_kind, alt, focal_x, focal_y, poster_url, storage_path, active, updated_at",
      )
      .eq("page_key", pageKey)
      .eq("active", true)
      .maybeSingle();
    if (error || !data) return null;
    return data as StoredBanner;
  },
  ["page-hero-banner"],
  { tags: ["page-hero-banners"], revalidate: 60 },
);
