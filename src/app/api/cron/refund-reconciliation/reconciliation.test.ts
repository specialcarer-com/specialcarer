/**
 * E1 — Refund reconciliation cron unit tests (pure module).
 *
 * Every path in the decision matrix, plus:
 *   - multiple events for one refund sum correctly (partial → reconciled).
 *   - over-refund → mismatch(over_refunded).
 *   - orphan refund → mismatch(orphan_refund).
 *   - idempotency: reducing the same events twice yields identical rows
 *     (so ON CONFLICT DO UPDATE on stripe_refund_id is safe).
 *   - multi-day-old ledger rows are the route's filter; the pure reducer
 *     doesn't drop them but the shape asserted here mirrors that
 *     contract (the route pre-filters to the last 24 hours).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractChargeIdFromRaw,
  reconcile,
  type LedgerEvent,
  type PaymentSnapshot,
} from "./reconciliation";

const NOW = new Date("2026-09-14T12:00:00.000Z");

function ledgerEvent(overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    booking_id: "book_1",
    stripe_refund_id: "re_1",
    amount_cents: 1000,
    currency: "gbp",
    status: "succeeded",
    event_type: "charge.refunded",
    raw: { id: "re_1", charge: "ch_1", amount: 1000, status: "succeeded" },
    created_at: "2026-09-14T11:00:00.000Z",
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentSnapshot> = {}): PaymentSnapshot {
  return {
    stripe_charge_id: "ch_1",
    stripe_payment_intent_id: "pi_1",
    amount_cents: 1000,
    currency: "gbp",
    status: "refunded",
    ...overrides,
  };
}

describe("extractChargeIdFromRaw", () => {
  it("returns the string charge id", () => {
    assert.equal(
      extractChargeIdFromRaw({ id: "re_1", charge: "ch_1" }),
      "ch_1",
    );
  });
  it("handles nested Charge objects", () => {
    assert.equal(
      extractChargeIdFromRaw({ charge: { id: "ch_9" } }),
      "ch_9",
    );
  });
  it("returns null on missing / malformed raw", () => {
    assert.equal(extractChargeIdFromRaw(null), null);
    assert.equal(extractChargeIdFromRaw({}), null);
    assert.equal(extractChargeIdFromRaw({ charge: null }), null);
    assert.equal(extractChargeIdFromRaw({ charge: 123 }), null);
  });
});

describe("reconcile — single refund, full match", () => {
  it("one succeeded event equal to payment amount → reconciled", () => {
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment({ amount_cents: 1000, status: "refunded" })],
    ]);
    const { rows, summary } = reconcile({
      events: [ledgerEvent({ amount_cents: 1000 })],
      paymentsByChargeId,
      now: NOW,
    });
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.equal(row.state, "reconciled");
    assert.equal(row.observed_amount_cents, 1000);
    assert.equal(row.expected_amount_cents, 1000);
    assert.equal(row.stripe_payment_intent_id, "pi_1");
    assert.equal(row.reconciled_at, NOW.toISOString());
    assert.equal(row.mismatch_reason, null);
    assert.deepEqual(summary, {
      processed: 1,
      reconciled: 1,
      partial: 0,
      initiated: 0,
      mismatched: 0,
    });
  });

  it("payment still 'succeeded' with a fully-refunded amount still reconciles (main handler mutation order)", () => {
    // The Stripe webhook route may write refund_ledger BEFORE mutating
    // payments.status to 'refunded'. The cron should still reconcile
    // as long as observed == expected and at least one succeeded event.
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment({ status: "succeeded" })],
    ]);
    const { rows } = reconcile({
      events: [ledgerEvent()],
      paymentsByChargeId,
      now: NOW,
    });
    assert.equal(rows[0]!.state, "reconciled");
  });
});

describe("reconcile — two events, partial refund", () => {
  it("two succeeded events totalling less than payment → partial", () => {
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment({ amount_cents: 5000 })],
    ]);
    const { rows, summary } = reconcile({
      events: [
        ledgerEvent({
          stripe_refund_id: "re_a",
          amount_cents: 2000,
          created_at: "2026-09-14T10:00:00.000Z",
        }),
        ledgerEvent({
          stripe_refund_id: "re_a",
          amount_cents: 1500,
          created_at: "2026-09-14T11:00:00.000Z",
          event_type: "charge.refund.updated",
        }),
      ],
      paymentsByChargeId,
      now: NOW,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.state, "partial");
    assert.equal(rows[0]!.observed_amount_cents, 3500);
    assert.equal(rows[0]!.expected_amount_cents, 5000);
    assert.equal(summary.partial, 1);
    assert.equal(summary.reconciled, 0);
  });

  it("one pending + one succeeded totalling less → still partial because at least one succeeded", () => {
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment({ amount_cents: 5000 })],
    ]);
    const { rows } = reconcile({
      events: [
        ledgerEvent({
          amount_cents: 2000,
          status: "pending",
          created_at: "2026-09-14T10:00:00.000Z",
        }),
        ledgerEvent({
          amount_cents: 2000,
          status: "succeeded",
          created_at: "2026-09-14T11:00:00.000Z",
        }),
      ],
      paymentsByChargeId,
      now: NOW,
    });
    assert.equal(rows[0]!.state, "partial");
    assert.equal(rows[0]!.observed_amount_cents, 2000);
  });

  it("all-pending events for the refund → initiated (nothing has moved yet)", () => {
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment()],
    ]);
    const { rows, summary } = reconcile({
      events: [
        ledgerEvent({ amount_cents: 500, status: "pending" }),
      ],
      paymentsByChargeId,
      now: NOW,
    });
    assert.equal(rows[0]!.state, "initiated");
    assert.equal(rows[0]!.observed_amount_cents, 0);
    assert.equal(summary.initiated, 1);
  });
});

describe("reconcile — mismatches", () => {
  it("over-refunded → state='mismatch', mismatch_reason='over_refunded'", () => {
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment({ amount_cents: 1000 })],
    ]);
    const { rows, summary } = reconcile({
      events: [ledgerEvent({ amount_cents: 1500 })],
      paymentsByChargeId,
      now: NOW,
    });
    assert.equal(rows[0]!.state, "mismatch");
    assert.equal(rows[0]!.mismatch_reason, "over_refunded");
    assert.equal(rows[0]!.observed_amount_cents, 1500);
    assert.equal(summary.mismatched, 1);
  });

  it("no matching payment → state='mismatch', mismatch_reason='orphan_refund'", () => {
    const { rows, summary } = reconcile({
      events: [
        ledgerEvent({
          raw: { id: "re_orphan", charge: "ch_unknown" },
        }),
      ],
      paymentsByChargeId: new Map(),
      now: NOW,
    });
    assert.equal(rows[0]!.state, "mismatch");
    assert.equal(rows[0]!.mismatch_reason, "orphan_refund");
    assert.equal(rows[0]!.expected_amount_cents, 0);
    assert.equal(summary.mismatched, 1);
  });
});

describe("reconcile — idempotency", () => {
  it("running the reducer twice on the same events produces byte-identical rows", () => {
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment()],
    ]);
    const events = [
      ledgerEvent({ amount_cents: 500, created_at: "2026-09-14T10:00:00.000Z" }),
      ledgerEvent({
        amount_cents: 500,
        created_at: "2026-09-14T11:00:00.000Z",
        event_type: "charge.refund.updated",
      }),
    ];
    const first = reconcile({ events, paymentsByChargeId, now: NOW });
    const second = reconcile({ events, paymentsByChargeId, now: NOW });
    assert.deepEqual(first.rows, second.rows);
    assert.deepEqual(first.summary, second.summary);
  });

  it("adding a duplicate succeeded event with the same refund id still sums correctly (ledger dedupes by design)", () => {
    // In production the (stripe_refund_id, event_type) unique index on
    // refund_ledger prevents duplicates. The reducer assumes upstream
    // dedup — this test documents the contract.
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment({ amount_cents: 1000 })],
    ]);
    const e = ledgerEvent({ amount_cents: 500, event_type: "charge.refunded" });
    // Two distinct event types for the same refund id — legal in the
    // ledger (dedup is per event_type).
    const { rows } = reconcile({
      events: [e, { ...e, event_type: "charge.refund.updated" }],
      paymentsByChargeId,
      now: NOW,
    });
    // Both are 'succeeded' → summed → 1000 → reconciled.
    assert.equal(rows[0]!.state, "reconciled");
    assert.equal(rows[0]!.observed_amount_cents, 1000);
  });
});

describe("reconcile — multi-day-old rows contract", () => {
  it("the reducer is time-agnostic — the route pre-filters to last 24h", () => {
    // Rows older than 24h ARE processed by the reducer if handed in; the
    // route (`route.ts`) drops them via `.gt('created_at', cutoff)`. This
    // test asserts the reducer's shape so a future refactor can't
    // silently move time filtering here.
    const paymentsByChargeId = new Map<string, PaymentSnapshot>([
      ["ch_1", payment()],
    ]);
    const old = ledgerEvent({
      amount_cents: 1000,
      created_at: "2026-08-01T00:00:00.000Z",
    });
    const { rows } = reconcile({
      events: [old],
      paymentsByChargeId,
      now: NOW,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.state, "reconciled");
  });
});
