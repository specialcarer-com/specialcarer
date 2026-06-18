/**
 * Carer Founder Membership — Stripe Checkout handler (pure, testable).
 *
 * Forked from src/lib/memberships/checkout-handler.ts (consumer tiers) but for
 * the carer-side £4.99/mo founder subscription:
 *   - The price is resolved by lookup_key (CARER_FOUNDER_LOOKUP_KEY) rather
 *     than an env-configured price id, so the create-carer-membership script
 *     is the single source of truth for the Price.
 *   - The Stripe customer id is persisted on the carer_memberships row (not
 *     subscriptions), so re-checkout reuses the same customer.
 *
 * Kept free of next/server-only imports so it can be unit-tested under
 * node:test with stubbed Stripe + Supabase clients. The route wrapper resolves
 * the signed-in carer and real clients, then delegates here.
 */
import type Stripe from "stripe";
import { CARER_FOUNDER_LOOKUP_KEY } from "./constants";

/** Minimal Supabase surface the handler needs (admin/service-role client). */
export type CarerCheckoutSupabase = {
  from(table: "carer_memberships"): {
    select(cols: string): {
      eq(
        col: "carer_user_id",
        val: string
      ): {
        maybeSingle(): Promise<{
          data: { stripe_customer_id: string | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
    upsert(
      values: { carer_user_id: string; stripe_customer_id: string },
      opts: { onConflict: string }
    ): Promise<{ error: { message: string } | null }>;
  };
};

/** Minimal Stripe surface the handler needs. */
export type CarerCheckoutStripe = {
  prices: {
    list(params: Stripe.PriceListParams): Promise<{
      data: Array<{ id: string; active?: boolean }>;
    }>;
  };
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

export type CarerCheckoutUser = {
  id: string;
  email: string | null;
};

export type CarerCheckoutResult =
  | { status: 200; body: { url: string } }
  | { status: 400 | 401 | 404 | 500; body: { error: string } };

export type HandleCarerCheckoutInput = {
  user: CarerCheckoutUser | null;
  supabase: CarerCheckoutSupabase;
  stripe: CarerCheckoutStripe;
  siteUrl: string | undefined;
};

/**
 * Find-or-create a Stripe customer for the carer. The customer id lives on the
 * carer_memberships row; the webhook also tags the customer with
 * carer_user_id so manual/dashboard subscriptions still attribute.
 */
async function ensureCarerCustomer(
  input: Pick<HandleCarerCheckoutInput, "user" | "supabase" | "stripe">
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const { user, supabase, stripe } = input;
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("carer_memberships")
    .select("stripe_customer_id")
    .eq("carer_user_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const existing = data?.stripe_customer_id;
  if (existing) return { ok: true, customerId: existing };

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { carer_user_id: user.id },
  });

  // Persist so future checkouts reuse the customer and the webhook can
  // attribute even before the subscription confirms.
  const upsertRes = await supabase
    .from("carer_memberships")
    .upsert(
      { carer_user_id: user.id, stripe_customer_id: customer.id },
      { onConflict: "carer_user_id" }
    );
  if (upsertRes.error) return { ok: false, error: upsertRes.error.message };

  return { ok: true, customerId: customer.id };
}

export async function handleCarerCheckout(
  input: HandleCarerCheckoutInput
): Promise<CarerCheckoutResult> {
  const { user, supabase, stripe, siteUrl } = input;

  if (!user) {
    return { status: 401, body: { error: "Not authenticated" } };
  }

  if (!siteUrl) {
    return { status: 500, body: { error: "Site URL is not configured" } };
  }

  // Resolve the Price by lookup_key — the create script is the source of truth.
  const prices = await stripe.prices.list({
    lookup_keys: [CARER_FOUNDER_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  const priceId = prices.data.find((p) => p.active !== false)?.id;
  if (!priceId) {
    return {
      status: 400,
      body: {
        error:
          "Founder membership is not available yet — the Stripe price is not configured. Run scripts/stripe/create-carer-membership.ts.",
      },
    };
  }

  const customer = await ensureCarerCustomer({ user, supabase, stripe });
  if (!customer.ok) {
    return { status: 500, body: { error: customer.error } };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/m/carer/membership/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/m/carer/membership`,
    client_reference_id: user.id,
    metadata: { carer_user_id: user.id },
    subscription_data: {
      metadata: { carer_user_id: user.id },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return {
      status: 500,
      body: { error: "Stripe did not return a checkout url" },
    };
  }

  return { status: 200, body: { url: session.url } };
}
