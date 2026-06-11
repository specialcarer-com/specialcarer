/**
 * RFC 5545 (iCalendar) builder for booking export (gap 40).
 *
 * Hand-rolled rather than pulling in the `ics` npm package: the subset of
 * RFC 5545 we need (VEVENT with the standard property set) is small, and a
 * zero-dependency builder keeps the bundle lean and avoids a transitive add.
 * The output is line-folded, CRLF-terminated, and property-escaped per spec
 * so Google / Apple / Outlook all parse it.
 *
 * Two delivery modes share this builder:
 *   - per-booking download → METHOD:REQUEST (importable invite)
 *   - personal feed         → METHOD:PUBLISH  (subscription item)
 */

export type IcsMethod = "PUBLISH" | "REQUEST";

/** Booking state mapped onto the iCalendar STATUS property. */
export type IcsStatus = "CONFIRMED" | "CANCELLED" | "TENTATIVE";

export type CalendarEvent = {
  /** Booking id — used to build a stable UID. */
  id: string;
  startsAt: string; // ISO 8601
  endsAt: string; // ISO 8601
  summary: string;
  /** Free-text location (city / postcode). Optional. */
  location?: string | null;
  /** Human-readable description body (deep link appended automatically). */
  description?: string | null;
  /** Absolute deep link to the booking detail page. */
  url?: string | null;
  status: IcsStatus;
  /** Increment on every material update so clients refresh the event. */
  sequence: number;
};

export type BuildIcsOptions = {
  method: IcsMethod;
  /** Defaults to specialcarer.com — the UID/PRODID domain. */
  domain?: string;
  /** DTSTAMP override (testing). Defaults to now. */
  now?: Date;
};

const PRODID = "-//SpecialCarer//Booking Calendar//EN";

/** Escape a TEXT value per RFC 5545 §3.3.11. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/** Format a Date as a UTC iCalendar timestamp: YYYYMMDDTHHMMSSZ. */
export function formatUtc(date: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/**
 * Fold a content line to 75 octets per RFC 5545 §3.1, continuation lines
 * prefixed by a single space. We fold on character boundaries which is safe
 * for our ASCII-dominant content; multi-byte runs stay well under the limit.
 */
export function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  // First line: 75 chars. Continuations: leading space + 74 chars.
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return chunks.join("\r\n");
}

function eventLines(ev: CalendarEvent, dtstamp: string, domain: string): string[] {
  const start = new Date(ev.startsAt);
  const end = new Date(ev.endsAt);
  const lines: string[] = ["BEGIN:VEVENT"];
  lines.push(`UID:booking-${ev.id}@${domain}`);
  lines.push(`DTSTAMP:${dtstamp}`);
  lines.push(`DTSTART:${formatUtc(start)}`);
  lines.push(`DTEND:${formatUtc(end)}`);
  lines.push(`SUMMARY:${escapeText(ev.summary)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);

  const descParts: string[] = [];
  if (ev.description) descParts.push(ev.description);
  if (ev.url) descParts.push(ev.url);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${escapeText(descParts.join("\n\n"))}`);
  }
  if (ev.url) lines.push(`URL:${escapeText(ev.url)}`);

  lines.push(`STATUS:${ev.status}`);
  lines.push(`SEQUENCE:${Math.max(0, Math.trunc(ev.sequence))}`);
  // CANCELLED events should not block free/busy time.
  if (ev.status === "CANCELLED") lines.push("TRANSP:TRANSPARENT");
  lines.push("END:VEVENT");
  return lines;
}

/**
 * Build a complete VCALENDAR string from a list of booking events.
 * Returns a CRLF-terminated, line-folded .ics document.
 */
export function buildIcs(
  events: CalendarEvent[],
  options: BuildIcsOptions,
): string {
  const domain = options.domain ?? "specialcarer.com";
  const dtstamp = formatUtc(options.now ?? new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${options.method}`,
  ];
  // Feed mode benefits from a calendar name + a suggested refresh interval.
  if (options.method === "PUBLISH") {
    lines.push("X-WR-CALNAME:SpecialCarer bookings");
    lines.push("X-PUBLISHED-TTL:PT3H");
    lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT3H");
  }
  for (const ev of events) {
    lines.push(...eventLines(ev, dtstamp, domain));
  }
  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Map a SpecialCarer booking status string onto an iCalendar STATUS. */
export function icsStatusFor(bookingStatus: string): IcsStatus {
  switch (bookingStatus) {
    case "cancelled":
    case "refunded":
      return "CANCELLED";
    case "pending":
      return "TENTATIVE";
    default:
      return "CONFIRMED";
  }
}
