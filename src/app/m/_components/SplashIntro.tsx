"use client";

/**
 * Animated splash overlay shown immediately before the sign-in screen.
 *
 * Scope (per product direction): the splash plays on cold app launch
 * (the /m entry route, before the auth-decision redirect lands) and on
 * /m/login (returning users signing back in). Both are one-per-session,
 * so users don't see the same reveal twice in the same launch.
 *
 * Critically: once the splash mounts on /m, it stays mounted across the
 * client-side router.replace() to /m/onboarding or /m/home so the full
 * 7s reveal never gets clipped by the redirect. We lock onto the first
 * allowed route we see and ignore subsequent path changes for unmount.
 *
 * v3.12 update — swap the simple ring/pulse intro for the canonical
 * SpecialCarerMobileSplash component (full ripple/sparkle/drift/flash/dot
 * stack, dark teal stage).
 *
 * Why we still need this on top of the native iOS launch image:
 *   - Capacitor's native splash (mobile/resources/splash.png) shows only
 *     until the WebView is ready, which on cold launches can finish before
 *     the JS bundle has fully loaded — leaving a beat of bare white.
 *   - On warm launches (already running, returning from background) iOS
 *     does NOT show the native splash at all.
 *   - This overlay paints immediately on first React render at /m/login so
 *     there's a branded transition into the sign-in screen instead of a
 *     flash of empty UI.
 *
 * Behaviour:
 *   - Renders only when pathname === "/m/login". On any other /m/* route
 *     the component returns null on first render (no DOM, no timers).
 *   - Plays once per session (sessionStorage gate). After it's done, the
 *     overlay is unmounted entirely so subsequent visits to /m/login in
 *     the same session don't replay it.
 *   - Total visible ~7000 ms, then 320 ms fade-out. The canonical splash
 *     runs 10s in scene-time — at SLOW=1.7 the icon lands by ~2.4s, the
 *     wordmark finishes typing by ~6.6s, and the tagline lands at ~8.5s.
 *     We hold to ~7000ms so users see the full "SpecialCarer" wordmark
 *     reveal (the whole point of the splash) before fading. Tap-anywhere
 *     skips after a short grace window.
 *   - prefers-reduced-motion → instant fade-in / fade-out, no animation.
 *   - First paint shows a solid teal background so there's no white flash
 *     while the SplashIntro client component hydrates.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SpecialCarerMobileSplash } from "@/components/motion/SpecialCarerMobileSplash";

const SESSION_KEY = "sc:splash:played";
const VISIBLE_MS = 7000;
const FADE_MS = 320;
const TAP_GRACE_MS = 500;

/**
 * Pathnames the splash is allowed to start on:
 *   - /m       → cold-launch entry (app open from icon)
 *   - /m/login → returning user signing in
 * Sign-up and onboarding intentionally do NOT trigger the splash; if a
 * user lands there directly via deep-link they don't get the reveal.
 */
const ALLOWED_PATHS = new Set(["/m", "/m/login"]);

export default function SplashIntro() {
  const pathname = usePathname();
  // Lock onto the first allowed path we see. Once locked, we ignore
  // subsequent route changes so the splash plays through its full
  // duration even when /m client-redirects to /m/onboarding mid-reveal.
  const lockedRef = useRef<boolean>(false);
  const isAllowedNow = pathname ? ALLOWED_PATHS.has(pathname) : false;
  if (isAllowedNow) lockedRef.current = true;
  const allowed = lockedRef.current;

  const [mounted, setMounted] = useState(false); // gate hydration paint
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [reduced, setReduced] = useState(false);
  const dismissed = useRef(false);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!allowed) return; // Off-route: never start any timers.

    setMounted(true);
    startedAt.current = Date.now();

    // Already played this session → skip entirely.
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setVisible(false);
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private mode / blocked storage — just play it once.
    }

    // prefers-reduced-motion → gentle staged fade-in (no ripples,
    // sparkles, or scaling — those can trigger vestibular discomfort)
    // held long enough to comfortably read the wordmark + tagline.
    let visibleMs = VISIBLE_MS;
    try {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mql.matches) {
        setReduced(true);
        visibleMs = 4500; // hold long enough to read everything
      }
    } catch {
      /* noop */
    }

    const fadeT = window.setTimeout(() => setFading(true), visibleMs);
    const hideT = window.setTimeout(() => setVisible(false), visibleMs + FADE_MS);
    return () => {
      window.clearTimeout(fadeT);
      window.clearTimeout(hideT);
    };
  }, [allowed]);

  // Tap-to-skip after the grace window.
  function handleSkip() {
    if (dismissed.current) return;
    if (Date.now() - startedAt.current < TAP_GRACE_MS) return;
    dismissed.current = true;
    setFading(true);
    window.setTimeout(() => setVisible(false), FADE_MS);
  }

  if (!allowed) return null;
  if (!mounted || !visible) return null;

  return (
    <div
      role="presentation"
      aria-hidden="true"
      onClick={handleSkip}
      className="sc-splash-overlay"
      data-fading={fading ? "1" : "0"}
    >
      {reduced ? (
        // Reduced-motion fallback — staged fade-in with a gentle teal
        // halo pulse around the icon. No translation, no scale changes,
        // no flying particles — just opacity + a soft breathing glow.
        // Total reveal sequence:
        //   0.0s  icon halo + icon fade in
        //   0.6s  wordmark fades in
        //   1.4s  tagline fades in
        //   held until visibleMs, then overlay fades.
        <div className="sc-splash-reduced">
          <div className="sc-splash-reduced-icon-wrap">
            <div className="sc-splash-reduced-halo" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/specialcarer-icon.svg"
              alt=""
              className="sc-splash-reduced-icon"
              decoding="async"
              draggable={false}
            />
          </div>
          <div className="sc-splash-reduced-wordmark">SpecialCarer</div>
          <div className="sc-splash-reduced-tagline">CARE, 4 U</div>
        </div>
      ) : (
        <div className="sc-splash-canvas">
          <SpecialCarerMobileSplash />
        </div>
      )}

      <style jsx>{`
        .sc-splash-overlay {
          position: fixed;
          inset: 0;
          /* Cover the iOS status bar / home indicator too. The overlay
             must be edge-to-edge so there's no white strip above or
             below the teal stage. Inner content is centred, so it does
             not need explicit safe-area padding. */
          z-index: 9999;
          background: #06151a;
          opacity: 1;
          transition: opacity ${FADE_MS}ms ease-out;
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          overflow: hidden;
        }
        .sc-splash-overlay[data-fading="1"] {
          opacity: 0;
          pointer-events: none;
        }

        .sc-splash-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .sc-splash-reduced {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          padding: 0 32px;
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        }

        /* Icon + halo wrap — keeps the halo perfectly behind the mark. */
        .sc-splash-reduced-icon-wrap {
          position: relative;
          width: min(60vw, 280px);
          aspect-ratio: 3 / 2;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sc-splash-reduced-halo {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 110%;
          height: 165%;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle,
            rgba(63, 198, 200, 0.55) 0%,
            rgba(63, 198, 200, 0) 65%
          );
          filter: blur(20px);
          opacity: 0;
          animation:
            sc-fade-in 600ms ease-out 100ms forwards,
            sc-halo-breathe 3.2s ease-in-out 700ms infinite;
        }
        .sc-splash-reduced-icon {
          position: relative;
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 14px 40px rgba(3, 158, 160, 0.45));
          opacity: 0;
          animation: sc-fade-in 700ms ease-out forwards;
        }
        .sc-splash-reduced-wordmark {
          font-weight: 700;
          font-style: italic;
          font-size: clamp(40px, 13vw, 64px);
          letter-spacing: -0.025em;
          color: #039ea0;
          line-height: 1;
          margin-top: 4px;
          opacity: 0;
          animation: sc-fade-in 600ms ease-out 600ms forwards;
        }
        .sc-splash-reduced-tagline {
          margin-top: 10px;
          font-weight: 500;
          font-size: 14px;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.85);
          opacity: 0;
          animation: sc-fade-in 500ms ease-out 1400ms forwards;
        }
        @keyframes sc-fade-in {
          to {
            opacity: 1;
          }
        }
        /* Gentle halo breathing — opacity only, no scale/translate, so
           it stays well within reduced-motion safety. */
        @keyframes sc-halo-breathe {
          0%, 100% {
            opacity: 0.55;
          }
          50% {
            opacity: 0.85;
          }
        }
      `}</style>
    </div>
  );
}
