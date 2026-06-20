/**
 * Carer Founder Membership — webhook reconciliation (pure, testable).
 *
 * The shared /api/stripe/webhook route verifies the Stripe signature once and
 * then delegates carer-membership events here. Kept free of next/server-only
 * imports so it can be unit-tested under node:test with a stubbed Supabase
 * client and plain Stripe-shaped objects.
 *
 * Three events drive the carer_memberships row:
 *   - checkout.session.completed     → first activation (status=active)
 *   - customer.subscription.updated  → status sync (active/past_due/canceled…)
 *   - customer.subscription.deleted  → mark canceled
 *
 * All three funnel through upsertCarerMembershipFromSubscription, keyed on
 * carer_user_id (one row per carer), so a re-subscribe after cancellation
 * updates the same row.
 */
import type Stripe from "stripe";
import { CARER_FOUNDER_LOOKUP_KEY } from "./constants";
import type { CarerMembershipStatus } from "./constants";

/** Minimal Supabase surface the upsert needs (service-role client). */
export type CarerWebhookSupabase = {
  from(table: "carer_memberships"): {
    upsert(
      values: Record<string, unknown>,
      opts: { onConflict: string }
    ): Promise<{ error: { message: string } | null }>;
  };
};

/** Map Stripe's subscription.status onto our narrower DB enum. */
export function mapCarerStatus(
  s: Stripe.Subscription.Status
): CarerMembershipStatus {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    // unpaid / incomplete_expired / canceled / paused all collapse to canceled
    default:
      return "canceled";
  }
}

/**
 * Is this Stripe subscription a carer founder membership?
 *
 * Two independent signals, either is sufficient:
 *   1. The price's lookup_key matches CARER_FOUNDER_LOOKUP_KEY (authoritative).
 *   2. The subscription metadata carries carer_user_id (set at checkout).
 *
 * This lets the shared webhook route carer subs here and consumer subs to the
 * existing handler without misattributing either.
 */
export function isCarerSubscription(sub: Stripe.Subscription): boolean {
  if (sub.metadata?.carer_user_id) return true;
  const price = sub.items?.data?.[0]?.price;
  if (price?.lookup_key === CARER_FOUNDER_LOOKUP_KEY) return true;
  return false;
}

/**
 * Resolve the carer_user_id for a subscription. Prefer the subscription's own
 * metadata; fall back to the customer's metadata (set when we create the
 * customer). Returns null if neither is present.
 */
export function resolveCarerUserId(
  sub: Stripe.Subscription,
  customer: Stripe.Customer | null
): string | null {
  const fromSub = sub.metadata?.carer_user_id;
  if (fromSub) return fromSub;
  const fromCustomer = customer?.metadata?.carer_user_id;
  return fromCustomer ?? null;
}

/**
 * Upsert a carer_memberships row from a Stripe subscription. Idempotent —
 * keyed on carer_user_id. `forceCanceled` is set for the deleted event so a
 * subscription Stripe still reports as e.g. active during the grace window is
 * recorded as canceled.
 */
export async function upsertCarerMembershipFromSubscription(args: {
  supabase: CarerWebhookSupabase;
  sub: Stripe.Subscription;
  carerUserId: string;
  forceCanceled?: boolean;
}): Promise<void> {
  const { supabase, sub, carerUserId, forceCanceled } = args;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const item = sub.items?.data?.[0];
  const periodEnd = item?.current_period_end;

  const status: CarerMembershipStatus = forceCanceled
    ? "canceled"
    : mapCarerStatus(sub.status);

  const row = {
    carer_user_id: carerUserId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status,
    current_period_end: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
  };

  const { error } = await supabase
    .from("carer_memberships")
    .upsert(row, { onConflict: "carer_user_id" });

  if (error) {
    console.error("[carer-membership] upsert failed", sub.id, error.message);
    throw new Error(error.message);
  }
}
