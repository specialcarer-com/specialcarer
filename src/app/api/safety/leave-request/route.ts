import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVE_BOOKING_STATUSES,
  LEAVE_REQUEST_REASONS,
  type LeaveRequestReason,
} from "@/lib/safety/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/safety/leave-request
 * Body: { bookingId, reason, description, replacementNeeded }
 * Allowed only when the booking belongs to the carer AND the booking
 * is currently in an active state (paid / in_progress).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const bookingId = typeof p.bookingId === "string" ? p.bookingId : "";
  const reason = p.reason;
  const description = typeof p.description === "string" ? p.description : "";
  const replacementNeeded =
    typeof p.replacementNeeded === "boolean" ? p.replacementNeeded : true;

  if (!bookingId) {
    return NextResponse.json({ error: "missing_booking" }, { status: 400 });
  }
  if (
    typeof reason !== "string" ||
    !(LEAVE_REQUEST_REASONS as readonly string[]).includes(reason)
  ) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }
  const trimmed = description.trim();
  if (trimmed.length < 10 || trimmed.length > 2000) {
    return NextResponse.json(
      { error: "description_length", message: "Description must be 10–2000 characters." },
      { status: 400 },
    );
  }

  // Confirm the caller is the carer on the booking AND it is active.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, caregiver_id, status")
    .eq("id", bookingId)
    .maybeSingle<{ id: string; caregiver_id: string | null; status: string }>();
  if (!booking) {
    return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
  }
  if (booking.caregiver_id !== user.id) {
    return NextResponse.json({ error: "not_the_carer" }, { status: 403 });
  }
  if (
    !(ACTIVE_BOOKING_STATUSES as readonly string[]).includes(booking.status)
  ) {
    return NextResponse.json(
      {
        error: "booking_not_active",
        message: "Leave requests are only allowed during an active shift.",
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      carer_user_id: user.id,
      booking_id: bookingId,
      reason: reason as LeaveRequestReason,
      description: trimmed,
      replacement_needed: replacementNeeded,
    })
    .select("id, status, created_at")
    .single();
  if (error || !data) {
    // Surface the partial-unique-index conflict cleanly.
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "already_open", message: "You already have an open leave request for this booking." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ request: data });
}
