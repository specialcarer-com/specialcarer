/**
 * Memberships — Stripe Checkout handler (pure, testable).
 *
 * The route wrapper (src/app/api/memberships/checkout/route.ts) resolves the
 * signed-in user + real Stripe/Supabase clients and delegates here. Keeping
 * the logic in a plain function lets us unit-test it with node:test and
 * stubbed clients — no next/headers, no live Stripe.
 *
 * Flow:
 *   1. Validate plan_slug against PLANS.
 *   2. Resolve a Stripe Price for plan + interval (env-driven).
 *   3. Find-or-create a Stripe customer for the user, persisting the id back
 *      to the user's subscriptions row(s) so the webhook can attribute.
 *   4. Create a subscription-mode Checkout Session and return its url.
 *
 * This module is pure logic (no Next/server-only imports) so it can be unit
 * tested under node:test. The server boundary is the route that calls it.
 */
import type Stripe from "stripe";
import { PLANS } from "./types";
import type { MembershipPlan, MembershipInterval } from "./types";
import { resolvePriceId } from "./plans";

/** Minimal Supabase surface the handler needs (admin/service-role client). */
export type CheckoutSupabase = {
  from(table: "subscriptions"): {
    select(cols: string): {
      eq(
        col: "user_id",
        val: string
      ): {
        not(
          col: "stripe_customer_id",
          op: "is",
          val: null
        ): {
          limit(n: number): Promise<{
            data: Array<{ stripe_customer_id: string | null }> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    update(values: { stripe_customer_id: string }): {
      eq(col: "user_id", val: string): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
};

/** Minimal Stripe surface the handler needs. */
export type CheckoutStripe = {
  customers: {
    create(params: Stripe.CustomerCreateParams): Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams
      ): Promise<{ url: string | null }>;
    };
  };
};

export type CheckoutUser = {
  id: string;
  email: string | null;
};

export type CheckoutResult =
  | { status: 200; body: { url: string } }
  | { status: 400 | 401 | 404 | 500; body: { error: string } };

export type HandleCheckoutInput = {
  user: CheckoutUser | null;
  planSlug: unknown;
  interval?: MembershipInterval;
  supabase: CheckoutSupabase;
  stripe: CheckoutStripe;
  siteUrl: string | undefined;
  env?: NodeJS.ProcessEnv;
};

function isMembershipPlan(slug: unknown): slug is MembershipPlan {
  return (
    typeof slug === "string" && PLANS.some((p) => p.id === slug)
  );
}

/**
 * Find-or-create a Stripe customer for the user. We don't keep a dedicated
 * customer table for consumers — the customer id lives on the user's
 * subscriptions rows. If none exists yet (first-ever subscribe), create one
 * and tag it with user_id so the webhook can attribute the subscription.
 */
async function ensureCustomer(
  input: Pick<HandleCheckoutInput, "user" | "supabase" | "stripe">
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const { user, supabase, stripe } = input;
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1);

  if (error) return { ok: false, error: error.message };

  const existing = data?.[0]?.stripe_customer_id;
  if (existing) return { ok: true, customerId: existing };

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { user_id: user.id },
  });

  // Best-effort backfill so future lookups + the webhook find it. Any rows a
  // comp grant created get the customer id; if there are none yet, the
  // webhook still attributes via customer.metadata.user_id.
  await supabase
    .from("subscriptions")
    .update({ stripe_customer_id: customer.id })
    .eq("user_id", user.id);

  return { ok: true, customerId: customer.id };
}

export async function handleMembershipCheckout(
  input: HandleCheckoutInput
): Promise<CheckoutResult> {
  const {
    user,
    planSlug,
    interval = "month",
    supabase,
    stripe,
    siteUrl,
    env = process.env,
  } = input;

  if (!user) {
    return { status: 401, body: { error: "Not authenticated" } };
  }

  if (!isMembershipPlan(planSlug)) {
    return { status: 404, body: { error: "Unknown plan" } };
  }

  const priceId = resolvePriceId(planSlug, interval, env);
  if (!priceId) {
    return {
      status: 400,
      body: {
        error:
          "This plan is not available for checkout yet — Stripe price is not configured.",
      },
    };
  }

  if (!siteUrl) {
    return { status: 500, body: { error: "Site URL is not configured" } };
  }

  const customer = await ensureCustomer({ user, supabase, stripe });
  if (!customer.ok) {
    return { status: 500, body: { error: customer.error } };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/m/memberships?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/m/memberships?cancelled=1`,
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan_slug: planSlug },
    subscription_data: {
      metadata: { user_id: user.id, plan_slug: planSlug },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return { status: 500, body: { error: "Stripe did not return a checkout url" } };
  }

  return { status: 200, body: { url: session.url } };
}
