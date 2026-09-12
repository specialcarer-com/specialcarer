import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearDisputeOpenHold,
  setDisputeOpenHold,
  type PayoutHoldAdminClient,
} from "./payout-hold";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory bookings table just for this module.
// ─────────────────────────────────────────────────────────────────────────────

type Bkg = { id: string; carer_payout_hold_reason: string | null };
type State = {
  bookings: Bkg[];
  simulateSchemaMissing?: boolean;
};

function makeAdmin(state: State): PayoutHoldAdminClient {
  return {
    from() {
      if (state.simulateSchemaMissing) {
        const error = {
          code: "42703",
          message: "column bookings.carer_payout_hold_reason does not exist",
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fail: any = { data: null, error };
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => fail }),
          }),
          update: () => ({
            eq: () => ({
              is: async () => fail,
              eq: async () => fail,
            }),
          }),
        };
      }
      return {
        select() {
          return {
            eq(_c: string, val: string) {
              return {
                maybeSingle: async () => {
                  const b = state.bookings.find((x) => x.id === val);
                  return b
                    ? {
                        data: {
                          carer_payout_hold_reason: b.carer_payout_hold_reason,
                        },
                        error: null,
                      }
                    : { data: null, error: null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_c1: string, id: string) {
              const chain = {
                is(_c2: string, _v: null) {
                  run((b) => b.carer_payout_hold_reason === null);
                  return {
                    then: (r: (v: unknown) => void) => r({ error: null }),
                  };
                },
                eq(_c2: string, v2: string) {
                  run((b) => b.carer_payout_hold_reason === v2);
                  return {
                    then: (r: (v: unknown) => void) => r({ error: null }),
                  };
                },
                then(resolve: (v: unknown) => void) {
                  run(() => true);
                  resolve({ error: null });
                },
              };
              function run(guard: (b: Bkg) => boolean) {
                const idx = state.bookings.findIndex((b) => b.id === id);
                if (idx >= 0 && guard(state.bookings[idx])) {
                  state.bookings[idx] = {
                    ...state.bookings[idx],
                    ...(patch as Partial<Bkg>),
                  };
                }
              }
              return chain;
            },
          };
        },
      };
    },
  };
}

describe("setDisputeOpenHold", () => {
  it("sets 'dispute_open' when the booking has no hold reason", async () => {
    const state: State = {
      bookings: [{ id: "bk", carer_payout_hold_reason: null }],
    };
    const r = await setDisputeOpenHold(makeAdmin(state), "bk");
    assert.equal(r.ok, true);
    if (r.ok && !("skippedReason" in r)) assert.equal(r.changed, true);
    assert.equal(state.bookings[0].carer_payout_hold_reason, "dispute_open");
  });

  it("is a no-op when already 'dispute_open' (idempotent)", async () => {
    const state: State = {
      bookings: [{ id: "bk", carer_payout_hold_reason: "dispute_open" }],
    };
    const r = await setDisputeOpenHold(makeAdmin(state), "bk");
    assert.equal(r.ok, true);
    if (r.ok && "changed" in r) assert.equal(r.changed, false);
  });

  it("refuses to overwrite a different reason (dbs_expired)", async () => {
    const state: State = {
      bookings: [{ id: "bk", carer_payout_hold_reason: "dbs_expired" }],
    };
    const r = await setDisputeOpenHold(makeAdmin(state), "bk");
    assert.equal(r.ok, true);
    if (r.ok && "skippedReason" in r) {
      assert.equal(r.skippedReason, "other_reason_present");
      assert.equal(r.currentReason, "dbs_expired");
    } else {
      assert.fail("expected skippedReason='other_reason_present'");
    }
    assert.equal(state.bookings[0].carer_payout_hold_reason, "dbs_expired");
  });

  it("returns schema_not_ready when the column is missing", async () => {
    const state: State = {
      bookings: [{ id: "bk", carer_payout_hold_reason: null }],
      simulateSchemaMissing: true,
    };
    const r = await setDisputeOpenHold(makeAdmin(state), "bk");
    assert.equal(r.ok, true);
    if (r.ok && "skippedReason" in r) {
      assert.equal(r.skippedReason, "schema_not_ready");
    } else {
      assert.fail("expected skippedReason='schema_not_ready'");
    }
  });
});

describe("clearDisputeOpenHold", () => {
  it("clears 'dispute_open'", async () => {
    const state: State = {
      bookings: [{ id: "bk", carer_payout_hold_reason: "dispute_open" }],
    };
    const r = await clearDisputeOpenHold(makeAdmin(state), "bk");
    assert.equal(r.ok, true);
    if (r.ok && !("skippedReason" in r)) assert.equal(r.changed, true);
    assert.equal(state.bookings[0].carer_payout_hold_reason, null);
  });

  it("preserves a different reason (dbs_expired)", async () => {
    const state: State = {
      bookings: [{ id: "bk", carer_payout_hold_reason: "dbs_expired" }],
    };
    const r = await clearDisputeOpenHold(makeAdmin(state), "bk");
    assert.equal(r.ok, true);
    if (r.ok && "skippedReason" in r) {
      assert.equal(r.skippedReason, "other_reason_present");
    }
    assert.equal(state.bookings[0].carer_payout_hold_reason, "dbs_expired");
  });

  it("is a no-op when already null", async () => {
    const state: State = {
      bookings: [{ id: "bk", carer_payout_hold_reason: null }],
    };
    const r = await clearDisputeOpenHold(makeAdmin(state), "bk");
    assert.equal(r.ok, true);
    if (r.ok && "changed" in r) assert.equal(r.changed, false);
  });
});
