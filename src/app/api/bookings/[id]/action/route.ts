import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings/[id]/action  { action: "cancel" | "decline" | "start" }
 *
 * - cancel  : seeker cancels (any pre-shift state). If paid, refund.
 * - decline : caregiver declines a pending/accepted booking. If paid, refund.
 * - start   : caregiver marks a paid booking as in_progress (when they arrive).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { action } = (await req.json()) as { action?: string };
  if (!["cancel", "decline", "start"].includes(action ?? "")) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const isSeeker = booking.seeker_id === user.id;
  const isCaregiver = booking.caregiver_id === user.id;
  if (!isSeeker && !isCaregiver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "cancel" || action === "decline") {
    if (action === "cancel" && !isSeeker) {
      return NextResponse.json({ error: "Only seeker can cancel" }, { status: 403 });
    }
    if (action === "decline" && !isCaregiver) {
      return NextResponse.json({ error: "Only caregiver can decline" }, { status: 403 });
    }
    if (!["pending", "accepted", "paid"].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot ${action} a booking in status ${booking.status}` },
        { status: 400 },
      );
    }

    // Track when the carer declined for the response-time metric.
    const isDeclineByCarer = action === "decline" && isCaregiver;

    // If paid (manual capture authorized), cancel the PaymentIntent to release the hold
    if (booking.status === "paid" || booking.paid_at) {
      const { data: payment } = await admin
        .from("payments")
        .select("stripe_payment_intent_id, status")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (payment?.stripe_payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
          await admin
            .from("payments")
            .update({ status: "cancelled" })
            .eq("booking_id", bookingId);
        } catch (err) {
          console.error("PI cancel failed", err);
        }
      }
    }

    const now = new Date().toISOString();
    await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: now,
        // Only stamp declined_at on a carer-initiated decline
        // (not on a seeker cancel) — drives the response-time metric.
        ...(isDeclineByCarer && !booking.declined_at
          ? { declined_at: now }
          : {}),
        updated_at: now,
      })
      .eq("id", bookingId);

    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (action === "start") {
    if (!isCaregiver) {
      return NextResponse.json(
        { error: "Only caregiver can start a shift" },
        { status: 403 },
      );
    }
    if (!["paid", "accepted"].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot start a booking in status ${booking.status}` },
        { status: 400 },
      );
    }
    const startNow = new Date().toISOString();
    await admin
      .from("bookings")
      .update({
        status: "in_progress",
        // Capture true arrival time for the on-time metric. Only sets
        // on the first start to keep the value honest if the shift
        // is paused/resumed in future.
        ...(booking.actual_started_at
          ? {}
          : { actual_started_at: startNow }),
        updated_at: startNow,
      })
      .eq("id", bookingId);
    return NextResponse.json({ ok: true, status: "in_progress" });
  }

  return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
}
