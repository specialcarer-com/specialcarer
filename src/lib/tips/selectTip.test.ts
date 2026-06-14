import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectTipForDate, dayOfYearUTC } from "./selectTip";
import type { Tip } from "./carerTips";
import { CARER_TIPS } from "./carerTips";

const TIPS: Tip[] = [
  { id: "a", category: "safety", body: "a" },
  { id: "b", category: "communication", body: "b" },
  { id: "c", category: "self-care", body: "c" },
];

describe("dayOfYearUTC", () => {
  it("returns 1 for 1 January", () => {
    assert.equal(dayOfYearUTC(new Date(Date.UTC(2026, 0, 1))), 1);
  });

  it("returns 365 for 31 December in a non-leap year", () => {
    assert.equal(dayOfYearUTC(new Date(Date.UTC(2026, 11, 31))), 365);
  });

  it("ignores the time-of-day component", () => {
    const morning = new Date(Date.UTC(2026, 5, 14, 1, 0, 0));
    const night = new Date(Date.UTC(2026, 5, 14, 23, 59, 59));
    assert.equal(dayOfYearUTC(morning), dayOfYearUTC(night));
  });
});

describe("selectTipForDate", () => {
  it("is deterministic for the same UTC day", () => {
    const a = selectTipForDate(new Date(Date.UTC(2026, 5, 14, 6, 0, 0)), TIPS);
    const b = selectTipForDate(new Date(Date.UTC(2026, 5, 14, 18, 30, 0)), TIPS);
    assert.equal(a.id, b.id);
  });

  it("advances by one tip per day", () => {
    const day1 = selectTipForDate(new Date(Date.UTC(2026, 0, 1)), TIPS);
    const day2 = selectTipForDate(new Date(Date.UTC(2026, 0, 2)), TIPS);
    const day3 = selectTipForDate(new Date(Date.UTC(2026, 0, 3)), TIPS);
    assert.deepEqual([day1.id, day2.id, day3.id], ["a", "b", "c"]);
  });

  it("cycles back to the start after exhausting the list", () => {
    // Day 1 -> index 0, day 4 -> index 0 again with a 3-tip list.
    const day1 = selectTipForDate(new Date(Date.UTC(2026, 0, 1)), TIPS);
    const day4 = selectTipForDate(new Date(Date.UTC(2026, 0, 4)), TIPS);
    assert.equal(day1.id, day4.id);
  });

  it("cycles correctly across a year boundary", () => {
    // 31 Dec 2025 is day 365; 1 Jan 2026 is day 1. The index resets, so the
    // rotation is continuous and deterministic over the boundary.
    const dec31 = selectTipForDate(new Date(Date.UTC(2025, 11, 31)), TIPS);
    const jan1 = selectTipForDate(new Date(Date.UTC(2026, 0, 1)), TIPS);
    assert.equal((365 - 1) % TIPS.length, 1); // dec31 -> index 1
    assert.equal(dec31.id, "b");
    assert.equal(jan1.id, "a");
  });

  it("throws on an empty tip list", () => {
    assert.throws(() => selectTipForDate(new Date(), []));
  });

  it("returns a tip from the supplied list for the real content", () => {
    const tip = selectTipForDate(new Date(Date.UTC(2026, 5, 14)), CARER_TIPS);
    assert.ok(CARER_TIPS.some((t) => t.id === tip.id));
  });
});
