/**
 * Carer Founder Membership — shared constants.
 *
 * Plain module (no server-only / Stripe imports) so both server routes and
 * "use client" UI can import the lookup_key, price copy, and status helpers.
 */

/** Stripe Price lookup_key for the £4.99/mo founder tier. Bumped if pricing changes. */
export const CARER_FOUNDER_LOOKUP_KEY = "carer_founder_monthly_v1";

/** Display price. The authoritative amount lives on the Stripe Price. */
export const CARER_FOUNDER_PRICE_LABEL = "£4.99";
export const CARER_FOUNDER_PRICE_AMOUNT_PENCE = 499;
export const CARER_FOUNDER_CURRENCY = "GBP";

/** Mirrors the DB check constraint on carer_memberships.status. */
export type CarerMembershipStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing";

/**
 * A carer "has access" (profile publishable) only while active. trialing is
 * treated as not-yet-entitled for publishing — the founder tier has no trial,
 * so this is defensive. past_due/canceled/incomplete are clearly not entitled.
 */
export function isCarerMembershipActive(
  status: CarerMembershipStatus | string | null | undefined,
  currentPeriodEnd: string | null | undefined
): boolean {
  if (status !== "active") return false;
  if (!currentPeriodEnd) return false;
  return new Date(currentPeriodEnd).getTime() > Date.now();
}

export type CarerMembership = {
  status: CarerMembershipStatus;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export const CARER_FOUNDER_PERKS: string[] = [
  "Publish your public profile to the SpecialCarer marketplace",
  "Founding Carer badge on your profile",
  "Your £4.99 founder rate is locked for life",
  "Priority placement as we grow the marketplace",
];
