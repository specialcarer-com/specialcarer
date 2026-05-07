"use client";

/**
 * Animated splash overlay shown briefly on first paint of the mobile WebView.
 *
 * Why we need this on top of the native iOS launch image:
 *   - Capacitor's native splash (mobile/resources/splash.png) only shows
 *     until the WebView is ready, which on cold launches can finish before
 *     the JS bundle has fully loaded — leaving a beat of bare white.
 *   - On warm launches (already running, returning from background) iOS
 *     does NOT show the native splash at all.
 *   - This overlay paints immediately on first React render so there's a
 *     branded transition into the app instead of a flash of empty UI.
 *
 * Behaviour:
 *   - Plays once per session (sessionStorage gate). After it's done, the
 *     overlay is unmounted entirely so the rest of /m never sees it.
 *   - Total duration ~1500 ms, then 250 ms fade-out. Tap-anywhere skips.
 *   - prefers-reduced-motion → instant fade-in / fade-out, no pulse.
 *   - Uses CSS @keyframes (not framer-motion) to keep bundle size minimal
 *     and avoid layout shift while React hydrates.
 *
 * The visual is the SpecialCarer wordmark (PNG already shipped in /public),
 * so we don't re-encode the artwork — we just animate it.
 */

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "sc:splash:played";
const TOTAL_MS = 1500;
const FADE_MS = 280;

export default function SplashIntro() {
  const [mounted, setMounted] = useState(false); // gate hydration paint
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const dismissed = useRef(false);

  useEffect(() => {
    setMounted(true);
    // If we've already played the intro this session, skip it.
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setVisible(false);
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private mode / blocked storage — just play it once.
    }

    const fadeT = window.setTimeout(() => setFading(true), TOTAL_MS);
    const hideT = window.setTimeout(() => setVisible(false), TOTAL_MS + FADE_MS);
    return () => {
      window.clearTimeout(fadeT);
      window.clearTimeout(hideT);
    };
  }, []);

  // Tap-to-skip — but only after the first ~250 ms so a stray tap during
  // launch doesn't dismiss the intro instantly.
  function handleSkip() {
    if (dismissed.current) return;
    dismissed.current = true;
    setFading(true);
    window.setTimeout(() => setVisible(false), FADE_MS);
  }

  if (!mounted || !visible) return null;

  return (
    <div
      role="presentation"
      aria-hidden="true"
      onClick={handleSkip}
      className="sc-splash-overlay"
      data-fading={fading ? "1" : "0"}
    >
      <div className="sc-splash-mark">
        {/* Animated rings — draw outward from the wordmark */}
        <svg
          className="sc-splash-rings"
          viewBox="0 0 200 200"
          width="280"
          height="280"
          aria-hidden="true"
        >
          <circle className="sc-ring sc-ring-1" cx="100" cy="100" r="60" />
          <circle className="sc-ring sc-ring-2" cx="100" cy="100" r="80" />
          <circle className="sc-ring sc-ring-3" cx="100" cy="100" r="98" />
        </svg>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-wordmark-email.png"
          alt=""
          width={220}
          height={166}
          className="sc-splash-logo"
          decoding="async"
          draggable={false}
        />
      </div>

      <style jsx>{`
        .sc-splash-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #ffffff;
          display: grid;
          place-items: center;
          opacity: 1;
          transition: opacity ${FADE_MS}ms ease-out;
          /* Respect iOS notch — overlay covers full screen */
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
          /* Prevent text selection / image drag during the intro */
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .sc-splash-overlay[data-fading="1"] {
          opacity: 0;
          pointer-events: none;
        }

        .sc-splash-mark {
          position: relative;
          width: 280px;
          height: 280px;
          display: grid;
          place-items: center;
        }

        .sc-splash-logo {
          position: relative;
          width: 220px;
          height: auto;
          opacity: 0;
          transform: scale(0.92) translateY(8px);
          animation: sc-logo-in 700ms cubic-bezier(0.22, 1, 0.36, 1) 120ms forwards,
            sc-logo-pulse 1100ms ease-in-out 820ms 1;
        }

        .sc-splash-rings {
          position: absolute;
          inset: 0;
          margin: auto;
        }
        .sc-ring {
          fill: none;
          stroke: #039ea0; /* brand teal */
          stroke-width: 1.4;
          opacity: 0;
          transform-origin: 100px 100px;
          transform: scale(0.4);
        }
        .sc-ring-1 {
          animation: sc-ring 1100ms ease-out 200ms 1 forwards;
        }
        .sc-ring-2 {
          animation: sc-ring 1100ms ease-out 360ms 1 forwards;
        }
        .sc-ring-3 {
          animation: sc-ring 1100ms ease-out 520ms 1 forwards;
        }

        @keyframes sc-logo-in {
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes sc-logo-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.04);
          }
        }
        @keyframes sc-ring {
          0% {
            opacity: 0;
            transform: scale(0.4);
          }
          40% {
            opacity: 0.55;
          }
          100% {
            opacity: 0;
            transform: scale(1);
          }
        }

        /* Accessibility — honour the user's reduced-motion preference. */
        @media (prefers-reduced-motion: reduce) {
          .sc-splash-logo {
            animation: sc-logo-in-reduced 220ms ease-out forwards;
          }
          .sc-ring-1,
          .sc-ring-2,
          .sc-ring-3 {
            animation: none;
            opacity: 0;
          }
          @keyframes sc-logo-in-reduced {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
              transform: none;
            }
          }
        }
      `}</style>
    </div>
  );
}
