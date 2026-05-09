"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drives an rAF loop and returns elapsed seconds since mount.
 *
 * - Returns 0 forever if the user prefers reduced motion (caller is
 *   expected to render the static composition in that case), UNLESS
 *   the caller passes `forceAnimate: true` to override that gate.
 *   Used by the splash, where the brand intro must always play.
 * - Stops the loop after `durationSec` if `loop=false` and freezes
 *   on the final frame value.
 */
export function useTime(opts: {
  durationSec: number;
  loop?: boolean;
  paused?: boolean;
  forceAnimate?: boolean;
} = { durationSec: 6 }): { t: number; reducedMotion: boolean; done: boolean } {
  const { durationSec, loop = false, paused = false, forceAnimate = false } = opts;
  const [t, setT] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [done, setDone] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if ((reducedMotion && !forceAnimate) || paused) return;

    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000;
      if (!loop && elapsed >= durationSec) {
        setT(durationSec);
        setDone(true);
        return;
      }
      const value = loop ? elapsed % durationSec : elapsed;
      setT(value);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
    };
  }, [durationSec, loop, paused, reducedMotion, forceAnimate]);

  return { t, reducedMotion, done };
}
