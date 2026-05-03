import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { logAdminAction, type AdminUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bookings/[id]/action
 * Body: { action: "force_release" | "refund" | "mark_disputed", reason?: string }
 *
 * Admin-only. Performs marketplace-ops actions on a booking.
 *  - force_release : capture the PI now (skip the 24h hold). Sets status=paid_out.
 *  - refund        : refund the captured charge. Sets status=refunded.
 *  - mark_disputed : flag a booking for manual review (no Stripe action).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;

  // Auth: must be admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminUser: AdminUser = { id: user.id, email: user.email ?? null };

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = body.action;
  const reason = (body.reason ?? "").trim() || null;

  if (!["force_release", "refund", "mark_disputed"].includes(action ?? "")) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json(
      { error: "Reason is required for admin booking actions." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking)
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // Snapshot for audit
  const snapshot = {
    booking_id: booking.id,
    prior_status: booking.status,
    total_cents: booking.total_cents,
    currency: booking.currency,
    seeker_id: booking.seeker_id,
    caregiver_id: booking.caregiver_id,
  };

  if (action === "mark_disputed") {
    await admin
      .from("bookings")
      .update({ status: "disputed", updated_at: new Date().toISOString() })
      .eq("id", bookingId);
    await logAdminAction({
      admin: adminUser,
      action: "booking.mark_disputed",
      targetType: "booking",
      targetId: bookingId,
      details: { ...snapshot, reason },
    });
    return NextResponse.json({ ok: true, status: "disputed" });
  }

  // For Stripe-touching actions, fetch the payment row
  const { data: payment } = await admin
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!payment?.stripe_payment_intent_id) {
    return NextResponse.json(
      { error: "No PaymentIntent on this booking" },
      { status: 400 },
    );
  }

  if (action === "force_release") {
    if (!["completed", "in_progress", "paid"].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot force-release in status ${booking.status}` },
        { status: 400 },
      );
    }
    try {
      await stripe.paymentIntents.capture(payment.stripe_payment_intent_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "capture failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    await admin
      .from("bookings")
      .update({
        status: "paid_out",
        paid_out_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);
    await logAdminAction({
      admin: adminUser,
      action: "booking.force_release",
      targetType: "booking",
      targetId: bookingId,
      details: { ...snapshot, reason },
    });
    return NextResponse.json({ ok: true, status: "paid_out" });
  }

  if (action === "refund") {
    if (
      !["paid", "in_progress", "completed", "paid_out", "disputed"].includes(
        booking.status,
      )
    ) {
      return NextResponse.json(
        { error: `Cannot refund in status ${booking.status}` },
        { status: 400 },
      );
    }
    try {
      // If captured, refund the charge; if only authorized, cancel the PI.
      if (booking.status === "paid_out") {
        // captured — full refund
        await stripe.refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
        });
      } else {
        // not captured — cancel the PI to release the auth
        await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "refund failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    await admin
      .from("bookings")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);
    await admin
      .from("payments")
      .update({
        status:
          booking.status === "paid_out" ? "refunded" : "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId);
    await logAdminAction({
      admin: adminUser,
      action: "booking.refund",
      targetType: "booking",
      targetId: bookingId,
      details: { ...snapshot, reason },
    });
    return NextResponse.json({ ok: true, status: "refunded" });
  }

  return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
}
