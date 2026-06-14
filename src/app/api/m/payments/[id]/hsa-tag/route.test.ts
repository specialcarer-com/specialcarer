/**
 * Tests for the HSA-tag handler (gap 33).
 *
 * Drives the pure handleHsaTag with a stubbed HsaTagClient, asserting:
 *   • 200 when the payer toggles eligible=true (stamps tagged_at/by)
 *   • 200 when un-tagging (eligible=false clears stamps)
 *   • 400 when the body's eligible is not a boolean
 *   • 401 when there is no authenticated user
 *   • 403 when a non-payer tries to tag
 *   • 404 when the payment does not exist
 *   • 500 when the lookup errors
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleHsaTag,
  type HsaTagClient,
  type HsaTagPaymentRow,
} from "@/lib/hsa/tag-handler";

const PAYER = "00000000-0000-0000-0000-000000000001";
const STRANGER = "00000000-0000-0000-0000-000000000002";
const PAYMENT = "00000000-0000-0000-0000-0000000000aa";
const FIXED_NOW = new Date("2026-06-14T12:00:00.000Z");

function paymentRow(): HsaTagPaymentRow {
  return { id: PAYMENT, seeker_id: PAYER, currency: "usd" };
}

function client(overrides?: {
  found?: { data: HsaTagPaymentRow | null; error: { message: string } | null };
  updateError?: { message: string } | null;
  onUpdate?: (args: {
    paymentId: string;
    eligible: boolean;
    taggedAt: string | null;
    taggedBy: string | null;
  }) => void;
}): HsaTagClient {
  return {
    async getPaymentWithPayer() {
      return overrides?.found ?? { data: paymentRow(), error: null };
    },
    async updateHsaTag(args) {
      overrides?.onUpdate?.(args);
      return { error: overrides?.updateError ?? null };
    },
  };
}

describe("handleHsaTag", () => {
  it("tags eligible=true, stamping tagged_at/by", async () => {
    let captured:
      | { eligible: boolean; taggedAt: string | null; taggedBy: string | null }
      | undefined;
    const res = await handleHsaTag({
      user_id: PAYER,
      payment_id: PAYMENT,
      eligible: true,
      now: FIXED_NOW,
      client: client({
        onUpdate: (a) => {
          captured = a;
        },
      }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as Record<string, unknown>;
    assert.equal(json.hsa_eligible, true);
    assert.equal(json.hsa_tagged_at, FIXED_NOW.toISOString());
    assert.equal(json.hsa_tagged_by, PAYER);
    assert.equal(captured?.taggedAt, FIXED_NOW.toISOString());
    assert.equal(captured?.taggedBy, PAYER);
  });

  it("un-tags eligible=false, clearing stamps", async () => {
    const res = await handleHsaTag({
      user_id: PAYER,
      payment_id: PAYMENT,
      eligible: false,
      now: FIXED_NOW,
      client: client(),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as Record<string, unknown>;
    assert.equal(json.hsa_eligible, false);
    assert.equal(json.hsa_tagged_at, null);
    assert.equal(json.hsa_tagged_by, null);
  });

  it("400 when eligible is not a boolean", async () => {
    const res = await handleHsaTag({
      user_id: PAYER,
      payment_id: PAYMENT,
      eligible: "yes",
      client: client(),
    });
    assert.equal(res.status, 400);
  });

  it("401 when not authenticated", async () => {
    const res = await handleHsaTag({
      user_id: null,
      payment_id: PAYMENT,
      eligible: true,
      client: client(),
    });
    assert.equal(res.status, 401);
  });

  it("403 when caller is not the payer", async () => {
    const res = await handleHsaTag({
      user_id: STRANGER,
      payment_id: PAYMENT,
      eligible: true,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("403 when the payment is not USD (US-only)", async () => {
    const res = await handleHsaTag({
      user_id: PAYER,
      payment_id: PAYMENT,
      eligible: true,
      client: client({
        found: {
          data: { id: PAYMENT, seeker_id: PAYER, currency: "gbp" },
          error: null,
        },
      }),
    });
    assert.equal(res.status, 403);
  });

  it("404 when the payment is missing", async () => {
    const res = await handleHsaTag({
      user_id: PAYER,
      payment_id: PAYMENT,
      eligible: true,
      client: client({ found: { data: null, error: null } }),
    });
    assert.equal(res.status, 404);
  });

  it("500 when the lookup errors", async () => {
    const res = await handleHsaTag({
      user_id: PAYER,
      payment_id: PAYMENT,
      eligible: true,
      client: client({ found: { data: null, error: { message: "boom" } } }),
    });
    assert.equal(res.status, 500);
  });
});
