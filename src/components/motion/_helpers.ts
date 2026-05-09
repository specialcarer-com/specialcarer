/**
 * SpecialCarer motion-brand helpers.
 *
 * Shared easing functions and time/clamp utilities for the logo animation
 * and mobile splash components. Mirrors `design/motion-brand/animations.jsx`
 * (the pinned design spec) so behaviour is identical between the design
 * reference HTMLs and the production components.
 */

export const Easing = {
  easeOutBack: (t: number, s = 1.70158) => {
    const x = t - 1;
    return x * x * ((s + 1) * x + s) + 1;
  },
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
};

export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, v));

export const interpolate = (a: number, b: number, t: number) =>
  a + (b - a) * clamp(t);

/**
 * Deterministic LCG used for splash particle layouts so positions are
 * stable across re-renders. Must produce identical sequences to the
 * `seeded()` function in the design HTMLs.
 */
export function seeded(seedInit: number, count: number): number[] {
  const out: number[] = [];
  let s = seedInit;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(s / 233280);
  }
  return out;
}

export const BRAND = {
  teal: "#039EA0",
  tealLo: "#02787A",
  tealHi: "#3FC6C8",
  cream: "#F4EFE6",
  ink: "#0F1416",
} as const;

export const WORDMARK = "SpecialCarer";
export const TAGLINE = "CARE, 4 U";
