/**
 * Tests for the push notify dispatcher.
 *
 * Pure-function tests over `buildPayload` + `formatMoney`, plus a
 * `dispatch` test that injects a fake createNotification to assert call
 * shape without touching the DB.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPayload,
  dispatch,
  formatMoney,
  type DispatchDeps,
  type DispatchEvent,
} from "./notify";
import type { NotificationInsert } from "@/lib/notifications/server";

const BOOKING_ID = "11111111-1111-1111-1111-111111111111";
const SEEKER_ID = "22222222-2222-2222-2222-222222222222";
const CARER_ID = "33333333-3333-3333-3333-333333333333";
const THREAD_ID = "44444444-4444-4444-4444-444444444444";

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

describe("formatMoney", () => {
  it("formats common currencies with the correct symbol", () => {
    assert.equal(formatMoney(4250, "GBP"), "£42.50");
    assert.equal(formatMoney(1000, "USD"), "$10.00");
    assert.equal(formatMoney(750, "EUR"), "€7.50");
  });

  it("falls back to the currency code prefix for unknown currencies", () => {
    assert.equal(formatMoney(500, "CAD"), "CAD 5.00");
  });

  it("uppercases lowercase currency input", () => {
    assert.equal(formatMoney(4250, "gbp"), "£42.50");
  });
});

describe("buildPayload — payout.completed", () => {
  it("targets the carer and links to earnings", () => {
    const out = buildPayload({
      type: "payout.completed",
      carerId: CARER_ID,
      bookingId: BOOKING_ID,
      amountPence: 4250,
      currency: "GBP",
    });
    assert.equal(out.recipientUserId, CARER_ID);
    assert.equal(out.title, "Payout sent");
    assert.equal(out.body, "£42.50 is on the way to your bank.");
    assert.equal(out.deeplink, "/m/earnings");
  });
});

describe("buildPayload — review.received", () => {
  it("targets the reviewee with the star rating in the body", () => {
    const out = buildPayload({
      type: "review.received",
      revieweeId: CARER_ID,
      reviewerId: SEEKER_ID,
      bookingId: BOOKING_ID,
      rating: 5,
    });
    assert.equal(out.recipientUserId, CARER_ID);
    assert.equal(out.title, "New review");
    assert.equal(out.body, "You got a 5-star review.");
    assert.equal(out.deeplink, `/m/bookings/${BOOKING_ID}`);
  });
});

describe("buildPayload — shift.arrived", () => {
  it("targets the seeker", () => {
    const out = buildPayload({
      type: "shift.arrived",
      seekerId: SEEKER_ID,
      carerId: CARER_ID,
      bookingId: BOOKING_ID,
      arrivedAt: "2026-06-10T09:00:00.000Z",
    });
    assert.equal(out.recipientUserId, SEEKER_ID);
    assert.equal(out.title, "Your carer has arrived");
    assert.equal(out.deeplink, `/m/bookings/${BOOKING_ID}`);
  });
});

describe("buildPayload — booking.reminder_24h", () => {
  it("targets the recipient and links to the booking", () => {
    const out = buildPayload({
      type: "booking.reminder_24h",
      recipientId: SEEKER_ID,
      bookingId: BOOKING_ID,
      otherPartyId: CARER_ID,
      startsAt: "2026-06-10T09:00:00.000Z",
    });
    assert.equal(out.recipientUserId, SEEKER_ID);
    assert.equal(out.title, "Booking tomorrow");
    assert.match(out.body, /Reminder: your booking starts/);
    assert.equal(out.deeplink, `/m/bookings/${BOOKING_ID}`);
  });
});

describe("buildPayload — message.received", () => {
  it("targets the recipient and links to the thread", () => {
    const out = buildPayload({
      type: "message.received",
      recipientId: SEEKER_ID,
      senderId: CARER_ID,
      threadId: THREAD_ID,
      preview: "Hello there",
    });
    assert.equal(out.recipientUserId, SEEKER_ID);
    assert.equal(out.title, "New message");
    assert.equal(out.body, "Hello there");
    assert.equal(out.deeplink, `/m/jobs/${THREAD_ID}`);
  });

  it("truncates preview > 120 chars with an ellipsis", () => {
    const long = "x".repeat(200);
    const out = buildPayload({
      type: "message.received",
      recipientId: SEEKER_ID,
      senderId: CARER_ID,
      threadId: THREAD_ID,
      preview: long,
    });
    assert.equal(out.body.length, 120);
    assert.ok(out.body.endsWith("…"));
  });

  it("does not modify a preview at or below 120 chars", () => {
    const exact = "y".repeat(120);
    const out = buildPayload({
      type: "message.received",
      recipientId: SEEKER_ID,
      senderId: CARER_ID,
      threadId: THREAD_ID,
      preview: exact,
    });
    assert.equal(out.body, exact);
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
