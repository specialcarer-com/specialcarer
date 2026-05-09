import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clientFeeCents,
  totalChargedCents,
} from "@/lib/fees/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/service-requests/[id]/claim
 *
 * Carer claims an open request. Atomic flow:
 *   1. Read the request with the admin (service-role) client.
 *   2. Reject if not 'open' or expired. If already claimed by THIS carer,
 *      return the existing booking_id (idempotent re-tap from a flaky
 *      network).
 *   3. Insert a `bookings` row in 'accepted' state with no PaymentIntent
 *      yet — the seeker will pay separately via the existing
 *      /api/stripe/create-booking-intent flow. Carer fee % already
 *      lives on the row via the config helpers; we mirror them so
 *      payouts compute cleanly when the seeker pays.
 *   4. Update the service_request: status='claimed', claimed_by, etc.
 *
 * NB: we don't use `select … for update` because supabase-js doesn't
 * expose row locks; the unique-claim invariant is enforced by the
 * status='open' check in the UPDATE filter, so a double-claim race
 * surfaces as `already_claimed`.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: req0 } = await admin
    .from("service_requests")
    .select(
      "id, seeker_id, service_type, starts_at, ends_at, hours, hourly_rate_cents, currency, location_city, location_country, location_postcode, notes, status, expires_at, claimed_by, booking_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!req0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Idempotent: same carer re-tapping after a flaky network gets the
  // booking they already created.
  if (req0.status === "claimed" && req0.claimed_by === user.id && req0.booking_id) {
    return NextResponse.json({ booking_id: req0.booking_id, idempotent: true });
  }

  if (req0.status !== "open") {
    return NextResponse.json(
      { error: "already_claimed_or_cancelled" },
      { status: 409 },
    );
  }
  if (new Date(req0.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  if (req0.seeker_id === user.id) {
    return NextResponse.json(
      { error: "cannot_claim_own_request" },
      { status: 400 },
    );
  }

  const subtotalCents = Math.round(
    Number(req0.hours) * Number(req0.hourly_rate_cents),
  );
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const platformFeeCents = clientFeeCents(subtotalCents);
  const totalCents = totalChargedCents(subtotalCents);

  const acceptedAt = new Date().toISOString();
  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .insert({
      seeker_id: req0.seeker_id,
      caregiver_id: user.id,
      status: "accepted",
      accepted_at: acceptedAt,
      starts_at: req0.starts_at,
      ends_at: req0.ends_at,
      hours: req0.hours,
      hourly_rate_cents: req0.hourly_rate_cents,
      subtotal_cents: subtotalCents,
      platform_fee_cents: platformFeeCents,
      total_cents: totalCents,
      currency: req0.currency,
      service_type: req0.service_type,
      notes: req0.notes,
      location_city: req0.location_city,
      location_country: req0.location_country,
      location_postcode: req0.location_postcode,
    })
    .select("id")
    .single();
  if (bErr || !booking) {
    return NextResponse.json(
      { error: bErr?.message ?? "Could not create booking" },
      { status: 500 },
    );
  }

  // Race-safe claim: only flips to 'claimed' if it's still 'open'.
  const { data: updated, error: uErr } = await admin
    .from("service_requests")
    .update({
      status: "claimed",
      claimed_by: user.id,
      claimed_at: acceptedAt,
      booking_id: booking.id,
      updated_at: acceptedAt,
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  if (!updated) {
    // Lost the race — roll back the booking we just created.
    await admin.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json(
      { error: "already_claimed_or_cancelled" },
      { status: 409 },
    );
  }

  return NextResponse.json({ booking_id: booking.id });
}
