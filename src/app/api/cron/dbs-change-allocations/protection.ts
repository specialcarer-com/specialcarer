/**
 * Pure decision logic for the DBS-change allocation-protection cron
 * (Phase A / A4).
 *
 * When a caregiver's DBS Update Service recheck returns "changed" the
 * recheck cron already writes a dbs_change_events row. This module
 * decides, for each unresolved change event, what to do with every
 * booking still allocated to that caregiver in the future.
 *
 * Policy (approved 2026-09-11):
 *   accepted     → flag as pending_review, admin decides.
 *   paid         → auto-cancel and issue Stripe refund (escrow held).
 *   in_progress  → auto-cancel and refund; shift is happening.
 *   anything else (completed, cancelled, refunded, disputed, pending,
 *                  paid_out) → no action.
 *
 * The module is pure: it takes an injected client + refund callback and
 * returns a plan. Route.ts translates the plan into DB writes,
 * Stripe refund calls, and push notifications.
 */

export type BookingStatus =
  | "pending"
  | "accepted"
  | "paid"
  | "in_progress"
  | "completed"
  | "paid_out"
  | "cancelled"
  | "refunded"
  | "disputed";

export type ChangeEvent = {
  id: string;
  carer_id: string;
  detected_at: string;
};

export type AllocatedBooking = {
  id: string;
  seeker_id: string;
  caregiver_id: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  stripe_payment_intent_id: string | null;
  amount_cents: number | null;
  dbs_protection_status: string | null;
  dbs_protection_change_event_id: string | null;
};

export type BookingAction =
  | { kind: "skip"; reason: string }
  | { kind: "flag_pending"; reason: string }
  | { kind: "auto_cancel"; reason: string; refundCents: number };

export type PlannedAction = {
  bookingId: string;
  carerId: string;
  seekerId: string;
  changeEventId: string;
  action: BookingAction;
};

export type PlanSummary = {
  scanned: number;
  flagged: number;
  autoCancelled: number;
  skipped: number;
  actions: PlannedAction[];
};

/**
 * Decide the action for a single booking given the change event that
 * triggered the scan. Idempotent — a booking already tagged for the
 * same event is skipped.
 */
export function decideBookingAction(
  booking: AllocatedBooking,
  event: ChangeEvent,
  now: number,
): BookingAction {
  // Already handled for this event? Nothing to do.
  if (
    booking.dbs_protection_change_event_id === event.id &&
    booking.dbs_protection_status !== null &&
    booking.dbs_protection_status !== "cleared"
  ) {
    return { kind: "skip", reason: "already_handled" };
  }

  // Only touch bookings that overlap "now or future". A shift that
  // already ended before the DBS change was detected can't be protected
  // retroactively — that is a post-incident review, not this cron's job.
  const endsAtMs = new Date(booking.ends_at).getTime();
  if (Number.isFinite(endsAtMs) && endsAtMs < now) {
    return { kind: "skip", reason: "shift_already_ended" };
  }

  switch (booking.status) {
    case "accepted":
      return {
        kind: "flag_pending",
        reason: "DBS Update Service returned a status change; awaiting admin decision",
      };

    case "paid":
    case "in_progress": {
      if (!booking.stripe_payment_intent_id) {
        // No payment intent means no escrow to refund. Still cancel and
        // flag; admin will settle the money side manually.
        return {
          kind: "auto_cancel",
          reason: booking.status === "in_progress"
            ? "DBS Update Service returned a status change during an in-progress shift"
            : "DBS Update Service returned a status change on a paid booking",
          refundCents: 0,
        };
      }
      return {
        kind: "auto_cancel",
        reason: booking.status === "in_progress"
          ? "DBS Update Service returned a status change during an in-progress shift"
          : "DBS Update Service returned a status change on a paid booking",
        refundCents: booking.amount_cents ?? 0,
      };
    }

    // Terminal / pre-payment / payout states — nothing to protect.
    case "pending":
    case "completed":
    case "paid_out":
    case "cancelled":
    case "refunded":
    case "disputed":
    default:
      return { kind: "skip", reason: `status_${booking.status}` };
  }
}

/**
 * Build the full plan for every unresolved change event.
 */
export function planProtection(
  events: ChangeEvent[],
  bookingsByCarer: Map<string, AllocatedBooking[]>,
  now: number,
): PlanSummary {
  const actions: PlannedAction[] = [];
  let scanned = 0;
  let flagged = 0;
  let autoCancelled = 0;
  let skipped = 0;

  for (const event of events) {
    const bookings = bookingsByCarer.get(event.carer_id) ?? [];
    for (const b of bookings) {
      scanned += 1;
      const action = decideBookingAction(b, event, now);
      switch (action.kind) {
        case "flag_pending":
          flagged += 1;
          break;
        case "auto_cancel":
          autoCancelled += 1;
          break;
        case "skip":
          skipped += 1;
          continue;
      }
      actions.push({
        bookingId: b.id,
        carerId: b.caregiver_id,
        seekerId: b.seeker_id,
        changeEventId: event.id,
        action,
      });
    }
  }

  return { scanned, flagged, autoCancelled, skipped, actions };
}
