"use client";

/**
 * SpecialCarerLogoAnimation
 *
 * Production implementation of the canonical SpecialCarer animated logo.
 * Renders the icon + brush sweep + heart pulse + wordmark stagger + tagline
 * over one of three surface variants (dark | light | transparent). Identical
 * timing/easing/structure across themes — only surface tokens change per
 * the spec at `design/motion-brand/README.md`.
 *
 * Sources of truth:
 *   design/motion-brand/SpecialCarer-logo-animation.html              (dark)
 *   design/motion-brand/SpecialCarer-logo-animation-light.html        (light)
 *   design/motion-brand/SpecialCarer-logo-animation-transparent.html  (transparent)
 *
 * Implementation rules:
 *   - Backdrop / soft-glow / heart-halo nodes are OMITTED for theme="transparent"
 *     (not rendered with opacity 0).
 *   - prefers-reduced-motion → static composition only.
 *   - Wordmark is one word: "SpecialCarer". Tagline is "CARE, 4 U".
 */

import type { CSSProperties } from "react";
import { BRAND, Easing, WORDMARK, TAGLINE, clamp } from "./_helpers";
import { useTime } from "./use-time";

export type LogoTheme = "dark" | "light" | "transparent";

export interface SpecialCarerLogoAnimationProps {
  /** Surface variant. Defaults to "dark". */
  theme?: LogoTheme;
  /** Total run length in ms. Defaults to 6000 (the canonical 6s timeline). */
  durationMs?: number;
  /** Loop the animation continuously. Defaults to false. */
  loop?: boolean;
  /** Width of the rendered stage. Defaults to 100% of parent. */
  width?: number | string;
  /** Height of the rendered stage. Defaults to auto (16:9). */
  height?: number | string;
  /** Optional className applied to the outer wrapper. */
  className?: string;
  /** Optional inline style merged onto the outer wrapper. */
  style?: CSSProperties;
  /** Don't drive the animation (e.g. for SSR/preview). */
  paused?: boolean;
}

interface SurfaceTokens {
  body: string;
  stage: string;
  backdropTint: string | null;
  softGlowAlphaScale: number;
  heartHaloAlphaScale: number | null;
  iconShadowBase: string;
  iconShadowPulse: (beat: number) => string;
  heartBlend: "screen" | "multiply" | "normal";
  heartOverlayAlpha: (heartGlow: number) => number;
  taglineText: string;
  taglineBars: string;
}

const SURFACES: Record<LogoTheme, SurfaceTokens> = {
  dark: {
    body: "#0f1416",
    stage:
      "radial-gradient(120% 90% at 50% 35%, #11181a 0%, #0a0e10 70%, #06090a 100%)",
    backdropTint: "rgba(63,198,200,0.18)",
    softGlowAlphaScale: 0.22,
    heartHaloAlphaScale: 0.55,
    iconShadowBase: "drop-shadow(0 14px 40px rgba(3,158,160,0.45))",
    iconShadowPulse: (beat) =>
      `drop-shadow(0 0 ${10 + beat * 20}px rgba(63,198,200,${0.35 + beat * 0.4}))`,
    heartBlend: "screen",
    heartOverlayAlpha: (g) => 0.55 * Math.max(0, g - 0.4),
    taglineText: "rgba(244,239,230,0.78)",
    taglineBars: "rgba(244,239,230,0.45)",
  },
  light: {
    body: "#ffffff",
    stage:
      "radial-gradient(120% 90% at 50% 35%, #ffffff 0%, #f7fafa 70%, #eef5f5 100%)",
    backdropTint: "rgba(3,158,160,0.10)",
    softGlowAlphaScale: 0.14,
    heartHaloAlphaScale: 0.30,
    iconShadowBase: "drop-shadow(0 14px 40px rgba(3,158,160,0.18))",
    iconShadowPulse: (beat) =>
      `drop-shadow(0 0 ${10 + beat * 20}px rgba(3,158,160,${0.18 + beat * 0.25}))`,
    heartBlend: "multiply",
    heartOverlayAlpha: (g) => 0.40 * Math.max(0, g - 0.4),
    taglineText: "rgba(15,20,22,0.65)",
    taglineBars: "rgba(15,20,22,0.25)",
  },
  transparent: {
    body: "transparent",
    stage: "transparent",
    backdropTint: null,
    softGlowAlphaScale: 0,
    heartHaloAlphaScale: null,
    iconShadowBase: "drop-shadow(0 14px 40px rgba(3,158,160,0.25))",
    iconShadowPulse: (beat) =>
      `drop-shadow(0 0 ${10 + beat * 20}px rgba(3,158,160,${0.25 + beat * 0.35}))`,
    heartBlend: "normal",
    heartOverlayAlpha: (g) => 0.18 * Math.max(0, g - 0.4),
    taglineText: BRAND.teal,
    taglineBars: "rgba(3,158,160,0.55)",
  },
};

export function SpecialCarerLogoAnimation({
  theme = "dark",
  durationMs = 6000,
  loop = false,
  width = "100%",
  height = "auto",
  className,
  style,
  paused = false,
}: SpecialCarerLogoAnimationProps) {
  const { t, reducedMotion } = useTime({
    durationSec: durationMs / 1000,
    loop,
    paused,
  });
  const tokens = SURFACES[theme];
  const isTransparent = theme === "transparent";

  // Effective time — when reduced motion, freeze at end-of-timeline so the
  // composition reads as the static "final frame".
  const tt = reducedMotion ? durationMs / 1000 : t;

  // Phase A — icon entrance
  const tInA = clamp((tt - 0.2) / 1.2, 0, 1);
  const iconScale = 0.6 + 0.4 * Easing.easeOutBack(tInA);
  const iconOpacity = Easing.easeOutCubic(tInA);

  // Phase B — brush sweep
  const sweep = clamp((tt - 0.4) / 1.4, 0, 1);
  const sweepEased = Easing.easeInOutCubic(sweep);

  // Phase C — heart pulse
  const beatStart = 1.7;
  const beatT = Math.max(0, tt - beatStart);
  const burst = (delay: number) => {
    const x = beatT - delay;
    if (x < 0 || x > 0.45) return 0;
    return Math.sin((x / 0.45) * Math.PI);
  };
  const sustained = beatT > 0.8 ? 0.18 + 0.18 * Math.sin((beatT - 0.8) * 2.4) : 0;
  const beat = Math.max(burst(0), burst(0.35)) + sustained;
  const heartGlow = clamp(beat, 0, 1);

  // Phase D — icon breathing
  const settleD = clamp((tt - 2.0) / 1.0, 0, 1);
  const iconBreath = 1 + Math.sin(tt * 1.6) * 0.012 * settleD;

  // Phase E — wordmark per-letter reveal
  const wordmarkStart = 2.1;
  const perLetter = 0.045;
  const letterDur = 0.55;

  // Phase F — tagline
  const taglineT = clamp((tt - 3.4) / 1.0, 0, 1);
  const taglineEased = Easing.easeOutCubic(taglineT);
  const barP = clamp((tt - 3.6) / 0.8, 0, 1);
  const barEased = Easing.easeInOutCubic(barP);

  // Phase G — camera breathing
  const settleG = clamp((tt - 4.0) / 1.0, 0, 1);
  const cameraBreath = 1 + Math.sin(tt * 1.4) * 0.006 * settleG;

  // Phase C₁ — foundation underline
  const foundation = clamp(tt / 1.0, 0, 1);
  const foundationEased = Easing.easeInOutCubic(foundation);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width,
        aspectRatio: height === "auto" ? "16 / 9" : undefined,
        height: height === "auto" ? undefined : height,
        background: tokens.body,
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
          background: tokens.stage,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${cameraBreath})`,
          transformOrigin: "center",
        }}
      >
        {/* Backdrop tint — omitted for transparent */}
        {!isTransparent && tokens.backdropTint && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(60% 50% at 50% 45%, ${tokens.backdropTint} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Soft glow — omitted for transparent (alpha scale = 0) */}
        {!isTransparent && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "55%",
              aspectRatio: "1 / 1",
              transform: "translate(-50%, -50%)",
              background: `radial-gradient(circle, rgba(63,198,200,${tokens.softGlowAlphaScale * (0.4 + beat * 0.6)}) 0%, rgba(63,198,200,0) 60%)`,
              filter: "blur(24px)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Heart halo — omitted for transparent */}
        {!isTransparent && tokens.heartHaloAlphaScale != null && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "44%",
              width: "30%",
              aspectRatio: "1 / 1",
              transform: "translate(-50%, -50%)",
              background: `radial-gradient(circle, rgba(63,198,200,${tokens.heartHaloAlphaScale * heartGlow}) 0%, rgba(63,198,200,0) 60%)`,
              filter: "blur(16px)",
              pointerEvents: "none",
              opacity: clamp((tt - 1.5) / 0.5, 0, 1),
            }}
          />
        )}

        {/* Composition */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transform: `scale(${iconBreath})`,
            transformOrigin: "center",
            zIndex: 5,
          }}
        >
          {/* Icon with brush sweep mask */}
          <div
            style={{
              position: "relative",
              width: "min(36%, 360px)",
              aspectRatio: "3 / 2",
              opacity: iconOpacity,
              transform: `scale(${iconScale})`,
              transformOrigin: "center 60%",
              WebkitMask: `linear-gradient(100deg, #000 0%, #000 ${sweepEased * 100 - 6}%, rgba(0,0,0,0.6) ${sweepEased * 100 - 2}%, transparent ${sweepEased * 100 + 4}%)`,
              mask: `linear-gradient(100deg, #000 0%, #000 ${sweepEased * 100 - 6}%, rgba(0,0,0,0.6) ${sweepEased * 100 - 2}%, transparent ${sweepEased * 100 + 4}%)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/specialcarer-icon.svg"
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: `${tokens.iconShadowBase} ${tokens.iconShadowPulse(beat)}`,
              }}
            />
            {/* Heart overlay (additive glow / blend) */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "32%",
                width: "16%",
                aspectRatio: "1 / 1",
                transform: "translate(-50%, -50%)",
                background: `radial-gradient(circle, rgba(63,198,200,${tokens.heartOverlayAlpha(heartGlow)}) 0%, rgba(63,198,200,0) 70%)`,
                mixBlendMode: tokens.heartBlend,
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Foundation line (under icon) */}
          <div
            style={{
              width: "min(28%, 280px)",
              height: 2,
              marginTop: 4,
              background: `linear-gradient(90deg, rgba(3,158,160,0) 0%, ${BRAND.teal} 50%, rgba(3,158,160,0) 100%)`,
              transform: `scaleX(${foundationEased})`,
              transformOrigin: "center",
              opacity: foundationEased,
            }}
          />

          {/* Wordmark */}
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
              marginTop: "1.2em",
              lineHeight: 1,
            }}
          >
            {WORDMARK.split("").map((ch, i) => {
              const start = wordmarkStart + i * perLetter;
              const lt = clamp((tt - start) / letterDur, 0, 1);
              const eased = Easing.easeOutCubic(lt);
              const blurEased = Easing.easeOutQuad(lt);
              const isCapC = i === 7; // capital "C" pop
              const popMix = isCapC ? clamp((tt - (start + 0.2)) / 0.4, 0, 1) : 0;
              const color = isCapC
                ? popMix > 0
                  ? // gradient from tealHi back to teal
                    `color-mix(in srgb, ${BRAND.tealHi} ${(1 - popMix) * 100}%, ${BRAND.teal})`
                  : BRAND.tealHi
                : BRAND.teal;
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    opacity: eased,
                    transform: `translateY(${(1 - eased) * 32}px)`,
                    filter: `blur(${(1 - blurEased) * 10}px)`,
                    color,
                    textShadow: isCapC
                      ? `0 0 ${24 * (1 - popMix)}px rgba(63,198,200,${0.6 * (1 - popMix)})`
                      : "none",
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              opacity: taglineEased,
              transform: `translateY(${(1 - taglineEased) * 14}px)`,
              marginTop: 8,
            }}
          >
            <div
              style={{
                width: 56 * barEased,
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
                width: 56 * barEased,
                height: 1,
                background: tokens.taglineBars,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpecialCarerLogoAnimation;
