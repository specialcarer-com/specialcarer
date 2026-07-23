/**
 * SpecialCarerLogoStatic
 *
 * The pinned static lockup of the SpecialCarer logo: icon + wordmark + tagline,
 * with no animation. Use this for any context where the animated version
 * would be overkill or inappropriate:
 *
 *   - Email banners (clients don't render the animation)
 *   - PDF / certificate covers
 *   - App Store / TestFlight marketing screenshots
 *   - prefers-reduced-motion fallback
 *   - Any embed where the splash / hero animation has already played and
 *     the brand needs to settle into a quiet final state
 *
 * Source of truth: design/motion-brand/SpecialCarer-logo-static.html
 *
 * Renders as Server Component by default — safe to use anywhere without
 * pulling in the rAF loop / motion infra. Same `theme` API as
 * SpecialCarerLogoAnimation so consumers can flip between animated and
 * static via a single prop change.
 */

import type { CSSProperties } from "react";
import { BRAND, WORDMARK, TAGLINE } from "./_helpers";

export type LogoStaticTheme = "dark" | "light" | "transparent";

export interface SpecialCarerLogoStaticProps {
  /** Surface variant. Defaults to "dark". */
  theme?: LogoStaticTheme;
  /** Width of the rendered stage. Defaults to 100% of parent. */
  width?: number | string;
  /** Force a specific aspect ratio (e.g. "16 / 9"). Defaults to "auto" — wraps the lockup. */
  aspectRatio?: string;
  /** Optional className applied to the outer wrapper. */
  className?: string;
  /** Optional inline style merged onto the outer wrapper. */
  style?: CSSProperties;
  /** Hide the surface stage gradient (useful when embedding in a card that already has its own background). */
  bare?: boolean;
}

interface SurfaceTokens {
  body: string;
  stage: string;
  iconShadow: string;
  taglineText: string;
  taglineBars: string;
}

const SURFACES: Record<LogoStaticTheme, SurfaceTokens> = {
  dark: {
    body: "#0f1416",
    stage:
      "radial-gradient(120% 90% at 50% 35%, #11181a 0%, #0a0e10 70%, #06090a 100%)",
    iconShadow:
      "drop-shadow(0 14px 40px rgba(3,158,160,0.45)) drop-shadow(0 0 18px rgba(63,198,200,0.55))",
    taglineText: "rgba(244,239,230,0.78)",
    taglineBars: "rgba(244,239,230,0.45)",
  },
  light: {
    body: "#ffffff",
    stage:
      "radial-gradient(120% 90% at 50% 35%, #ffffff 0%, #f7fafa 70%, #eef5f5 100%)",
    // Light spec uses tighter, all-teal drop-shadows (no tealHi accent)
    // — matches design/motion-brand/SpecialCarer-logo-static-light.html exactly.
    iconShadow:
      "drop-shadow(0 10px 30px rgba(3,158,160,0.18)) drop-shadow(0 0 12px rgba(3,158,160,0.25))",
    taglineText: "rgba(15,20,22,0.65)",
    taglineBars: "rgba(15,20,22,0.25)",
  },
  transparent: {
    body: "transparent",
    stage: "transparent",
    // Transparent spec uses a pure glow halo (no vertical offset, no second layer)
    // so directional shadows never fall onto an unknown underlying surface.
    // — matches design/motion-brand/SpecialCarer-logo-static-transparent.html exactly.
    iconShadow: "drop-shadow(0 0 14px rgba(3,158,160,0.45))",
    taglineText: BRAND.teal,
    taglineBars: "rgba(3,158,160,0.55)",
  },
};

export function SpecialCarerLogoStatic({
  theme = "dark",
  width = "100%",
  aspectRatio,
  className,
  style,
  bare = false,
}: SpecialCarerLogoStaticProps) {
  const tokens = SURFACES[theme];

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width,
        aspectRatio,
        background: bare ? "transparent" : tokens.body,
        overflow: "hidden",
        ...style,
      }}
      aria-label="SpecialCarer logo"
      role="img"
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: bare ? "transparent" : tokens.stage,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {/* Icon */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/specialcarer-icon.svg"
          alt=""
          style={{
            width: "min(40%, 480px)",
            height: "auto",
            display: "block",
            filter: tokens.iconShadow,
          }}
        />

        {/* Wordmark — capital "C" gets the tealHi pop, matching the animation's settled state */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            fontWeight: 700,
            fontStyle: "italic",
            fontSize: "clamp(40px, 6.4vw, 110px)",
            letterSpacing: "-0.025em",
            color: BRAND.teal,
            lineHeight: 1,
            marginTop: 4,
          }}
        >
          {WORDMARK.split("").map((ch, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                color: i === 7 ? BRAND.tealHi : BRAND.teal,
              }}
            >
              {ch}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            marginTop: 16,
          }}
        >
          <div
            style={{
              width: 80,
              height: 1,
              background: tokens.taglineBars,
            }}
          />
          <div
            style={{
              fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              fontWeight: 500,
              fontSize: "clamp(11px, 1.2vw, 22px)",
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: tokens.taglineText,
            }}
          >
            {TAGLINE}
          </div>
          <div
            style={{
              width: 80,
              height: 1,
              background: tokens.taglineBars,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default SpecialCarerLogoStatic;
