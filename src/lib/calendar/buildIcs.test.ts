/**
 * Unit tests for the hand-rolled iCalendar builder (gap 40).
 *
 * Covers the RFC 5545 essentials the calendar clients rely on: UID stability,
 * UTC DTSTART/DTEND, SUMMARY/LOCATION escaping, STATUS + SEQUENCE, the
 * METHOD difference between feed (PUBLISH) and download (REQUEST), and
 * CRLF line termination + 75-octet folding.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildIcs,
  escapeText,
  formatUtc,
  foldLine,
  icsStatusFor,
  type CalendarEvent,
} from "./buildIcs";

const baseEvent: CalendarEvent = {
  id: "abc-123",
  startsAt: "2026-07-01T09:00:00.000Z",
  endsAt: "2026-07-01T12:30:00.000Z",
  summary: "Elderly care — SpecialCarer",
  location: "London, SW1A 1AA",
  description: "Care booking",
  url: "https://specialcarers.com/m/bookings/abc-123",
  status: "CONFIRMED",
  sequence: 2,
};

const NOW = new Date("2026-06-11T08:00:00.000Z");

describe("formatUtc", () => {
  it("renders a Z-suffixed UTC stamp", () => {
    assert.equal(formatUtc(new Date("2026-07-01T09:05:07.000Z")), "20260701T090507Z");
  });
});

describe("escapeText", () => {
  it("escapes commas, semicolons, backslashes and newlines", () => {
    assert.equal(escapeText("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
  });
});

describe("foldLine", () => {
  it("leaves short lines untouched", () => {
    assert.equal(foldLine("SHORT:value"), "SHORT:value");
  });
  it("folds long lines with a leading space on continuation", () => {
    const long = "X".repeat(200);
    const folded = foldLine(`DESCRIPTION:${long}`);
    const parts = folded.split("\r\n");
    assert.ok(parts.length > 1);
    assert.equal(parts[0].length, 75);
    for (const p of parts.slice(1)) assert.equal(p[0], " ");
  });
});

describe("icsStatusFor", () => {
  it("maps cancelled/refunded to CANCELLED", () => {
    assert.equal(icsStatusFor("cancelled"), "CANCELLED");
    assert.equal(icsStatusFor("refunded"), "CANCELLED");
  });
  it("maps pending to TENTATIVE and everything else to CONFIRMED", () => {
    assert.equal(icsStatusFor("pending"), "TENTATIVE");
    assert.equal(icsStatusFor("completed"), "CONFIRMED");
    assert.equal(icsStatusFor("accepted"), "CONFIRMED");
  });
});

describe("buildIcs", () => {
  it("emits the required VCALENDAR/VEVENT props", () => {
    const out = buildIcs([baseEvent], { method: "REQUEST", now: NOW });
    assert.match(out, /BEGIN:VCALENDAR/);
    assert.match(out, /VERSION:2\.0/);
    assert.match(out, /PRODID:-\/\/SpecialCarer\/\/Booking Calendar\/\/EN/);
    assert.match(out, /BEGIN:VEVENT/);
    assert.match(out, /END:VEVENT/);
    assert.match(out, /END:VCALENDAR/);
  });

  it("builds a stable UID from the booking id", () => {
    const out = buildIcs([baseEvent], { method: "REQUEST", now: NOW });
    assert.match(out, /UID:booking-abc-123@specialcarer\.com/);
  });

  it("renders DTSTART/DTEND/DTSTAMP in UTC", () => {
    const out = buildIcs([baseEvent], { method: "REQUEST", now: NOW });
    assert.match(out, /DTSTART:20260701T090000Z/);
    assert.match(out, /DTEND:20260701T123000Z/);
    assert.match(out, /DTSTAMP:20260611T080000Z/);
  });

  it("includes SUMMARY, LOCATION, STATUS and SEQUENCE", () => {
    const out = buildIcs([baseEvent], { method: "REQUEST", now: NOW });
    assert.match(out, /SUMMARY:Elderly care — SpecialCarer/);
    assert.match(out, /LOCATION:London\\, SW1A 1AA/);
    assert.match(out, /STATUS:CONFIRMED/);
    assert.match(out, /SEQUENCE:2/);
  });

  it("embeds the deep link in DESCRIPTION and URL", () => {
    const out = buildIcs([baseEvent], { method: "REQUEST", now: NOW });
    assert.match(out, /URL:https:\/\/specialcarer\.com\/m\/bookings\/abc-123/);
    assert.match(out, /DESCRIPTION:.*specialcarer\.com\/m\/bookings\/abc-123/);
  });

  it("uses METHOD:REQUEST for per-booking download", () => {
    const out = buildIcs([baseEvent], { method: "REQUEST", now: NOW });
    assert.match(out, /METHOD:REQUEST/);
    assert.doesNotMatch(out, /X-WR-CALNAME/);
  });

  it("uses METHOD:PUBLISH plus refresh hints for the feed", () => {
    const out = buildIcs([baseEvent], { method: "PUBLISH", now: NOW });
    assert.match(out, /METHOD:PUBLISH/);
    assert.match(out, /X-WR-CALNAME:SpecialCarer bookings/);
    assert.match(out, /REFRESH-INTERVAL;VALUE=DURATION:PT3H/);
  });

  it("marks CANCELLED events transparent", () => {
    const out = buildIcs(
      [{ ...baseEvent, status: "CANCELLED" }],
      { method: "PUBLISH", now: NOW },
    );
    assert.match(out, /STATUS:CANCELLED/);
    assert.match(out, /TRANSP:TRANSPARENT/);
  });

  it("terminates every line with CRLF", () => {
    const out = buildIcs([baseEvent], { method: "REQUEST", now: NOW });
    assert.ok(out.endsWith("\r\n"));
    // No lone LF that isn't part of a CRLF pair.
    assert.doesNotMatch(out, /[^\r]\n/);
  });

  it("emits multiple VEVENT blocks for a feed of several bookings", () => {
    const out = buildIcs(
      [baseEvent, { ...baseEvent, id: "def-456" }],
      { method: "PUBLISH", now: NOW },
    );
    const count = out.match(/BEGIN:VEVENT/g)?.length ?? 0;
    assert.equal(count, 2);
    assert.match(out, /UID:booking-def-456@specialcarer\.com/);
  });
});
