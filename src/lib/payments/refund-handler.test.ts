import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createStripeRefund,
  type StripeRefundClient,
} from "@/lib/payments/refund-handler";

const BOOKING_ID = "d9b55f3d-ef14-4e02-bca9-3e2749a18aa4";
const ADMIN_ID = "27ef4621-bdd5-4a42-b0bd-f3fb0ef6d597";

function makeStripe() {
  const calls: Array<{
    params: Record<string, unknown>;
    options: { idempotencyKey: string };
  }> = [];
  const stripe: StripeRefundClient = {
    refunds: {
      async create(params, options) {
        calls.push({
          params: params as unknown as Record<string, unknown>,
          options,
        });
        return { id: "re_test_123" };
      },
    },
  };
  return { stripe, calls };
}

describe("createStripeRefund", () => {
  it("calls Stripe refunds.create with server-side idempotency and audit metadata", async () => {
    const { stripe, calls } = makeStripe();
    const result = await createStripeRefund(
      {
        booking: {
          id: BOOKING_ID,
          stripeRefundId: null,
          refundRequestKey: null,
        },
        payment: {
          stripePaymentIntentId: "pi_test_123",
          amountCents: 7_000,
        },
        adminId: ADMIN_ID,
        amountCents: 2_500,
        reason: "requested_by_customer",
      },
      stripe,
    );

    assert.deepEqual(result, {
      ok: true,
      refundId: "re_test_123",
      amountCents: 2_500,
      idempotencyKey: `refund-${BOOKING_ID}-${ADMIN_ID}-2500`,
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      params: {
        payment_intent: "pi_test_123",
        amount: 2_500,
        reason: "requested_by_customer",
        metadata: {
          admin_id: ADMIN_ID,
          booking_id: BOOKING_ID,
          refund_request_key: `refund-${BOOKING_ID}-${ADMIN_ID}-2500`,
        },
      },
      options: { idempotencyKey: `refund-${BOOKING_ID}-${ADMIN_ID}-2500` },
    });
  });

  it("returns 409 without calling Stripe when a refund already exists", async () => {
    const { stripe, calls } = makeStripe();
    const result = await createStripeRefund(
      {
        booking: {
          id: BOOKING_ID,
          stripeRefundId: "re_existing",
          refundRequestKey: null,
        },
        payment: {
          stripePaymentIntentId: "pi_test_123",
          amountCents: 7_000,
        },
        adminId: ADMIN_ID,
        reason: null,
      },
      stripe,
    );

    assert.deepEqual(result, {
      ok: false,
      status: 409,
      error: "refund_already_requested",
    });
    assert.equal(calls.length, 0);
  });

  it("retries uncertain Stripe errors with the original idempotency key", async () => {
    const calls: string[] = [];
    let attempts = 0;
    const stripe: StripeRefundClient = {
      refunds: {
        async create(_params, options) {
          calls.push(options.idempotencyKey);
          attempts += 1;
          if (attempts < 3) throw new Error("connection reset");
          return { id: "re_recovered" };
        },
      },
    };

    const result = await createStripeRefund(
      {
        booking: { id: BOOKING_ID, stripeRefundId: null, refundRequestKey: null },
        payment: { stripePaymentIntentId: "pi_test_123", amountCents: 7_000 },
        adminId: ADMIN_ID,
        reason: null,
      },
      stripe,
    );

    assert.equal(result.ok, true);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls, [
      `refund-${BOOKING_ID}-${ADMIN_ID}-7000`,
      `refund-${BOOKING_ID}-${ADMIN_ID}-7000`,
      `refund-${BOOKING_ID}-${ADMIN_ID}-7000`,
    ]);
  });
});
