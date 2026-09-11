import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectLedgerCacheDiscrepancy,
  foldLedger,
  projectRefundState,
  recordRefundEvent,
  type LedgerAdminClient,
  type RefundLedgerRow,
} from "./refund-ledger";

// ---- foldLedger ------------------------------------------------------------

describe("foldLedger", () => {
  it("returns a zero projection for an empty ledger", () => {
    const p = foldLedger([]);
    assert.deepEqual(p, {
      total_refunded_cents: 0,
      latest_refund_status: null,
      latest_event_type: null,
      last_event_at: null,
      failed_refund_count: 0,
      event_count: 0,
    });
  });

  it("sums two successful partials to the correct total", () => {
    // Booking £30 (3000). Partial 1 of £10 then partial 2 of £15 → total 2500.
    const p = foldLedger([
      row({
        stripe_refund_id: "re_partial1",
        event_type: "charge.refunded",
        amount_cents: 1000,
        status: "succeeded",
        created_at: "2026-09-11T10:00:00.000Z",
      }),
      row({
        stripe_refund_id: "re_partial2",
        event_type: "charge.refunded",
        amount_cents: 1500,
        status: "succeeded",
        created_at: "2026-09-11T10:05:00.000Z",
      }),
    ]);
    assert.equal(p.total_refunded_cents, 2500);
    assert.equal(p.event_count, 2);
    assert.equal(p.failed_refund_count, 0);
    assert.equal(p.latest_event_type, "charge.refunded");
    assert.equal(p.last_event_at, "2026-09-11T10:05:00.000Z");
  });

  it("excludes failed refunds from the total but counts them", () => {
    const p = foldLedger([
      row({
        stripe_refund_id: "re_ok",
        event_type: "charge.refunded",
        amount_cents: 1000,
        status: "succeeded",
        created_at: "2026-09-11T10:00:00.000Z",
      }),
      row({
        stripe_refund_id: "re_fail",
        event_type: "refund.failed",
        amount_cents: 500,
        status: "failed",
        created_at: "2026-09-11T10:10:00.000Z",
      }),
    ]);
    assert.equal(p.total_refunded_cents, 1000);
    assert.equal(p.failed_refund_count, 1);
    // Latest event is the failure, even though it didn't affect the total.
    assert.equal(p.latest_event_type, "refund.failed");
    assert.equal(p.latest_refund_status, "failed");
  });

  it("charge.refund.updated to failed does NOT add to the total", () => {
    // Simulates: succeeded event first, then a later updated→failed on the
    // same refund. The ledger projection should treat only the succeeded
    // event as money moved, and reflect the latest status as failed.
    const p = foldLedger([
      row({
        stripe_refund_id: "re_flipped",
        event_type: "charge.refunded",
        amount_cents: 1500,
        status: "succeeded",
        created_at: "2026-09-11T10:00:00.000Z",
      }),
      row({
        stripe_refund_id: "re_flipped",
        event_type: "charge.refund.updated",
        amount_cents: 1500,
        status: "failed",
        created_at: "2026-09-11T10:20:00.000Z",
      }),
    ]);
    // Note: this test documents the current invariant — an updated=failed
    // ledger row does NOT auto-reverse the successful debit. Reversal
    // becomes a separate accounting step (out of scope for B4). The
    // ledger surfaces the state correctly; humans decide on the
    // countervailing entry.
    assert.equal(p.total_refunded_cents, 1500);
    assert.equal(p.latest_refund_status, "failed");
    assert.equal(p.failed_refund_count, 1);
  });
});

// ---- detectLedgerCacheDiscrepancy -----------------------------------------

describe("detectLedgerCacheDiscrepancy", () => {
  it("returns null when ledger and cache agree", () => {
    const p = foldLedger([
      row({
        stripe_refund_id: "re_1",
        event_type: "charge.refunded",
        amount_cents: 2500,
        status: "succeeded",
        created_at: "2026-09-11T10:00:00.000Z",
      }),
    ]);
    const d = detectLedgerCacheDiscrepancy({
      bookingId: "bk_1",
      ledger: p,
      cached_refunded_amount_cents: 2500,
    });
    assert.equal(d, null);
  });

  it("treats a null cache as 0 and flags a positive delta", () => {
    const p = foldLedger([
      row({
        stripe_refund_id: "re_1",
        event_type: "charge.refunded",
        amount_cents: 2500,
        status: "succeeded",
        created_at: "2026-09-11T10:00:00.000Z",
      }),
    ]);
    const d = detectLedgerCacheDiscrepancy({
      bookingId: "bk_1",
      ledger: p,
      cached_refunded_amount_cents: null,
    });
    assert.deepEqual(d, {
      booking_id: "bk_1",
      ledger_total_cents: 2500,
      cache_total_cents: 0,
      delta_cents: 2500,
    });
  });

  it("flags when cache overstates the ledger (last-write-wins bug)", () => {
    // Realistic scenario: two partials were recorded correctly in the
    // ledger, but the counter was overwritten by the second one alone
    // rather than incremented — so cache says 1500, ledger says 2500.
    const p = foldLedger([
      row({
        stripe_refund_id: "re_1",
        event_type: "charge.refunded",
        amount_cents: 1000,
        status: "succeeded",
        created_at: "2026-09-11T10:00:00.000Z",
      }),
      row({
        stripe_refund_id: "re_2",
        event_type: "charge.refunded",
        amount_cents: 1500,
        status: "succeeded",
        created_at: "2026-09-11T10:05:00.000Z",
      }),
    ]);
    const d = detectLedgerCacheDiscrepancy({
      bookingId: "bk_1",
      ledger: p,
      cached_refunded_amount_cents: 1500,
    });
    assert.equal(d?.delta_cents, 1000);
  });
});

// ---- recordRefundEvent ----------------------------------------------------

describe("recordRefundEvent", () => {
  it("returns inserted:true on successful insert", async () => {
    const admin = makeAdmin({ upsertResult: { error: null } });
    const res = await recordRefundEvent(admin, {
      booking_id: "bk_1",
      stripe_refund_id: "re_1",
      stripe_event_id: "evt_1",
      event_type: "charge.refunded",
      amount_cents: 1000,
      currency: "gbp",
      status: "succeeded",
      reason: null,
      raw: {},
    });
    assert.deepEqual(res, { ok: true, inserted: true });
  });

  it("skips deploy-safely when the table does not exist yet", async () => {
    const admin = makeAdmin({
      upsertResult: {
        error: {
          code: "42P01",
          message: 'relation "refund_ledger" does not exist',
        },
      },
    });
    const res = await recordRefundEvent(admin, {
      booking_id: "bk_1",
      stripe_refund_id: "re_1",
      stripe_event_id: "evt_1",
      event_type: "charge.refunded",
      amount_cents: 1000,
      currency: "gbp",
      status: "succeeded",
      reason: null,
      raw: {},
    });
    assert.deepEqual(res, {
      ok: true,
      inserted: false,
      skippedReason: "schema_not_ready",
    });
  });

  it("returns ok:false on other database errors", async () => {
    const admin = makeAdmin({
      upsertResult: { error: { code: "23505", message: "some other error" } },
    });
    const res = await recordRefundEvent(admin, {
      booking_id: "bk_1",
      stripe_refund_id: "re_1",
      stripe_event_id: "evt_1",
      event_type: "charge.refunded",
      amount_cents: 1000,
      currency: "gbp",
      status: "succeeded",
      reason: null,
      raw: {},
    });
    assert.equal(res.ok, false);
  });

  it("upsert uses onConflict on (stripe_refund_id, event_type) so replay is a no-op", async () => {
    // We assert the *shape* of the upsert options here: a caller relying
    // on this behaviour needs onConflict to include both columns and
    // ignoreDuplicates=true. Regression guard for anyone who might swap
    // this for a plain .insert() later.
    const captured: { options: Record<string, unknown> | null } = {
      options: null,
    };
    const admin: LedgerAdminClient = {
      from() {
        return {
          upsert(
            _rows: unknown,
            options: Record<string, unknown>,
          ) {
            captured.options = options;
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    await recordRefundEvent(admin, {
      booking_id: "bk_1",
      stripe_refund_id: "re_1",
      stripe_event_id: "evt_1",
      event_type: "charge.refunded",
      amount_cents: 1000,
      currency: "gbp",
      status: "succeeded",
      reason: null,
      raw: {},
    });
    assert.equal(
      captured.options?.onConflict,
      "stripe_refund_id,event_type",
    );
    assert.equal(captured.options?.ignoreDuplicates, true);
  });
});

// ---- projectRefundState (read + fold) --------------------------------------

describe("projectRefundState", () => {
  it("returns a zero projection when the table doesn't exist yet", async () => {
    const admin = makeAdmin({
      selectResult: {
        data: null,
        error: {
          code: "42P01",
          message: 'relation "refund_ledger" does not exist',
        },
      },
    });
    const p = await projectRefundState(admin, "bk_1");
    assert.equal(p.event_count, 0);
    assert.equal(p.total_refunded_cents, 0);
  });

  it("folds two-partial rows into a projection of 2500", async () => {
    const admin = makeAdmin({
      selectResult: {
        data: [
          row({
            stripe_refund_id: "re_1",
            event_type: "charge.refunded",
            amount_cents: 1000,
            status: "succeeded",
            created_at: "2026-09-11T10:00:00.000Z",
          }),
          row({
            stripe_refund_id: "re_2",
            event_type: "charge.refunded",
            amount_cents: 1500,
            status: "succeeded",
            created_at: "2026-09-11T10:05:00.000Z",
          }),
        ],
        error: null,
      },
    });
    const p = await projectRefundState(admin, "bk_1");
    assert.equal(p.total_refunded_cents, 2500);
    assert.equal(p.event_count, 2);
  });

  it("returns an empty projection (not throw) on non-table errors", async () => {
    const admin = makeAdmin({
      selectResult: {
        data: null,
        error: { code: "unknown", message: "transient" },
      },
    });
    const p = await projectRefundState(admin, "bk_1");
    assert.equal(p.event_count, 0);
  });
});

// ---- test helpers ---------------------------------------------------------

function row(overrides: Partial<RefundLedgerRow>): RefundLedgerRow {
  return {
    booking_id: "bk_1",
    stripe_refund_id: "re_x",
    stripe_event_id: "evt_x",
    event_type: "charge.refunded",
    amount_cents: 0,
    currency: "gbp",
    status: "succeeded",
    reason: null,
    raw: {},
    ...overrides,
  };
}

type UpsertResult = { error: { message: string; code?: string } | null };
type SelectResult = {
  data: RefundLedgerRow[] | null;
  error: { message: string; code?: string } | null;
};
function makeAdmin(opts: {
  upsertResult?: UpsertResult;
  selectResult?: SelectResult;
}): LedgerAdminClient {
  return {
    from() {
      return {
        upsert() {
          return Promise.resolve(opts.upsertResult ?? { error: null });
        },
        select() {
          return {
            eq() {
              return {
                order() {
                  return Promise.resolve(
                    opts.selectResult ?? { data: [], error: null },
                  );
                },
              };
            },
          };
        },
      };
    },
  };
}
