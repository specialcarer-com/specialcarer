/**
 * Tests for the push notify dispatcher (P0-A2-min).
 *
 * Pure-function tests over `buildPayload`, plus a `dispatch` test that
 * injects a fake createNotification to assert call shape without touching
 * the DB. Same node:test pattern used elsewhere in the repo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPayload,
  dispatch,
  type DispatchDeps,
  type DispatchEvent,
} from "./notify";
import type { NotificationInsert } from "@/lib/notifications/server";

const BOOKING_ID = "11111111-1111-1111-1111-111111111111";
const SEEKER_ID = "22222222-2222-2222-2222-222222222222";
const CARER_ID = "33333333-3333-3333-3333-333333333333";

describe("buildPayload — booking.accepted", () => {
  it("targets the seeker and links to the booking", () => {
    const out = buildPayload({
      type: "booking.accepted",
      bookingId: BOOKING_ID,
      seekerId: SEEKER_ID,
      carerId: CARER_ID,
      startsAt: "2026-06-10T09:00:00.000Z",
    });
    assert.equal(out.recipientUserId, SEEKER_ID);
    assert.equal(out.title, "Your booking is accepted");
    assert.equal(out.deeplink, `/m/bookings/${BOOKING_ID}`);
    assert.match(out.body, /accepted/);
  });
});

describe("buildPayload — booking.cancelled", () => {
  it("falls back to a generic body when reason is null", () => {
    const out = buildPayload({
      type: "booking.cancelled",
      bookingId: BOOKING_ID,
      cancelledBy: SEEKER_ID,
      recipientId: CARER_ID,
      reason: null,
    });
    assert.equal(out.recipientUserId, CARER_ID);
    assert.equal(out.title, "Booking cancelled");
    assert.equal(out.body, "The other party cancelled this booking.");
    assert.equal(out.deeplink, `/m/bookings/${BOOKING_ID}`);
  });

  it("uses the supplied reason verbatim when provided", () => {
    const out = buildPayload({
      type: "booking.cancelled",
      bookingId: BOOKING_ID,
      cancelledBy: SEEKER_ID,
      recipientId: CARER_ID,
      reason: "no longer needed",
    });
    assert.equal(out.body, "no longer needed");
  });
});

describe("dispatch", () => {
  it("calls createNotification exactly once with the built payload", async () => {
    const calls: NotificationInsert[] = [];
    const deps: DispatchDeps = {
      async createNotification(input) {
        calls.push(input);
        return { id: "fake" };
      },
      async sendPush() {
        /* no-op */
      },
    };

    const event: DispatchEvent = {
      type: "booking.accepted",
      bookingId: BOOKING_ID,
      seekerId: SEEKER_ID,
      carerId: CARER_ID,
      startsAt: "2026-06-10T09:00:00.000Z",
    };

    await dispatch(event, deps);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].user_id, SEEKER_ID);
    assert.equal(calls[0].type, "booking.accepted");
    assert.equal(calls[0].deeplink, `/m/bookings/${BOOKING_ID}`);
    assert.equal(
      (calls[0].payload as { bookingId: string }).bookingId,
      BOOKING_ID,
    );
  });

  it("swallows createNotification errors so the caller is not affected", async () => {
    const deps: DispatchDeps = {
      async createNotification() {
        throw new Error("db down");
      },
      async sendPush() {
        /* no-op */
      },
    };
    // Should not throw.
    await dispatch(
      {
        type: "booking.cancelled",
        bookingId: BOOKING_ID,
        cancelledBy: SEEKER_ID,
        recipientId: CARER_ID,
        reason: null,
      },
      deps,
    );
  });
});
