/**
 * Fee model constants — isomorphic (safe to import from client components).
 *
 * The Stripe-aware helpers in `@/lib/stripe/server` are server-only because
 * they instantiate the Stripe SDK. This module exposes only the percentage
 * constants and pure math helpers, so client components (e.g. the carer
 * profile editor showing a take-home preview) can use them without pulling
 * Stripe into the browser bundle.
 *
 * The values are read from the same env vars the server uses, with the same
 * defaults — keep them in sync. Next.js inlines `process.env` at build time
 * for client modules, so flipping the env var still requires a redeploy on
 * the client side; the server side picks it up immediately.
 */

export const CLIENT_FEE_PERCENT = Number(
  process.env.NEXT_PUBLIC_CLIENT_FEE_PERCENT ??
    process.env.STRIPE_CLIENT_FEE_PERCENT ??
    "0",
);

export const CARER_FEE_PERCENT = Number(
  process.env.NEXT_PUBLIC_CARER_FEE_PERCENT ??
    process.env.STRIPE_CARER_FEE_PERCENT ??
    "25",
);

/** % the carer keeps of their listed rate (after the carer-side deduction). */
export const CARER_PAYOUT_PERCENT = 100 - CARER_FEE_PERCENT;

/** Round-half-to-even agnostic helper used everywhere we compute fees in cents. */
export function applyPercent(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

export function clientFeeCents(subtotalCents: number): number {
  return applyPercent(subtotalCents, CLIENT_FEE_PERCENT);
}

export function carerFeeCents(subtotalCents: number): number {
  return applyPercent(subtotalCents, CARER_FEE_PERCENT);
}

export function carerPayoutCents(subtotalCents: number): number {
  return subtotalCents - carerFeeCents(subtotalCents);
}

export function totalChargedCents(subtotalCents: number): number {
  return subtotalCents + clientFeeCents(subtotalCents);
}

export function platformTakeCents(subtotalCents: number): number {
  return clientFeeCents(subtotalCents) + carerFeeCents(subtotalCents);
}
