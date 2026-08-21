import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  stripe,
} from "@/lib/stripe/server";
import {
  isValidPostcode,
  normalisePostcode,
  inferCountryFromPostcode,
} from "@/lib/care/postcode";
import { geocodePostcode } from "@/lib/mapbox/server";
import { applyCreditToBooking } from "@/lib/referrals/redemption";
import { isDesignatedPayerEnabled } from "@/lib/family/designated-payer-flag";
import {
  resolveBookingPayer,
  type PayerChargeAdapter,
} from "@/lib/family/designated-payer-charge";
import {
  bookingIntentIdempotencyKey,
  isClientRequestId,
  priceBookingFromServerRate,
} from "@/lib/bookings/server-pricing";
import { retrievePaymentIntent } from "@/lib/payments/payment-intent-retrieval";

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
 *   client_request_id: UUID,
 *   currency: "gbp" | "usd",
 *   service_type: string,
 *   notes?: string,
 *   location_city?: string,
 *   location_country?: "GB" | "US",
 * }
 *
 * `hours` and `hourly_rate_cents` are accepted only for backwards-compatible
 * clients and are ignored. Duration and price are server-authoritative.
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
    client_request_id?: string;
    /** @deprecated Server derives duration from starts_at and ends_at. */
    hours?: number;
    /** @deprecated Server loads the caregiver's published rate. */
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
    "client_request_id",
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
  if (!isClientRequestId(body.client_request_id)) {
    return NextResponse.json(
      { error: "client_request_id must be a UUID" },
      { status: 400 },
    );
  }
  // SpecialCarer is a single-currency UK business: every booking, payment
  // intent and stored row settles in GBP regardless of any stale carer-side
  // currency the client may forward.
  const bookingCurrency = "gbp" as const;
  if (body.caregiver_id === user.id) {
    return NextResponse.json(
      { error: "You cannot book yourself" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // A retry must retrieve the original PaymentIntent rather than creating
  // another booking or authorisation. The unique index added in this PR is
  // the concurrency backstop for two requests arriving at the same time.
  const { data: existingBooking, error: existingBookingError } = await admin
    .from("bookings")
    .select(
      "id, total_cents, platform_fee_cents, currency, stripe_payment_intent_id",
    )
    .eq("seeker_id", user.id)
    .eq("client_request_id", body.client_request_id)
    .maybeSingle<{
      id: string;
      total_cents: number;
      platform_fee_cents: number;
      currency: string;
      stripe_payment_intent_id: string | null;
    }>();
  if (existingBookingError) {
    console.error(
      "[create-booking-intent] idempotency booking lookup failed",
      existingBookingError,
    );
    return NextResponse.json({ error: "database_error" }, { status: 503 });
  }
  if (existingBooking) {
    const { data: existingPayment, error: existingPaymentError } = await admin
      .from("payments")
      .select("stripe_payment_intent_id, amount_cents")
      .eq("booking_id", existingBooking.id)
      .maybeSingle<{
        stripe_payment_intent_id: string;
        amount_cents: number;
      }>();
    if (existingPaymentError) {
      console.error(
        "[create-booking-intent] idempotency payment lookup failed",
        existingPaymentError,
      );
      return NextResponse.json({ error: "database_error" }, { status: 503 });
    }
    if (existingPayment) {
      const retrievedIntent = await retrievePaymentIntent(
        stripe,
        existingPayment.stripe_payment_intent_id,
      );
      if (!retrievedIntent.ok) {
        console.error(
          "[create-booking-intent] existing PaymentIntent lookup failed",
          retrievedIntent.error,
        );
        return NextResponse.json(
          { error: "Payment initialisation is pending; retry the booking" },
          { status: 502 },
        );
      }
      const existingIntent = retrievedIntent.intent;
      return NextResponse.json({
        booking_id: existingBooking.id,
        client_secret: existingIntent.client_secret,
        total_cents: existingBooking.total_cents,
        platform_fee_cents: existingBooking.platform_fee_cents,
        referral_credit_applied_cents: Math.max(
          0,
          existingBooking.total_cents - existingPayment.amount_cents,
        ),
        amount_due_cents: existingPayment.amount_cents,
        currency: existingBooking.currency,
        idempotent: true,
      });
    }
    if (existingBooking.stripe_payment_intent_id) {
      const retrievedIntent = await retrievePaymentIntent(
        stripe,
        existingBooking.stripe_payment_intent_id,
      );
      if (!retrievedIntent.ok) {
        console.error(
          "[create-booking-intent] existing PaymentIntent recovery failed",
          retrievedIntent.error,
        );
        return NextResponse.json(
          { error: "Payment initialisation is pending; retry the booking" },
          { status: 502 },
        );
      }
      const existingIntent = retrievedIntent.intent;
      const destination =
        typeof existingIntent.transfer_data?.destination === "string"
          ? existingIntent.transfer_data.destination
          : existingIntent.transfer_data?.destination?.id;
      if (!destination) {
        return NextResponse.json(
          { error: "Payment initialisation is pending; retry the booking" },
          { status: 503 },
        );
      }
      const { error: restorePaymentError } = await admin
        .from("payments")
        .upsert(
          {
            booking_id: existingBooking.id,
            stripe_payment_intent_id: existingIntent.id,
            status: "requires_payment_method",
            amount_cents: existingIntent.amount,
            application_fee_cents: existingIntent.application_fee_amount ?? 0,
            currency: existingIntent.currency,
            destination_account_id: destination,
            raw: existingIntent as unknown as Record<string, unknown>,
          },
          { onConflict: "stripe_payment_intent_id" },
        );
      if (!restorePaymentError) {
        return NextResponse.json({
          booking_id: existingBooking.id,
          client_secret: existingIntent.client_secret,
          total_cents: existingBooking.total_cents,
          platform_fee_cents: existingBooking.platform_fee_cents,
          referral_credit_applied_cents: Math.max(
            0,
            existingBooking.total_cents - existingIntent.amount,
          ),
          amount_due_cents: existingIntent.amount,
          currency: existingBooking.currency,
          idempotent: true,
        });
      }
    }
    return NextResponse.json(
      { error: "Payment initialisation is pending; retry the booking" },
      { status: 503 },
    );
  }

  // Verify caregiver has a Stripe account that can receive transfers
  const { data: caregiverStripe, error: caregiverStripeError } = await admin
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("user_id", body.caregiver_id!)
    .maybeSingle();
  if (caregiverStripeError) {
    console.error(
      "[create-booking-intent] caregiver Stripe account lookup failed",
      caregiverStripeError,
    );
    return NextResponse.json({ error: "database_error" }, { status: 503 });
  }
  if (!caregiverStripe) {
    return NextResponse.json(
      { error: "Caregiver has not completed payment setup" },
      { status: 400 }
    );
  }

  // Verify caregiver has cleared all required background checks for their country
  const { data: caregiverProfile, error: caregiverProfileError } = await admin
    .from("profiles")
    .select("country")
    .eq("id", body.caregiver_id!)
    .maybeSingle();
  if (caregiverProfileError) {
    console.error(
      "[create-booking-intent] caregiver profile lookup failed",
      caregiverProfileError,
    );
    return NextResponse.json({ error: "database_error" }, { status: 503 });
  }
  const cgCountry = (caregiverProfile?.country as "GB" | "US") || "GB";
  const { data: caregiverRate, error: caregiverRateError } = await admin
    .from("caregiver_profiles")
    .select("hourly_rate_cents, updated_at")
    .eq("user_id", body.caregiver_id!)
    .maybeSingle<{
      hourly_rate_cents: number | null;
      updated_at: string | null;
    }>();
  if (caregiverRateError) {
    console.error(
      "[create-booking-intent] caregiver rate lookup failed",
      caregiverRateError,
    );
    return NextResponse.json({ error: "database_error" }, { status: 503 });
  }
  const pricing = priceBookingFromServerRate({
    startsAt: body.starts_at!,
    endsAt: body.ends_at!,
    serverHourlyRateCents: caregiverRate?.hourly_rate_cents ?? Number.NaN,
    clientHourlyRateCents: body.hourly_rate_cents,
  });
  if (!pricing.ok) {
    return NextResponse.json({ error: pricing.error }, { status: 400 });
  }
  const requiredChecks =
    cgCountry === "US"
      ? ["us_criminal", "us_healthcare_sanctions"]
      : ["enhanced_dbs_barred", "right_to_work", "digital_id"];
  const { data: bgRows, error: bgRowsError } = await admin
    .from("background_checks")
    .select("check_type, status")
    .eq("user_id", body.caregiver_id!)
    .eq("status", "cleared");
  if (bgRowsError) {
    console.error(
      "[create-booking-intent] caregiver checks lookup failed",
      bgRowsError,
    );
    return NextResponse.json({ error: "database_error" }, { status: 503 });
  }
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
      const { data: ownedRows, error: ownedRowsError } = await admin
        .from("household_recipients")
        .select("id")
        .eq("owner_id", user.id)
        .in("id", requested);
      if (ownedRowsError) {
        console.error(
          "[create-booking-intent] recipient ownership lookup failed",
          ownedRowsError,
        );
        return NextResponse.json({ error: "database_error" }, { status: 503 });
      }
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

  const {
    hours,
    hourlyRateCents,
    subtotalCents,
    platformFeeCents,
    totalCents,
  } = pricing;

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
      starts_at: pricing.startsAt,
      ends_at: pricing.endsAt,
      hours,
      hourly_rate_cents: hourlyRateCents,
      rate_version: `caregiver_profiles:${caregiverRate?.updated_at ?? "unknown"}`,
      client_request_id: body.client_request_id,
      subtotal_cents: subtotalCents,
      platform_fee_cents: platformFeeCents,
      total_cents: totalCents,
      currency: bookingCurrency,
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
  if (bookingError?.code === "23505") {
    // A concurrent request won the unique client_request_id race. Tell the
    // caller to retry so the top-of-route idempotency lookup returns it.
    return NextResponse.json(
      { error: "Booking request is already being processed; retry shortly" },
      { status: 409 },
    );
  }
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

  // Designated Payer (gap 31): when the flag is on and the booking already
  // names a designated payer in the seeker's household, charge that payer's
  // saved payment method off-session instead of the seeker. With the flag off
  // this resolves to a no-op and the legacy seeker-confirms flow is untouched.
  const payerChargeAdapter: PayerChargeAdapter = {
    async getSavedPaymentMethod(payerUserId) {
      const { data: sub, error: subscriptionLookupError } = await admin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", payerUserId)
        .not("stripe_customer_id", "is", null)
        .limit(1)
        .maybeSingle<{ stripe_customer_id: string | null }>();
      if (subscriptionLookupError) {
        throw new Error("designated payer subscription lookup failed");
      }
      const customerId = sub?.stripe_customer_id;
      if (!customerId) return null;
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) return null;
        const defaultPm =
          customer.invoice_settings?.default_payment_method;
        const paymentMethodId =
          typeof defaultPm === "string" ? defaultPm : defaultPm?.id ?? null;
        if (!paymentMethodId) return null;
        return { stripeCustomerId: customerId, paymentMethodId };
      } catch (err) {
        console.warn(
          "[designated-payer] failed to load payer payment method",
          err,
        );
        return null;
      }
    },
  };
  const designatedPayerFlagOn = isDesignatedPayerEnabled();
  let payerResolution;
  try {
    payerResolution = await resolveBookingPayer({
      seekerId: user.id,
      designatedPayerUserId:
        (booking as { designated_payer_user_id?: string | null })
          .designated_payer_user_id ?? null,
      flagEnabled: designatedPayerFlagOn,
      adapter: payerChargeAdapter,
    });
  } catch (err) {
    console.error(
      "[create-booking-intent] designated payer lookup failed",
      err,
    );
    return NextResponse.json({ error: "database_error" }, { status: 503 });
  }

  // Create PaymentIntent with manual capture — funds held in escrow
  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: intentAmount,
      currency: bookingCurrency,
      capture_method: "manual",
      application_fee_amount: intentApplicationFee,
      transfer_data: {
        destination: caregiverStripe.stripe_account_id,
      },
      metadata: {
        booking_id: booking.id,
        seeker_id: user.id,
        caregiver_id: body.caregiver_id!,
        // Only stamp the payer audit field when the feature is live so the
        // PaymentIntent is byte-identical to legacy when the flag is off.
        ...(designatedPayerFlagOn
          ? { charged_user_id: payerResolution.chargedUserId }
          : {}),
      },
      ...(payerResolution.override
        ? {
            customer: payerResolution.override.customer,
            payment_method: payerResolution.override.payment_method,
            off_session: payerResolution.override.off_session,
            confirm: payerResolution.override.confirm,
          }
        : { automatic_payment_methods: { enabled: true } }),
    }, {
      idempotencyKey: bookingIntentIdempotencyKey(body.client_request_id),
    });
  } catch (err) {
    // Keep the draft for reconciliation. Deleting here could lose the link
    // to an intent Stripe accepted just before a network failure.
    console.error("[create-booking-intent] Stripe PaymentIntent failed", err);
    return NextResponse.json(
      { error: "Could not initialise payment; retry the booking" },
      { status: 502 },
    );
  }

  const { error: intentLinkError } = await admin
    .from("bookings")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", booking.id);
  if (intentLinkError) {
    console.error("[create-booking-intent] intent link persistence failed", intentLinkError);
    return NextResponse.json(
      { error: "Payment initialisation is pending; retry the booking" },
      { status: 503 },
    );
  }

  const { error: paymentError } = await admin.from("payments").insert({
    booking_id: booking.id,
    stripe_payment_intent_id: intent.id,
    status: "requires_payment_method",
    amount_cents: intentAmount,
    application_fee_cents: intentApplicationFee,
    currency: bookingCurrency,
    destination_account_id: caregiverStripe.stripe_account_id,
    raw: intent as unknown as Record<string, unknown>,
  });
  if (paymentError) {
    // Keep the booking and idempotent Stripe PaymentIntent together for the
    // retry path above; deleting only one side would make reconciliation
    // impossible. Return a retryable response rather than claiming success.
    console.error("[create-booking-intent] payment persistence failed", paymentError);
    return NextResponse.json(
      { error: "Payment initialisation is pending; retry the booking" },
      { status: 503 },
    );
  }

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
        currency: bookingCurrency,
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
    currency: bookingCurrency,
  });
}
