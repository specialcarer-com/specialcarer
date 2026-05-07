import Stripe from "stripe";
import {
  CLIENT_FEE_PERCENT,
  CARER_FEE_PERCENT,
  clientFeeCents,
  carerFeeCents,
  carerPayoutCents,
  totalChargedCents,
  platformTakeCents,
} from "@/lib/fees/config";

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

/**
 * SpecialCarer fee model: single-sided 25% deduction from the carer.
 *
 *   Client uplift:    0%   (the client pays exactly the listed rate)
 *   Carer deduction:  25%  (deducted from the carer's listed rate)
 *
 * The carer's listed hourly rate is what the client pays — no surprise
 * uplift at checkout. The platform deducts 25% from the carer's payout
 * via Stripe's application_fee_amount.
 *
 * Worked example for 10h × £18/hr in the UK:
 *   listed_rate × hours    = 18000   (subtotalCents — what the carer set)
 *   client uplift (0%)     =     0
 *   client pays (total)    = 18000   (== subtotal)               ← charged to card
 *   carer deduction (25%)  =  4500
 *   carer payout           = 13500   (subtotal × 0.75)           ← lands in carer's bank
 *   platform keeps         =  4500   (deduction = 25% of subtotal)
 *
 * Database semantics:
 *   subtotal_cents     = listed_rate × hours          (== client paid; == carer gross)
 *   total_cents        = subtotal × (1 + uplift)      (what the client pays; == subtotal
 *                                                       while CLIENT_FEE_PERCENT = 0)
 *   platform_fee_cents = uplift + deduction           (platform's full cut, used as Stripe
 *                                                       application_fee_amount so Stripe
 *                                                       deducts it from the destination
 *                                                       transfer to the carer's account)
 *
 * Stripe wiring:
 *   amount                 = total_cents              (charged to the seeker's card)
 *   application_fee_amount = platform_fee_cents       (kept by SpecialCarer)
 *   transfer destination   = carer's connected account
 *   carer ultimately receives total − application_fee = subtotal × 0.75
 *
 * Constants live in `@/lib/fees/config` so client components (e.g. the
 * profile editor) can import them without pulling Stripe into the bundle.
 * Override at runtime via STRIPE_CLIENT_FEE_PERCENT / STRIPE_CARER_FEE_PERCENT.
 */
export {
  CLIENT_FEE_PERCENT,
  CARER_FEE_PERCENT,
};

/**
 * Legacy export. Kept so any code still importing this name compiles.
 * Equals the platform's total cut as a % of subtotal (uplift + deduction).
 */
export const PLATFORM_FEE_PERCENT = CLIENT_FEE_PERCENT + CARER_FEE_PERCENT;

export const PAYOUT_HOLD_HOURS = Number(
  process.env.STRIPE_PAYOUT_HOLD_HOURS ?? "24"
);

/** Client-side uplift in cents (added on top of subtotal). */
export function calculateClientFeeCents(subtotalCents: number): number {
  return clientFeeCents(subtotalCents);
}

/** Carer-side deduction in cents (taken out of subtotal at payout). */
export function calculateCarerFeeCents(subtotalCents: number): number {
  return carerFeeCents(subtotalCents);
}

/**
 * Total platform take in cents — both the client uplift and the carer
 * deduction together. This is the value passed as Stripe's
 * `application_fee_amount` so the destination transfer to the carer is
 * net of the carer-side deduction (Stripe charges total_cents and routes
 * total_cents − application_fee_amount to the carer).
 */
export function calculatePlatformFeeCents(subtotalCents: number): number {
  return platformTakeCents(subtotalCents);
}

/**
 * Total amount charged to the client. Subtotal plus the client-side uplift.
 */
export function calculateTotalCents(subtotalCents: number): number {
  return totalChargedCents(subtotalCents);
}

/**
 * Carer's payout in the smallest currency unit (subtotal minus carer
 * deduction). Use this anywhere the carer needs to see take-home pay.
 */
export function calculateCarerPayoutCents(subtotalCents: number): number {
  return carerPayoutCents(subtotalCents);
}
