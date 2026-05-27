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
  sendPush,
  type BuiltPayload,
  type DispatchDeps,
  type DispatchEvent,
} from "./notify";
import type { NotificationInsert } from "@/lib/notifications/server";
import type { PushToken } from "./tokens";
import type { ExpoPushMessage, ExpoPushResponse } from "./expo";

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

function makeToken(token: string, user_id: string): PushToken {
  return {
    id: `id-${token}`,
    user_id,
    platform: "ios",
    token,
    device_id: null,
    app_version: null,
    last_seen_at: "2026-05-25T00:00:00.000Z",
    revoked_at: null,
    created_at: "2026-05-25T00:00:00.000Z",
  };
}

describe("dispatch", () => {
  it("calls createNotification and sendPush once with the built payload", async () => {
    const calls: NotificationInsert[] = [];
    const sendPushCalls: Array<{ tokens: PushToken[] }> = [];
    const deps: DispatchDeps = {
      async createNotification(input) {
        calls.push(input);
        return { id: "fake" };
      },
      async sendPush(tokens) {
        sendPushCalls.push({ tokens });
      },
      async getActiveTokensForUser(user_id) {
        return [makeToken("ExponentPushToken[abc]", user_id)];
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
    assert.equal(sendPushCalls.length, 1);
    assert.equal(sendPushCalls[0].tokens.length, 1);
    assert.equal(sendPushCalls[0].tokens[0].token, "ExponentPushToken[abc]");
  });

  it("swallows createNotification errors so the caller is not affected", async () => {
    const deps: DispatchDeps = {
      async createNotification() {
        throw new Error("db down");
      },
      async sendPush() {
        /* no-op */
      },
      async getActiveTokensForUser() {
        return [];
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

  it("swallows sendPush errors so the caller is not affected", async () => {
    let createdOnce = false;
    const deps: DispatchDeps = {
      async createNotification() {
        createdOnce = true;
        return { id: "ok" };
      },
      async sendPush() {
        throw new Error("expo down");
      },
      async getActiveTokensForUser(user_id) {
        return [makeToken("ExponentPushToken[x]", user_id)];
      },
    };
    await dispatch(
      {
        type: "booking.accepted",
        bookingId: BOOKING_ID,
        seekerId: SEEKER_ID,
        carerId: CARER_ID,
        startsAt: "2026-06-10T09:00:00.000Z",
      },
      deps,
    );
    assert.equal(createdOnce, true);
  });
});

describe("sendPush", () => {
  it("is a no-op when there are no tokens", async () => {
    let expoCalls = 0;
    let revoked = 0;
    await sendPush(
      [],
      {
        recipientUserId: SEEKER_ID,
        title: "t",
        body: "b",
        deeplink: "/x",
        payload: {},
      },
      {
        async sendExpoPush() {
          expoCalls += 1;
          return { data: [] };
        },
        async revokeToken() {
          revoked += 1;
        },
      },
    );
    assert.equal(expoCalls, 0);
    assert.equal(revoked, 0);
  });

  it("maps tokens to Expo messages with title/body/deeplink", async () => {
    const seen: ExpoPushMessage[][] = [];
    await sendPush(
      [
        makeToken("ExponentPushToken[a]", SEEKER_ID),
        makeToken("ExponentPushToken[b]", SEEKER_ID),
      ],
      {
        recipientUserId: SEEKER_ID,
        title: "Hello",
        body: "World",
        deeplink: "/m/bookings/123",
        payload: { foo: "bar" },
      },
      {
        async sendExpoPush(messages) {
          seen.push(messages);
          return {
            data: messages.map(() => ({ status: "ok" as const, id: "tk" })),
          };
        },
        async revokeToken() {
          /* not expected */
        },
      },
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].length, 2);
    assert.equal(seen[0][0].to, "ExponentPushToken[a]");
    assert.equal(seen[0][0].title, "Hello");
    assert.equal(seen[0][0].body, "World");
    assert.equal(seen[0][0].priority, "high");
    assert.equal(seen[0][0].sound, "default");
    assert.equal(seen[0][0].channelId, "default");
    assert.deepEqual(seen[0][0].data, {
      deeplink: "/m/bookings/123",
      foo: "bar",
    });
  });

  it("revokes tokens flagged as DeviceNotRegistered", async () => {
    const revoked: string[] = [];
    await sendPush(
      [
        makeToken("ExponentPushToken[kept]", SEEKER_ID),
        makeToken("ExponentPushToken[dead]", SEEKER_ID),
      ],
      {
        recipientUserId: SEEKER_ID,
        title: "t",
        body: "b",
        deeplink: "/x",
        payload: {},
      },
      {
        async sendExpoPush() {
          const body: ExpoPushResponse = {
            data: [
              { status: "ok", id: "kept" },
              {
                status: "error",
                message: "gone",
                details: { error: "DeviceNotRegistered" },
              },
            ],
          };
          return body;
        },
        async revokeToken(t) {
          revoked.push(t);
        },
      },
    );
    assert.deepEqual(revoked, ["ExponentPushToken[dead]"]);
  });
});

describe("buildPayload — booking.sos_triggered", () => {
  it("targets the recipient (counterpart) and links to the booking", () => {
    const out = buildPayload({
      type: "booking.sos_triggered",
      bookingId: BOOKING_ID,
      raiserId: SEEKER_ID,
      recipientId: CARER_ID,
      raiserName: "Priya Patel",
    });
    assert.equal(out.recipientUserId, CARER_ID);
    assert.equal(out.title, "🚨 SOS on your booking");
    assert.equal(out.deeplink, `/m/bookings/${BOOKING_ID}`);
    assert.match(out.body, /Priya Patel/);
    assert.match(out.body, /check on them/i);
  });

  it("uses a generic body when raiserName is null", () => {
    const out = buildPayload({
      type: "booking.sos_triggered",
      bookingId: BOOKING_ID,
      raiserId: SEEKER_ID,
      recipientId: CARER_ID,
      raiserName: null,
    });
    assert.equal(out.body, "A booking party has triggered an SOS. Please check on them now.");
  });

  it("trims whitespace-only names down to the generic body", () => {
    const out = buildPayload({
      type: "booking.sos_triggered",
      bookingId: BOOKING_ID,
      raiserId: SEEKER_ID,
      recipientId: CARER_ID,
      raiserName: "   ",
    });
    assert.equal(out.body, "A booking party has triggered an SOS. Please check on them now.");
  });
});

describe("dispatch — booking.sos_triggered", () => {
  it("creates an inbox row and pushes to active tokens for the recipient", async () => {
    const createCalls: NotificationInsert[] = [];
    const tokenLookups: string[] = [];
    const pushCalls: Array<{ tokens: PushToken[]; payload: BuiltPayload }> = [];
    const deps: DispatchDeps = {
      async createNotification(input) {
        createCalls.push(input);
      },
      async getActiveTokensForUser(user_id) {
        tokenLookups.push(user_id);
        return [
          {
            token: "ExponentPushToken[carer]",
            user_id,
            platform: "ios",
          } as PushToken,
        ];
      },
      async sendPush(tokens, payload) {
        pushCalls.push({ tokens, payload });
      },
    };
    const event: DispatchEvent = {
      type: "booking.sos_triggered",
      bookingId: BOOKING_ID,
      raiserId: SEEKER_ID,
      recipientId: CARER_ID,
      raiserName: "Priya Patel",
    };
    await dispatch(event, deps);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0]?.user_id, CARER_ID);
    assert.equal(createCalls[0]?.type, "booking.sos_triggered");
    assert.equal(createCalls[0]?.deeplink, `/m/bookings/${BOOKING_ID}`);
    assert.deepEqual(tokenLookups, [CARER_ID]);
    assert.equal(pushCalls.length, 1);
    assert.equal(pushCalls[0]?.tokens.length, 1);
    assert.equal(pushCalls[0]?.payload.recipientUserId, CARER_ID);
  });
});
