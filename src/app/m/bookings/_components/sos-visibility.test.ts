/**
 * Tests for the seeker SOS visibility helper.
 *
 * Pure-logic tests — no DOM, no React. Mirrors the
 * handler/route split pattern used elsewhere in the repo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSosButtonVisible } from "./sos-visibility";

const NOW = new Date("2026-05-27T11:00:00Z");

describe("isSosButtonVisible", () => {
  it("shows when seeker and status === in_progress (regardless of starts_at)", () => {
    assert.equal(
      isSosButtonVisible({
        status: "in_progress",
        as_role: "seeker",
        starts_at: "1999-01-01T00:00:00Z",
        now: NOW,
      }),
      true,
    );
  });

  it("shows when seeker, status === accepted, and starts_at is within +2h", () => {
    assert.equal(
      isSosButtonVisible({
        status: "accepted",
        as_role: "seeker",
        starts_at: "2026-05-27T12:30:00Z", // +1h30m
        now: NOW,
      }),
      true,
    );
  });

  it("shows when seeker, status === paid, and starts_at is within -2h (just started)", () => {
    assert.equal(
      isSosButtonVisible({
        status: "paid",
        as_role: "seeker",
        starts_at: "2026-05-27T09:30:00Z", // -1h30m
        now: NOW,
      }),
      true,
    );
  });

  it("hides when seeker, status === accepted, but starts_at is >2h away", () => {
    assert.equal(
      isSosButtonVisible({
        status: "accepted",
        as_role: "seeker",
        starts_at: "2026-05-27T15:00:00Z", // +4h
        now: NOW,
      }),
      false,
    );
  });

  it("hides when seeker, status === accepted, but starts_at is more than 2h in the past", () => {
    assert.equal(
      isSosButtonVisible({
        status: "accepted",
        as_role: "seeker",
        starts_at: "2026-05-27T07:00:00Z", // -4h
        now: NOW,
      }),
      false,
    );
  });

  it("hides when user is the carer, even if shift is live", () => {
    assert.equal(
      isSosButtonVisible({
        status: "in_progress",
        as_role: "carer",
        starts_at: "2026-05-27T10:00:00Z",
        now: NOW,
      }),
      false,
    );
  });

  it("hides for pending bookings", () => {
    assert.equal(
      isSosButtonVisible({
        status: "pending",
        as_role: "seeker",
        starts_at: "2026-05-27T11:30:00Z",
        now: NOW,
      }),
      false,
    );
  });

  it("hides for completed bookings", () => {
    assert.equal(
      isSosButtonVisible({
        status: "completed",
        as_role: "seeker",
        starts_at: "2026-05-27T10:00:00Z",
        now: NOW,
      }),
      false,
    );
  });

  it("hides for cancelled bookings", () => {
    assert.equal(
      isSosButtonVisible({
        status: "cancelled",
        as_role: "seeker",
        starts_at: "2026-05-27T11:30:00Z",
        now: NOW,
      }),
      false,
    );
  });

  it("hides when starts_at is missing on accepted booking", () => {
    assert.equal(
      isSosButtonVisible({
        status: "accepted",
        as_role: "seeker",
        starts_at: null,
        now: NOW,
      }),
      false,
    );
  });

  it("hides when starts_at is unparseable", () => {
    assert.equal(
      isSosButtonVisible({
        status: "accepted",
        as_role: "seeker",
        starts_at: "not-a-date",
        now: NOW,
      }),
      false,
    );
  });

  it("treats the ±2h window inclusively at the boundary", () => {
    assert.equal(
      isSosButtonVisible({
        status: "accepted",
        as_role: "seeker",
        starts_at: "2026-05-27T13:00:00Z", // +2h exactly
        now: NOW,
      }),
      true,
    );
    assert.equal(
      isSosButtonVisible({
        status: "accepted",
        as_role: "seeker",
        starts_at: "2026-05-27T09:00:00Z", // -2h exactly
        now: NOW,
      }),
      true,
    );
  });
});
