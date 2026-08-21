import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  reconcileChargeRefund,
  type RefundWebhookClient,
} from "@/lib/payments/refund-webhook-reconciliation";

function client(overrides: Partial<RefundWebhookClient> = {}) {
  const calls: string[] = [];
  const base: RefundWebhookClient = {
    async updatePaymentStatus() {
      calls.push("payment-update");
      return { error: null };
    },
    async findPayment() {
      calls.push("payment-lookup");
      return { data: { bookingId: "booking-1" }, error: null };
    },
    async updateBooking() {
      calls.push("booking-update");
      return { error: null };
    },
    async reconcileClaim(input) {
      calls.push(`claim:${input.claim.id}:${input.claim.requestKey}`);
      return { error: null };
    },
  };
  return { client: { ...base, ...overrides }, calls };
}

describe("reconcileChargeRefund", () => {
  it("reconciles a Stripe-created refund that was left pending in the database", async () => {
    const { client: db, calls } = client();
    const bookingId = await reconcileChargeRefund({
      client: db,
      fullyRefunded: false,
      amountCents: 2500,
      claimedRefund: { id: "re_123", requestKey: "refund-booking-1-admin-2500" },
      now: new Date("2026-08-21T12:00:00.000Z"),
    });
    assert.equal(bookingId, "booking-1");
    assert.deepEqual(calls, [
      "payment-update",
      "payment-lookup",
      "booking-update",
      "claim:re_123:refund-booking-1-admin-2500",
    ]);
  });

  it("throws on a payment lookup error so Stripe retries the webhook", async () => {
    const { client: db } = client({
      async findPayment() {
        return { data: null, error: { message: "database unavailable" } };
      },
    });
    await assert.rejects(
      reconcileChargeRefund({
        client: db,
        fullyRefunded: true,
        amountCents: 7000,
        claimedRefund: null,
      }),
      /payment lookup failed/,
    );
  });

  it("throws on a booking update error so Stripe retries the webhook", async () => {
    const { client: db } = client({
      async updateBooking() {
        return { error: { message: "database unavailable" } };
      },
    });
    await assert.rejects(
      reconcileChargeRefund({
        client: db,
        fullyRefunded: true,
        amountCents: 7000,
        claimedRefund: null,
      }),
      /booking refund update failed/,
    );
  });
});
