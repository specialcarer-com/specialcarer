import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgBooking } from "@/lib/org/booking-types";
import { computeCarerPayTotalCents } from "@/lib/stripe/invoicing";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/org/bookings/[id]/offers/[offerId]/respond
 *
 * Called by the CARER to accept or decline an offer.
 *
 * Body: { action: 'accept' | 'decline' }
 *
 * On accept:
 *   - First-accept wins: mark this offer 'accepted', decline all others
 *   - Update booking: status = 'accepted', caregiver_id = caller, accepted_at = now
 *
 * On decline:
 *   - Mark this offer 'declined'
 *   - If no more pending offers remain, booking reverts to 'pending_offer'
 *     so ops can redistribute
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; offerId: string }> }
) {
  const { id: bookingId, offerId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action } = (await req.json()) as { action: "accept" | "decline" };
  if (!["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the offer belongs to this carer
  const { data: offer } = await admin
    .from("org_booking_offers")
    .select("*")
    .eq("id", offerId)
    .eq("booking_id", bookingId)
    .eq("carer_id", user.id)
    .maybeSingle();

  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  if (offer.status !== "pending") {
    return NextResponse.json({ error: `Offer is already ${offer.status}` }, { status: 400 });
  }
  if (new Date(offer.expires_at) < new Date()) {
    await admin
      .from("org_booking_offers")
      .update({ status: "expired", responded_at: new Date().toISOString() })
      .eq("id", offerId);
    return NextResponse.json({ error: "Offer has expired" }, { status: 410 });
  }

  const now = new Date().toISOString();

  if (action === "decline") {
    await admin
      .from("org_booking_offers")
      .update({ status: "declined", responded_at: now })
      .eq("id", offerId);

    // Check if any pending offers remain
    const { count } = await admin
      .from("org_booking_offers")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId)
      .eq("status", "pending");

    if ((count ?? 0) === 0) {
      // No more pending offers; revert to pending_offer for redistribution
      await admin
        .from("bookings")
        .update({ status: "pending_offer" })
        .eq("id", bookingId);
    }

    return NextResponse.json({ ok: true, action: "declined" });
  }

  // Accept — first-accept wins
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (!["offered", "pending_offer"].includes(booking.status)) {
    return NextResponse.json(
      { error: `Booking is no longer available (status: ${booking.status})` },
      { status: 409 }
    );
  }

  // Compute carer pay if not already set
  const carerPayCents =
    booking.carer_pay_total_cents ??
    computeCarerPayTotalCents(booking as OrgBooking);

  // Accept this offer; decline all others atomically
  await admin
    .from("org_booking_offers")
    .update({ status: "accepted", responded_at: now })
    .eq("id", offerId);

  await admin
    .from("org_booking_offers")
    .update({ status: "cancelled", responded_at: now })
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .neq("id", offerId);

  // Lock in the carer on the booking
  await admin
    .from("bookings")
    .update({
      status: "accepted",
      caregiver_id: user.id,
      accepted_at: now,
      carer_pay_total_cents: carerPayCents,
    })
    .eq("id", bookingId);

  return NextResponse.json({ ok: true, action: "accepted" });
}
