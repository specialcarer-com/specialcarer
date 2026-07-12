/**
 * Push notify dispatcher.
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
import { sendExpoPush, type ExpoPushMessage } from "./expo";
import type { PushToken } from "./tokens";

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
    }
  | {
      type: "payout.completed";
      carerId: string;
      bookingId: string;
      amountPence: number;
      currency: string;
    }
  | {
      type: "review.received";
      revieweeId: string;
      reviewerId: string;
      bookingId: string;
      rating: 1 | 2 | 3 | 4 | 5;
    }
  | {
      type: "shift.arrived";
      seekerId: string;
      carerId: string;
      bookingId: string;
      arrivedAt: string;
    }
  | {
      type: "booking.reminder_24h";
      recipientId: string;
      bookingId: string;
      otherPartyId: string;
      startsAt: string;
    }
  | {
      type: "message.received";
      recipientId: string;
      senderId: string;
      threadId: string;
      preview: string;
    }
  | {
      type: "booking.sos_triggered";
      bookingId: string;
      raiserId: string;
      recipientId: string;
      raiserName: string | null;
    }
  | {
      type: "job.offered";
      bookingId: string;
      carerId: string;
      startsAt: string;
    }
  | {
      type: "job.confirmed";
      bookingId: string;
      carerId: string;
      startsAt: string;
    }
  | {
      type: "job.lost";
      bookingId: string;
      carerId: string;
    }
  | {
      type: "booking.confirmed_for_seeker";
      bookingId: string;
      seekerId: string;
      startsAt: string;
    }
  | {
      type: "offer.expired";
      bookingId: string;
      seekerId: string;
      // Carers who were shortlisted but didn't get picked. Cheap to grab in
      // the expiry sweep; kept on the event for downstream use (e.g. a future
      // "shift went unfilled" nudge to carers — see PR follow-up).
      shortlistedCaregiverIds?: string[];
    }
  | {
      // Family timeline (gap 41). One dispatch per recipient — the fan-out
      // helper in src/lib/timeline/fanout.ts resolves the recipient list and
      // emits one of these per person.
      type: "timeline.event_created";
      recipientId: string;
      eventId: string;
      actorName: string | null;
      eventTitle: string;
    }
  | {
      type: "timeline.comment_created";
      recipientId: string;
      eventId: string;
      actorName: string | null;
      commentPreview: string;
    };

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

function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "soon";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoney(pence: number, currency: string): string {
  const up = currency.toUpperCase();
  const symbol =
    up === "GBP" ? "£" : up === "USD" ? "$" : up === "EUR" ? "€" : `${up} `;
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

const PREVIEW_MAX = 120;
function truncatePreview(s: string): string {
  if (s.length <= PREVIEW_MAX) return s;
  return s.slice(0, PREVIEW_MAX - 1) + "…";
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
    case "payout.completed":
      return {
        recipientUserId: event.carerId,
        title: "Payout sent",
        body: `${formatMoney(event.amountPence, event.currency)} is on the way to your bank.`,
        deeplink: "/m/earnings",
        payload: { ...event },
      };
    case "review.received":
      return {
        recipientUserId: event.revieweeId,
        title: "New review",
        body: `You got a ${event.rating}-star review.`,
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
    case "shift.arrived":
      return {
        recipientUserId: event.seekerId,
        title: "Your carer has arrived",
        body: "Your carer marked themselves arrived.",
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
    case "booking.reminder_24h":
      return {
        recipientUserId: event.recipientId,
        title: "Booking tomorrow",
        body: `Reminder: your booking starts ${shortDateTime(event.startsAt)}.`,
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
    case "message.received":
      return {
        recipientUserId: event.recipientId,
        title: "New message",
        body: truncatePreview(event.preview),
        deeplink: `/m/jobs/${event.threadId}`,
        payload: { ...event },
      };
    case "booking.sos_triggered":
      return {
        recipientUserId: event.recipientId,
        title: "🚨 SOS on your booking",
        body:
          event.raiserName && event.raiserName.trim().length > 0
            ? `${event.raiserName.trim()} has triggered an SOS. Please check on them now.`
            : "A booking party has triggered an SOS. Please check on them now.",
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
    case "job.offered":
      return {
        recipientUserId: event.carerId,
        title: "New job offer",
        body: `A family is looking for a carer — shift starts ${shortDate(event.startsAt)}. Respond before it expires.`,
        deeplink: `/m/jobs?offer=${event.bookingId}`,
        payload: { ...event },
      };
    case "job.confirmed":
      return {
        recipientUserId: event.carerId,
        title: "You got the job",
        body: `You're confirmed — shift starts ${shortDate(event.startsAt)}.`,
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
    case "job.lost":
      return {
        recipientUserId: event.carerId,
        title: "Position filled",
        body: "This shift was filled by another carer. Thanks for responding.",
        deeplink: `/m/jobs`,
        payload: { ...event },
      };
    case "booking.confirmed_for_seeker":
      return {
        recipientUserId: event.seekerId,
        title: "Your carer is confirmed",
        body: `A carer is locked in — shift starts ${shortDate(event.startsAt)}.`,
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
    // Copy is inline English-only here, matching every other variant above.
    // TODO(i18n): push templates aren't localised yet — localise the whole
    // dispatcher in one pass rather than special-casing this event.
    case "offer.expired":
      return {
        recipientUserId: event.seekerId,
        title: "Offer expired",
        body: "No carer accepted in time. Re-post or adjust your search?",
        deeplink: `/m/bookings/${event.bookingId}`,
        payload: { ...event },
      };
    // Family timeline (gap 41). English-only copy with TODO(i18n) — matches
    // every other variant in this dispatcher; localise the whole file in one
    // pass rather than special-casing these.
    case "timeline.event_created":
      return {
        recipientUserId: event.recipientId,
        title: event.actorName
          ? `New activity from ${event.actorName}`
          : "New activity",
        body: event.eventTitle,
        deeplink: `/m/timeline?event=${event.eventId}`,
        payload: { ...event },
      };
    case "timeline.comment_created":
      return {
        recipientUserId: event.recipientId,
        title: event.actorName
          ? `${event.actorName} commented`
          : "New comment",
        body: truncatePreview(event.commentPreview),
        deeplink: `/m/timeline?event=${event.eventId}`,
        payload: { ...event },
      };
  }
}

export type SendPushDeps = {
  sendExpoPush: (messages: ExpoPushMessage[]) => Promise<{
    data: Array<
      | { status: "ok"; id: string }
      | {
          status: "error";
          message: string;
          details?: { error?: string };
        }
    >;
  }>;
  revokeToken: (token: string) => Promise<void>;
};

const defaultSendPushDeps: SendPushDeps = {
  sendExpoPush,
  async revokeToken(token: string) {
    const { revokeToken } = await import("./tokens");
    await revokeToken(token);
  },
};

/**
 * Fire-and-forget push delivery via Expo. Tickets marked
 * `DeviceNotRegistered` cause the matching token to be revoked so we stop
 * dispatching to dead devices.
 */
export async function sendPush(
  tokens: PushToken[],
  payload: BuiltPayload,
  deps: SendPushDeps = defaultSendPushDeps,
): Promise<void> {
  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.token,
    title: payload.title,
    body: payload.body,
    data: { deeplink: payload.deeplink, ...payload.payload },
    sound: "default",
    priority: "high",
    channelId: "default",
  }));

  const response = await deps.sendExpoPush(messages);

  await Promise.all(
    response.data.map(async (ticket, idx) => {
      if (
        ticket.status === "error" &&
        ticket.details?.error === "DeviceNotRegistered"
      ) {
        const token = tokens[idx]?.token;
        if (token) {
          await deps.revokeToken(token).catch(() => {});
        }
      }
    }),
  );
}

export type DispatchDeps = {
  createNotification: (input: NotificationInsert) => Promise<unknown>;
  sendPush: (tokens: PushToken[], payload: BuiltPayload) => Promise<void>;
  getActiveTokensForUser: (user_id: string) => Promise<PushToken[]>;
};

/**
 * Lazy-loads the real createNotification on first call. Keeps the test file
 * free of the `next/server` transitive import that admin.ts pulls in.
 */
async function loadDefaultDeps(): Promise<DispatchDeps> {
  const { createNotification } = await import("@/lib/notifications/server");
  const { getActiveTokensForUser } = await import("./tokens");
  return { createNotification, sendPush, getActiveTokensForUser };
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
    const tokens = await resolved.getActiveTokensForUser(built.recipientUserId);
    await resolved.sendPush(tokens, built);
  } catch (err) {
    console.error("[notify.dispatch] failed", event.type, err);
  }
}
