/**
 * STUB — replaced by PR-A2 (bot/p0-a2-push-dispatcher).
 *
 * This file is shipped from PR-A4 so the chat backbone can import
 * `dispatch` against a stable contract. PR-A2 will overwrite this
 * module with the full typed-event dispatcher (per-event payload
 * builders, APNs fan-out, Android no-op until FCM, notifications
 * inbox write-through via createNotification from PR-A3).
 *
 * Until A2 lands the stub no-ops and resolves successfully so the
 * chat send path is not blocked. The merge order in the PR body is
 * A1 → A3 → A2 → A4, so by the time A4 ships, the real dispatcher
 * is already in main.
 */

export type PushEvent =
  | { type: "booking.confirmed"; user_id: string; booking_id: string }
  | { type: "booking.cancelled"; user_id: string; booking_id: string; reason?: string }
  | { type: "booking.reminder_24h"; user_id: string; booking_id: string }
  | { type: "booking.reminder_1h"; user_id: string; booking_id: string }
  | { type: "shift.starting"; user_id: string; booking_id: string }
  | { type: "shift.arrived"; user_id: string; booking_id: string; carer_name: string }
  | { type: "shift.completed"; user_id: string; booking_id: string }
  | { type: "message.received"; user_id: string; thread_id: string; preview: string }
  | { type: "payout.completed"; user_id: string; amount_cents: number; currency: string }
  | { type: "review.received"; user_id: string; booking_id: string; stars: number };

export type DispatchResult = {
  ok: boolean;
  delivered: number;
  skipped: number;
};

export async function dispatch(_event: PushEvent): Promise<DispatchResult> {
  return { ok: true, delivered: 0, skipped: 0 };
}
