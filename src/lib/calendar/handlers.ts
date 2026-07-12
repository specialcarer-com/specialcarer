import { randomUUID } from "node:crypto";
import {
  type BookingEventRow,
  bookingToEvent,
} from "./bookingEvent";
import { buildIcs } from "./buildIcs";

/**
 * Pure, dependency-light handlers for the calendar export routes. Routes stay
 * thin adapters around these so the auth gate and ics assembly can be unit
 * tested without next/headers + supabase machinery (matching the
 * handler-extraction pattern used by earnings / upcoming).
 */

export type AuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Per-booking download gate: only the seeker or the assigned carer on a
 * booking may export it. Non-parties get 404 (don't reveal existence),
 * unauthenticated gets 401.
 */
export function authorizeBookingExport(input: {
  userId: string | null | undefined;
  seekerId: string | null | undefined;
  caregiverId: string | null | undefined;
  bookingExists: boolean;
}): AuthResult {
  if (!input.userId) return { ok: false, status: 401, error: "Unauthorized" };
  if (!input.bookingExists)
    return { ok: false, status: 404, error: "not_found" };
  const isParty =
    input.userId === input.seekerId || input.userId === input.caregiverId;
  if (!isParty) return { ok: false, status: 404, error: "not_found" };
  return { ok: true };
}

/** Build the single-event .ics body for a per-booking download. */
export function buildBookingIcs(row: BookingEventRow, now?: Date): string {
  const ev = bookingToEvent(row);
  return buildIcs(ev ? [ev] : [], { method: "REQUEST", now });
}

/** Build the multi-event feed .ics body for a personal subscription. */
export function buildFeedIcs(rows: BookingEventRow[], now?: Date): string {
  const events = rows
    .map(bookingToEvent)
    .filter((e): e is NonNullable<typeof e> => e !== null);
  return buildIcs(events, { method: "PUBLISH", now });
}

/** A calendar feed token is a v4 UUID. Reject anything else fast (→ 404). */
export function isValidCalendarToken(token: string | null | undefined): boolean {
  return (
    typeof token === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
  );
}

/** Generate a fresh opaque feed token. */
export function generateCalendarToken(): string {
  return randomUUID();
}

/** Build the webcal:// subscribe URL for a token, given the public origin. */
export function feedUrlFor(origin: string, token: string): string {
  const host = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `webcal://${host}/api/calendar/feed/${token}.ics`;
}
