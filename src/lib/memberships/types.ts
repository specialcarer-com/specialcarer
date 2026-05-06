/**
 * Memberships — shared types and plan configuration.
 *
 * Pricing changes are made in Stripe (live in your dashboard) — the IDs
 * in PLAN_PRICES below are the Stripe price IDs to reference.
 *
 * To rotate prices: create a new Price in Stripe, update the env vars
 * (STRIPE_PRICE_*_GBP / STRIPE_PRICE_*_USD) — no code change needed.
 */

export type MembershipPlan = "lite" | "plus" | "premium";
export type MembershipInterval = "month" | "year";
export type MembershipSource = "stripe" | "comp" | "partner";

/**
 * Mirrors the membership_status enum in Postgres + Stripe.
 */
export type MembershipStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "comp";

/**
 * Plan tiers as the user sees them. Keep this list in sync with the
 * `membership_plan` Postgres enum and with the Stripe Products.
 */
export const PLANS: ReadonlyArray<{
  id: MembershipPlan;
  name: string;
  tagline: string;
  /** Stripe Product ID — used by /admin and webhook reverse-lookup. */
  stripeProductIdEnv: string;
  perks: ReadonlyArray<string>;
  popular?: boolean;
}> = [
  {
    id: "lite",
    name: "Lite",
    tagline: "For occasional support",
    stripeProductIdEnv: "STRIPE_PRODUCT_LITE",
    perks: [
      "Priority match on weekday bookings",
      "Standard 30% platform fee",
      "Email support",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "For weekly care routines",
    stripeProductIdEnv: "STRIPE_PRODUCT_PLUS",
    popular: true,
    perks: [
      "Priority match across all hours",
      "Reduced platform fee on bookings over 4 hours",
      "Same-carer consistency where possible",
      "Phone + chat support",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "For dedicated, daily care",
    stripeProductIdEnv: "STRIPE_PRODUCT_PREMIUM",
    perks: [
      "Concierge booking — we match you in under an hour",
      "Lowest platform fee tier",
      "Care coordinator phone line",
      "Quarterly care reviews",
    ],
  },
] as const;

/**
 * Plan-aware platform fee (in percent). Returned at booking time so the
 * seeker sees their member discount applied.
 *
 * Default fee = 30% (set via STRIPE_PLATFORM_FEE_PERCENT). These overrides
 * apply to bookings where the seeker has an active membership.
 */
export const PLAN_PLATFORM_FEE_PERCENT: Record<MembershipPlan, number> = {
  lite: 30,    // standard
  plus: 25,    // -5pp on bookings >= 4h (gating done in booking server lib)
  premium: 20, // -10pp on all bookings
};

/**
 * Active membership row as exposed to the client. Keep field set minimal —
 * never leak Stripe IDs or grant_reason to the client.
 */
export type ActiveMembership = {
  plan: MembershipPlan;
  status: MembershipStatus;
  source: MembershipSource;
  billingInterval: MembershipInterval | null;
  currentPeriodEnd: string | null; // ISO
  cancelAtPeriodEnd: boolean;
};

/**
 * Helpful constants for the UI.
 */
export const PLAN_LABEL: Record<MembershipPlan, string> = {
  lite: "Lite",
  plus: "Plus",
  premium: "Premium",
};

/**
 * Statuses that count as "currently entitled to perks".
 */
export const ENTITLED_STATUSES: ReadonlySet<MembershipStatus> = new Set([
  "active",
  "trialing",
  "past_due", // grace period
  "comp",
]);

export function isEntitled(status: MembershipStatus): boolean {
  return ENTITLED_STATUSES.has(status);
}
