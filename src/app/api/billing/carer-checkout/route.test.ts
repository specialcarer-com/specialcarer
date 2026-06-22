/**
 * Tests for the carer founder membership checkout handler.
 *
 * Drives the pure handler (src/lib/carer-membership/checkout-handler.ts) with
 * stubbed Stripe + Supabase clients so we never touch next/headers or live
 * Stripe. Mirrors src/app/api/memberships/checkout/route.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleCarerCheckout,
  type CarerCheckoutStripe,
  type CarerCheckoutSupabase,
  type CarerCheckoutUser,
} from "@/lib/carer-membership/checkout-handler";
import { CARER_FOUNDER_LOOKUP_KEY } from "@/lib/carer-membership/constants";

const USER: CarerCheckoutUser = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "carer@example.com",
};
const SITE = "https://specialcarers.com";

type StripeCalls = {
  priceLists: Array<Record<string, unknown>>;
  customerCreates: Array<{ email?: string; carer_user_id?: string }>;
  sessionCreates: Array<Record<string, unknown>>;
};

function makeStripe(
  opts: { priceId?: string | null; sessionUrl?: string | null } = {}
): { stripe: CarerCheckoutStripe; calls: StripeCalls } {
  const calls: StripeCalls = {
    priceLists: [],
    customerCreates: [],
    sessionCreates: [],
  };
  const stripe: CarerCheckoutStripe = {
    prices: {
      async list(params) {
        calls.priceLists.push(params as unknown as Record<string, unknown>);
        const id = opts.priceId === undefined ? "price_carer_founder" : opts.priceId;
        return { data: id ? [{ id, active: true }] : [] };
      },
    },
    customers: {
      async create(params) {
        const md = (params.metadata ?? {}) as Record<string, unknown>;
        calls.customerCreates.push({
          email: params.email ?? undefined,
          carer_user_id:
            typeof md.carer_user_id === "string" ? md.carer_user_id : undefined,
        });
        return { id: "cus_new" };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          calls.sessionCreates.push(params as unknown as Record<string, unknown>);
          return {
            url:
              opts.sessionUrl === undefined
                ? "https://checkout.stripe.com/c/pay/cs_test_carer"
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
}): { supabase: CarerCheckoutSupabase; upsertCalls: () => number } {
  let upsertCalls = 0;
  const supabase = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (opts.selectError) {
                    return { data: null, error: opts.selectError };
                  }
                  return {
                    data: opts.existingCustomerId
                      ? { stripe_customer_id: opts.existingCustomerId }
                      : null,
                    error: null,
                  };
                },
              };
            },
          };
        },
        async upsert() {
          upsertCalls += 1;
          return { error: null };
        },
      };
    },
  } as unknown as CarerCheckoutSupabase;
  return { supabase, upsertCalls: () => upsertCalls };
}

describe("handleCarerCheckout", () => {
  it("401 when not authenticated", async () => {
    const { stripe } = makeStripe();
    const { supabase } = makeSupabase({});
    const res = await handleCarerCheckout({
      user: null,
      supabase,
      stripe,
      siteUrl: SITE,
    });
    assert.equal(res.status, 401);
  });

  it("500 when site url is missing", async () => {
    const { stripe } = makeStripe();
    const { supabase } = makeSupabase({});
    const res = await handleCarerCheckout({
      user: USER,
      supabase,
      stripe,
      siteUrl: undefined,
    });
    assert.equal(res.status, 500);
  });

  it("400 when no price exists for the lookup_key", async () => {
    const { stripe, calls } = makeStripe({ priceId: null });
    const { supabase } = makeSupabase({});
    const res = await handleCarerCheckout({
      user: USER,
      supabase,
      stripe,
      siteUrl: SITE,
    });
    assert.equal(res.status, 400);
    // Looked up by the founder lookup_key.
    assert.deepEqual(calls.priceLists[0].lookup_keys, [
      CARER_FOUNDER_LOOKUP_KEY,
    ]);
  });

  it("200 — creates a customer + subscription session and returns the url", async () => {
    const { stripe, calls } = makeStripe();
    const { supabase, upsertCalls } = makeSupabase({ existingCustomerId: null });
    const res = await handleCarerCheckout({
      user: USER,
      supabase,
      stripe,
      siteUrl: SITE,
    });
    assert.equal(res.status, 200);
    assert.equal(
      (res.body as { url: string }).url,
      "https://checkout.stripe.com/c/pay/cs_test_carer"
    );
    // New customer created, tagged with carer_user_id, persisted via upsert.
    assert.equal(calls.customerCreates.length, 1);
    assert.equal(calls.customerCreates[0].carer_user_id, USER.id);
    assert.equal(upsertCalls(), 1);
    // Session wired to spec.
    assert.equal(calls.sessionCreates.length, 1);
    const s = calls.sessionCreates[0];
    assert.equal(s.mode, "subscription");
    assert.equal(s.customer, "cus_new");
    assert.equal(s.client_reference_id, USER.id);
    assert.equal(s.allow_promotion_codes, true);
    assert.deepEqual(s.line_items, [
      { price: "price_carer_founder", quantity: 1 },
    ]);
    assert.deepEqual(s.metadata, { carer_user_id: USER.id });
    assert.deepEqual(s.subscription_data, {
      metadata: { carer_user_id: USER.id },
    });
    assert.match(s.success_url as string, /\/m\/carer\/membership\/success/);
    assert.match(s.success_url as string, /session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.equal(s.cancel_url, `${SITE}/m/carer/membership`);
  });

  it("200 — reuses an existing customer (no customers.create, no upsert)", async () => {
    const { stripe, calls } = makeStripe();
    const { supabase, upsertCalls } = makeSupabase({
      existingCustomerId: "cus_existing",
    });
    const res = await handleCarerCheckout({
      user: USER,
      supabase,
      stripe,
      siteUrl: SITE,
    });
    assert.equal(res.status, 200);
    assert.equal(calls.customerCreates.length, 0);
    assert.equal(upsertCalls(), 0);
    assert.equal(calls.sessionCreates[0].customer, "cus_existing");
  });

  it("500 when the membership lookup errors", async () => {
    const { stripe } = makeStripe();
    const { supabase } = makeSupabase({ selectError: { message: "db down" } });
    const res = await handleCarerCheckout({
      user: USER,
      supabase,
      stripe,
      siteUrl: SITE,
    });
    assert.equal(res.status, 500);
  });

  it("500 when Stripe returns no checkout url", async () => {
    const { stripe } = makeStripe({ sessionUrl: null });
    const { supabase } = makeSupabase({ existingCustomerId: "cus_existing" });
    const res = await handleCarerCheckout({
      user: USER,
      supabase,
      stripe,
      siteUrl: SITE,
    });
    assert.equal(res.status, 500);
  });
});
