import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimStripeWebhookEvent,
  type StripeWebhookEventRow,
  type WebhookEventPersistResult,
} from "./webhook-event-claim";

const event: StripeWebhookEventRow = {
  id: "evt_test",
  type: "payment_intent.succeeded",
  payload: { id: "evt_test", livemode: true },
};

function persistResult(
  overrides: Partial<WebhookEventPersistResult> = {},
): WebhookEventPersistResult {
  return {
    existed: false,
    alreadyProcessed: false,
    hasError: false,
    attemptCount: 1,
    error: null,
    ...overrides,
  };
}

describe("claimStripeWebhookEvent", () => {
  it("classifies a brand-new insert as fresh", async () => {
    const out = await claimStripeWebhookEvent(
      async () => persistResult({ existed: false, attemptCount: 1 }),
      event,
    );
    assert.deepEqual(out, { status: "fresh", attemptCount: 1, error: null });
  });

  it("classifies a re-delivery of a processed event as already_processed", async () => {
    const out = await claimStripeWebhookEvent(
      async () =>
        persistResult({
          existed: true,
          alreadyProcessed: true,
          attemptCount: 2,
        }),
      event,
    );
    assert.deepEqual(out, {
      status: "already_processed",
      attemptCount: 2,
      error: null,
    });
  });

  it("classifies a re-delivery of an errored event as retryable so the handler runs again", async () => {
    // This is the bug we're fixing: prior version returned claimed=false
    // for ANY existing row, which told Stripe to stop retrying a crashed
    // handler and orphaned the delivery.
    const out = await claimStripeWebhookEvent(
      async () =>
        persistResult({
          existed: true,
          alreadyProcessed: false,
          hasError: true,
          attemptCount: 3,
        }),
      event,
    );
    assert.deepEqual(out, {
      status: "retryable",
      attemptCount: 3,
      error: null,
    });
  });

  it("classifies a re-delivery of an in-flight event as retryable (caller decides concurrency)", async () => {
    // processed_at IS NULL and error IS NULL: the row exists but is still
    // being handled by another invocation, OR a crash happened before the
    // error column could be written. Either way the handler must run again;
    // the persist layer is responsible for guarding against parallelism.
    const out = await claimStripeWebhookEvent(
      async () =>
        persistResult({
          existed: true,
          alreadyProcessed: false,
          hasError: false,
          attemptCount: 2,
        }),
      event,
    );
    assert.equal(out.status, "retryable");
    assert.equal(out.attemptCount, 2);
  });

  it("surfaces the persist error verbatim, still as fresh so the caller 500s and Stripe retries", async () => {
    const out = await claimStripeWebhookEvent(
      async () =>
        persistResult({
          existed: false,
          attemptCount: 0,
          error: "database unavailable",
        }),
      event,
    );
    assert.deepEqual(out, {
      status: "fresh",
      attemptCount: 0,
      error: "database unavailable",
    });
  });
});
