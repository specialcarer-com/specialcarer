/**
 * formatDistance() unit tests (PR-R3) — boundaries around the m/km switch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDistance } from "./format";

test("null / undefined / NaN / negative → Online", () => {
  assert.equal(formatDistance(null), "Online");
  assert.equal(formatDistance(undefined), "Online");
  assert.equal(formatDistance(NaN), "Online");
  assert.equal(formatDistance(-5), "Online");
});

test("0 m renders as metres", () => {
  assert.equal(formatDistance(0), "0 m");
});

test("sub-kilometre distances render as whole metres", () => {
  assert.equal(formatDistance(120), "120 m");
  assert.equal(formatDistance(999), "999 m");
  assert.equal(formatDistance(999.4), "999 m");
});

test("1000 m is the km boundary (one decimal)", () => {
  assert.equal(formatDistance(1000), "1.0 km");
});

test("kilometre distances render with one decimal", () => {
  assert.equal(formatDistance(1200), "1.2 km");
  assert.equal(formatDistance(1500), "1.5 km");
  assert.equal(formatDistance(12345), "12.3 km");
});

test("metres round to the nearest whole number", () => {
  assert.equal(formatDistance(120.6), "121 m");
});
