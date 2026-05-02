import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, PAYOUT_HOLD_HOURS } from "@/lib/stripe/server";

/**
 * POST /api/stripe/complete-shift
 *
 * Marks a booking as "completed" and starts the 24h payout hold timer.
 * Called by either party (seeker or caregiver) once the shift is done.
 * The actual capture (which releases funds to the caregiver) is performed
 * by a separate cron route (`/api/stripe/release-due-payouts`) once the
 * hold window has elapsed.
 *
 * Body: { booking_id: uuid }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { booking_id } = (await req.json()) as { booking_id?: string };
  if (!booking_id) {
    return NextResponse.json({ error: "Missing booking_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.seeker_id !== user.id && booking.caregiver_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (booking.status !== "paid" && booking.status !== "in_progress") {
    return NextResponse.json(
      { error: `Cannot complete a booking in status ${booking.status}` },
      { status: 400 }
    );
  }

  const now = new Date();
  const eligibleAt = new Date(
    now.getTime() + PAYOUT_HOLD_HOURS * 60 * 60 * 1000
  );

  await admin
    .from("bookings")
    .update({
      status: "completed",
      shift_completed_at: now.toISOString(),
      payout_eligible_at: eligibleAt.toISOString(),
    })
    .eq("id", booking_id);

  return NextResponse.json({
    ok: true,
    payout_eligible_at: eligibleAt.toISOString(),
  });
}

/**
 * POST /api/stripe/release-due-payouts
 * (separate route — called by cron) — captures all completed bookings
 * whose hold window has expired.
 */
export async function PUT() {
  const admin = createAdminClient();
  const { data: due } = await admin
    .from("bookings")
    .select("id, status, payout_eligible_at")
    .eq("status", "completed")
    .lte("payout_eligible_at", new Date().toISOString())
    .limit(50);

  let released = 0;
  for (const b of due ?? []) {
    const { data: payment } = await admin
      .from("payments")
      .select("stripe_payment_intent_id")
      .eq("booking_id", b.id)
      .maybeSingle();
    if (!payment) continue;
    try {
      await stripe.paymentIntents.capture(payment.stripe_payment_intent_id);
      await admin
        .from("bookings")
        .update({
          status: "paid_out",
          paid_out_at: new Date().toISOString(),
        })
        .eq("id", b.id);
      released += 1;
    } catch (err) {
      console.error("capture failed", b.id, err);
    }
  }
  return NextResponse.json({ released, scanned: due?.length ?? 0 });
}
