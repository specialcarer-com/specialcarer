import {
  platformTakeCents,
  totalChargedCents,
} from "@/lib/fees/config";

export const MAX_SINGLE_BOOKING_HOURS = 24;
const MILLIS_PER_HOUR = 60 * 60 * 1000;

export type BookingPricingInput = {
  startsAt: string;
  endsAt: string;
  serverHourlyRateCents: number;
  /**
   * Present only to make it explicit that legacy clients may still send a
   * rate. It is deliberately ignored: the server-owned rate is authoritative.
   */
  clientHourlyRateCents?: number;
};

export type BookingPricing =
  | {
      ok: true;
      startsAt: string;
      endsAt: string;
      hours: number;
      hourlyRateCents: number;
      subtotalCents: number;
      platformFeeCents: number;
      totalCents: number;
    }
  | { ok: false; error: string };

/**
 * Derive every monetary input from server-controlled data and timestamps.
 * `hours` is rounded to the two decimal places supported by bookings.hours.
 */
export function priceBookingFromServerRate(
  input: BookingPricingInput,
): BookingPricing {
  const startsAtMs = Date.parse(input.startsAt);
  const endsAtMs = Date.parse(input.endsAt);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
    return { ok: false, error: "Invalid booking timestamps" };
  }

  const durationMs = endsAtMs - startsAtMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, error: "Booking end time must be after start time" };
  }
  if (durationMs > MAX_SINGLE_BOOKING_HOURS * MILLIS_PER_HOUR) {
    return {
      ok: false,
      error: `A single booking cannot exceed ${MAX_SINGLE_BOOKING_HOURS} hours`,
    };
  }

  const hours = Math.round((durationMs / MILLIS_PER_HOUR) * 100) / 100;
  if (!Number.isFinite(hours) || hours <= 0) {
    return { ok: false, error: "Booking duration must be positive" };
  }

  const hourlyRateCents = Math.round(input.serverHourlyRateCents);
  if (!Number.isFinite(hourlyRateCents) || hourlyRateCents <= 0) {
    return { ok: false, error: "Caregiver does not have a valid bookable rate" };
  }

  const subtotalCents = Math.round(hours * hourlyRateCents);
  const platformFeeCents = platformTakeCents(subtotalCents);
  const totalCents = totalChargedCents(subtotalCents);
  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    return { ok: false, error: "Booking total must be positive" };
  }

  return {
    ok: true,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    hours,
    hourlyRateCents,
    subtotalCents,
    platformFeeCents,
    totalCents,
  };
}

export function isClientRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function bookingIntentIdempotencyKey(clientRequestId: string): string {
  return `booking-intent-${clientRequestId}`;
}
