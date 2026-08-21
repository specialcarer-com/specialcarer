import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_SINGLE_BOOKING_HOURS,
  bookingIntentIdempotencyKey,
  priceBookingFromServerRate,
} from "@/lib/bookings/server-pricing";

const START = "2026-08-20T09:00:00.000Z";
const END = "2026-08-20T11:00:00.000Z";
const REQUEST_ID = "e6c3b0d1-2197-4f1c-a32c-60f4f43b4185";

describe("priceBookingFromServerRate", () => {
  it("uses the server rate when a client supplies a lower rate", () => {
    const price = priceBookingFromServerRate({
      startsAt: START,
      endsAt: END,
      serverHourlyRateCents: 3_500,
      clientHourlyRateCents: 100,
    });

    assert.equal(price.ok, true);
    if (!price.ok) return;
    assert.equal(price.hours, 2);
    assert.equal(price.hourlyRateCents, 3_500);
    assert.equal(price.subtotalCents, 7_000);
  });

  for (const [name, startsAt, endsAt] of [
    ["zero", START, START],
    ["negative", END, START],
    [
      "oversized",
      START,
      new Date(
        Date.parse(START) + (MAX_SINGLE_BOOKING_HOURS + 1) * 60 * 60 * 1000,
      ).toISOString(),
    ],
  ] as const) {
    it(`rejects a ${name} duration`, () => {
      const price = priceBookingFromServerRate({
        startsAt,
        endsAt,
        serverHourlyRateCents: 3_500,
      });
      assert.equal(price.ok, false);
    });
  }

  it("uses a deterministic idempotency key for a double-tap request", () => {
    const firstTap = bookingIntentIdempotencyKey(REQUEST_ID);
    const secondTap = bookingIntentIdempotencyKey(REQUEST_ID);

    assert.equal(firstTap, secondTap);
    assert.equal(firstTap, `booking-intent-${REQUEST_ID}`);
  });
});
