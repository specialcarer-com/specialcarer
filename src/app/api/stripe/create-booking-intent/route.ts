import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  stripe,
  calculatePlatformFeeCents,
  calculateTotalCents,
} from "@/lib/stripe/server";

/**
 * POST /api/stripe/create-booking-intent
 *
 * Creates a draft booking + a PaymentIntent in `requires_capture` mode
 * (manual capture). The seeker authorizes the card; funds sit in escrow
 * until the shift is marked complete + 24h hold has elapsed.
 *
 * Body:
 * {
 *   caregiver_id: uuid,
 *   starts_at: ISO,
 *   ends_at: ISO,
 *   hours: number,
 *   hourly_rate_cents: number,
 *   currency: "gbp" | "usd",
 *   service_type: string,
 *   notes?: string,
 *   location_city?: string,
 *   location_country?: "GB" | "US",
 * }
 *
 * Returns: { booking_id, client_secret, total_cents, platform_fee_cents }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  type BookingBody = {
    caregiver_id?: string;
    starts_at?: string;
    ends_at?: string;
    hours?: number;
    hourly_rate_cents?: number;
    currency?: "gbp" | "usd";
    service_type?: string;
    notes?: string;
    location_city?: string;
    location_country?: "GB" | "US";
    recipient_ids?: string[];
  };
  const body = (await req.json()) as BookingBody;

  const required: (keyof BookingBody)[] = [
    "caregiver_id",
    "starts_at",
    "ends_at",
    "hours",
    "hourly_rate_cents",
    "currency",
    "service_type",
  ];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null) {
      return NextResponse.json(
        { error: `Missing field: ${field}` },
        { status: 400 }
      );
    }
  }
  if (body.currency !== "gbp" && body.currency !== "usd") {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }
  if (body.caregiver_id === user.id) {
    return NextResponse.json(
      { error: "You cannot book yourself" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify caregiver has a Stripe account that can receive transfers
  const { data: caregiverStripe } = await admin
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("user_id", body.caregiver_id!)
    .maybeSingle();
  if (!caregiverStripe) {
    return NextResponse.json(
      { error: "Caregiver has not completed payment setup" },
      { status: 400 }
    );
  }

  // Verify caregiver has cleared all required background checks for their country
  const { data: caregiverProfile } = await admin
    .from("profiles")
    .select("country")
    .eq("id", body.caregiver_id!)
    .maybeSingle();
  const cgCountry = (caregiverProfile?.country as "GB" | "US") || "GB";
  const requiredChecks =
    cgCountry === "US"
      ? ["us_criminal", "us_healthcare_sanctions"]
      : ["enhanced_dbs_barred", "right_to_work", "digital_id"];
  const { data: bgRows } = await admin
    .from("background_checks")
    .select("check_type, status")
    .eq("user_id", body.caregiver_id!)
    .eq("status", "cleared");
  const cleared = new Set((bgRows ?? []).map((r) => r.check_type));
  if (!requiredChecks.every((t) => cleared.has(t))) {
    return NextResponse.json(
      { error: "Caregiver is not yet fully verified" },
      { status: 400 }
    );
  }

  // Validate any provided recipient_ids actually belong to the seeker
  let recipientIds: string[] = [];
  if (Array.isArray(body.recipient_ids) && body.recipient_ids.length > 0) {
    const requested = body.recipient_ids.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    if (requested.length > 0) {
      const { data: ownedRows } = await admin
        .from("household_recipients")
        .select("id")
        .eq("owner_id", user.id)
        .in("id", requested);
      const ownedSet = new Set((ownedRows ?? []).map((r) => r.id));
      const allOwned = requested.every((id) => ownedSet.has(id));
      if (!allOwned) {
        return NextResponse.json(
          { error: "One or more recipient_ids are invalid" },
          { status: 400 },
        );
      }
      recipientIds = requested;
    }
  }

  const subtotalCents = Math.round(
    body.hours! * body.hourly_rate_cents!
  );
  const platformFeeCents = calculatePlatformFeeCents(subtotalCents);
  const totalCents = calculateTotalCents(subtotalCents);

  // Create booking in 'accepted' state — payment is the next gate
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .insert({
      seeker_id: user.id,
      caregiver_id: body.caregiver_id!,
      status: "accepted",
      starts_at: body.starts_at!,
      ends_at: body.ends_at!,
      hours: body.hours!,
      hourly_rate_cents: body.hourly_rate_cents!,
      subtotal_cents: subtotalCents,
      platform_fee_cents: platformFeeCents,
      total_cents: totalCents,
      currency: body.currency,
      service_type: body.service_type!,
      notes: body.notes,
      location_city: body.location_city,
      location_country: body.location_country,
      recipient_ids: recipientIds,
    })
    .select()
    .single();
  if (bookingError || !booking) {
    return NextResponse.json(
      { error: bookingError?.message ?? "Booking creation failed" },
      { status: 500 }
    );
  }

  // Create PaymentIntent with manual capture — funds held in escrow
  const intent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: body.currency,
    capture_method: "manual",
    application_fee_amount: platformFeeCents,
    transfer_data: {
      destination: caregiverStripe.stripe_account_id,
    },
    metadata: {
      booking_id: booking.id,
      seeker_id: user.id,
      caregiver_id: body.caregiver_id!,
    },
    automatic_payment_methods: { enabled: true },
  });

  await admin.from("payments").insert({
    booking_id: booking.id,
    stripe_payment_intent_id: intent.id,
    status: "requires_payment_method",
    amount_cents: totalCents,
    application_fee_cents: platformFeeCents,
    currency: body.currency,
    destination_account_id: caregiverStripe.stripe_account_id,
    raw: intent as unknown as Record<string, unknown>,
  });

  return NextResponse.json({
    booking_id: booking.id,
    client_secret: intent.client_secret,
    total_cents: totalCents,
    platform_fee_cents: platformFeeCents,
    currency: body.currency,
  });
}
