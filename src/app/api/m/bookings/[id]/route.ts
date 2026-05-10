import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ApiBookingListItem } from "../route";

export const dynamic = "force-dynamic";

export type ApiBookingPayment = {
  status: string;
  amount_cents: number;
  currency: string;
  stripe_payment_intent_id: string;
};

export type ApiBookingDetail = ApiBookingListItem & {
  accepted_at: string | null;
  location_postcode: string | null;
  subtotal_cents: number;
  platform_fee_cents: number;
  payment: ApiBookingPayment | null;
};

type BookingRow = {
  id: string;
  seeker_id: string;
  caregiver_id: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  hours: number | null;
  hourly_rate_cents: number | null;
  subtotal_cents: number | null;
  platform_fee_cents: number | null;
  total_cents: number | null;
  currency: string | null;
  service_type: string | null;
  location_city: string | null;
  location_country: string | null;
  location_postcode: string | null;
  notes: string | null;
  accepted_at: string | null;
  created_at: string;
};

/**
 * GET /api/m/bookings/[id]
 * Returns a single booking the caller is party to, plus the linked
 * payment row (if any) so the UI can render the auth/capture badge.
 */
export async function GET(
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

  const { data: row, error } = await supabase
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, hourly_rate_cents, subtotal_cents, platform_fee_cents, total_cents, currency, service_type, location_city, location_country, location_postcode, notes, accepted_at, created_at",
    )
    .eq("id", id)
    .maybeSingle<BookingRow>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Only seeker / caregiver may read.
  const isSeeker = row.seeker_id === user.id;
  const isCarer = row.caregiver_id === user.id;
  if (!isSeeker && !isCarer) {
    // Don't reveal existence to non-parties.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Counterparty profiles (one batch each).
  type CarerSummary = {
    display_name: string | null;
    photo_url: string | null;
    city: string | null;
    country: string | null;
  };
  type ProfileSummary = {
    full_name: string | null;
    avatar_url: string | null;
  };
  const counterId = isSeeker ? row.caregiver_id : row.seeker_id;
  let carer: CarerSummary | null = null;
  let prof: ProfileSummary | null = null;
  if (counterId) {
    const [{ data: carerRow }, { data: profRow }] = await Promise.all([
      supabase
        .from("caregiver_profiles")
        .select("display_name, photo_url, city, country")
        .eq("user_id", counterId)
        .maybeSingle<CarerSummary>(),
      supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", counterId)
        .maybeSingle<ProfileSummary>(),
    ]);
    carer = carerRow ?? null;
    prof = profRow ?? null;
  }

  // Payment row (best-effort — payments are 1:1 with booking).
  const { data: payRow } = await supabase
    .from("payments")
    .select(
      "status, amount_cents, currency, stripe_payment_intent_id, created_at",
    )
    .eq("booking_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      status: string;
      amount_cents: number;
      currency: string;
      stripe_payment_intent_id: string;
    }>();

  const cur = (row.currency ?? "gbp").toLowerCase();
  const currency: "gbp" | "usd" = cur === "usd" ? "usd" : "gbp";

  const detail: ApiBookingDetail = {
    id: row.id,
    status: row.status,
    as_role: isSeeker ? "seeker" : "carer",
    starts_at: row.starts_at ?? "",
    ends_at: row.ends_at ?? "",
    hours: Number(row.hours ?? 0),
    hourly_rate_cents: Number(row.hourly_rate_cents ?? 0),
    total_cents: Number(row.total_cents ?? 0),
    currency,
    service_type: row.service_type ?? "",
    location_city: row.location_city,
    location_country: row.location_country,
    notes: row.notes,
    counterparty: {
      user_id: counterId ?? "",
      display_name: carer?.display_name ?? null,
      full_name: prof?.full_name ?? null,
      avatar_url: prof?.avatar_url ?? null,
      photo_url: carer?.photo_url ?? null,
      city: carer?.city ?? null,
      country: carer?.country ?? null,
    },
    created_at: row.created_at,
    accepted_at: row.accepted_at,
    location_postcode: row.location_postcode,
    subtotal_cents: Number(row.subtotal_cents ?? 0),
    platform_fee_cents: Number(row.platform_fee_cents ?? 0),
    payment: payRow
      ? {
          status: payRow.status,
          amount_cents: Number(payRow.amount_cents ?? 0),
          currency: payRow.currency,
          stripe_payment_intent_id: payRow.stripe_payment_intent_id,
        }
      : null,
  };
  return NextResponse.json(detail);
}
