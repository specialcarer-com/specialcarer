import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCaptureClaimAvailable,
  PAYMENT_CAPTURE_CLAIM_TTL_MS,
  paymentCaptureClaimFilter,
  processClaimedCapture,
} from "./payment-capture-claim";

describe("payment capture claim pattern", () => {
  const now = new Date("2026-08-18T00:20:00.000Z");

  it("does not process a row another cron invocation already claimed", async () => {
    let captures = 0;
    const result = await processClaimedCapture(
      async () => null,
      async () => {
        captures += 1;
      },
    );

    assert.equal(result, "skipped");
    assert.equal(captures, 0);
  });

  it("processes the row only after the atomic claim returns its id", async () => {
    let processedId: string | null = null;
    const result = await processClaimedCapture(
      async () => "payment-1",
      async (id) => {
        processedId = id;
      },
    );

    assert.equal(result, "claimed");
    assert.equal(processedId, "payment-1");
  });

  it("permits an unclaimed row or a claim older than the ten-minute TTL", () => {
    assert.equal(isCaptureClaimAvailable(null, now), true);
    assert.equal(
      isCaptureClaimAvailable(
        new Date(now.getTime() - PAYMENT_CAPTURE_CLAIM_TTL_MS - 1).toISOString(),
        now,
      ),
      true,
    );
    assert.equal(
      isCaptureClaimAvailable(
        new Date(now.getTime() - PAYMENT_CAPTURE_CLAIM_TTL_MS).toISOString(),
        now,
      ),
      false,
    );
  });

  it("builds the atomic SQL predicate that reclaims only expired claims", () => {
    assert.equal(
      paymentCaptureClaimFilter(now),
      "processing_started_at.is.null,processing_started_at.lt.2026-08-18T00:10:00.000Z",
    );
  });
});
