/**
 * Unit tests for the typed push-event dispatcher.
 *
 * Covers:
 *   - buildPayload per event type (title, body, deeplink, data shape)
 *   - dispatch happy path (2 iOS tokens fan-out, single inbox row)
 *   - dispatch mixed iOS + Android (Android skipped + warned, not counted)
 *   - dispatch APNs failure (BadDeviceToken triggers revokeToken)
 *   - dispatch message.received grouping (skip insert when same-day row exists)
 *   - dispatch with no active tokens (inbox row still written)
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { buildPayload, dispatch, type PushEvent } from "./notify";
import type { PushToken } from "./tokens";
import type { SendPushResult } from "./apns";
import type { CreateNotificationInput } from "@/lib/notifications/server";

function iosToken(id: string, token: string): PushToken {
  return {
    id,
    user_id: "u1",
    platform: "ios",
    token,
    device_id: null,
    app_version: null,
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
    created_at: new Date().toISOString(),
  };
}
function androidToken(id: string, token: string): PushToken {
  return { ...iosToken(id, token), platform: "android" };
}

describe("buildPayload", () => {
  it("booking.confirmed → seeker deeplink + booking_id in data", () => {
    const p = buildPayload({
      type: "booking.confirmed",
      user_id: "u",
      booking_id: "b1",
    });
    assert.equal(p.title, "Booking confirmed");
    assert.match(p.body, /confirmed/i);
    assert.equal(p.deeplink, "/m/bookings/b1");
    assert.equal(p.data.type, "booking.confirmed");
    assert.equal(p.data.booking_id, "b1");
  });

  it("booking.cancelled includes reason when present", () => {
    const p = buildPayload({
      type: "booking.cancelled",
      user_id: "u",
      booking_id: "b1",
      reason: "Carer unavailable",
    });
    assert.equal(p.title, "Booking cancelled");
    assert.match(p.body, /Carer unavailable/);
    assert.equal(p.deeplink, "/m/bookings/b1");
    assert.equal(p.data.reason, "Carer unavailable");
  });

  it("booking.cancelled omits reason in body when absent", () => {
    const p = buildPayload({
      type: "booking.cancelled",
      user_id: "u",
      booking_id: "b1",
    });
    assert.equal(p.body, "Your booking was cancelled.");
    assert.equal(p.data.reason, undefined);
  });

  it("booking.reminder_24h → 'tomorrow' copy + booking deeplink", () => {
    const p = buildPayload({
      type: "booking.reminder_24h",
      user_id: "u",
      booking_id: "b1",
    });
    assert.match(p.title, /tomorrow/i);
    assert.equal(p.deeplink, "/m/bookings/b1");
    assert.equal(p.data.type, "booking.reminder_24h");
  });

  it("booking.reminder_1h → '1 hour' copy", () => {
    const p = buildPayload({
      type: "booking.reminder_1h",
      user_id: "u",
      booking_id: "b1",
    });
    assert.match(p.title, /1 hour/);
    assert.equal(p.deeplink, "/m/bookings/b1");
  });

  it("shift.starting → track deeplink", () => {
    const p = buildPayload({
      type: "shift.starting",
      user_id: "u",
      booking_id: "b1",
    });
    assert.equal(p.title, "Shift starting");
    assert.equal(p.deeplink, "/m/track/b1");
  });

  it("shift.arrived → carer_name in title + data + track deeplink", () => {
    const p = buildPayload({
      type: "shift.arrived",
      user_id: "u",
      booking_id: "b1",
      carer_name: "Priya",
    });
    assert.match(p.title, /Priya/);
    assert.match(p.body, /Priya/);
    assert.equal(p.deeplink, "/m/track/b1");
    assert.equal(p.data.carer_name, "Priya");
  });

  it("shift.completed → review-prompt body + track deeplink", () => {
    const p = buildPayload({
      type: "shift.completed",
      user_id: "u",
      booking_id: "b1",
    });
    assert.equal(p.title, "Shift completed");
    assert.match(p.body, /review/i);
    assert.equal(p.deeplink, "/m/track/b1");
  });

  it("message.received → chat deeplink + truncated preview in body", () => {
    const longPreview =
      "This is a very long preview that we want to assert gets truncated " +
      "somewhere reasonable because notification bodies can't be huge — " +
      "if it just keeps going forever the OS will chop it anyway but we " +
      "want a tidy ellipsis where we control it.";
    const p = buildPayload({
      type: "message.received",
      user_id: "u",
      thread_id: "t1",
      preview: longPreview,
    });
    assert.equal(p.title, "New message");
    assert.equal(p.deeplink, "/m/chat/t1");
    assert.ok(p.body.length <= 140);
    assert.equal(p.data.thread_id, "t1");
  });

  it("payout.completed → earnings deeplink + £ amount", () => {
    const p = buildPayload({
      type: "payout.completed",
      user_id: "u",
      amount_cents: 4250,
      currency: "gbp",
    });
    assert.match(p.body, /£42\.50/);
    assert.equal(p.deeplink, "/m/earnings");
    assert.equal(p.data.amount_cents, 4250);
    assert.equal(p.data.currency, "gbp");
  });

  it("payout.completed → $ for usd", () => {
    const p = buildPayload({
      type: "payout.completed",
      user_id: "u",
      amount_cents: 10000,
      currency: "usd",
    });
    assert.match(p.body, /\$100\.00/);
  });

  it("review.received → reviews deeplink + stars in body", () => {
    const p = buildPayload({
      type: "review.received",
      user_id: "u",
      booking_id: "b1",
      stars: 5,
    });
    assert.match(p.body, /5★/);
    assert.equal(p.deeplink, "/m/profile/reviews");
    assert.equal(p.data.stars, 5);
  });

  it("review.received clamps stars to 1..5 in display", () => {
    const p = buildPayload({
      type: "review.received",
      user_id: "u",
      booking_id: "b1",
      stars: 9,
    });
    assert.match(p.body, /5★/);
  });
});

// ── dispatch ───────────────────────────────────────────────────────────

type Spy = {
  tokens: PushToken[];
  pushCalls: Array<{ deviceToken: string }>;
  pushResults: Map<string, SendPushResult>;
  revoked: string[];
  inboxCalls: CreateNotificationInput[];
  hasSameDayResult: boolean;
  hasSameDayCalls: Array<{ user_id: string; type: string; thread_id: string }>;
};

function makeSpy(opts: Partial<Spy> = {}): Spy {
  return {
    tokens: opts.tokens ?? [],
    pushCalls: [],
    pushResults: opts.pushResults ?? new Map(),
    revoked: [],
    inboxCalls: [],
    hasSameDayResult: opts.hasSameDayResult ?? false,
    hasSameDayCalls: [],
  };
}

function depsFromSpy(spy: Spy) {
  return {
    getActiveTokensForUser: async () => spy.tokens,
    revokeToken: async (token: string) => {
      spy.revoked.push(token);
    },
    sendPush: async (args: { deviceToken: string }): Promise<SendPushResult> => {
      spy.pushCalls.push({ deviceToken: args.deviceToken });
      return (
        spy.pushResults.get(args.deviceToken) ?? {
          ok: true as const,
          apnsId: "fake-id",
        }
      );
    },
    createNotification: async (input: CreateNotificationInput) => {
      spy.inboxCalls.push(input);
    },
    hasSameDayThreadNotification: async (args: {
      user_id: string;
      type: string;
      thread_id: string;
    }) => {
      spy.hasSameDayCalls.push(args);
      return spy.hasSameDayResult;
    },
  };
}

describe("dispatch — happy path", () => {
  it("fans out to 2 iOS tokens, writes one inbox row", async () => {
    const spy = makeSpy({
      tokens: [iosToken("t1", "TOKEN_A"), iosToken("t2", "TOKEN_B")],
    });
    const ev: PushEvent = {
      type: "booking.confirmed",
      user_id: "u1",
      booking_id: "b1",
    };
    const res = await dispatch(ev, depsFromSpy(spy));
    assert.equal(res.sent, 2);
    assert.equal(res.failed, 0);
    assert.equal(res.errors.length, 0);
    assert.equal(spy.pushCalls.length, 2);
    assert.equal(spy.inboxCalls.length, 1);
    assert.equal(spy.inboxCalls[0].type, "booking.confirmed");
    assert.equal(spy.inboxCalls[0].deeplink, "/m/bookings/b1");
  });
});

describe("dispatch — mixed ios + android", () => {
  let warnings: string[] = [];
  const origWarn = console.warn;
  beforeEach(() => {
    warnings = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((a) => String(a)).join(" "));
    };
  });
  afterEach(() => {
    console.warn = origWarn;
  });

  it("APNs called only for ios tokens; structured warning emitted", async () => {
    const spy = makeSpy({
      tokens: [
        iosToken("t1", "IOS_A"),
        androidToken("t2", "ANDROID_A"),
        androidToken("t3", "ANDROID_B"),
      ],
    });
    const res = await dispatch(
      {
        type: "shift.arrived",
        user_id: "u1",
        booking_id: "b1",
        carer_name: "Priya",
      },
      depsFromSpy(spy),
    );
    assert.equal(spy.pushCalls.length, 1);
    assert.equal(spy.pushCalls[0].deviceToken, "IOS_A");
    assert.equal(res.sent, 1);
    assert.equal(res.failed, 0);
    const fcmWarn = warnings.find((w) => w.includes("FCM adapter not yet"));
    assert.ok(fcmWarn, "expected structured FCM-skip warning");
    // Confirm the warning is JSON-shaped (single line per dispatch).
    assert.match(fcmWarn!, /"android_token_count":2/);
    assert.equal(spy.inboxCalls.length, 1);
  });
});

describe("dispatch — apns failure paths", () => {
  it("BadDeviceToken triggers revoke + counts as failed", async () => {
    const spy = makeSpy({
      tokens: [iosToken("t1", "GOOD_A"), iosToken("t2", "DEAD_B")],
      pushResults: new Map<string, SendPushResult>([
        ["GOOD_A", { ok: true as const, apnsId: "id1" }],
        ["DEAD_B", { ok: false as const, status: 410, reason: "BadDeviceToken" }],
      ]),
    });
    const res = await dispatch(
      {
        type: "booking.confirmed",
        user_id: "u1",
        booking_id: "b1",
      },
      depsFromSpy(spy),
    );
    assert.equal(res.sent, 1);
    assert.equal(res.failed, 1);
    assert.equal(res.errors.length, 1);
    assert.equal(res.errors[0].token, "DEAD_B");
    assert.equal(res.errors[0].error, "BadDeviceToken");
    assert.deepEqual(spy.revoked, ["DEAD_B"]);
  });

  it("non-dead apns reason fails but does NOT revoke", async () => {
    const spy = makeSpy({
      tokens: [iosToken("t1", "RATE_LIMITED")],
      pushResults: new Map<string, SendPushResult>([
        [
          "RATE_LIMITED",
          { ok: false as const, status: 429, reason: "TooManyRequests" },
        ],
      ]),
    });
    const res = await dispatch(
      {
        type: "booking.confirmed",
        user_id: "u1",
        booking_id: "b1",
      },
      depsFromSpy(spy),
    );
    assert.equal(res.sent, 0);
    assert.equal(res.failed, 1);
    assert.deepEqual(spy.revoked, []);
  });
});

describe("dispatch — message.received grouping", () => {
  it("inserts inbox row when no same-day row exists", async () => {
    const spy = makeSpy({
      tokens: [iosToken("t1", "TOKEN_A")],
      hasSameDayResult: false,
    });
    await dispatch(
      {
        type: "message.received",
        user_id: "u1",
        thread_id: "thr1",
        preview: "Hi there",
      },
      depsFromSpy(spy),
    );
    assert.equal(spy.inboxCalls.length, 1);
    assert.equal(spy.inboxCalls[0].type, "message.received");
    assert.equal(spy.hasSameDayCalls.length, 1);
    assert.equal(spy.hasSameDayCalls[0].thread_id, "thr1");
  });

  it("skips inbox row when same-day row already exists", async () => {
    const spy = makeSpy({
      tokens: [iosToken("t1", "TOKEN_A")],
      hasSameDayResult: true,
    });
    const res = await dispatch(
      {
        type: "message.received",
        user_id: "u1",
        thread_id: "thr1",
        preview: "Hi again",
      },
      depsFromSpy(spy),
    );
    assert.equal(spy.inboxCalls.length, 0);
    // Push still goes out — the chat screen still wants to notify.
    assert.equal(res.sent, 1);
  });
});

describe("dispatch — no active tokens", () => {
  it("returns sent:0 failed:0 and still writes inbox row", async () => {
    const spy = makeSpy({ tokens: [] });
    const res = await dispatch(
      { type: "booking.confirmed", user_id: "u1", booking_id: "b1" },
      depsFromSpy(spy),
    );
    assert.equal(res.sent, 0);
    assert.equal(res.failed, 0);
    assert.equal(res.errors.length, 0);
    assert.equal(spy.inboxCalls.length, 1);
  });
});
