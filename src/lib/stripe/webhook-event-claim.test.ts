import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimStripeWebhookEvent,
  type StripeWebhookEventRow,
} from "./webhook-event-claim";

const event: StripeWebhookEventRow = {
  id: "evt_duplicate",
  type: "payment_intent.succeeded",
  payload: { id: "evt_duplicate", livemode: true },
};

describe("claimStripeWebhookEvent", () => {
  it("treats a duplicate insert as already owned and does not re-execute effects", async () => {
    let sideEffects = 0;
    const first = await claimStripeWebhookEvent(
      async () => ({ id: event.id, error: null }),
      event,
    );
    if (first.claimed) sideEffects += 1;

    const duplicate = await claimStripeWebhookEvent(
      async () => ({ id: null, error: null }),
      event,
    );
    if (duplicate.claimed) sideEffects += 1;

    assert.deepEqual(first, { claimed: true, error: null });
    assert.deepEqual(duplicate, { claimed: false, error: null });
    assert.equal(sideEffects, 1);
  });

  it("does not treat a failed insert as a duplicate", async () => {
    const result = await claimStripeWebhookEvent(
      async () => ({ id: null, error: "database unavailable" }),
      event,
    );

    assert.deepEqual(result, {
      claimed: false,
      error: "database unavailable",
    });
  });
});
