/**
 * Push notify dispatcher (P0-A2-min).
 *
 * Two responsibilities per event:
 *   1. Insert a row via `createNotification` so it shows up in the user's
 *      inbox + bell badge.
 *   2. (Future) deliver a real push via Expo/APNs. For now this is a stub.
 *
 * Errors are swallowed locally — a failed notification must never break
 * the booking write that fired it.
 */
import type { NotificationInsert } from "@/lib/notifications/server";

export type DispatchEvent =
  | {
      type: "booking.accepted";
      bookingId: string;
      seekerId: string;
      carerId: string;
      startsAt: string;
    }
  | {
      type: "booking.cancelled";
      bookingId: string;
      cancelledBy: string;
      recipientId: string;
      reason: string | null;
    };

// TODO: A2-bis — these events are intentionally NOT handled yet.
//   payment.received (Stripe webhook), payout.sent, review.posted,
//   booking.reminder, message.received. Add to DispatchEvent union and
//   buildPayload when they're wired up.

export type BuiltPayload = {
  recipientUserId: string;
  title: string;
  body: string;
  deeplink: string;
  payload: Record<string, unknown>;
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "soon";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function buildPayload(event: DispatchEvent): BuiltPayload {
  switch (event.type) {
    case "booking.accepted":
      return {
        recipientUserId: event.seekerId,
        title: "Your booking is accepted",
        body: `Your carer has accepted. Booking starts ${shortDate(event.startsAt)}.`,
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
    case "booking.cancelled":
      return {
        recipientUserId: event.recipientId,
        title: "Booking cancelled",
        body:
          event.reason && event.reason.trim().length > 0
            ? event.reason
            : "The other party cancelled this booking.",
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
  }
}

/**
 * Fire-and-forget push delivery. Currently a stub that logs in non-prod
 * and no-ops in prod.
 */
// TODO: A2-bis wire Expo push API
async function sendPush(
  _tokens: string[],
  payload: BuiltPayload,
): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log("[push.stub]", payload.title, "→", payload.recipientUserId);
  }
}

export type DispatchDeps = {
  createNotification: (input: NotificationInsert) => Promise<unknown>;
  sendPush: (tokens: string[], payload: BuiltPayload) => Promise<void>;
};

/**
 * Lazy-loads the real createNotification on first call. Keeps the test file
 * free of the `next/server` transitive import that admin.ts pulls in.
 */
async function loadDefaultDeps(): Promise<DispatchDeps> {
  const { createNotification } = await import("@/lib/notifications/server");
  return { createNotification, sendPush };
}

export async function dispatch(
  event: DispatchEvent,
  deps?: DispatchDeps,
): Promise<void> {
  try {
    const resolved = deps ?? (await loadDefaultDeps());
    const built = buildPayload(event);
    await resolved.createNotification({
      user_id: built.recipientUserId,
      type: event.type,
      title: built.title,
      body: built.body,
      deeplink: built.deeplink,
      payload: built.payload,
    });
    // Push delivery deferred to A2-bis. Stub is called for parity / future wiring.
    await resolved.sendPush([], built);
  } catch (err) {
    console.error("[notify.dispatch] failed", event.type, err);
  }
}
