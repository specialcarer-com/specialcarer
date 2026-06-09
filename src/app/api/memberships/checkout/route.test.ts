/**
 * Tests for the membership checkout handler.
 *
 * Drives the pure handler with stubbed Supabase + Stripe clients so we never
 * touch next/headers or live Stripe (matches the pattern in
 * src/app/api/m/carers/recent/route.test.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleMembershipCheckout,
  type CheckoutStripe,
  type CheckoutSupabase,
  type CheckoutUser,
} from "@/lib/memberships/checkout-handler";

const USER: CheckoutUser = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "carer@example.com",
};

const SITE = "https://specialcarer.com";

const ENV = {
  STRIPE_PRICE_PLUS_MONTHLY: "price_plus_monthly",
  STRIPE_PRICE_PLUS_YEARLY: "price_plus_yearly",
} as unknown as NodeJS.ProcessEnv;

type StripeCalls = {
  customerCreates: Array<{ email?: string; user_id?: string }>;
  sessionCreates: Array<Record<string, unknown>>;
};

function makeStripe(
  opts: { sessionUrl?: string | null; newCustomerId?: string } = {}
): { stripe: CheckoutStripe; calls: StripeCalls } {
  const calls: StripeCalls = { customerCreates: [], sessionCreates: [] };
  const stripe: CheckoutStripe = {
    customers: {
      async create(params) {
        const md = (params.metadata ?? {}) as Record<string, unknown>;
        calls.customerCreates.push({
          email: params.email ?? undefined,
          user_id:
            typeof md.user_id === "string" ? md.user_id : undefined,
        });
        return { id: opts.newCustomerId ?? "cus_new" };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          calls.sessionCreates.push(params as unknown as Record<string, unknown>);
          return {
            url:
              opts.sessionUrl === undefined
                ? "https://checkout.stripe.com/c/pay/cs_test_123"
                : opts.sessionUrl,
          };
        },
      },
    },
  };
  return { stripe, calls };
}

function makeSupabase(opts: {
  existingCustomerId?: string | null;
  selectError?: { message: string } | null;
}): { supabase: CheckoutSupabase; updateCalls: () => number } {
  let updateCalls = 0;
  const supabase = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                not() {
                  return {
                    async limit() {
                      if (opts.selectError) {
                        return { data: null, error: opts.selectError };
                      }
                      return {
                        data: opts.existingCustomerId
                          ? [{ stripe_customer_id: opts.existingCustomerId }]
                          : [],
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
        update() {
          return {
            async eq() {
              updateCalls += 1;
              return { error: null };
            },
          };
        },
      };
    },
  } as unknown as CheckoutSupabase;
  return { supabase, updateCalls: () => updateCalls };
}

describe("handleMembershipCheckout", () => {
  it("401 when not authenticated", async () => {
    const { stripe } = makeStripe();
    const { supabase } = makeSupabase({});
    const res = await handleMembershipCheckout({
      user: null,
      planSlug: "plus",
      supabase,
      stripe,
      siteUrl: SITE,
      env: ENV,
    });
    assert.equal(res.status, 401);
  });

  it("404 when the plan slug is unknown", async () => {
    const { stripe } = makeStripe();
    const { supabase } = makeSupabase({});
    const res = await handleMembershipCheckout({
      user: USER,
      planSlug: "family", // not one of lite|plus|premium
      supabase,
      stripe,
      siteUrl: SITE,
      env: ENV,
    });
    assert.equal(res.status, 404);
  });

  it("404 when plan_slug is missing/invalid type", async () => {
    const { stripe } = makeStripe();
    const { supabase } = makeSupabase({});
    const res = await handleMembershipCheckout({
      user: USER,
      planSlug: undefined,
      supabase,
      stripe,
      siteUrl: SITE,
      env: ENV,
    });
    assert.equal(res.status, 404);
  });

  it("400 when the plan has no configured Stripe price", async () => {
    const { stripe } = makeStripe();
    const { supabase } = makeSupabase({});
    // lite has no env price configured in ENV
    const res = await handleMembershipCheckout({
      user: USER,
      planSlug: "lite",
      supabase,
      stripe,
      siteUrl: SITE,
      env: ENV,
    });
    assert.equal(res.status, 400);
  });

  it("200 — creates a customer + checkout session and returns the url", async () => {
    const { stripe, calls } = makeStripe();
    const { supabase } = makeSupabase({ existingCustomerId: null });
    const res = await handleMembershipCheckout({
      user: USER,
      planSlug: "plus",
      supabase,
      stripe,
      siteUrl: SITE,
      env: ENV,
    });
    assert.equal(res.status, 200);
    assert.equal(
      (res.body as { url: string }).url,
      "https://checkout.stripe.com/c/pay/cs_test_123"
    );
    // A new customer was created (no existing id) and tagged with user_id.
    assert.equal(calls.customerCreates.length, 1);
    assert.equal(calls.customerCreates[0].user_id, USER.id);
    // One subscription Checkout Session, wired with the right shape.
    assert.equal(calls.sessionCreates.length, 1);
    const s = calls.sessionCreates[0];
    assert.equal(s.mode, "subscription");
    assert.equal(s.customer, "cus_new");
    assert.equal(s.client_reference_id, USER.id);
    assert.equal(s.allow_promotion_codes, true);
    assert.deepEqual(s.line_items, [
      { price: "price_plus_monthly", quantity: 1 },
    ]);
    assert.deepEqual(s.metadata, { user_id: USER.id, plan_slug: "plus" });
    assert.match(s.success_url as string, /session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.match(s.cancel_url as string, /cancelled=1/);
  });

  it("200 — reuses an existing Stripe customer (no customers.create)", async () => {
    const { stripe, calls } = makeStripe();
    const { supabase } = makeSupabase({ existingCustomerId: "cus_existing" });
    const res = await handleMembershipCheckout({
      user: USER,
      planSlug: "plus",
      supabase,
      stripe,
      siteUrl: SITE,
      env: ENV,
    });
    assert.equal(res.status, 200);
    assert.equal(calls.customerCreates.length, 0);
    assert.equal(calls.sessionCreates[0].customer, "cus_existing");
  });

  it("200 — yearly interval resolves the yearly price id", async () => {
    const { stripe, calls } = makeStripe();
    const { supabase } = makeSupabase({ existingCustomerId: "cus_existing" });
    const res = await handleMembershipCheckout({
      user: USER,
      planSlug: "plus",
      interval: "year",
      supabase,
      stripe,
      siteUrl: SITE,
      env: ENV,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(calls.sessionCreates[0].line_items, [
      { price: "price_plus_yearly", quantity: 1 },
    ]);
  });

  it("500 when the subscriptions lookup errors", async () => {
    const { stripe } = makeStripe();
    const { supabase } = makeSupabase({
      selectError: { message: "db down" },
    });
    const res = await handleMembershipCheckout({
      user: USER,
      planSlug: "plus",
      supabase,
      stripe,
      siteUrl: SITE,
      env: ENV,
    });
    assert.equal(res.status, 500);
  });
});
