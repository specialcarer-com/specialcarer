/**
 * Concurrency semantics for the D3 create_org_booking_with_offer RPC.
 *
 * Real DB integration for this migration lives in the follow-up
 * integration harness (not yet wired up in this repo — see the Phase
 * C postmortem for context). Meanwhile this file models the
 * RPC's contract with a mock Supabase client:
 *
 *   • Both concurrent callers pass the same client-supplied
 *     idempotency key (surfaced as a duplicate carer_id or a
 *     duplicate (booking_id, carer_id) unique-constraint hit on the
 *     org_booking_offers side).
 *   • First caller wins; second caller receives a 23505 error and
 *     the route maps it to a 409 body without corrupting the DB.
 *
 * TODO: promote to integration test when harness lands. When it
 * does, replace `mockRpc` with a real supabase-js call inside a
 * fresh transaction (`begin; call rpc ...; rollback;` pattern used
 * by the payout_alerts integration harness).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Mock RPC — models the atomic branch of create_org_booking_with_offer
// ---------------------------------------------------------------------------

type RpcCall = {
  bookingId: string;
  carerId: string;
};

type RpcOutcome =
  | { ok: true; bookingId: string }
  | { ok: false; code: string; message: string };

class MockRpcState {
  // (bookingId, carerId) → offer id. Models the unique constraint on
  // org_booking_offers.
  private offers = new Map<string, string>();
  // bookingId → true — models the bookings table.
  private bookings = new Map<string, true>();

  private key(bookingId: string, carerId: string) {
    return `${bookingId}::${carerId}`;
  }

  /**
   * Attempt a single insert-booking + insert-offer transaction.
   * Serial from the caller's POV; concurrent orderings are modelled
   * by calling this multiple times in a Promise.all with a shared
   * `state` instance.
   */
  attempt(call: RpcCall): RpcOutcome {
    // If the booking already exists (idempotent re-attempt), we still
    // try to insert the offer — the RPC caller would have passed the
    // same bookingId for a retry. In the real DB this happens
    // atomically inside one txn; the mock reflects the observable
    // outcome, not the internal ordering.
    if (this.bookings.has(call.bookingId)) {
      // Booking exists → try to fan out the offer only.
      const key = this.key(call.bookingId, call.carerId);
      if (this.offers.has(key)) {
        return {
          ok: false,
          code: "23505",
          message: `duplicate key value violates unique constraint (booking_id, carer_id)`,
        };
      }
      this.offers.set(key, `offer_${this.offers.size}`);
      return { ok: true, bookingId: call.bookingId };
    }
    // New booking + first offer.
    this.bookings.set(call.bookingId, true);
    this.offers.set(this.key(call.bookingId, call.carerId), `offer_${this.offers.size}`);
    return { ok: true, bookingId: call.bookingId };
  }

  snapshot() {
    return {
      bookings: Array.from(this.bookings.keys()),
      offers: Array.from(this.offers.keys()),
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("create_org_booking_with_offer — idempotent re-attempts", () => {
  it("second caller with same (booking, carer) hits 23505", () => {
    const state = new MockRpcState();
    const first = state.attempt({ bookingId: "b1", carerId: "c1" });
    const second = state.attempt({ bookingId: "b1", carerId: "c1" });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, "23505");
  });

  it("state remains consistent after a duplicate hit", () => {
    const state = new MockRpcState();
    state.attempt({ bookingId: "b1", carerId: "c1" });
    state.attempt({ bookingId: "b1", carerId: "c1" });
    const snap = state.snapshot();
    assert.equal(snap.bookings.length, 1, "one booking recorded");
    assert.equal(snap.offers.length, 1, "one offer recorded");
  });

  it("different carer_id on same booking succeeds (fan-out)", () => {
    const state = new MockRpcState();
    const first = state.attempt({ bookingId: "b1", carerId: "c1" });
    const second = state.attempt({ bookingId: "b1", carerId: "c2" });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const snap = state.snapshot();
    assert.equal(snap.bookings.length, 1);
    assert.equal(snap.offers.length, 2);
  });
});

describe("create_org_booking_with_offer — concurrent inserts", () => {
  it("promise-all with same (booking, carer) yields exactly one success", async () => {
    const state = new MockRpcState();
    // Simulate 5 concurrent callers all racing for the same slot.
    // Because JS is single-threaded, they're actually sequential —
    // this test models the OBSERVABLE outcome from the DB's
    // perspective (which is what the RPC's unique constraint
    // guarantees).
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        Promise.resolve(state.attempt({ bookingId: "b1", carerId: "c1" })),
      ),
    );
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 4);
    for (const f of failures) {
      if (!f.ok) assert.equal(f.code, "23505");
    }
  });

  it("distinct bookings never collide", async () => {
    const state = new MockRpcState();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(state.attempt({ bookingId: `b${i}`, carerId: "c1" })),
      ),
    );
    assert.equal(results.filter((r) => r.ok).length, 10);
    const snap = state.snapshot();
    assert.equal(snap.bookings.length, 10);
    assert.equal(snap.offers.length, 10);
  });

  it("distinct (booking, carer) pairs on same booking succeed", async () => {
    const state = new MockRpcState();
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        Promise.resolve(state.attempt({ bookingId: "b1", carerId: `c${i}` })),
      ),
    );
    assert.equal(results.filter((r) => r.ok).length, 3);
    const snap = state.snapshot();
    assert.equal(snap.bookings.length, 1);
    assert.equal(snap.offers.length, 3);
  });
});

describe("create_org_booking_with_offer — error semantics", () => {
  it("returns a stable error shape on unique-constraint hit", () => {
    const state = new MockRpcState();
    state.attempt({ bookingId: "b1", carerId: "c1" });
    const dup = state.attempt({ bookingId: "b1", carerId: "c1" });
    if (!dup.ok) {
      assert.equal(dup.code, "23505");
      assert.match(dup.message, /unique/i);
    } else {
      assert.fail("expected duplicate to fail");
    }
  });

  it("error responses do not mutate state", () => {
    const state = new MockRpcState();
    state.attempt({ bookingId: "b1", carerId: "c1" });
    const before = state.snapshot();
    state.attempt({ bookingId: "b1", carerId: "c1" }); // dup
    state.attempt({ bookingId: "b1", carerId: "c1" }); // dup
    const after = state.snapshot();
    assert.deepEqual(after, before, "state should be unchanged by dup calls");
  });
});
