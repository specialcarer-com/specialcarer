/**
 * Typed push-event dispatcher.
 *
 * Every server-side trigger that should ping the user funnels through
 * `dispatch(event)` rather than calling APNs directly. The dispatcher:
 *
 *   1. Builds the user-facing copy + deeplink via `buildPayload(event)`
 *      (pure function — easy to unit-test, UK English).
 *   2. Resolves the user's active push tokens via `tokens.ts` (PR-A1).
 *   3. Fans out to APNs for iOS tokens (existing `apns.ts` adapter).
 *      Android is logged + skipped until FCM is wired (// TODO).
 *   4. Soft-revokes tokens that APNs reports as Unregistered/BadDeviceToken.
 *   5. Inserts a row into the in-app notifications inbox via the A3 helper.
 *      `message.received` is grouped to one row per (user, thread, day) to
 *      avoid spamming the bell — the realtime channel still updates badges.
 *
 * The dispatcher returns a `DispatchResult` and never throws on per-token
 * failures — callers (webhook handlers, cron jobs) treat push as best-effort
 * and must not 500 just because Apple bounced one token.
 *
 * Wiring callsites for PR-A2:
 *   - bookings/[id]/action accept   → booking.confirmed
 *   - bookings/[id]/action cancel   → booking.cancelled
 *   - bookings/[id]/action decline  → booking.cancelled
 *   - bookings/[id]/action start    → shift.starting
 *   - bookings/[id]/action complete → shift.completed
 *   - m/org/bookings/[id]/cancel    → booking.cancelled
 *   - bookings/[id]/arrival-selfie  → shift.arrived
 *   - bookings/[id]/review          → review.received (to carer)
 *   - stripe/webhook payout.paid    → payout.completed
 *
 * TODO: PR-A4 will call dispatch({ type: 'message.received', ... }) from
 * sendMessage() when the chat backbone lands.
 * TODO: a booking-reminder cron does not yet exist — when it does, it
 * should dispatch booking.reminder_24h and booking.reminder_1h alongside
 * the existing email path. (Brief gap noted; not added here so this PR
 * stays scoped to wiring up real callsites.)
 */

import { sendPush, type SendPushResult, type ApnsPayload } from "./apns";
import {
  getActiveTokensForUser as defaultGetActiveTokensForUser,
  revokeToken as defaultRevokeToken,
  type PushToken,
} from "./tokens";
import {
  createNotification as defaultCreateNotification,
  hasSameDayThreadNotification as defaultHasSameDayThreadNotification,
  type CreateNotificationInput,
} from "@/lib/notifications/server";

// ── Event union ──────────────────────────────────────────────────────────

export type PushEvent =
  | { type: "booking.confirmed"; user_id: string; booking_id: string }
  | {
      type: "booking.cancelled";
      user_id: string;
      booking_id: string;
      reason?: string;
    }
  | { type: "booking.reminder_24h"; user_id: string; booking_id: string }
  | { type: "booking.reminder_1h"; user_id: string; booking_id: string }
  | { type: "shift.starting"; user_id: string; booking_id: string }
  | {
      type: "shift.arrived";
      user_id: string;
      booking_id: string;
      carer_name: string;
    }
  | { type: "shift.completed"; user_id: string; booking_id: string }
  | {
      type: "message.received";
      user_id: string;
      thread_id: string;
      preview: string;
    }
  | {
      type: "payout.completed";
      user_id: string;
      amount_cents: number;
      currency: string;
    }
  | {
      type: "review.received";
      user_id: string;
      booking_id: string;
      stars: number;
    };

export type PushEventType = PushEvent["type"];

export type BuiltPayload = {
  title: string;
  body: string;
  deeplink: string;
  data: Record<string, unknown>;
};

export type DispatchResult = {
  sent: number;
  failed: number;
  errors: Array<{ token: string; error: string }>;
};

// ── Pure copy + deeplink builder ─────────────────────────────────────────

function formatAmount(amountCents: number, currency: string): string {
  const symbol =
    currency.toLowerCase() === "gbp"
      ? "£"
      : currency.toLowerCase() === "usd"
        ? "$"
        : "";
  const pounds = (amountCents / 100).toFixed(2);
  return `${symbol}${pounds}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

export function buildPayload(event: PushEvent): BuiltPayload {
  switch (event.type) {
    case "booking.confirmed":
      return {
        title: "Booking confirmed",
        body: "Your booking is confirmed. Tap to see the details.",
        deeplink: `/m/bookings/${event.booking_id}`,
        data: { type: event.type, booking_id: event.booking_id },
      };
    case "booking.cancelled":
      return {
        title: "Booking cancelled",
        body: event.reason
          ? `Your booking was cancelled: ${truncate(event.reason, 80)}`
          : "Your booking was cancelled.",
        deeplink: `/m/bookings/${event.booking_id}`,
        data: {
          type: event.type,
          booking_id: event.booking_id,
          ...(event.reason ? { reason: event.reason } : {}),
        },
      };
    case "booking.reminder_24h":
      return {
        title: "Shift tomorrow",
        body: "Your booking starts in 24 hours.",
        deeplink: `/m/bookings/${event.booking_id}`,
        data: { type: event.type, booking_id: event.booking_id },
      };
    case "booking.reminder_1h":
      return {
        title: "Shift in 1 hour",
        body: "Your booking starts in an hour.",
        deeplink: `/m/bookings/${event.booking_id}`,
        data: { type: event.type, booking_id: event.booking_id },
      };
    case "shift.starting":
      return {
        title: "Shift starting",
        body: "Your carer is on their way.",
        deeplink: `/m/track/${event.booking_id}`,
        data: { type: event.type, booking_id: event.booking_id },
      };
    case "shift.arrived":
      return {
        title: `${event.carer_name} has arrived`,
        body: `${event.carer_name} just checked in. Tap to view.`,
        deeplink: `/m/track/${event.booking_id}`,
        data: {
          type: event.type,
          booking_id: event.booking_id,
          carer_name: event.carer_name,
        },
      };
    case "shift.completed":
      return {
        title: "Shift completed",
        body: "Your shift has ended. Tap to leave a review.",
        deeplink: `/m/track/${event.booking_id}`,
        data: { type: event.type, booking_id: event.booking_id },
      };
    case "message.received":
      return {
        title: "New message",
        body: truncate(event.preview, 140),
        deeplink: `/m/chat/${event.thread_id}`,
        data: {
          type: event.type,
          thread_id: event.thread_id,
          preview: event.preview,
        },
      };
    case "payout.completed": {
      const amount = formatAmount(event.amount_cents, event.currency);
      return {
        title: "Payout sent",
        body: `${amount} is on its way to your bank.`,
        deeplink: "/m/earnings",
        data: {
          type: event.type,
          amount_cents: event.amount_cents,
          currency: event.currency,
        },
      };
    }
    case "review.received": {
      const stars = Math.max(1, Math.min(5, Math.round(event.stars)));
      return {
        title: "You got a review",
        body: `A client left you ${stars}★. Tap to read it.`,
        deeplink: "/m/profile/reviews",
        data: {
          type: event.type,
          booking_id: event.booking_id,
          stars: event.stars,
        },
      };
    }
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────────

/**
 * Apple's transient + terminal token errors. Per APNs spec, these mean the
 * token is dead and we should stop sending to it.
 *   https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
 */
const DEAD_TOKEN_REASONS = new Set(["Unregistered", "BadDeviceToken"]);

export type DispatchDeps = {
  getActiveTokensForUser?: (userId: string) => Promise<PushToken[]>;
  revokeToken?: (token: string) => Promise<void>;
  sendPush?: (args: {
    deviceToken: string;
    payload: ApnsPayload;
  }) => Promise<SendPushResult>;
  createNotification?: (input: CreateNotificationInput) => Promise<void>;
  hasSameDayThreadNotification?: (args: {
    user_id: string;
    type: string;
    thread_id: string;
  }) => Promise<boolean>;
};

function toApnsPayload(built: BuiltPayload): ApnsPayload {
  return {
    aps: {
      alert: { title: built.title, body: built.body },
      sound: "default",
    },
    deeplink: built.deeplink,
    data: built.data,
  };
}

async function maybeWriteInbox(
  event: PushEvent,
  built: BuiltPayload,
  deps: Required<DispatchDeps>,
): Promise<void> {
  if (event.type === "message.received") {
    // Grouping rule: at most one inbox row per (user, thread, day) for
    // chat messages. The bell badge updates via realtime — we just don't
    // want the notification list to fill up with "New message" rows.
    const exists = await deps.hasSameDayThreadNotification({
      user_id: event.user_id,
      type: event.type,
      thread_id: event.thread_id,
    });
    if (exists) return;
  }
  await deps.createNotification({
    user_id: event.user_id,
    type: event.type,
    title: built.title,
    body: built.body,
    deeplink: built.deeplink,
    payload: event as unknown as Record<string, unknown>,
  });
}

export async function dispatch(
  event: PushEvent,
  depsOverride?: DispatchDeps,
): Promise<DispatchResult> {
  const deps: Required<DispatchDeps> = {
    getActiveTokensForUser:
      depsOverride?.getActiveTokensForUser ?? defaultGetActiveTokensForUser,
    revokeToken: depsOverride?.revokeToken ?? defaultRevokeToken,
    sendPush:
      depsOverride?.sendPush ??
      (async (args) =>
        sendPush({ deviceToken: args.deviceToken, payload: args.payload })),
    createNotification:
      depsOverride?.createNotification ?? defaultCreateNotification,
    hasSameDayThreadNotification:
      depsOverride?.hasSameDayThreadNotification ??
      defaultHasSameDayThreadNotification,
  };

  const built = buildPayload(event);
  const result: DispatchResult = { sent: 0, failed: 0, errors: [] };

  // Inbox row — fire-and-best-effort. A failure here is logged inside
  // createNotification(); we still try to deliver the push.
  try {
    await maybeWriteInbox(event, built, deps);
  } catch (err) {
    console.warn(
      JSON.stringify({
        at: "push.notify.dispatch.inbox",
        level: "warn",
        msg: "inbox write threw",
        event_type: event.type,
        user_id: event.user_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  let tokens: PushToken[] = [];
  try {
    tokens = await deps.getActiveTokensForUser(event.user_id);
  } catch (err) {
    console.warn(
      JSON.stringify({
        at: "push.notify.dispatch.tokens",
        level: "warn",
        msg: "token lookup threw",
        event_type: event.type,
        user_id: event.user_id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return result;
  }

  const iosTokens = tokens.filter((t) => t.platform === "ios");
  const androidTokens = tokens.filter((t) => t.platform === "android");

  if (androidTokens.length > 0) {
    // TODO: FCM adapter — once the Android shell ships, wire a parallel
    // sender that mirrors sendPush() for FCM. Until then we log once per
    // dispatch (not per token) so this doesn't drown the logs.
    console.warn(
      JSON.stringify({
        at: "push.notify.dispatch.fcm",
        level: "warn",
        msg: "android tokens skipped — FCM adapter not yet wired",
        event_type: event.type,
        user_id: event.user_id,
        android_token_count: androidTokens.length,
      }),
    );
  }

  if (iosTokens.length === 0) {
    return result;
  }

  const apnsPayload = toApnsPayload(built);

  await Promise.all(
    iosTokens.map(async (t) => {
      try {
        const res = await deps.sendPush({
          deviceToken: t.token,
          payload: apnsPayload,
        });
        if (res.ok) {
          result.sent += 1;
          return;
        }
        result.failed += 1;
        result.errors.push({ token: t.token, error: res.reason });
        if (DEAD_TOKEN_REASONS.has(res.reason)) {
          try {
            await deps.revokeToken(t.token);
          } catch (err) {
            console.warn(
              JSON.stringify({
                at: "push.notify.dispatch.revoke",
                level: "warn",
                msg: "revoke threw",
                token_suffix: t.token.slice(-6),
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        }
      } catch (err) {
        result.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ token: t.token, error: message });
      }
    }),
  );

  return result;
}
