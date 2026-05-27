/**
 * Pure handler for GET /api/m/bookings/[id]/tasks.
 *
 * The route resolves auth + builds a thin Supabase adapter; this module
 * handles ordering, authorisation checks (seeker / carer / admin), and
 * the 404 / 403 / 200 outcomes — so tests can drive it with a stubbed
 * client (same convention as upcoming-handler, register-handler, etc.).
 */
import { NextResponse } from "next/server";
import type { BookingTaskRow, ApiBookingTasksResponse } from "./types";

/** Minimal booking row we need to check authorisation. */
export type BookingPartyRow = {
  id: string;
  seeker_id: string;
  caregiver_id: string;
};

/**
 * Thin DB shape so we don't drag in @supabase/supabase-js types.
 * `getBooking` returns `null` if the booking doesn't exist (→ 404).
 * `listTasks` returns the ordered rows for the booking.
 * `isAdmin` does the RPC / role lookup the route adapter wires up.
 */
export type ListTasksClient = {
  getBooking(
    bookingId: string,
  ): Promise<{ data: BookingPartyRow | null; error: { message: string } | null }>;
  listTasks(
    bookingId: string,
  ): Promise<{
    data: BookingTaskRow[] | null;
    error: { message: string } | null;
  }>;
  isAdmin(userId: string): Promise<boolean>;
};

export type HandleListInput = {
  user_id: string;
  booking_id: string;
  client: ListTasksClient;
};

export async function handleListTasks(
  input: HandleListInput,
): Promise<NextResponse<ApiBookingTasksResponse | { error: string }>> {
  const { user_id, booking_id, client } = input;

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

  const isParty =
    booking.data.seeker_id === user_id ||
    booking.data.caregiver_id === user_id;
  if (!isParty) {
    const adminOverride = await client.isAdmin(user_id);
    if (!adminOverride) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const tasks = await client.listTasks(booking_id);
  if (tasks.error) {
    return NextResponse.json(
      { error: "Failed to load tasks" },
      { status: 500 },
    );
  }

  return NextResponse.json({ tasks: tasks.data ?? [] }, { status: 200 });
}
