/**
 * Unit tests for the calendar route handlers (gap 40):
 *   - authorizeBookingExport gate (401/404/ok)
 *   - calendar-token validation + feed URL shape
 *   - booking → .ics assembly (download vs feed method)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeBookingExport,
  buildBookingIcs,
  buildFeedIcs,
  feedUrlFor,
  generateCalendarToken,
  isValidCalendarToken,
} from "./handlers";
import type { BookingEventRow } from "./bookingEvent";

const row: BookingEventRow = {
  id: "bk-1",
  status: "accepted",
  starts_at: "2026-07-01T09:00:00.000Z",
  ends_at: "2026-07-01T11:00:00.000Z",
  service_type: "elderly",
  location_city: "Leeds",
  location_postcode: "LS1 1AA",
  location_country: "GB",
  notes: "Front door code 1234",
  ics_sequence: 3,
};

describe("authorizeBookingExport", () => {
  it("401s when unauthenticated", () => {
    const r = authorizeBookingExport({
      userId: null,
      seekerId: "s",
      caregiverId: "c",
      bookingExists: true,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 401);
  });

  it("404s when the booking does not exist", () => {
    const r = authorizeBookingExport({
      userId: "u",
      seekerId: null,
      caregiverId: null,
      bookingExists: false,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 404);
  });

  it("404s a non-participant (does not reveal existence)", () => {
    const r = authorizeBookingExport({
      userId: "stranger",
      seekerId: "seeker-1",
      caregiverId: "carer-1",
      bookingExists: true,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.status, 404);
  });

  it("allows the seeker", () => {
    const r = authorizeBookingExport({
      userId: "seeker-1",
      seekerId: "seeker-1",
      caregiverId: "carer-1",
      bookingExists: true,
    });
    assert.equal(r.ok, true);
  });

  it("allows the assigned carer", () => {
    const r = authorizeBookingExport({
      userId: "carer-1",
      seekerId: "seeker-1",
      caregiverId: "carer-1",
      bookingExists: true,
    });
    assert.equal(r.ok, true);
  });
});

describe("isValidCalendarToken", () => {
  it("accepts a v4-shaped UUID", () => {
    assert.equal(isValidCalendarToken(generateCalendarToken()), true);
  });
  it("rejects junk / empty / null", () => {
    assert.equal(isValidCalendarToken("not-a-token"), false);
    assert.equal(isValidCalendarToken(""), false);
    assert.equal(isValidCalendarToken(null), false);
    assert.equal(isValidCalendarToken(undefined), false);
  });
});

describe("feedUrlFor", () => {
  it("builds a webcal:// URL from an https origin", () => {
    const url = feedUrlFor("https://specialcarers.com", "tok-123");
    assert.equal(url, "webcal://specialcarers.com/api/calendar/feed/tok-123.ics");
  });
  it("strips a trailing slash from the origin", () => {
    const url = feedUrlFor("https://specialcarers.com/", "tok");
    assert.equal(url, "webcal://specialcarers.com/api/calendar/feed/tok.ics");
  });
});

describe("buildBookingIcs / buildFeedIcs", () => {
  it("download mode produces a single REQUEST event with the booking sequence", () => {
    const out = buildBookingIcs(row, new Date("2026-06-11T00:00:00Z"));
    assert.match(out, /METHOD:REQUEST/);
    assert.match(out, /UID:booking-bk-1@specialcarer\.com/);
    assert.match(out, /SEQUENCE:3/);
    assert.match(out, /DTSTART:20260701T090000Z/);
    assert.equal(out.match(/BEGIN:VEVENT/g)?.length, 1);
  });

  it("includes city + postcode in LOCATION", () => {
    const out = buildBookingIcs(row, new Date("2026-06-11T00:00:00Z"));
    assert.match(out, /LOCATION:Leeds\\, LS1 1AA/);
  });

  it("feed mode produces PUBLISH and skips rows without start/end", () => {
    const noTimes: BookingEventRow = {
      ...row,
      id: "bk-2",
      starts_at: null,
      ends_at: null,
    };
    const out = buildFeedIcs([row, noTimes], new Date("2026-06-11T00:00:00Z"));
    assert.match(out, /METHOD:PUBLISH/);
    assert.equal(out.match(/BEGIN:VEVENT/g)?.length, 1);
    assert.doesNotMatch(out, /UID:booking-bk-2@/);
  });
});
