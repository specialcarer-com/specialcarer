/**
 * Tests for carer founder membership webhook reconciliation.
 *
 * Exercises the pure webhook-core helpers with plain Stripe-shaped objects and
 * a stubbed Supabase client, asserting that each of the three handled events
 * writes the carer_memberships row correctly:
 *   - checkout.session.completed     → status active
 *   - customer.subscription.updated  → status synced (e.g. past_due)
 *   - customer.subscription.deleted  → status canceled
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  isCarerSubscription,
  resolveCarerUserId,
  mapCarerStatus,
  upsertCarerMembershipFromSubscription,
  type CarerWebhookSupabase,
} from "@/lib/carer-membership/webhook-core";
import { CARER_FOUNDER_LOOKUP_KEY } from "@/lib/carer-membership/constants";

const CARER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PERIOD_END = 1893456000; // 2030-01-01T00:00:00Z

function makeSub(
  overrides: Partial<Stripe.Subscription> & {
    status?: Stripe.Subscription.Status;
    lookupKey?: string | null;
    carerUserId?: string | null;
    periodEnd?: number | null;
  } = {}
): Stripe.Subscription {
  const {
    status = "active",
    lookupKey = CARER_FOUNDER_LOOKUP_KEY,
    carerUserId = CARER_ID,
    periodEnd = PERIOD_END,
  } = overrides;
  return {
    id: "sub_carer_1",
    customer: "cus_123",
    status,
    metadata: carerUserId ? { carer_user_id: carerUserId } : {},
    items: {
      data: [
        {
          current_period_end: periodEnd,
          price: { id: "price_1", lookup_key: lookupKey },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

type Upsert = { values: Record<string, unknown>; onConflict: string };

function makeSupabase(opts: { error?: { message: string } } = {}): {
  supabase: CarerWebhookSupabase;
  upserts: Upsert[];
} {
  const upserts: Upsert[] = [];
  const supabase: CarerWebhookSupabase = {
    from() {
      return {
        async upsert(values, o) {
          upserts.push({ values, onConflict: o.onConflict });
          return { error: opts.error ?? null };
        },
      };
    },
  };
  return { supabase, upserts };
}

describe("isCarerSubscription", () => {
  it("true when metadata carries carer_user_id", () => {
    assert.equal(isCarerSubscription(makeSub({ lookupKey: null })), true);
  });
  it("true when the price lookup_key matches the founder key", () => {
    assert.equal(isCarerSubscription(makeSub({ carerUserId: null })), true);
  });
  it("false for an unrelated subscription", () => {
    assert.equal(
      isCarerSubscription(
        makeSub({ carerUserId: null, lookupKey: "plus_monthly_v1" })
      ),
      false
    );
  });
});

describe("resolveCarerUserId", () => {
  it("prefers subscription metadata", () => {
    assert.equal(resolveCarerUserId(makeSub(), null), CARER_ID);
  });
  it("falls back to customer metadata", () => {
    const sub = makeSub({ carerUserId: null });
    const customer = {
      metadata: { carer_user_id: "from-customer" },
    } as unknown as Stripe.Customer;
    assert.equal(resolveCarerUserId(sub, customer), "from-customer");
  });
  it("null when neither has it", () => {
    assert.equal(resolveCarerUserId(makeSub({ carerUserId: null }), null), null);
  });
});

describe("mapCarerStatus", () => {
  it("maps active/trialing/past_due/incomplete directly", () => {
    assert.equal(mapCarerStatus("active"), "active");
    assert.equal(mapCarerStatus("trialing"), "trialing");
    assert.equal(mapCarerStatus("past_due"), "past_due");
    assert.equal(mapCarerStatus("incomplete"), "incomplete");
  });
  it("collapses unpaid/canceled/paused to canceled", () => {
    assert.equal(mapCarerStatus("unpaid"), "canceled");
    assert.equal(mapCarerStatus("canceled"), "canceled");
    assert.equal(mapCarerStatus("paused"), "canceled");
  });
});

describe("upsertCarerMembershipFromSubscription", () => {
  it("checkout.session.completed → active row with subscription id + period end", async () => {
    const { supabase, upserts } = makeSupabase();
    await upsertCarerMembershipFromSubscription({
      supabase,
      sub: makeSub({ status: "active" }),
      carerUserId: CARER_ID,
    });
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].onConflict, "carer_user_id");
    const v = upserts[0].values;
    assert.equal(v.carer_user_id, CARER_ID);
    assert.equal(v.status, "active");
    assert.equal(v.stripe_subscription_id, "sub_carer_1");
    assert.equal(v.stripe_customer_id, "cus_123");
    assert.equal(
      v.current_period_end,
      new Date(PERIOD_END * 1000).toISOString()
    );
  });

  it("customer.subscription.updated → syncs past_due", async () => {
    const { supabase, upserts } = makeSupabase();
    await upsertCarerMembershipFromSubscription({
      supabase,
      sub: makeSub({ status: "past_due" }),
      carerUserId: CARER_ID,
    });
    assert.equal(upserts[0].values.status, "past_due");
  });

  it("customer.subscription.deleted → forceCanceled marks canceled even if Stripe says active", async () => {
    const { supabase, upserts } = makeSupabase();
    await upsertCarerMembershipFromSubscription({
      supabase,
      sub: makeSub({ status: "active" }),
      carerUserId: CARER_ID,
      forceCanceled: true,
    });
    assert.equal(upserts[0].values.status, "canceled");
  });

  it("throws when the upsert errors (surfaces for webhook retry)", async () => {
    const { supabase } = makeSupabase({ error: { message: "db down" } });
    await assert.rejects(
      upsertCarerMembershipFromSubscription({
        supabase,
        sub: makeSub(),
        carerUserId: CARER_ID,
      }),
      /db down/
    );
  });
});
