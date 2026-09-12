/**
 * Unit tests for src/lib/candour/sla.ts.
 *
 * Pure calculations — no DB, no environment. We drive `regulatorNotifyTarget`
 * and `candourDisclosureTarget` with explicit UTC instants chosen so their
 * London wall-clock reading is unambiguous.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  regulatorNotifyTarget,
  candourDisclosureTarget,
  slaBadge,
} from "./sla";

// Small helper — build a Date from a London wall-clock string (assumes
// the year is far enough from a DST switch to be unambiguous). For DST
// edge cases we build the UTC instant directly.
function londonHhMmOn(ymd: string, hh: number, mm = 0): Date {
  // Non-BST months (Jan-Feb, Nov-Dec): London == UTC.
  // Rest of the year: London == UTC + 1. We pass explicit UTC and read
  // back the London parts inside the SLA module, so we just need to
  // supply the right UTC hour.
  const [y, m, d] = ymd.split("-").map(Number);
  // Sept 12 2026 → BST (UTC+1). Only used in DST test explicitly.
  // Use a helper: use Intl.DateTimeFormat to determine the shift for
  // the given calendar date and construct the corresponding UTC.
  // For our test dates below we know the offset — set it explicitly.
  const isBst = isBritishSummerTime(y!, m!, d!);
  const utcHour = isBst ? hh - 1 : hh;
  return new Date(Date.UTC(y!, m! - 1, d!, utcHour, mm, 0));
}

// Approximate rule for our test dates: BST from last Sunday of March
// through last Sunday of October. Good enough for the specific
// calendar dates we hard-code below.
function isBritishSummerTime(y: number, m: number, d: number): boolean {
  if (m < 3 || m > 10) return false;
  if (m > 3 && m < 10) return true;
  const lastSundayMarch = lastSundayOf(y, 3);
  const lastSundayOct = lastSundayOf(y, 10);
  if (m === 3) return d >= lastSundayMarch;
  return d < lastSundayOct;
}

function lastSundayOf(year: number, month: number): number {
  // Get the last day of the month via Date.UTC + day 0 of next month.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = lastDay; day >= 1; day--) {
    // Day-of-week 0=Sun … 6=Sat.
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) return day;
  }
  return lastDay;
}

// ─────────────────────────────────────────────────────────────────────────
// regulatorNotifyTarget
// ─────────────────────────────────────────────────────────────────────────

describe("regulatorNotifyTarget", () => {
  it("discovered Monday 09:00 London → target is 17:00 London same day", () => {
    // 2026-11-16 is a Monday (Nov = GMT, so London == UTC).
    const discovered = londonHhMmOn("2026-11-16", 9);
    const target = regulatorNotifyTarget(discovered, "death");
    assert.ok(target instanceof Date);
    // Expected: 2026-11-16 17:00 London == 2026-11-16 17:00 UTC (GMT).
    assert.equal(target!.toISOString(), "2026-11-16T17:00:00.000Z");
  });

  it("discovered Friday 18:00 London → target is Monday 09:00 London", () => {
    // 2026-11-13 is a Friday (GMT).
    const discovered = londonHhMmOn("2026-11-13", 18);
    const target = regulatorNotifyTarget(discovered, "injury_serious");
    assert.ok(target instanceof Date);
    // Next working day = Monday 2026-11-16 09:00 London (GMT).
    assert.equal(target!.toISOString(), "2026-11-16T09:00:00.000Z");
  });

  it("type='other' returns null (no statutory clock)", () => {
    const discovered = londonHhMmOn("2026-11-16", 10);
    assert.equal(regulatorNotifyTarget(discovered, "other"), null);
  });

  it("discovered on a bank holiday morning → target is next working day 09:00", () => {
    // 2026-12-25 (Christmas Day, Friday). Boxing Day observed 2026-12-28
    // (Monday, per gov.uk substitute since 26 Dec is Saturday). Next
    // working day is 2026-12-29 (Tuesday).
    const discovered = londonHhMmOn("2026-12-25", 10);
    const target = regulatorNotifyTarget(discovered, "abuse_alleged");
    assert.equal(target!.toISOString(), "2026-12-29T09:00:00.000Z");
  });

  it("DST edge: discovery Fri 2027-03-26 18:00 BST → next working day is Mon 09:00 BST", () => {
    // 2027-03-26 is Good Friday (bank holiday in the static list) AND
    // sits the day before the UK BST switchover (last Sunday of March
    // 2027 = 2027-03-28). 29 Mar is Easter Monday (also a bank holiday).
    // So the next working day is Tuesday 2027-03-30, which IS in BST.
    // Expected target: 2027-03-30 09:00 BST == 2027-03-30 08:00 UTC.
    const discovered = new Date(Date.UTC(2027, 2, 26, 17, 0, 0)); // 18:00 GMT = 18:00 pre-BST wall-clock (GMT applies until switchover)
    const target = regulatorNotifyTarget(discovered, "death");
    assert.ok(target instanceof Date);
    assert.equal(target!.toISOString(), "2027-03-30T08:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// candourDisclosureTarget
// ─────────────────────────────────────────────────────────────────────────

describe("candourDisclosureTarget", () => {
  it("discovered Sunday 2026-11-15 12:00 → skips weekend, counts 10 working days", () => {
    // 2026-11-15 is a Sunday (GMT). First working day (from cursor at
    // +1 day = Mon 2026-11-16) starts the count. 10 working days = 2
    // working weeks = 2026-11-16 through 2026-11-27. Target = 2026-11-27.
    const discovered = londonHhMmOn("2026-11-15", 12);
    const target = candourDisclosureTarget(discovered);
    // Expected London wall-clock: 2026-11-27 12:00 GMT.
    assert.equal(target.toISOString(), "2026-11-27T12:00:00.000Z");
  });

  it("discovered 2026-12-22 09:00 → skips Christmas Day + Boxing Day (Mon) + New Year's Day", () => {
    // 2026-12-22 is a Tuesday (GMT). Working days from cursor = Wed
    // 12-23 (1), Thu 12-24 (2), Fri 12-25 SKIP (Xmas), Sat 12-26 SKIP,
    // Sun 12-27 SKIP, Mon 12-28 SKIP (Boxing Day substitute), Tue 12-29
    // (3), Wed 12-30 (4), Thu 12-31 (5), Fri 2027-01-01 SKIP (New Year),
    // Sat SKIP, Sun SKIP, Mon 2027-01-04 (6), Tue 2027-01-05 (7), Wed
    // 2027-01-06 (8), Thu 2027-01-07 (9), Fri 2027-01-08 (10).
    // Target = 2027-01-08 09:00 GMT.
    const discovered = londonHhMmOn("2026-12-22", 9);
    const target = candourDisclosureTarget(discovered);
    assert.equal(target.toISOString(), "2027-01-08T09:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// slaBadge
// ─────────────────────────────────────────────────────────────────────────

describe("slaBadge", () => {
  const now = new Date("2026-11-16T10:00:00.000Z");

  it("returns 'na' when target is null", () => {
    assert.equal(slaBadge(null, now), "na");
  });

  it("returns 'on-time' when target is more than 24h away", () => {
    const target = new Date(now.getTime() + 48 * 3600 * 1000);
    assert.equal(slaBadge(target, now), "on-time");
  });

  it("returns 'due-soon' when target is within 24h and future", () => {
    const target = new Date(now.getTime() + 6 * 3600 * 1000);
    assert.equal(slaBadge(target, now), "due-soon");
  });

  it("returns 'overdue' when target is in the past", () => {
    const target = new Date(now.getTime() - 3600 * 1000);
    assert.equal(slaBadge(target, now), "overdue");
  });

  it("boundary — target exactly 24h from now → 'due-soon'", () => {
    const target = new Date(now.getTime() + 24 * 3600 * 1000);
    assert.equal(slaBadge(target, now), "due-soon");
  });
});
