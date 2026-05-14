import { getBanner, getBannerVariants } from "@/lib/page-banners/get";
import { resolveVariant } from "@/lib/page-banners/pick-variant";
import { getSlot } from "@/lib/page-banners/registry";
import BannerVariantPicker from "./banner-variant-picker";

type Props = {
  pageKey: string;
  /** Hero height. Defaults to a tall, editorial feel on desktop. */
  height?: "sm" | "md" | "lg";
  /** Optional eyebrow/headline overlay for service pages. */
  overlay?: React.ReactNode;
  /** Tint strength of the gradient overlay so overlay text stays readable. */
  tint?: "none" | "soft" | "strong";
};

const HEIGHT_CLS: Record<NonNullable<Props["height"]>, string> = {
  sm: "h-[200px] sm:h-[260px] md:h-[300px]",
  md: "h-[280px] sm:h-[340px] md:h-[400px]",
  lg: "h-[320px] sm:h-[420px] md:h-[520px]",
};

const TINT_CLS: Record<NonNullable<Props["tint"]>, string> = {
  none: "",
  soft: "bg-gradient-to-b from-black/0 via-black/10 to-black/40",
  strong: "bg-gradient-to-b from-black/10 via-black/30 to-black/60",
};

/**
 * PageHeroBanner — server component.
 *
 * Reads /page_hero_banners by pageKey. Falls back to the slot's brand
 * gradient + a subtle pattern when no media has been uploaded so a missing
 * banner never feels "empty". Supports image and video.
 */
export default async function PageHeroBanner({
  pageKey,
  height = "md",
  overlay,
  tint = "soft",
}: Props) {
  const slot = getSlot(pageKey);
  const banner = await getBanner(pageKey);
  const variants = banner ? getBannerVariants(banner) : [];
  const resolved = banner && variants.length > 0
    ? await resolveVariant(pageKey, variants)
    : null;

  const fallbackAlt = slot?.defaultAlt ?? "";
  const fallbackBg =
    slot?.fallbackGradient ??
    "linear-gradient(135deg, #0E7C7B 0%, #039EA0 50%, #02787A 100%)";

  return (
    <section
      aria-label="Page banner"
      className={`relative w-full overflow-hidden ${HEIGHT_CLS[height]}`}
      style={banner ? undefined : { background: fallbackBg }}
    >
      {/* Media layer */}
      {banner?.media_kind === "image" && resolved && (
        variants.length > 1 ? (
          <BannerVariantPicker
            pageKey={pageKey}
            variants={variants}
            ssrIndex={resolved.index}
            needsClientPick={resolved.needsClientPick}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolved.variant.media_url}
            alt={resolved.variant.alt ?? fallbackAlt}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: `${resolved.variant.focal_x}% ${resolved.variant.focal_y}%`,
            }}
          />
        )
      )}
      {banner?.media_kind === "video" && (
        <video
          src={banner.media_url}
          poster={banner.poster_url ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          aria-label={banner.alt ?? fallbackAlt}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `${banner.focal_x}% ${banner.focal_y}%` }}
        />
      )}

      {/* Decorative pattern on the fallback so empty slots aren't flat. */}
      {!banner && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, #fff 0, transparent 35%), radial-gradient(circle at 80% 70%, #fff 0, transparent 40%)",
          }}
        />
      )}

      {/* Tint overlay for legibility */}
      <div className={`absolute inset-0 ${TINT_CLS[tint]}`} aria-hidden />

      {/* Optional foreground content (hero copy) */}
      {overlay && (
        <div className="relative z-10 h-full">
          <div className="mx-auto max-w-4xl h-full px-6 flex flex-col justify-end pb-8 sm:pb-12 text-white">
            {overlay}
          </div>
        </div>
      )}
    </section>
  );
}
