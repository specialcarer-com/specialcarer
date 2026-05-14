import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type BannerVariant = {
  media_url: string;
  alt: string | null;
  focal_x: number;
  focal_y: number;
};

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
  // Optional alternating variants. When present, the front-end picks one of
  // [primary, variant_2, variant_3] per visitor via a sticky-per-visit cookie.
  media_url_2: string | null;
  alt_2: string | null;
  focal_x_2: number | null;
  focal_y_2: number | null;
  media_url_3: string | null;
  alt_3: string | null;
  focal_x_3: number | null;
  focal_y_3: number | null;
};

/** Returns the variants array (1–3 entries) from a StoredBanner. */
export function getBannerVariants(banner: StoredBanner): BannerVariant[] {
  const variants: BannerVariant[] = [
    {
      media_url: banner.media_url,
      alt: banner.alt,
      focal_x: banner.focal_x,
      focal_y: banner.focal_y,
    },
  ];
  if (banner.media_url_2) {
    variants.push({
      media_url: banner.media_url_2,
      alt: banner.alt_2,
      focal_x: banner.focal_x_2 ?? 50,
      focal_y: banner.focal_y_2 ?? 50,
    });
  }
  if (banner.media_url_3) {
    variants.push({
      media_url: banner.media_url_3,
      alt: banner.alt_3,
      focal_x: banner.focal_x_3 ?? 50,
      focal_y: banner.focal_y_3 ?? 50,
    });
  }
  return variants;
}

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
        "page_key, media_url, media_kind, alt, focal_x, focal_y, poster_url, storage_path, active, updated_at, media_url_2, alt_2, focal_x_2, focal_y_2, media_url_3, alt_3, focal_x_3, focal_y_3",
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
