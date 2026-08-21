import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRefundRequest } from "@/lib/payments/refund-request";

describe("parseRefundRequest", () => {
  for (const amount_cents of [true, "1", null, {}]) {
    it(`rejects non-numeric amount_cents: ${JSON.stringify(amount_cents)}`, () => {
      assert.equal(parseRefundRequest({ amount_cents }), null);
    });
  }

  it("accepts a positive integer JSON number", () => {
    assert.deepEqual(parseRefundRequest({ amount_cents: 2500 }), {
      amountCents: 2500,
      reason: null,
    });
  });
});
