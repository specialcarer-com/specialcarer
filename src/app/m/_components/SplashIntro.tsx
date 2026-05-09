"use client";

/**
 * Animated splash overlay shown immediately before the sign-in screen.
 *
 * Scope (per product direction): the splash plays only on the /m/login
 * route, just before users see Welcome Back!. We deliberately do NOT play
 * it on /m (the entry redirect) or /m/onboarding so first-time users move
 * through the onboarding carousel without an interrupting brand reveal.
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
 * Pathnames the splash is allowed to play on. Today this is just the
 * sign-in screen; sign-up intentionally does NOT trigger the splash so
 * the same-session SESSION_KEY gate doesn't cause a no-op there either.
 */
const ALLOWED_PATHS = new Set(["/m/login"]);

export default function SplashIntro() {
  const pathname = usePathname();
  const allowed = pathname ? ALLOWED_PATHS.has(pathname) : false;

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

    // prefers-reduced-motion → instant fade.
    let visibleMs = VISIBLE_MS;
    try {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mql.matches) {
        setReduced(true);
        visibleMs = 600; // very brief brand chrome instead of the full splash
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
        // Reduced-motion fallback — solid teal stage with static wordmark.
        <div className="sc-splash-reduced">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-wordmark-email.png"
            alt=""
            width={220}
            height={166}
            className="sc-splash-reduced-logo"
            decoding="async"
            draggable={false}
          />
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
          z-index: 9999;
          /* Solid teal stage matches the SpecialCarerMobileSplash background,
             so there's no white flash while the canvas mounts. */
          background: #06151a;
          opacity: 1;
          transition: opacity ${FADE_MS}ms ease-out;
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
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
          display: grid;
          place-items: center;
        }
        .sc-splash-reduced-logo {
          width: 220px;
          height: auto;
          opacity: 0;
          animation: sc-fade-in 220ms ease-out forwards;
          /* Tint white wordmark down for the dark stage. */
          filter: brightness(1.15) saturate(1.05);
        }
        @keyframes sc-fade-in {
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
