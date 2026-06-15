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
import {
  reissueIntentForPayer,
  type ReissueAdapter,
} from "./designated-payer-reissue";

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
  /**
   * Optional PaymentIntent re-issue adapter (rollout plan Option B). When
   * provided and a non-null payer is set with the flag on, the handler cancels
   * any pre-charge intent on the booking and re-creates it billed to the payer.
   * Omitted in the pure unit tests that only exercise the column-write path.
   */
  reissue?: ReissueAdapter;
  /** Injectable logger so tests can assert the canary lines. */
  logger?: Pick<typeof console, "warn" | "info" | "error">;
};

export async function handleSetDesignatedPayer(
  input: HandleSetInput,
): Promise<NextResponse> {
  const {
    user_id,
    booking_id,
    payerUserId,
    flagEnabled,
    client,
    reissue,
    logger = console,
  } = input;

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

  const previousPayer = booking.data.designated_payer_user_id;

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

  const base: GetDesignatedPayerResponse = {
    designatedPayerUserId: payer,
    designatedPayerName: payerName,
    isFlagEnabled: true,
    householdAdults: members,
  };

  // Attempt PaymentIntent re-issue (rollout plan Option B). Only when a real
  // payer (not a clear, not the seeker themselves) is set and the route wired
  // a Stripe adapter. Clearing the payer or setting the seeker as payer never
  // re-issues — there is nothing to bill to a different customer.
  const shouldReissue =
    reissue !== undefined && payer !== null && payer !== user_id;

  if (!shouldReissue) {
    logger.info(
      JSON.stringify({
        event: "designated_payer_set",
        bookingId: booking_id,
        seekerId: user_id,
        payerId: payer,
        flagEnabled: true,
        intentReissued: false,
      }),
    );
    return NextResponse.json(base, { status: 200 });
  }

  const result = await reissueIntentForPayer({
    bookingId: booking_id,
    seekerId: user_id,
    payerUserId: payer,
    adapter: reissue!,
    logger,
  });

  if (result.kind === "failed") {
    // Roll back the column so the booking's stored payer matches its intent.
    await client.setDesignatedPayer(booking_id, previousPayer);
    return NextResponse.json(
      {
        error: "Failed to re-issue payment intent",
        phase: result.phase,
        code: result.code,
      },
      { status: 500 },
    );
  }

  logger.info(
    JSON.stringify({
      event: "designated_payer_set",
      bookingId: booking_id,
      seekerId: user_id,
      payerId: payer,
      flagEnabled: true,
      intentReissued: result.kind === "reissued",
    }),
  );

  switch (result.kind) {
    case "reissued":
      return NextResponse.json(
        {
          ...base,
          ok: true,
          intentReissued: true,
          newIntentId: result.newIntentId,
          payerHasPaymentMethod: true,
        },
        { status: 200 },
      );
    case "no_pm":
      return NextResponse.json(
        {
          ...base,
          ok: true,
          intentReissued: false,
          payerHasPaymentMethod: false,
          warning: "payer_no_pm_will_fallback",
        },
        { status: 200 },
      );
    case "already_in_flight":
      return NextResponse.json(
        {
          ...base,
          ok: true,
          intentReissued: false,
          reason: "intent_already_in_flight",
          payerSetForFutureCharges: true,
        },
        { status: 200 },
      );
    case "no_intent":
      return NextResponse.json(
        {
          ...base,
          ok: true,
          intentReissued: false,
          reason: "no_existing_intent",
          payerSetForFutureCharges: true,
        },
        { status: 200 },
      );
  }
}

export type { HouseholdMember };
