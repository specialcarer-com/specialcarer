/**
 * Pure reference implementation of the caregiver rate formulae.
 *
 * The authoritative computation runs in SQL (caregiver_rates_v, see
 * supabase/migrations/20260611120000_caregiver_rates_v1.sql) and is materialised into
 * caregiver_rates_cache for the matching loop to read. This module mirrors that
 * SQL in TypeScript so the formulae are unit-testable without a live database
 * and so there is a single documented definition both sides can be checked
 * against.
 *
 * Keep these in lockstep with the view's WHERE/FILTER clauses.
 */

/** Offer lifecycle states, matching booking_match_offers.status. */
export type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "accepted_and_confirmed"
  | "lost";

/** Booking lifecycle states relevant to completion, matching booking_status. */
export type BookingStatus =
  | "pending"
  | "accepted"
  | "paid"
  | "in_progress"
  | "completed"
  | "paid_out"
  | "cancelled"
  | "refunded"
  | "disputed"
  | "confirmed";

/**
 * response_rate = (offers the carer acted on) / (offers sent), trailing 30d.
 *
 *   acted on  : accepted | accepted_and_confirmed | declined
 *   sent      : acted-on + expired (a non-response counts to denominator only)
 *
 * 'lost' and 'cancelled' (filled by another carer) are excluded entirely — the
 * carer was never given a fair chance to respond. 'pending' offers are still
 * live and excluded until they resolve.
 *
 * Returns null when no offers count toward the denominator (neutral signal).
 */
export function computeResponseRate(
  statuses: readonly OfferStatus[],
): number | null {
  let responded = 0;
  let offered = 0;
  for (const s of statuses) {
    const acted =
      s === "accepted" || s === "accepted_and_confirmed" || s === "declined";
    if (acted) {
      responded += 1;
      offered += 1;
    } else if (s === "expired") {
      offered += 1;
    }
  }
  if (offered === 0) return null;
  return round4(responded / offered);
}

/**
 * completion_rate = (completed bookings) / (completed + cancelled), trailing
 * 90d.
 *
 *   completed : completed | paid_out
 *   resolved  : completed + cancelled (denominator)
 *
 * In-flight bookings (confirmed/in_progress/paid/accepted/pending) are excluded
 * from both so a carer isn't penalised for shifts that simply haven't happened
 * yet. 'refunded'/'disputed' are likewise excluded (ambiguous outcome).
 *
 * NOTE: the brief defines the denominator as bookings that reached a confirmed
 * state excluding seeker-cancellations-before-start. This codebase has no
 * cancelled_by column, so we cannot isolate who cancelled; following the
 * precedent in src/lib/ai/matching.ts, all cancellations sit in the
 * denominator. See PR body.
 *
 * Returns null when no bookings are resolved in window (neutral signal).
 */
export function computeCompletionRate(
  statuses: readonly BookingStatus[],
): number | null {
  let completed = 0;
  let resolved = 0;
  for (const s of statuses) {
    const isCompleted = s === "completed" || s === "paid_out";
    if (isCompleted) {
      completed += 1;
      resolved += 1;
    } else if (s === "cancelled") {
      resolved += 1;
    }
  }
  if (resolved === 0) return null;
  return round4(completed / resolved);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
