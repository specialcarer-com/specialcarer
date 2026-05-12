import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyCreditToBooking,
  unredeemCreditsForBooking,
  type ApplyCreditError,
} from "@/lib/referrals/redemption";
import { stripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings/[id]/apply-credit  { requestedCents?: number }
 *
 * Applies referral credit to a booking that is still in a pre-payment
 * status. If `requestedCents` is omitted, the maximum allowed (capped at
 * 50% of the booking total or the user's available balance, whichever is
 * lower) is applied.
 *
 * Only the booking's seeker can apply credit. The PaymentIntent amount
 * is recomputed on the next checkout-intent call as
 * `bookings.total_cents - bookings.referral_credit_applied_cents`; the
 * booking's total_cents itself never changes (carer payout invariant).
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

  const body = (await req.json().catch(() => ({}))) as {
    requestedCents?: number;
  };
  if (
    body.requestedCents !== undefined &&
    (typeof body.requestedCents !== "number" ||
      !Number.isFinite(body.requestedCents) ||
      body.requestedCents <= 0)
  ) {
    return NextResponse.json(
      { error: "requestedCents must be a positive integer" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const r = await applyCreditToBooking({
    supabase: admin,
    bookingId,
    userId: user.id,
    requestedCents: body.requestedCents,
  });
  if (!r.ok) return errorResponse(r.error);

  // If a PaymentIntent already exists for this booking, lower its amount
  // and application_fee to reflect the credit. This keeps the seeker's
  // authorisation in sync. Booking.total_cents stays untouched.
  try {
    await syncPaymentIntentAmount({
      admin,
      bookingId,
      newAmountCents: r.value.newTotalCents,
    });
  } catch (err) {
    console.error("[apply-credit] stripe sync failed", err);
  }

  return NextResponse.json({
    ok: true,
    applied_cents: r.value.appliedCents,
    new_total_cents: r.value.newTotalCents,
    consumed_credit_ids: r.value.consumedCreditIds,
  });
}

/**
 * DELETE /api/bookings/[id]/apply-credit
 *
 * Un-applies credit from a pre-payment booking. Restores credits that have
 * not yet expired; resets the booking's applied counter to 0.
 */
export async function DELETE(
  _req: Request,
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

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, status, referral_credit_applied_cents")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.seeker_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Only allow user-initiated un-apply while still pre-payment. Refund-path
  // un-redeem is handled by the cancellation routes / Stripe webhook.
  if (!["pending", "accepted"].includes(booking.status)) {
    return NextResponse.json(
      {
        error: `Cannot remove credit from a booking in status ${booking.status}`,
      },
      { status: 400 },
    );
  }
  if ((booking.referral_credit_applied_cents ?? 0) === 0) {
    return NextResponse.json({ ok: true, restored_cents: 0, restored_credit_ids: [] });
  }

  const r = await unredeemCreditsForBooking({ supabase: admin, bookingId });

  // Restore the PaymentIntent amount to the full booking total.
  try {
    const { data: bookingRow } = await admin
      .from("bookings")
      .select("total_cents")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingRow?.total_cents) {
      await syncPaymentIntentAmount({
        admin,
        bookingId,
        newAmountCents: bookingRow.total_cents as number,
      });
    }
  } catch (err) {
    console.error("[apply-credit:DELETE] stripe sync failed", err);
  }

  return NextResponse.json({
    ok: true,
    restored_cents: r.unredeemedCents,
    restored_credit_ids: r.restoredCreditIds,
  });
}

/**
 * Sync the open PaymentIntent's amount to match a new seeker-facing
 * total. Only attempts the update while the PI is still pre-confirmation
 * (`requires_payment_method` / `requires_confirmation`). Stripe rejects
 * amount updates after authorisation.
 */
async function syncPaymentIntentAmount(args: {
  admin: ReturnType<typeof createAdminClient>;
  bookingId: string;
  newAmountCents: number;
}): Promise<void> {
  const { admin, bookingId, newAmountCents } = args;
  const { data: pay } = await admin
    .from("payments")
    .select("stripe_payment_intent_id, status, application_fee_cents")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!pay?.stripe_payment_intent_id) return;
  if (
    !["requires_payment_method", "requires_confirmation"].includes(
      (pay.status as string) ?? "",
    )
  ) {
    return;
  }
  // Pull the original platform fee so we can reduce it proportionally
  // (platform absorbs the credit; carer payout is preserved).
  const { data: booking } = await admin
    .from("bookings")
    .select("total_cents, platform_fee_cents, referral_credit_applied_cents")
    .eq("id", bookingId)
    .maybeSingle();
  const platformFee = Number(booking?.platform_fee_cents ?? 0);
  const credit = Number(booking?.referral_credit_applied_cents ?? 0);
  const newApplicationFee = Math.max(0, platformFee - credit);
  try {
    await stripe.paymentIntents.update(pay.stripe_payment_intent_id, {
      amount: newAmountCents,
      application_fee_amount: newApplicationFee,
    });
    await admin
      .from("payments")
      .update({
        amount_cents: newAmountCents,
        application_fee_cents: newApplicationFee,
      })
      .eq("stripe_payment_intent_id", pay.stripe_payment_intent_id);
  } catch (err) {
    console.error(
      "[apply-credit] stripe.paymentIntents.update failed",
      err,
    );
  }
}

function errorResponse(err: ApplyCreditError): NextResponse {
  const status =
    err.code === "booking_not_found"
      ? 404
      : err.code === "forbidden"
        ? 403
        : err.code === "already_applied"
          ? 409
          : err.code === "internal"
            ? 500
            : 400;
  return NextResponse.json({ error: err.message, code: err.code }, { status });
}
