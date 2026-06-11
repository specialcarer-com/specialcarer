import { serviceLabel } from "@/lib/care/services";
import {
  type CalendarEvent,
  icsStatusFor,
} from "./buildIcs";

/**
 * The minimal booking shape both the per-booking download route and the
 * personal feed route select from the `bookings` table.
 */
export type BookingEventRow = {
  id: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  service_type: string | null;
  location_city: string | null;
  location_postcode: string | null;
  location_country: string | null;
  notes: string | null;
  ics_sequence: number | null;
};

/** Resolve the public site origin (no trailing slash). */
export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://specialcarer.com"
  );
}

/** Absolute deep link to the in-app booking detail screen. */
export function bookingDeepLink(id: string): string {
  return `${siteOrigin()}/m/bookings/${id}`;
}

function locationFor(row: BookingEventRow): string | null {
  const parts = [row.location_city, row.location_postcode].filter(
    (s): s is string => Boolean(s && s.trim()),
  );
  return parts.length ? parts.join(", ") : null;
}

/**
 * Map a booking row into a calendar event. Rows missing start/end are not
 * representable as a timed VEVENT and must be filtered out by the caller.
 */
export function bookingToEvent(row: BookingEventRow): CalendarEvent | null {
  if (!row.starts_at || !row.ends_at) return null;
  const service = row.service_type ? serviceLabel(row.service_type) : "Care";
  const descLines: string[] = [`${service} booking with SpecialCarer.`];
  if (row.notes && row.notes.trim()) descLines.push(row.notes.trim());

  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    summary: `${service} — SpecialCarer`,
    location: locationFor(row),
    description: descLines.join("\n\n"),
    url: bookingDeepLink(row.id),
    status: icsStatusFor(row.status),
    sequence: row.ics_sequence ?? 0,
  };
}

/** Column list shared by both ics routes when selecting from `bookings`. */
export const BOOKING_EVENT_COLUMNS =
  "id, status, starts_at, ends_at, service_type, location_city, location_postcode, location_country, notes, ics_sequence";
