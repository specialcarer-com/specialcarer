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

/**
 * SpecialCarer fee model: split (client uplift + carer deduction).
 *
 *   Client uplift:    +10%  (added on top of the carer's listed rate)
 *   Carer deduction:  −20%  (deducted from the carer's listed rate)
 *
 * The two pieces add to roughly 27.3% of gross — competitive with Curam
 * (~24.1%) but transparent on both sides: clients see a clear platform fee
 * line on the invoice, and carers see a single deduction on their payout.
 *
 * Worked example for 10h × £18/hr in the UK:
 *   listed_rate × hours    = 18000   (subtotalCents — what the carer set)
 *   client uplift (+10%)   =  1800
 *   client pays (total)    = 19800   (subtotal × 1.10)            ← charged to card
 *   carer deduction (−20%) =  3600
 *   carer payout           = 14400   (subtotal × 0.80)            ← lands in carer's bank
 *   platform keeps         =  5400   (uplift + deduction = 30% of subtotal)
 *
 * Database semantics:
 *   subtotal_cents     = listed_rate × hours          (carer's gross / what they advertised)
 *   total_cents        = subtotal × (1 + uplift)      (what the client pays)
 *   platform_fee_cents = uplift + deduction           (platform's full cut, used as Stripe
 *                                                       application_fee_amount so Stripe
 *                                                       deducts it from the destination
 *                                                       transfer to the carer's account)
 *
 * Stripe wiring:
 *   amount                 = total_cents              (charged to the seeker's card)
 *   application_fee_amount = platform_fee_cents       (kept by SpecialCarer)
 *   transfer destination   = carer's connected account
 *   carer ultimately receives total − application_fee = subtotal × 0.80
 */
export const CLIENT_FEE_PERCENT = Number(
  process.env.STRIPE_CLIENT_FEE_PERCENT ?? "10"
);
export const CARER_FEE_PERCENT = Number(
  process.env.STRIPE_CARER_FEE_PERCENT ?? "20"
);

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
  return Math.round((subtotalCents * CLIENT_FEE_PERCENT) / 100);
}

/** Carer-side deduction in cents (taken out of subtotal at payout). */
export function calculateCarerFeeCents(subtotalCents: number): number {
  return Math.round((subtotalCents * CARER_FEE_PERCENT) / 100);
}

/**
 * Total platform take in cents — both the client uplift and the carer
 * deduction together. This is the value passed as Stripe's
 * `application_fee_amount` so the destination transfer to the carer is
 * net of the carer-side deduction (Stripe charges total_cents and routes
 * total_cents − application_fee_amount to the carer).
 */
export function calculatePlatformFeeCents(subtotalCents: number): number {
  return (
    calculateClientFeeCents(subtotalCents) +
    calculateCarerFeeCents(subtotalCents)
  );
}

/**
 * Total amount charged to the client. Subtotal plus the client-side uplift.
 */
export function calculateTotalCents(subtotalCents: number): number {
  return subtotalCents + calculateClientFeeCents(subtotalCents);
}

/**
 * Carer's payout in the smallest currency unit (subtotal minus carer
 * deduction). Use this anywhere the carer needs to see take-home pay.
 */
export function calculateCarerPayoutCents(subtotalCents: number): number {
  return subtotalCents - calculateCarerFeeCents(subtotalCents);
}
