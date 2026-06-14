/**
 * Pure handlers for the Designated Payer routes (gap 31):
 *   GET  /api/m/bookings/[id]/designated-payer
 *   POST /api/m/bookings/[id]/designated-payer
 *
 * The route resolves auth + builds a thin Supabase adapter; these functions
 * own the flag gate, authorisation (seeker-only writes), household validation
 * and the status-code outcomes — so tests drive them with a stubbed client
 * (same convention as booking-tasks/list-handler.ts).
 */
import { NextResponse } from "next/server";
import {
  listHouseholdAdults,
  type HouseholdClient,
  type HouseholdMember,
} from "./household";

/** Minimal booking row we need for authorisation + current payer. */
export type DesignatedPayerBookingRow = {
  id: string;
  seeker_id: string;
  designated_payer_user_id: string | null;
};

export type DesignatedPayerClient = HouseholdClient & {
  getBooking(bookingId: string): Promise<{
    data: DesignatedPayerBookingRow | null;
    error: { message: string } | null;
  }>;
  setDesignatedPayer(
    bookingId: string,
    payerUserId: string | null,
  ): Promise<{ error: { message: string } | null }>;
};

export type GetDesignatedPayerResponse = {
  designatedPayerUserId: string | null;
  designatedPayerName: string | null;
  isFlagEnabled: boolean;
  /** Household adults eligible to be set as payer (seeker first). */
  householdAdults: HouseholdMember[];
};

const FEATURE_DISABLED = { error: "feature disabled" } as const;

export type HandleGetInput = {
  user_id: string;
  booking_id: string;
  flagEnabled: boolean;
  client: DesignatedPayerClient;
};

export async function handleGetDesignatedPayer(
  input: HandleGetInput,
): Promise<NextResponse> {
  const { user_id, booking_id, flagEnabled, client } = input;

  if (!flagEnabled) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const booking = await client.getBooking(booking_id);
  if (booking.error) {
    return NextResponse.json(
      { error: "Failed to load booking" },
      { status: 500 },
    );
  }
  if (!booking.data) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Only the booking's seeker may view/manage the payer. Don't reveal
  // existence to non-seekers.
  if (booking.data.seeker_id !== user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { members, error: hhError } = await listHouseholdAdults(
    booking.data.seeker_id,
    client,
  );
  if (hhError) {
    return NextResponse.json(
      { error: "Failed to load household" },
      { status: 500 },
    );
  }

  const payerId = booking.data.designated_payer_user_id;
  const payerName = payerId
    ? members.find((m) => m.user_id === payerId)?.display_name ??
      (await client.getUserName(payerId))
    : null;

  const body: GetDesignatedPayerResponse = {
    designatedPayerUserId: payerId,
    designatedPayerName: payerName,
    isFlagEnabled: true,
    householdAdults: members,
  };
  return NextResponse.json(body, { status: 200 });
}

export type HandleSetInput = {
  user_id: string;
  booking_id: string;
  payerUserId: unknown;
  flagEnabled: boolean;
  client: DesignatedPayerClient;
};

export async function handleSetDesignatedPayer(
  input: HandleSetInput,
): Promise<NextResponse> {
  const { user_id, booking_id, payerUserId, flagEnabled, client } = input;

  if (!flagEnabled) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  // Body validation: payerUserId must be a non-empty string or null.
  if (payerUserId !== null && typeof payerUserId !== "string") {
    return NextResponse.json(
      { error: "payerUserId must be a string or null" },
      { status: 400 },
    );
  }
  if (typeof payerUserId === "string" && payerUserId.trim().length === 0) {
    return NextResponse.json(
      { error: "payerUserId cannot be empty" },
      { status: 400 },
    );
  }
  const payer: string | null =
    typeof payerUserId === "string" ? payerUserId.trim() : null;

  const booking = await client.getBooking(booking_id);
  if (booking.error) {
    return NextResponse.json(
      { error: "Failed to load booking" },
      { status: 500 },
    );
  }
  if (!booking.data) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  // Only the seeker can set the payer.
  if (booking.data.seeker_id !== user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { members, error: hhError } = await listHouseholdAdults(
    booking.data.seeker_id,
    client,
  );
  if (hhError) {
    return NextResponse.json(
      { error: "Failed to validate household" },
      { status: 500 },
    );
  }

  // Validate household membership (unless clearing the payer).
  if (payer !== null && !members.some((m) => m.user_id === payer)) {
    return NextResponse.json(
      { error: "Payer must be an adult in the same household" },
      { status: 400 },
    );
  }

  const upd = await client.setDesignatedPayer(booking_id, payer);
  if (upd.error) {
    return NextResponse.json(
      { error: "Failed to update designated payer" },
      { status: 500 },
    );
  }

  const payerName = payer
    ? members.find((m) => m.user_id === payer)?.display_name ?? null
    : null;

  const body: GetDesignatedPayerResponse = {
    designatedPayerUserId: payer,
    designatedPayerName: payerName,
    isFlagEnabled: true,
    householdAdults: members,
  };
  return NextResponse.json(body, { status: 200 });
}

export type { HouseholdMember };
