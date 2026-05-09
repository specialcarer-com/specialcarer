import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TIP_MAX_CENTS,
  TIP_MIN_CENTS,
} from "@/lib/reviews/types";

export const dynamic = "force-dynamic";

type TipBody = {
  amount_cents?: number;
  currency?: string;
};

const ALLOWED_CURRENCIES = new Set(["GBP", "USD"]);

/**
 * POST /api/bookings/[id]/tip
 *   { amount_cents: 100..50000, currency: 'GBP' | 'USD' }
 *
 * Creates a 0%-fee Stripe PaymentIntent that transfers directly to the
 * caregiver's connected account. Inserts a `tips` row in 'created'
 * state; the Stripe webhook flips it to 'succeeded' when the payment
 * confirms client-side.
 *
 * Only the seeker of a completed/paid_out booking can tip.
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

  let body: TipBody;
  try {
    body = (await req.json()) as TipBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const amount = Number(body.amount_cents);
  const currency = String(body.currency ?? "").toUpperCase();
  if (!Number.isInteger(amount) || amount < TIP_MIN_CENTS || amount > TIP_MAX_CENTS) {
    return NextResponse.json(
      { error: `Tip must be between ${TIP_MIN_CENTS} and ${TIP_MAX_CENTS} cents` },
      { status: 400 },
    );
  }
  if (!ALLOWED_CURRENCIES.has(currency)) {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, caregiver_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.seeker_id !== user.id) {
    return NextResponse.json(
      { error: "Only the booking seeker can tip" },
      { status: 403 },
    );
  }
  if (!["completed", "paid_out"].includes(booking.status)) {
    return NextResponse.json(
      { error: "Tips open after the shift completes" },
      { status: 400 },
    );
  }

  const { data: caregiverStripe } = await admin
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id, charges_enabled")
    .eq("user_id", booking.caregiver_id)
    .maybeSingle();
  if (!caregiverStripe?.stripe_account_id) {
    return NextResponse.json(
      { error: "Caregiver cannot receive tips yet" },
      { status: 400 },
    );
  }

  // 0% platform fee on tips — every penny goes to the carer.
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    application_fee_amount: 0,
    transfer_data: { destination: caregiverStripe.stripe_account_id },
    metadata: {
      kind: "tip",
      booking_id: booking.id,
      seeker_id: user.id,
      caregiver_id: booking.caregiver_id,
    },
    automatic_payment_methods: { enabled: true },
  });

  const { data: inserted, error } = await admin
    .from("tips")
    .insert({
      booking_id: booking.id,
      payer_id: user.id,
      caregiver_id: booking.caregiver_id,
      amount_cents: amount,
      currency,
      stripe_payment_intent_id: intent.id,
      status: "created",
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[tip] insert failed", error);
    return NextResponse.json(
      { error: "Failed to record tip" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    tip_id: inserted.id,
    client_secret: intent.client_secret,
  });
}
