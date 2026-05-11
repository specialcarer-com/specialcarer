import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings/[id]/timesheet/payments/[payment_id]/retry
 *
 * Returns a fresh `client_secret` for a supplemental timesheet PaymentIntent
 * still in `requires_payment_method` / `requires_confirmation` /
 * `requires_action` state. Used by the resume-payment flow when the seeker
 * bails out of the Elements step and returns from the retry email link.
 *
 * Auth: seeker or org owner/admin of the booking. Read-only call to Stripe
 * (`paymentIntents.retrieve`) — never re-creates a PI.
 */
export async function POST(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; payment_id: string }>;
  },
) {
  const { id: bookingId, payment_id: paymentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Auth check: same rules as /timesheet/approve — seeker or org owner/admin.
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, organization_id, booking_source")
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      organization_id: string | null;
      booking_source: string;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
  }

  let authorised = false;
  if (booking.booking_source === "org") {
    if (booking.organization_id) {
      const { data: member } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", booking.organization_id)
        .eq("user_id", user.id)
        .maybeSingle<{ role: string }>();
      authorised = !!member && ["owner", "admin"].includes(member.role);
    }
  } else {
    authorised = booking.seeker_id === user.id;
  }
  if (!authorised) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: payment } = await admin
    .from("payments")
    .select("id, booking_id, stripe_payment_intent_id, kind, amount_cents, currency, status")
    .eq("id", paymentId)
    .maybeSingle<{
      id: string;
      booking_id: string;
      stripe_payment_intent_id: string;
      kind: string;
      amount_cents: number;
      currency: string;
      status: string;
    }>();
  if (!payment || payment.booking_id !== bookingId) {
    return NextResponse.json({ error: "payment_not_found" }, { status: 404 });
  }
  // Refuse anything that isn't a supplemental timesheet PI.
  if (!["overage", "overtime", "tip"].includes(payment.kind)) {
    return NextResponse.json({ error: "not_retriable" }, { status: 400 });
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(
      payment.stripe_payment_intent_id,
    );
    // Already past needing client action — nothing to do.
    if (
      pi.status === "succeeded" ||
      pi.status === "requires_capture" ||
      pi.status === "canceled"
    ) {
      return NextResponse.json({
        ok: true,
        already_resolved: true,
        payment_id: payment.id,
        status: pi.status,
        kind: payment.kind,
        amount_cents: payment.amount_cents,
        currency: payment.currency,
        client_secret: null,
        payment_intent_id: pi.id,
      });
    }
    if (!pi.client_secret) {
      return NextResponse.json(
        { error: "no_client_secret" },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      already_resolved: false,
      payment_id: payment.id,
      kind: payment.kind,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      client_secret: pi.client_secret,
      payment_intent_id: pi.id,
    });
  } catch (e) {
    console.error("[timesheet.retry] retrieve failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "stripe_error" },
      { status: 500 },
    );
  }
}
