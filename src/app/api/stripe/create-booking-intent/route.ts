import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  stripe,
  calculatePlatformFeeCents,
  calculateTotalCents,
} from "@/lib/stripe/server";
import {
  isValidPostcode,
  normalisePostcode,
  inferCountryFromPostcode,
} from "@/lib/care/postcode";
import { geocodePostcode } from "@/lib/mapbox/server";
import { applyCreditToBooking } from "@/lib/referrals/redemption";

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

  type BookingPreferences = {
    genders?: string[];
    require_driver?: boolean;
    require_vehicle?: boolean;
    required_certifications?: string[];
    required_languages?: string[];
    tags?: string[];
  };
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
    location_postcode?: string;
    recipient_ids?: string[];
    preferences?: BookingPreferences;
    is_instant?: boolean;
    // Referral credit (optional). Server-enforces 50% cap and balance;
    // value passed here is treated as a "requested cents", capped down.
    referral_credit_cents?: number;
  };
  const body = (await req.json()) as BookingBody;

  // Sanitise booking preferences — stored as jsonb on the booking so we
  // have an audit trail of what the seeker required at request time.
  // Validation here is intentionally lenient: this is a record of intent,
  // not an enforcement gate. Length caps prevent abuse.
  function sanitisePrefs(p?: BookingPreferences): Record<string, unknown> {
    if (!p || typeof p !== "object") return {};
    const cleanArr = (a: unknown, max: number, len: number): string[] => {
      if (!Array.isArray(a)) return [];
      return Array.from(
        new Set(
          a
            .filter((s): s is string => typeof s === "string")
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && s.length <= len),
        ),
      ).slice(0, max);
    };
    return {
      genders: cleanArr(p.genders, 4, 30),
      require_driver: !!p.require_driver,
      require_vehicle: !!p.require_vehicle,
      required_certifications: cleanArr(p.required_certifications, 16, 60),
      required_languages: cleanArr(p.required_languages, 5, 30),
      tags: cleanArr(p.tags, 8, 30),
    };
  }

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

  // Create booking in 'accepted' state — payment is the next gate.
  // Stamp accepted_at so the response-time metric counts this booking;
  // the request-to-accept latency is effectively 0 in the auto-accept
  // model, which is honest given the carer pre-set their availability.
  const acceptedAt = new Date().toISOString();
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .insert({
      seeker_id: user.id,
      caregiver_id: body.caregiver_id!,
      status: "accepted",
      accepted_at: acceptedAt,
      starts_at: body.starts_at!,
      ends_at: body.ends_at!,
      hours: body.hours!,
      hourly_rate_cents: body.hourly_rate_cents!,
      subtotal_cents: subtotalCents,
      platform_fee_cents: platformFeeCents,
      total_cents: totalCents,
      currency: body.currency,
      service_type: body.service_type!,
      // Smart-default photo consent. Care for older / clinical /
      // postnatal recipients defaults ON (families want updates),
      // childcare / special-needs default OFF (privacy by default —
      // family can opt in from the tracker page).
      photo_updates_consent:
        body.service_type === "elderly_care" ||
        body.service_type === "postnatal" ||
        body.service_type === "complex_care",
      notes: body.notes,
      location_city: body.location_city,
      location_country: body.location_country,
      ...(body.location_postcode && (() => {
        const trimmed = String(body.location_postcode).trim();
        const targetCountry =
          body.location_country === "GB" || body.location_country === "US"
            ? body.location_country
            : inferCountryFromPostcode(trimmed);
        if (targetCountry && isValidPostcode(trimmed, targetCountry)) {
          return true;
        }
        return false;
      })()
        ? {
            location_postcode: normalisePostcode(
              body.location_postcode!.trim(),
              (body.location_country === "GB" || body.location_country === "US"
                ? body.location_country
                : inferCountryFromPostcode(body.location_postcode!.trim())) as
                | "GB"
                | "US",
            ),
          }
        : {}),
      recipient_ids: recipientIds,
      preferences: {
        ...sanitisePrefs(body.preferences),
        ...(body.is_instant ? { is_instant: true } : {}),
      },
    })
    .select()
    .single();
  if (bookingError || !booking) {
    return NextResponse.json(
      { error: bookingError?.message ?? "Booking creation failed" },
      { status: 500 }
    );
  }

  // Best-effort: geocode the booking postcode to a service_point so we can
  // do distance-based matching and route the carer on the day. Soft-fails.
  if (body.location_postcode) {
    try {
      const trimmed = String(body.location_postcode).trim();
      const targetCountry =
        body.location_country === "GB" || body.location_country === "US"
          ? body.location_country
          : inferCountryFromPostcode(trimmed);
      if (targetCountry && isValidPostcode(trimmed, targetCountry)) {
        const normalised = normalisePostcode(trimmed, targetCountry);
        if (normalised) {
        const geo = await geocodePostcode(normalised, targetCountry);
        if (geo) {
          await admin
            .from("bookings")
            // service_point is a geography(Point,4326) column — supabase-js
            // generated types don't know about it, so we cast.
            .update({
              service_point: `SRID=4326;POINT(${geo.lng} ${geo.lat})`,
            } as unknown as Record<string, unknown>)
            .eq("id", booking.id);
        }
        }
      }
    } catch {
      // soft-fail; booking already created
    }
  }

  // Apply referral credit (if any) BEFORE creating the PaymentIntent so
  // the seeker's authorisation amount is reduced. The booking row's
  // `total_cents` deliberately stays at the full pre-credit value — the
  // carer payout pipeline reads that. Only the PI amount and Stripe
  // application_fee are adjusted to absorb the discount on platform side.
  let appliedCreditCents = 0;
  if (
    typeof body.referral_credit_cents === "number" &&
    body.referral_credit_cents > 0
  ) {
    try {
      const credit = await applyCreditToBooking({
        supabase: admin,
        bookingId: booking.id,
        userId: user.id,
        requestedCents: body.referral_credit_cents,
      });
      if (credit.ok) {
        appliedCreditCents = credit.value.appliedCents;
      } else {
        console.warn(
          "[create-booking-intent] credit apply failed:",
          credit.error.code,
          credit.error.message,
        );
      }
    } catch (err) {
      console.error("[create-booking-intent] credit apply threw", err);
    }
  }
  const intentAmount = totalCents - appliedCreditCents;
  // Application fee scales with the seeker payment — platform absorbs the
  // credit, so the platform fee is reduced by min(fee, credit). Carer
  // still receives the full pre-credit subtotal on capture/transfer.
  const intentApplicationFee = Math.max(
    0,
    platformFeeCents - appliedCreditCents,
  );

  // Create PaymentIntent with manual capture — funds held in escrow
  const intent = await stripe.paymentIntents.create({
    amount: intentAmount,
    currency: body.currency,
    capture_method: "manual",
    application_fee_amount: intentApplicationFee,
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
    amount_cents: intentAmount,
    application_fee_cents: intentApplicationFee,
    currency: body.currency,
    destination_account_id: caregiverStripe.stripe_account_id,
    raw: intent as unknown as Record<string, unknown>,
  });

  // Instant bookings: notify the carer right away (best-effort, soft-fail).
  // The booking is in `accepted` state; the seeker still has to authorize
  // payment to confirm — but for instant we want the carer to start
  // preparing immediately.
  if (body.is_instant) {
    try {
      const { notifyCarerInstantBooking } = await import(
        "@/lib/care/instant-notify"
      );
      await notifyCarerInstantBooking({
        bookingId: booking.id,
        caregiverId: body.caregiver_id!,
        seekerId: user.id,
        startsAt: body.starts_at!,
        endsAt: body.ends_at!,
        serviceType: body.service_type!,
        locationCity: body.location_city,
        totalCents,
        currency: body.currency,
      });
    } catch (err) {
      console.error("[instant-notify] failed", err);
    }
  }

  return NextResponse.json({
    booking_id: booking.id,
    client_secret: intent.client_secret,
    total_cents: totalCents,
    platform_fee_cents: platformFeeCents,
    referral_credit_applied_cents: appliedCreditCents,
    amount_due_cents: intentAmount,
    currency: body.currency,
  });
}
