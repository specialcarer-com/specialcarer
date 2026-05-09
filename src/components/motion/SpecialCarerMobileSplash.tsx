"use client";

/**
 * SpecialCarerMobileSplash
 *
 * Production implementation of the canonical mobile-app boot splash.
 * Portrait 9:16, dark teal stage with the full effect stack: ambient
 * gradient, ripple rings, sparkle field, drift bokeh, burst flash, icon
 * impact bump, settle breathing, and progress dots.
 *
 * Sources of truth:
 *   design/motion-brand/SpecialCarer-splash-mobile.html       (SLOW=1.7, 10s)
 *   design/motion-brand/SpecialCarer-splash-mobile-slow.html  (SLOW=2.5, 14s)
 *
 * Pacing:
 *   - slow=false (default) → SLOW=1.7, 10s. Returning-user boot.
 *   - slow=true            → SLOW=2.5, 14s. First-launch / onboarding.
 *
 * The SLOW factor is applied as a single time divisor across every
 * sub-effect so all rhythmic relationships stay intact.
 */

import { useMemo, type CSSProperties } from "react";
import { BRAND, Easing, WORDMARK, clamp, seeded } from "./_helpers";
import { useTime } from "./use-time";

const IMPACT = 2.4; // moment the icon "lands" (pre-SLOW, in scene seconds)

export interface SpecialCarerMobileSplashProps {
  /** Use the slowed cinematic pacing (SLOW=2.5, 14s) instead of the default (SLOW=1.7, 10s). */
  slow?: boolean;
  /** Fired once when the splash finishes (final frame reached). */
  onComplete?: () => void;
  /** Stop driving the animation. */
  paused?: boolean;
  /** Loop continuously (debug / preview). Defaults to false. */
  loop?: boolean;
  /**
   * Force the animation to play even when the user prefers reduced motion.
   * Used for the boot splash, where the brand intro is the canonical
   * launch experience and must play for every user. Defaults to false.
   */
  forceAnimate?: boolean;
  /** Optional className applied to the outer wrapper. */
  className?: string;
  /** Optional inline style merged onto the outer wrapper. */
  style?: CSSProperties;
}

export function SpecialCarerMobileSplash({
  slow = false,
  onComplete,
  paused = false,
  loop = false,
  forceAnimate = false,
  className,
  style,
}: SpecialCarerMobileSplashProps) {
  const SLOW = slow ? 2.5 : 1.7;
  const totalSec = slow ? 14 : 10;

  const { t: rawT, reducedMotion, done } = useTime({
    durationSec: totalSec,
    loop,
    paused,
    forceAnimate,
  });

  // Apply pacing factor — same constant divides every sub-effect.
  // When reduced-motion is on AND we are NOT force-animating, snap to
  // the final frame so the static composition is visible. Otherwise
  // run the rAF-driven scene normally.
  const useStaticEnd = reducedMotion && !forceAnimate;
  const t = (useStaticEnd ? totalSec : rawT) / SLOW;

  if (done && onComplete) onComplete();

  // Pre-roll deterministic randoms. Seed values match design HTML.
  const sparkleRnd = useMemo(() => seeded(7, 28 * 3), []);
  const driftRnd = useMemo(() => seeded(42, 14 * 3), []);

  // --- Scene scalars ------------------------------------------------------

  // Ambient breathing for radial gradient.
  const ambient = 0.55 + 0.08 * Math.sin(t * 0.8);

  // Burst flash overlay at impact.
  const flashX = t - IMPACT;
  const flash =
    flashX < 0 || flashX > 0.6 ? 0 : Math.pow(1 - flashX / 0.6, 2);

  // Settle breathing (camera).
  const settle = clamp((t - 4.0) / 1.5, 0, 1);
  const breath = 1 + Math.sin(t * 1.4) * 0.006 * settle;

  // Icon entrance.
  const tInA = clamp((t - 0.2) / 1.2, 0, 1);
  const easedA = Easing.easeOutBack(tInA);
  const iconScale = 0.55 + 0.45 * easedA;
  const iconOpacity = Easing.easeOutCubic(tInA);

  // Brush sweep on icon.
  const sweep = clamp((t - 0.4) / 1.4, 0, 1);
  const sweepEased = Easing.easeInOutCubic(sweep);

  // Icon impact bump.
  const ix = t - IMPACT;
  const impactBump =
    ix > -0.1 && ix < 0.5 ? Math.exp(-Math.pow((ix - 0.05) * 6, 2)) * 0.10 : 0;

  // Heart pulse.
  const beatT = Math.max(0, t - IMPACT);
  const burst = (delay: number) => {
    const x = beatT - delay;
    if (x < 0 || x > 0.45) return 0;
    return Math.sin((x / 0.45) * Math.PI);
  };
  const sustained = beatT > 0.8 ? 0.18 + 0.18 * Math.sin((beatT - 0.8) * 2.4) : 0;
  const beat = Math.max(burst(0), burst(0.35)) + sustained;

  // Wordmark — letter-by-letter typed reveal (matches supplied design).
  const wmStartBase = 2.6;
  const wmPerLetter = 0.045;
  const wmLetterDur = 0.55;

  // Tagline + bars.
  const taglineT = clamp((t - 4.0) / 1.0, 0, 1);
  const taglineEased = Easing.easeOutCubic(taglineT);
  const barP = clamp((t - 4.2) / 0.8, 0, 1);
  const barEased = Easing.easeInOutCubic(barP);

  // Drift fade-in.
  const driftFade = clamp((t - 0.5) / 1.5, 0, 1);

  // Progress dots.
  const dotsStart = 4.5;
  const dotsVisible = clamp((t - dotsStart) / 0.6, 0, 1);
  const dotsPhase = (t - dotsStart) * 1.4;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#06151a",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        ...style,
      }}
      aria-label="SpecialCarer splash"
      role="img"
    >
      {/* Stage gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(120% 80% at 50% 35%, rgba(3,158,160,${0.18 * ambient}) 0%, rgba(3,158,160,0) 55%),
            radial-gradient(140% 100% at 50% 100%, #0c2a2d 0%, #06151a 60%, #03090b 100%)
          `,
        }}
      />

      {/* Drift bokeh (ambience, behind everything) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
          opacity: driftFade,
        }}
      >
        {Array.from({ length: 14 }).map((_, i) => {
          const baseX = driftRnd[i] * 100;
          const baseY = driftRnd[i + 14] * 100;
          const speed = 4 + driftRnd[i + 28] * 6;
          const drift = (t * 8) / speed;
          const yp = (baseY - drift * 6 + 100) % 100;
          const sway = Math.sin(t * 0.8 + i) * 1.5;
          const size = 3 + driftRnd[i] * 5;
          const op = 0.18 + driftRnd[i + 14] * 0.32;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `calc(${baseX + sway}% - ${size / 2}px)`,
                top: `${yp}%`,
                width: size,
                height: size,
                borderRadius: "50%",
                background: BRAND.tealHi,
                opacity: op,
                filter: `blur(${size > 5 ? 2 : 0.5}px)`,
                boxShadow: `0 0 ${size * 2}px rgba(63,198,200,${op})`,
              }}
            />
          );
        })}
      </div>

      {/* Ripple rings */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "42%",
          width: 0,
          height: 0,
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        {[0.0, 0.18, 0.38].map((d, i) => {
          const x = t - (IMPACT + d);
          if (x < 0 || x > 1.6) return null;
          const p = x / 1.6;
          const r = 60 + p * 720;
          const op = (1 - p) * 0.5;
          const w = 2 + (1 - p) * 2;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: -r,
                top: -r,
                width: r * 2,
                height: r * 2,
                border: `${w}px solid rgba(63,198,200,${op})`,
                borderRadius: "50%",
                boxShadow: `0 0 ${20 * (1 - p)}px rgba(63,198,200,${op * 0.6}) inset, 0 0 ${30 * (1 - p)}px rgba(63,198,200,${op * 0.4})`,
              }}
            />
          );
        })}
      </div>

      {/* Sparkle field */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "42%",
          width: 0,
          height: 0,
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        {Array.from({ length: 28 }).map((_, i) => {
          const angle = (i / 28) * Math.PI * 2 + sparkleRnd[i] * 0.4;
          const x = t - (IMPACT + sparkleRnd[i + 28] * 0.15);
          if (x < 0 || x > 1.4) return null;
          const p = x / 1.4;
          const eased = Easing.easeOutCubic(p);
          const dist = 80 + sparkleRnd[i + 56] * 360 * eased + 220 * eased;
          const opacity = (1 - p) * (0.7 + sparkleRnd[i] * 0.3);
          const size = 4 + sparkleRnd[i + 28] * 8 * (1 - p);
          const dx = Math.cos(angle) * dist;
          const dy = Math.sin(angle) * dist;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: dx - size / 2,
                top: dy - size / 2,
                width: size,
                height: size,
                borderRadius: "50%",
                background: i % 4 === 0 ? "#fff" : BRAND.tealHi,
                opacity,
                boxShadow: `0 0 ${size * 2}px rgba(63,198,200,${opacity})`,
              }}
            />
          );
        })}
      </div>

      {/* Burst flash overlay (above particles, below composition) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 4,
          background: `radial-gradient(circle at 50% 42%, rgba(255,255,255,${0.55 * flash}) 0%, rgba(63,198,200,${0.22 * flash}) 18%, rgba(63,198,200,0) 45%)`,
        }}
      />

      {/* Composition: icon + wordmark + tagline */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          transform: `scale(${breath})`,
          transformOrigin: "center",
          zIndex: 5,
        }}
      >
        {/* Brand icon — supplied icon-only mark (wordmark animates separately below) */}
        <div
          style={{
            position: "relative",
            width: 360,
            maxWidth: "60vw",
            aspectRatio: "3 / 2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Icon halo behind */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "6%",
              width: 280,
              height: 280,
              maxWidth: "50vw",
              maxHeight: "50vw",
              transform: "translateX(-50%)",
              background: `radial-gradient(circle, rgba(63,198,200,${0.55 * (0.4 + beat * 0.6)}) 0%, rgba(63,198,200,0) 60%)`,
              filter: "blur(20px)",
              opacity: clamp((t - 1.5) / 0.5, 0, 1),
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              opacity: iconOpacity,
              transform: `scale(${iconScale * (1 + impactBump)})`,
              transformOrigin: "center 60%",
              WebkitMask: `linear-gradient(100deg, #000 0%, #000 ${sweepEased * 100 - 6}%, rgba(0,0,0,0.6) ${sweepEased * 100 - 2}%, transparent ${sweepEased * 100 + 4}%)`,
              mask: `linear-gradient(100deg, #000 0%, #000 ${sweepEased * 100 - 6}%, rgba(0,0,0,0.6) ${sweepEased * 100 - 2}%, transparent ${sweepEased * 100 + 4}%)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/specialcarer-icon.svg"
              alt="SpecialCarer"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: `drop-shadow(0 14px 40px rgba(3,158,160,0.45)) drop-shadow(0 0 ${10 + beat * 20}px rgba(63,198,200,${0.4 + beat * 0.5}))`,
              }}
            />
          </div>
        </div>

        {/* Wordmark — italic, letter-staggered (matches supplied design) */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            fontWeight: 700,
            fontStyle: "italic",
            fontSize: "clamp(40px, 13vw, 64px)",
            letterSpacing: "-0.025em",
            color: BRAND.teal,
            whiteSpace: "nowrap",
          }}
        >
          {WORDMARK.split("").map((ch, i) => {
            const start = wmStartBase + i * wmPerLetter;
            const lt = clamp((t - start) / wmLetterDur, 0, 1);
            const eased = Easing.easeOutCubic(lt);
            const blurEased = Easing.easeOutQuad(lt);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: eased,
                  transform: `translateY(${(1 - eased) * 22}px)`,
                  filter: `blur(${(1 - blurEased) * 8}px)`,
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
            transform: `translateY(${(1 - taglineEased) * 12}px)`,
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 56 * barEased,
              height: 1,
              background: "rgba(63,198,200,0.55)",
            }}
          />
          <div
            style={{
              fontWeight: 500,
              fontSize: 14,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            Care, 4 U
          </div>
          <div
            style={{
              width: 56 * barEased,
              height: 1,
              background: "rgba(63,198,200,0.55)",
            }}
          />
        </div>
      </div>

      {/* Progress dots */}
      <div
        style={{
          position: "absolute",
          bottom: "8%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 10,
          opacity: dotsVisible,
          zIndex: 6,
        }}
      >
        {[0, 1, 2].map((i) => {
          const v = (Math.sin(dotsPhase * 2 - i * 0.7) + 1) / 2;
          return (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: BRAND.tealHi,
                opacity: 0.3 + v * 0.7,
                transform: `scale(${0.8 + v * 0.4})`,
                boxShadow: `0 0 ${4 + v * 12}px rgba(63,198,200,${0.4 + v * 0.5})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default SpecialCarerMobileSplash;
