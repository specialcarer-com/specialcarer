"use client";

/**
 * SignInRippleReveal
 *
 * Wraps the /m/login content with a one-shot ripple-reveal handoff from
 * the splash. After the splash overlay completes (~7s), a circular
 * ripple expands from the heart-cross centroid and reveals the sign-in
 * screen content inside its leading edge while the outside stays teal
 * (matching the splash final frame). Sparkles ride the ripple front.
 * After the ripple finishes, the AppLogo tile briefly settles 95% → 100%.
 *
 * Trigger rules (Option C from V3_2_SPEC.md):
 *   - Plays ONLY on cold-launch → sign-in path, i.e. the same JS mount
 *     cycle in which SplashIntro just played.
 *   - Does NOT play when the user returns from background, signs out,
 *     or navigates to /m/login any subsequent time.
 *
 * Reduce-motion fallback:
 *   - 200ms cross-fade, no ripple, no sparkles, no tile settle.
 *   - Honours `prefers-reduced-motion: reduce`.
 *   - `forceAnimate` (dev/QA path) overrides reduce-motion at every layer.
 *
 * Implementation notes:
 *   - No new dependencies. Uses CSS `clip-path: circle(...)` (well
 *     supported in iOS WebView) for the ripple reveal, plain DOM nodes
 *     for the sparkle band, and a CSS transform for the tile settle.
 *   - The "teal lock frame" outside the ripple front is a fixed-position
 *     div painted brand teal. Once the ripple finishes (radius >>
 *     viewport diagonal), the wrapper unmounts entirely.
 *
 * See: splash_inspect/V3_2_SPEC.md, src/app/m/_components/SplashIntro.tsx
 */

import { useEffect, useRef, useState } from "react";
import { didSplashPlayThisMount } from "./SplashIntro";

/** Brand teal — must match the splash final-frame background EXACTLY. */
const BRAND_TEAL = "#039EA0";

/** Ripple duration (ms). */
const RIPPLE_MS = 800;
/** Tile settle (95% → 100%) duration (ms). */
const TILE_SETTLE_MS = 200;
/** Reduce-motion cross-fade duration (ms). */
const REDUCED_FADE_MS = 200;
/** Sparkle count along the ripple front. */
const SPARKLE_COUNT = 80;
/** Per-sparkle fade-in / fade-out duration (ms). */
const SPARKLE_LIFE_MS = 100;
/** Outward drift distance per sparkle (px). */
const SPARKLE_DRIFT_PX = 3;
/** Annular band thickness on either side of the ripple front (px). */
const SPARKLE_BAND_PX = 8;
/**
 * Ripple end radius multiplier — front travels to 1.4× the screen
 * diagonal so even the corners are well-revealed before unmount.
 */
const RIPPLE_END_DIAG_MULT = 1.4;

/**
 * Heart-cross centroid in viewBox 0..161 × 0..82 (source SVG path 7).
 *   - x ≈ 80 (centre of the icon glyph)
 *   - y ≈ 22 (a touch below the top of the icon)
 * Mapped to screen coords below using the icon's render frame on the
 * splash, which matches the AppLogo on the sign-in screen vertically.
 *
 * Tuned to the same on-screen position the splash uses (icon centred
 * horizontally, lifted slightly above true vertical centre).
 */
const HEART_CENTROID_X_FRAC = 0.5; // horizontally centred on screen
const HEART_CENTROID_Y_FRAC = 0.42; // approx top-of-icon vertically

export interface SignInRippleRevealProps {
  /**
   * The sign-in screen content. Visible from t=0 inside the ripple front
   * as it expands, and fully visible once the ripple finishes.
   */
  children: React.ReactNode;
  /**
   * Force the animation to play even when the user has Reduce Motion on.
   * Use sparingly — dev/QA path only. Honoured at every animation layer.
   */
  forceAnimate?: boolean;
  /**
   * Override the cold-launch gate. When unset, the ripple plays only
   * when SplashIntro played in the same mount cycle.
   */
  playFizzle?: boolean;
}

/** Deterministic per-sparkle layout (avoids hydration mismatch). */
function buildSparkles(diagPx: number) {
  const out: Array<{ angle: number; r: number; size: number; delay: number }> = [];
  // Linear-congruential generator with a fixed seed so positions are
  // stable across re-renders and runs.
  let s = 1337;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    const angle = rand() * Math.PI * 2;
    // Sparkle "trigger radius" — when the ripple front reaches this r,
    // the sparkle blinks. Spread evenly across the ripple lifetime so
    // they appear in waves rather than all at once.
    const u = (i + rand() * 0.7) / SPARKLE_COUNT;
    const r = u * diagPx * RIPPLE_END_DIAG_MULT;
    const size = 1 + Math.round(rand() * 2); // 1..3 px
    const delay = u * RIPPLE_MS; // ms after ripple start
    out.push({ angle, r, size, delay });
  }
  return out;
}

export function SignInRippleReveal({
  children,
  forceAnimate = false,
  playFizzle,
}: SignInRippleRevealProps) {
  // Decide once at mount whether to play. Capturing in a ref avoids the
  // ripple flickering back on if React re-renders us for any reason.
  const decidedRef = useRef<boolean | null>(null);
  if (decidedRef.current === null) {
    decidedRef.current = playFizzle ?? didSplashPlayThisMount();
  }
  const shouldPlay = decidedRef.current;

  const [reducedMotion, setReducedMotion] = useState(false);
  const [phase, setPhase] = useState<"pending" | "rippling" | "settling" | "done">(
    shouldPlay ? "pending" : "done",
  );
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [tNow, setTNow] = useState(0); // ms since ripple start

  // prefers-reduced-motion (read once + subscribe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Capture viewport size at mount (and on resize, e.g. rotation).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Drive the ripple via rAF, then the tile settle, then unmount the
  // overlay. forceAnimate bypasses reduce-motion at THIS layer too.
  useEffect(() => {
    if (!shouldPlay) return;
    // Effect deps no longer include `phase`; this effect runs exactly once
    // after shouldPlay+viewport are set, schedules the rAF tick chain, and
    // the cleanup at line 189-192 only fires on full unmount.
    if (viewport == null) return;

    // Reduce Motion (without forceAnimate): use a simple cross-fade
    // instead of the ripple. We still go through phases so the overlay
    // can unmount cleanly.
    if (reducedMotion && !forceAnimate) {
      setPhase("rippling");
      const t1 = window.setTimeout(() => setPhase("done"), REDUCED_FADE_MS);
      return () => window.clearTimeout(t1);
    }

    setPhase("rippling");
    startedAtRef.current = performance.now();

    const tick = (now: number) => {
      const start = startedAtRef.current ?? now;
      const elapsed = now - start;
      if (elapsed >= RIPPLE_MS) {
        setTNow(RIPPLE_MS);
        setPhase("settling");
        return;
      }
      setTNow(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [shouldPlay, reducedMotion, forceAnimate, viewport]);

  // Tile-settle phase → done.
  useEffect(() => {
    if (phase !== "settling") return;
    const t = window.setTimeout(() => setPhase("done"), TILE_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Always render children. The overlay sits on top while phase != done.
  if (!shouldPlay || phase === "done") {
    return <>{children}</>;
  }

  const useReducedFallback = reducedMotion && !forceAnimate;

  // Compute ripple geometry. Origin is mapped from heart-cross centroid.
  const vw = viewport?.w ?? 0;
  const vh = viewport?.h ?? 0;
  const originX = vw * HEART_CENTROID_X_FRAC;
  const originY = vh * HEART_CENTROID_Y_FRAC;
  const diag = Math.hypot(vw, vh);
  const endRadius = diag * RIPPLE_END_DIAG_MULT;

  // ease-out cubic
  const u = useReducedFallback ? 1 : Math.min(1, tNow / RIPPLE_MS);
  const eased = 1 - Math.pow(1 - u, 3);
  const radius = eased * endRadius;

  return (
    <div
      className="sc-ripple-host"
      data-phase={phase}
      data-reduced={useReducedFallback ? "1" : "0"}
    >
      {/*
        Inner wrapper masked to the expanding circle. Children paint
        the real sign-in screen here; outside the circle, the teal
        lock-frame behind it shows through.

        Tile-settle (95% → 100%, ease-out, 200ms) is applied via a CSS
        class on the host once the ripple completes; descendant elements
        marked with `data-sc-auth-tile` (the AppLogo wrapper on the
        sign-in screen) animate during the settle phase. See mobile.css
        for the keyframes — kept off the inline style so the React
        wrapper itself never scales (only the tile does).
      */}
      <div
        className="sc-ripple-reveal"
        style={{
          // Inside ripple front: visible. Outside: clipped.
          clipPath: useReducedFallback
            ? "none"
            : `circle(${radius}px at ${originX}px ${originY}px)`,
          WebkitClipPath: useReducedFallback
            ? "none"
            : `circle(${radius}px at ${originX}px ${originY}px)`,
          opacity: useReducedFallback ? (phase === "rippling" ? 0 : 1) : 1,
          transition: useReducedFallback
            ? `opacity ${REDUCED_FADE_MS}ms cubic-bezier(0.4,0,0.2,1)`
            : undefined,
        }}
      >
        {children}
      </div>

      {/*
        Teal lock-frame painted UNDER the masked content so anything
        outside the circle reads as the splash final frame. Sits below
        the masked layer so it never covers it.
      */}
      <div className="sc-ripple-lockframe" aria-hidden />

      {/*
        Sparkle band — a thin annular ring of white dots at the ripple
        front. Each sparkle blinks 0→1→0 over its 100ms life when the
        ripple front reaches its trigger radius. Hidden when Reduce
        Motion is on (and forceAnimate is off) — we don't decorate the
        cross-fade.
      */}
      {!useReducedFallback && viewport != null && (
        <SparkleLayer
          originX={originX}
          originY={originY}
          radius={radius}
          tNow={tNow}
          diag={diag}
        />
      )}

      <style jsx>{`
        .sc-ripple-host {
          position: fixed;
          inset: 0;
          z-index: 9998; /* below the splash (9999), above app content */
          pointer-events: none;
          overflow: hidden;
        }
        .sc-ripple-lockframe {
          position: absolute;
          inset: 0;
          background: ${BRAND_TEAL};
          z-index: 0;
        }
        .sc-ripple-reveal {
          position: absolute;
          inset: 0;
          z-index: 1;
          /* Children own pointer events again once revealed. */
          pointer-events: ${useReducedFallback || phase === "rippling" ? "none" : "auto"};
          background: #ffffff;
        }
      `}</style>
    </div>
  );
}

/**
 * Sparkle band — independent renderer so the ripple's rAF tick doesn't
 * have to thrash through 80 sparkle nodes on every frame. We compute
 * once which sparkles have already triggered and how far into their
 * 100ms life they are, then render only the live ones.
 */
function SparkleLayer({
  originX,
  originY,
  radius,
  tNow,
  diag,
}: {
  originX: number;
  originY: number;
  radius: number;
  tNow: number;
  diag: number;
}) {
  const sparklesRef = useRef<ReturnType<typeof buildSparkles> | null>(null);
  if (sparklesRef.current == null) sparklesRef.current = buildSparkles(diag);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {sparklesRef.current.map((s, i) => {
        // Time since this sparkle's trigger (ms). Sparkles trigger when
        // ripple-elapsed reaches their delay; live for SPARKLE_LIFE_MS.
        const lifeT = tNow - s.delay;
        if (lifeT < 0 || lifeT > SPARKLE_LIFE_MS) return null;
        // Front passes through s.r at some elapsed time — we use the
        // current ripple radius for placement so they ride the front.
        // Place at radius (current ripple front) ± a small band offset
        // tied to lifeT (drift outward as they fade).
        const driftU = lifeT / SPARKLE_LIFE_MS; // 0..1
        const r = radius - SPARKLE_BAND_PX + driftU * (2 * SPARKLE_BAND_PX + SPARKLE_DRIFT_PX);
        const x = originX + Math.cos(s.angle) * r;
        const y = originY + Math.sin(s.angle) * r;
        // Triangle-wave opacity: 0→1 then 1→0 over the life.
        const opacity =
          driftU < 0.5 ? driftU * 2 : (1 - driftU) * 2;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: x - s.size / 2,
              top: y - s.size / 2,
              width: s.size,
              height: s.size,
              borderRadius: "50%",
              background: "#FFFFFF",
              opacity,
              boxShadow: "0 0 2px rgba(255,255,255,0.8)",
            }}
          />
        );
      })}
    </div>
  );
}

export default SignInRippleReveal;
