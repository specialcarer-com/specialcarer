import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Pin a stable, recent API version so SDK upgrades don't break behavior.
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
  appInfo: {
    name: "SpecialCarer",
    version: "0.1.0",
    url: "https://specialcarer.com",
  },
});

export const PLATFORM_FEE_PERCENT = Number(
  process.env.STRIPE_PLATFORM_FEE_PERCENT ?? "30"
);
export const PAYOUT_HOLD_HOURS = Number(
  process.env.STRIPE_PAYOUT_HOLD_HOURS ?? "24"
);

/**
 * Calculate the platform's fee in the smallest currency unit.
 * Subtotal is what the seeker pays for caregiver hours; the platform
 * fee is added on top so the caregiver receives the full subtotal.
 */
export function calculatePlatformFeeCents(subtotalCents: number): number {
  return Math.round((subtotalCents * PLATFORM_FEE_PERCENT) / 100);
}

export function calculateTotalCents(subtotalCents: number): number {
  return subtotalCents + calculatePlatformFeeCents(subtotalCents);
}
