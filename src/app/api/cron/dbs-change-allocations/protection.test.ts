import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decideBookingAction,
  planProtection,
  type AllocatedBooking,
  type BookingStatus,
  type ChangeEvent,
} from "./protection";

const NOW = Date.parse("2026-09-11T20:00:00Z");
const FUTURE = new Date(NOW + 60 * 60 * 1000).toISOString();     // +1h
const FUTURE_END = new Date(NOW + 3 * 60 * 60 * 1000).toISOString(); // +3h
const PAST = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();  // -1d
const PAST_END = new Date(NOW - 20 * 60 * 60 * 1000).toISOString();

const EVENT: ChangeEvent = {
  id: "evt_1",
  carer_id: "carer_a",
  detected_at: new Date(NOW - 5 * 60 * 1000).toISOString(),
};

function booking(overrides: Partial<AllocatedBooking> = {}): AllocatedBooking {
  return {
    id: "book_1",
    seeker_id: "seeker_a",
    caregiver_id: "carer_a",
    status: "accepted",
    starts_at: FUTURE,
    ends_at: FUTURE_END,
    stripe_payment_intent_id: "pi_test_1",
    amount_cents: 5000,
    dbs_protection_status: null,
    dbs_protection_change_event_id: null,
    ...overrides,
  };
}

describe("decideBookingAction", () => {
  it("flags a future accepted booking for admin review", () => {
    const action = decideBookingAction(booking({ status: "accepted" }), EVENT, NOW);
    assert.equal(action.kind, "flag_pending");
  });

  it("auto-cancels a paid booking and requests a refund of the escrow", () => {
    const action = decideBookingAction(
      booking({ status: "paid", amount_cents: 8000 }),
      EVENT,
      NOW,
    );
    assert.equal(action.kind, "auto_cancel");
    if (action.kind === "auto_cancel") {
      assert.equal(action.refundCents, 8000);
    }
  });

  it("auto-cancels an in-progress shift and refunds the escrow", () => {
    const action = decideBookingAction(
      booking({ status: "in_progress", amount_cents: 12000 }),
      EVENT,
      NOW,
    );
    assert.equal(action.kind, "auto_cancel");
    if (action.kind === "auto_cancel") {
      assert.equal(action.refundCents, 12000);
      assert.match(action.reason, /in-progress shift/);
    }
  });

  it("auto-cancels a paid booking with no payment intent (zero refund)", () => {
    const action = decideBookingAction(
      booking({ status: "paid", stripe_payment_intent_id: null, amount_cents: 5000 }),
      EVENT,
      NOW,
    );
    assert.equal(action.kind, "auto_cancel");
    if (action.kind === "auto_cancel") {
      assert.equal(action.refundCents, 0);
    }
  });

  it("skips a booking whose shift has already ended", () => {
    const action = decideBookingAction(
      booking({ starts_at: PAST, ends_at: PAST_END, status: "accepted" }),
      EVENT,
      NOW,
    );
    assert.equal(action.kind, "skip");
    if (action.kind === "skip") {
      assert.equal(action.reason, "shift_already_ended");
    }
  });

  it("skips terminal statuses (completed, cancelled, refunded, disputed)", () => {
    const terminals: BookingStatus[] = [
      "completed",
      "cancelled",
      "refunded",
      "disputed",
      "paid_out",
      "pending",
    ];
    for (const status of terminals) {
      const action = decideBookingAction(booking({ status }), EVENT, NOW);
      assert.equal(action.kind, "skip", `expected skip for ${status}`);
    }
  });

  it("skips a booking already handled for the same change event", () => {
    const action = decideBookingAction(
      booking({
        dbs_protection_status: "pending_review",
        dbs_protection_change_event_id: "evt_1",
      }),
      EVENT,
      NOW,
    );
    assert.equal(action.kind, "skip");
    if (action.kind === "skip") assert.equal(action.reason, "already_handled");
  });

  it("re-runs a booking that was previously cleared but a new event fired", () => {
    // Same booking cleared once, DBS status flipped again → new event.
    const action = decideBookingAction(
      booking({
        dbs_protection_status: "cleared",
        dbs_protection_change_event_id: "evt_1",
        status: "accepted",
      }),
      { ...EVENT, id: "evt_2" }, // NEW event
      NOW,
    );
    assert.equal(action.kind, "flag_pending");
  });

  it("does re-flag a booking whose stored change_event differs (different event)", () => {
    const action = decideBookingAction(
      booking({
        dbs_protection_status: "pending_review",
        dbs_protection_change_event_id: "evt_old",
      }),
      EVENT,
      NOW,
    );
    assert.equal(action.kind, "flag_pending");
  });
});

describe("planProtection", () => {
  it("produces zero actions when there are no events", () => {
    const plan = planProtection([], new Map(), NOW);
    assert.deepEqual(plan, {
      scanned: 0,
      flagged: 0,
      autoCancelled: 0,
      skipped: 0,
      actions: [],
    });
  });

  it("produces zero actions when the affected carer has no future bookings", () => {
    const plan = planProtection([EVENT], new Map([["carer_a", []]]), NOW);
    assert.equal(plan.scanned, 0);
    assert.equal(plan.actions.length, 0);
  });

  it("aggregates flag+cancel+skip across mixed bookings", () => {
    const bookings: AllocatedBooking[] = [
      booking({ id: "b_accept", status: "accepted" }),
      booking({ id: "b_paid", status: "paid", amount_cents: 7000 }),
      booking({ id: "b_prog", status: "in_progress", amount_cents: 9000 }),
      booking({ id: "b_done", status: "completed" }),
      booking({ id: "b_past", starts_at: PAST, ends_at: PAST_END, status: "accepted" }),
    ];
    const plan = planProtection(
      [EVENT],
      new Map([["carer_a", bookings]]),
      NOW,
    );
    assert.equal(plan.scanned, 5);
    assert.equal(plan.flagged, 1);
    assert.equal(plan.autoCancelled, 2);
    assert.equal(plan.skipped, 2);
    assert.equal(plan.actions.length, 3); // only actionable ones recorded
  });

  it("fans out actions across multiple events + carers", () => {
    const eventA = EVENT;
    const eventB: ChangeEvent = {
      id: "evt_b",
      carer_id: "carer_b",
      detected_at: EVENT.detected_at,
    };
    const bookingsByCarer = new Map<string, AllocatedBooking[]>([
      ["carer_a", [booking({ id: "a1", status: "accepted" })]],
      ["carer_b", [booking({ id: "b1", status: "paid", caregiver_id: "carer_b" })]],
    ]);
    const plan = planProtection([eventA, eventB], bookingsByCarer, NOW);
    assert.equal(plan.actions.length, 2);
    assert.deepEqual(
      plan.actions.map((a) => a.changeEventId).sort(),
      ["evt_1", "evt_b"],
    );
  });
});
