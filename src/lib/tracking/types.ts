/**
 * Live Tracking v1 — shared types between server, API, and client.
 */

export type CarerPosition = {
  bookingId: string;
  carerId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  heading: number | null;
  speedMps: number | null;
  recordedAt: string;
};

export type TrackingEligibility =
  | { eligible: true; role: "seeker" | "caregiver"; bookingStatus: string }
  | { eligible: false; reason: string };

/** A position older than this is considered stale and not shown to seekers. */
export const POSITION_STALE_AFTER_MS = 15 * 60 * 1000; // 15 minutes
/** Carer pings every PING_INTERVAL_MS while sharing. */
export const PING_INTERVAL_MS = 10_000; // 10s
/** Drop pings whose accuracy is worse than this. */
export const MIN_ACCEPTABLE_ACCURACY_M = 200;
