/**
 * Tests for the HSA summary PDF handler (gap 33).
 *
 * Drives handleHsaPdf with a stubbed HsaPdfClient, asserting:
 *   • 200 with application/pdf, %PDF magic, sensible byte length
 *   • Content-Disposition filename + Cache-Control: private, no-store
 *   • 401 when not authenticated
 *   • 403 for a non-US seeker
 *   • renders even with zero eligible payments
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleHsaPdf,
  type HsaPdfClient,
} from "@/lib/hsa/pdf-handler";
import type { HsaSummaryPaymentRow } from "@/lib/hsa/summary-handler";

const PAYER = "00000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-06-14T12:00:00.000Z");

function rows(): HsaSummaryPaymentRow[] {
  return [
    {
      id: "p1",
      booking_id: "b1",
      amount_cents: 12000,
      paid_at: "2026-02-01T00:00:00.000Z",
      caregiver_name: "Jane Carer",
      hsa_eligible: true,
    },
  ];
}

function client(overrides?: {
  us?: boolean;
  payments?: HsaSummaryPaymentRow[] | null;
}): HsaPdfClient {
  return {
    async isUsSeeker() {
      return { data: overrides?.us ?? true, error: null };
    },
    async listEligiblePayments() {
      return { data: overrides?.payments ?? rows(), error: null };
    },
    async getSeekerName() {
      return "Pat Payer";
    },
  };
}

describe("handleHsaPdf", () => {
  it("200 returns a PDF with the right headers", async () => {
    const res = await handleHsaPdf({
      user_id: PAYER,
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/pdf");
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    assert.match(
      res.headers.get("Content-Disposition") ?? "",
      /hsa-fsa-summary-2026-20260614\.pdf/,
    );
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
    assert.ok(buf.byteLength > 1000);
  });

  it("401 when not authenticated", async () => {
    const res = await handleHsaPdf({
      user_id: null,
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 401);
  });

  it("403 for a non-US seeker", async () => {
    const res = await handleHsaPdf({
      user_id: PAYER,
      client: client({ us: false }),
      now: NOW,
    });
    assert.equal(res.status, 403);
  });

  it("renders with zero eligible payments", async () => {
    const res = await handleHsaPdf({
      user_id: PAYER,
      client: client({ payments: [] }),
      now: NOW,
    });
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
  });
});
