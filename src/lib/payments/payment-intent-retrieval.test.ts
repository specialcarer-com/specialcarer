import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retrievePaymentIntent } from "@/lib/payments/payment-intent-retrieval";

describe("retrievePaymentIntent", () => {
  it("returns a retryable failure result instead of throwing", async () => {
    const result = await retrievePaymentIntent(
      {
        paymentIntents: {
          async retrieve() {
            throw new Error("Stripe timeout");
          },
        },
      },
      "pi_stale",
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(String(result.error), /Stripe timeout/);
  });
});
