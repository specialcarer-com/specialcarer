"use client";

import * as React from "react";

/**
 * Booking-state badge for the mobile redesign (PR-R3).
 *
 * Pure presentational pill. The six states below are the redesign's
 * seeker-facing lifecycle buckets; they map onto the canonical
 * `booking_status` enum used across the app
 * (pending|accepted|paid|in_progress|completed|paid_out|cancelled|
 * refunded|disputed — see src/lib/admin/bookings.ts). The redesign collapses
 * payment-ledger states (paid/paid_out/refunded) into the user-meaningful
 * lifecycle, so `bookingStateFromStatus()` does that mapping and callers pass
 * the result here.
 *
 * Gated behind NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED by its callers; the
 * component itself is inert until rendered.
 */

export const BOOKING_STATES = [
  "requested",
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
  "disputed",
] as const;

export type BookingState = (typeof BOOKING_STATES)[number];

export type BookingStateBadgeProps = {
  state: BookingState;
  size?: "sm" | "md";
  className?: string;
};

/** Seeker-facing label for each lifecycle state. */
export function bookingStateLabel(state: BookingState): string {
  switch (state) {
    case "requested":
      return "Requested";
    case "accepted":
      return "Confirmed";
    case "in_progress":
      return "In progress now";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "disputed":
      return "Disputed";
  }
}

/**
 * Map a canonical `booking_status` enum value onto a redesign lifecycle
 * state, or null when the status has no badge (e.g. an unknown value). The
 * payment-ledger states fold into the lifecycle the user cares about:
 *   - paid      → accepted (money taken, shift not yet started)
 *   - paid_out  → completed (shift done, carer paid)
 *   - refunded  → cancelled
 */
export function bookingStateFromStatus(
  status: string | null | undefined,
): BookingState | null {
  switch (status) {
    case "pending":
      return "requested";
    case "accepted":
    case "paid":
      return "accepted";
    case "in_progress":
      return "in_progress";
    case "completed":
    case "paid_out":
      return "completed";
    case "cancelled":
    case "refunded":
      return "cancelled";
    case "disputed":
      return "disputed";
    default:
      return null;
  }
}

/* ── palette ─────────────────────────────────────────────────────────── */

type Swatch = { bg: string; fg: string };

// Inline styles (not Tailwind tokens) so the badge renders identically in
// static-markup tests and never depends on a token being present in the
// redesign theme build.
const SWATCH: Record<BookingState, Swatch> = {
  requested: { bg: "#FCE6D6", fg: "#8A4B22" }, // peach
  accepted: { bg: "#D6F0EF", fg: "#0B6B6C" }, // teal
  in_progress: { bg: "#039EA0", fg: "#FFFFFF" }, // solid teal
  completed: { bg: "#EEEEEE", fg: "#555555" }, // neutral grey
  cancelled: { bg: "#FBEBEB", fg: "#B23A3A" }, // light red
  disputed: { bg: "#7A1F1F", fg: "#FFFFFF" }, // dark red
};

export function BookingStateBadge({
  state,
  size = "md",
  className = "",
}: BookingStateBadgeProps) {
  const swatch = SWATCH[state];
  const label = bookingStateLabel(state);
  const sizing =
    size === "sm"
      ? "px-2 py-0.5 text-[11px]"
      : "px-2.5 py-1 text-[12px]";

  return (
    <span
      className={`inline-flex items-center rounded-pill font-semibold leading-none whitespace-nowrap ${sizing} ${className}`}
      style={{ backgroundColor: swatch.bg, color: swatch.fg }}
      data-booking-state={state}
    >
      {label}
    </span>
  );
}

export default BookingStateBadge;
