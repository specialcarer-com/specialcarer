/**
 * Unit tests for the caregiver rate formulae (response_rate / completion_rate).
 *
 * These mirror the SQL in caregiver_rates_v
 * (supabase/migrations/20260611120000_caregiver_rates_v1.sql). Pure functions, no DB.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeResponseRate,
  computeCompletionRate,
  type OfferStatus,
  type BookingStatus,
} from "./rates";

describe("computeResponseRate", () => {
  it("returns null with no offers in window", () => {
    assert.equal(computeResponseRate([]), null);
  });

  it("counts accepted + declined as responded over the offered total", () => {
    const offers: OfferStatus[] = [
      "accepted",
      "declined",
      "expired", // non-response: denominator only
      "expired",
    ];
    // responded = 2 (accepted, declined); offered = 4 → 0.5
    assert.equal(computeResponseRate(offers), 0.5);
  });

  it("treats accepted_and_confirmed as a response", () => {
    const offers: OfferStatus[] = ["accepted_and_confirmed", "expired"];
    // responded = 1; offered = 2 → 0.5
    assert.equal(computeResponseRate(offers), 0.5);
  });

  it("excludes 'lost' and 'cancelled' from both numerator and denominator", () => {
    const offers: OfferStatus[] = [
      "accepted",
      "lost",
      "cancelled",
      "expired",
    ];
    // responded = 1 (accepted); offered = 2 (accepted + expired) → 0.5
    assert.equal(computeResponseRate(offers), 0.5);
  });

  it("excludes still-pending offers from the denominator", () => {
    const offers: OfferStatus[] = ["accepted", "pending", "pending"];
    // responded = 1; offered = 1 → 1.0
    assert.equal(computeResponseRate(offers), 1);
  });

  it("returns null when every offer is non-counting", () => {
    const offers: OfferStatus[] = ["lost", "cancelled", "pending"];
    assert.equal(computeResponseRate(offers), null);
  });

  it("rounds to 4 dp", () => {
    const offers: OfferStatus[] = [
      "accepted",
      "expired",
      "expired", // 1/3 = 0.3333...
    ];
    assert.equal(computeResponseRate(offers), 0.3333);
  });
});

describe("computeCompletionRate", () => {
  it("returns null with no resolved bookings in window", () => {
    assert.equal(computeCompletionRate([]), null);
  });

  it("counts completed + paid_out over completed + cancelled", () => {
    const bookings: BookingStatus[] = [
      "completed",
      "paid_out",
      "cancelled",
      "cancelled",
    ];
    // completed = 2; resolved = 4 → 0.5
    assert.equal(computeCompletionRate(bookings), 0.5);
  });

  it("excludes in-flight bookings from both", () => {
    const bookings: BookingStatus[] = [
      "completed",
      "confirmed",
      "in_progress",
      "paid",
      "accepted",
      "pending",
    ];
    // completed = 1; resolved = 1 → 1.0 (in-flight ignored)
    assert.equal(computeCompletionRate(bookings), 1);
  });

  it("excludes refunded and disputed (ambiguous) from both", () => {
    const bookings: BookingStatus[] = ["completed", "refunded", "disputed"];
    // completed = 1; resolved = 1 → 1.0
    assert.equal(computeCompletionRate(bookings), 1);
  });

  it("returns null when only in-flight/ambiguous bookings exist", () => {
    const bookings: BookingStatus[] = ["confirmed", "in_progress", "refunded"];
    assert.equal(computeCompletionRate(bookings), null);
  });

  it("rounds to 4 dp", () => {
    const bookings: BookingStatus[] = [
      "completed",
      "completed",
      "cancelled", // 2/3 = 0.6666...
    ];
    assert.equal(computeCompletionRate(bookings), 0.6667);
  });
});
