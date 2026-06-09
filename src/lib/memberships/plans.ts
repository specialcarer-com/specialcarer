/**
 * Memberships — Stripe Price resolution for in-app Checkout.
 *
 * Server-only. The checkout route needs a Stripe *Price* ID to open a
 * subscription Checkout Session. Pricing is owned by Stripe; we reference
 * the Price IDs via env so prices can be rotated without a code change
 * (create a new Price in Stripe, point the env var at it).
 *
 * The webhook maps the other direction (Stripe Product ID -> plan code) via
 * STRIPE_PRODUCT_LITE/PLUS/PREMIUM; this module maps plan + interval -> Price.
 *
 * Pure logic (no Next/server-only imports) so the checkout handler that uses
 * it stays unit-testable; only the route that consumes it is server-bound.
 */
import type { MembershipPlan, MembershipInterval } from "./types";

/**
 * Resolve the Stripe Price ID for a plan + billing interval from env.
 *
 * Env var convention (GBP, the only billing currency at launch):
 *   STRIPE_PRICE_LITE_MONTHLY / STRIPE_PRICE_LITE_YEARLY
 *   STRIPE_PRICE_PLUS_MONTHLY / STRIPE_PRICE_PLUS_YEARLY
 *   STRIPE_PRICE_PREMIUM_MONTHLY / STRIPE_PRICE_PREMIUM_YEARLY
 *
 * Returns null if the relevant env var is unset, so callers can surface a
 * clean 4xx instead of handing Stripe an empty price id.
 */
export function resolvePriceId(
  plan: MembershipPlan,
  interval: MembershipInterval,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${
    interval === "year" ? "YEARLY" : "MONTHLY"
  }`;
  const value = env[key]?.trim();
  return value ? value : null;
}
