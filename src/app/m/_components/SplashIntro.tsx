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
 *   - prefers-reduced-motion → still plays the canonical animated splash
 *     (per product owner direction). The animation is gentle (no flashing,
 *     no rapid scaling) and tap-to-skip is available after a short grace.
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

    // Always play the canonical animated splash (ripple/sparkle/wordmark
    // reveal). The brand intro is the product owner's designed launch
    // experience and they have explicitly requested it for all users
    // regardless of OS-level Reduce Motion. The animation itself is
    // gentle (slow drifts, soft pulses, no flashing) and bounded to ~7s
    // with a tap-to-skip — so it stays well within WCAG 2.3.3 (Animation
    // from Interactions, AAA) for users who want to dismiss it.
    const visibleMs = VISIBLE_MS;

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
      <div className="sc-splash-canvas">
        <SpecialCarerMobileSplash />
      </div>

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
      `}</style>
    </div>
  );
}
