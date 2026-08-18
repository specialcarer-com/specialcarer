import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { createStripeRefund } from "@/lib/payments/refund-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bookings/[id]/refund
 *
 * Creates a Stripe refund and records its request. Booking status remains
 * unchanged here: Stripe's webhook is the authoritative confirmation.
 *
 * Body: { reason?: string, amount_cents?: number }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const reason =
    typeof p.reason === "string" ? p.reason.trim().slice(0, 500) : null;
  const requestedAmount =
    p.amount_cents === undefined ? undefined : Number(p.amount_cents);
  if (
    requestedAmount !== undefined &&
    (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0)
  ) {
    return NextResponse.json({ error: "invalid_refund_amount" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, stripe_refund_id, refund_request_key, refunded_amount_cents",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      stripe_refund_id: string | null;
      refund_request_key: string | null;
      refunded_amount_cents: number | null;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (booking.stripe_refund_id || booking.refund_request_key) {
    return NextResponse.json(
      {
        error: "refund_already_requested",
        refund_id: booking.stripe_refund_id,
        amount_cents: booking.refunded_amount_cents,
      },
      { status: 409 },
    );
  }

  const { data: payment } = await admin
    .from("payments")
    .select("stripe_payment_intent_id, amount_cents")
    .eq("booking_id", id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{
      stripe_payment_intent_id: string;
      amount_cents: number;
    }>();
  if (!payment) {
    return NextResponse.json({ error: "payment_not_found" }, { status: 400 });
  }

  const amountCents = requestedAmount ?? payment.amount_cents;
  if (amountCents > payment.amount_cents) {
    return NextResponse.json({ error: "invalid_refund_amount" }, { status: 400 });
  }
  const requestKey = `refund-${booking.id}-${me.id}-${amountCents}`;

  // Claim the booking before touching Stripe. This is a compare-and-set
  // operation; a concurrent refund request receives a 409 instead.
  const { data: claim, error: claimError } = await admin
    .from("bookings")
    .update({
      refund_request_key: requestKey,
    })
    .eq("id", id)
    .is("stripe_refund_id", null)
    .is("refund_request_key", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claim) {
    return NextResponse.json(
      { error: "refund_already_requested" },
      { status: 409 },
    );
  }

  let refund;
  try {
    refund = await createStripeRefund(
      {
        booking: {
          id: booking.id,
          stripeRefundId: null,
          refundRequestKey: null,
        },
        payment: {
          stripePaymentIntentId: payment.stripe_payment_intent_id,
          amountCents: payment.amount_cents,
        },
        adminId: me.id,
        amountCents,
        reason,
      },
      stripe,
    );
  } catch (err) {
    await admin
      .from("bookings")
      .update({ refund_request_key: null })
      .eq("id", id)
      .eq("refund_request_key", requestKey);
    console.error("[admin.refund] Stripe refund failed", err);
    return NextResponse.json(
      { error: "stripe_refund_failed" },
      { status: 502 },
    );
  }
  if (!refund.ok) {
    await admin
      .from("bookings")
      .update({ refund_request_key: null })
      .eq("id", id)
      .eq("refund_request_key", requestKey);
    return NextResponse.json({ error: refund.error }, { status: refund.status });
  }

  const { error: persistError } = await admin
    .from("bookings")
    .update({
      stripe_refund_id: refund.refundId,
      refunded_amount_cents: refund.amountCents,
      refund_reason: reason,
      refunded_at: new Date().toISOString(),
      refunded_by_admin_id: me.id,
    })
    .eq("id", id)
    .eq("refund_request_key", requestKey);
  if (persistError) {
    console.error("[admin.refund] refund persistence failed", persistError);
    return NextResponse.json({ error: "refund_record_failed" }, { status: 500 });
  }

  await logAdminAction({
    admin: me,
    action: "booking.refund_requested",
    targetType: "booking",
    targetId: id,
    details: { reason, amount_cents: refund.amountCents, stripe_refund_id: refund.refundId },
  });

  return NextResponse.json({
    ok: true,
    refund_id: refund.refundId,
    status: "processing",
  });
}
