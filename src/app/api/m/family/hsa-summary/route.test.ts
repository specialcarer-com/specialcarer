/**
 * Tests for the HSA summary handler (gap 33).
 *
 * Drives handleHsaSummary with a stubbed HsaSummaryClient, asserting:
 *   • 401 when not authenticated
 *   • enabled:false for a non-US (no USD bookings) seeker
 *   • enabled:true with total/count/payments for a US seeker
 *   • year defaulting + ?year filtering pass-through
 *   • 500 on lookup errors
 * Plus unit tests for the pure helpers (sumEligibleCents, formatUsd,
 * resolveYear).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleHsaSummary,
  sumEligibleCents,
  formatUsd,
  resolveYear,
  type HsaSummaryClient,
  type HsaSummaryPaymentRow,
} from "@/lib/hsa/summary-handler";

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
    {
      id: "p2",
      booking_id: "b2",
      amount_cents: 3450,
      paid_at: "2026-03-01T00:00:00.000Z",
      caregiver_name: null,
      hsa_eligible: true,
    },
  ];
}

function client(overrides?: {
  us?: boolean;
  usError?: { message: string } | null;
  payments?: HsaSummaryPaymentRow[] | null;
  paymentsError?: { message: string } | null;
  onList?: (args: { yearStart: string; yearEnd: string }) => void;
}): HsaSummaryClient {
  return {
    async isUsSeeker() {
      return {
        data: overrides?.us ?? true,
        error: overrides?.usError ?? null,
      };
    },
    async listEligiblePayments(args) {
      overrides?.onList?.(args);
      return {
        data: overrides?.payments ?? rows(),
        error: overrides?.paymentsError ?? null,
      };
    },
  };
}

describe("handleHsaSummary", () => {
  it("401 when not authenticated", async () => {
    const res = await handleHsaSummary({
      user_id: null,
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 401);
  });

  it("enabled:false for a non-US seeker", async () => {
    const res = await handleHsaSummary({
      user_id: PAYER,
      client: client({ us: false }),
      now: NOW,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as Record<string, unknown>;
    assert.equal(json.enabled, false);
  });

  it("enabled:true with total/count/payments for a US seeker", async () => {
    const res = await handleHsaSummary({
      user_id: PAYER,
      client: client(),
      now: NOW,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as Record<string, unknown>;
    assert.equal(json.enabled, true);
    assert.equal(json.year, 2026);
    assert.equal(json.currency, "usd");
    assert.equal(json.count, 2);
    assert.equal(json.totalCents, 15450);
    assert.ok(Array.isArray(json.payments));
    const first = (json.payments as Record<string, unknown>[])[0];
    assert.equal(first.bookingId, "b1");
    assert.equal(first.caregiverName, "Jane Carer");
  });

  it("defaults to the current year and passes the year window through", async () => {
    let captured: { yearStart: string; yearEnd: string } | undefined;
    await handleHsaSummary({
      user_id: PAYER,
      client: client({ onList: (a) => (captured = a) }),
      now: NOW,
    });
    assert.equal(captured?.yearStart, "2026-01-01T00:00:00.000Z");
    assert.equal(captured?.yearEnd, "2027-01-01T00:00:00.000Z");
  });

  it("honours an explicit ?year", async () => {
    let captured: { yearStart: string; yearEnd: string } | undefined;
    const res = await handleHsaSummary({
      user_id: PAYER,
      year: 2024,
      client: client({ onList: (a) => (captured = a) }),
      now: NOW,
    });
    const json = (await res.json()) as Record<string, unknown>;
    assert.equal(json.year, 2024);
    assert.equal(captured?.yearStart, "2024-01-01T00:00:00.000Z");
    assert.equal(captured?.yearEnd, "2025-01-01T00:00:00.000Z");
  });

  it("500 when the US check errors", async () => {
    const res = await handleHsaSummary({
      user_id: PAYER,
      client: client({ usError: { message: "boom" } }),
      now: NOW,
    });
    assert.equal(res.status, 500);
  });

  it("500 when the payments lookup errors", async () => {
    const res = await handleHsaSummary({
      user_id: PAYER,
      client: client({ paymentsError: { message: "boom" } }),
      now: NOW,
    });
    assert.equal(res.status, 500);
  });
});

describe("hsa summary helpers", () => {
  it("sumEligibleCents totals amountCents", () => {
    assert.equal(
      sumEligibleCents([{ amountCents: 100 }, { amountCents: 250 }]),
      350,
    );
    assert.equal(sumEligibleCents([]), 0);
  });

  it("formatUsd renders cents as a dollar string", () => {
    assert.equal(formatUsd(0), "$0.00");
    assert.equal(formatUsd(5), "$0.05");
    assert.equal(formatUsd(12345), "$123.45");
    assert.equal(formatUsd(100000), "$1,000.00");
    assert.equal(formatUsd(-2500), "-$25.00");
  });

  it("resolveYear clamps and defaults", () => {
    const now = new Date("2026-06-14T00:00:00.000Z");
    assert.equal(resolveYear(2024, now), 2024);
    assert.equal(resolveYear(undefined, now), 2026);
    assert.equal(resolveYear(1990, now), 2026);
    assert.equal(resolveYear(3000, now), 2026);
    assert.equal(resolveYear(NaN, now), 2026);
  });
});
