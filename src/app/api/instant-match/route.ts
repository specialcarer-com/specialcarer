import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidPostcode,
  normalisePostcode,
  inferCountryFromPostcode,
  type Country,
} from "@/lib/care/postcode";
import { geocodePostcode } from "@/lib/mapbox/server";

export const dynamic = "force-dynamic";

const SERVICE_KEYS = new Set([
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
]);

export type InstantMatchCard = {
  user_id: string;
  display_name: string | null;
  city: string | null;
  photo_url: string | null;
  rating_avg: number | null;
  hourly_rate_cents: number | null;
  currency: string | null;
  distance_m: number;
  distance_km: number;
  min_notice_minutes: number;
  eta_minutes_estimate: number;
};

/**
 * POST /api/instant-match
 * {
 *   postcode: string,
 *   country?: "GB"|"US",   // optional override; otherwise inferred
 *   service_type: string,  // one of the 5 verticals
 *   starts_at: ISO,
 *   ends_at: ISO,
 *   max_results?: number   // default 5
 * }
 *
 * Returns: { matches: InstantMatchCard[] } sorted by distance ascending.
 * Anonymous-callable on purpose so a logged-out family can preview matches
 * before signing up. The actual booking still requires auth + Stripe.
 */
export async function POST(req: Request) {
  type Body = {
    postcode?: string;
    country?: Country;
    service_type?: string;
    starts_at?: string;
    ends_at?: string;
    max_results?: number;
  };
  const body = (await req.json()) as Body;

  if (!body.postcode || !body.service_type || !body.starts_at || !body.ends_at) {
    return NextResponse.json(
      { error: "postcode, service_type, starts_at, ends_at are required" },
      { status: 400 },
    );
  }
  if (!SERVICE_KEYS.has(body.service_type)) {
    return NextResponse.json(
      { error: "Invalid service_type" },
      { status: 400 },
    );
  }

  const country: Country | null =
    body.country === "GB" || body.country === "US"
      ? body.country
      : inferCountryFromPostcode(body.postcode);
  if (!country || !isValidPostcode(body.postcode, country)) {
    return NextResponse.json(
      { error: "Invalid postcode for selected country" },
      { status: 400 },
    );
  }
  const normalised = normalisePostcode(body.postcode, country);
  if (!normalised) {
    return NextResponse.json(
      { error: "Invalid postcode for selected country" },
      { status: 400 },
    );
  }

  const startsAt = new Date(body.starts_at);
  const endsAt = new Date(body.ends_at);
  if (
    isNaN(startsAt.getTime()) ||
    isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return NextResponse.json(
      { error: "Invalid time range" },
      { status: 400 },
    );
  }

  let geo;
  try {
    geo = await geocodePostcode(normalised, country);
  } catch {
    geo = null;
  }
  if (!geo) {
    return NextResponse.json(
      { error: "Could not resolve postcode location" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("find_instant_match", {
    origin_lng: geo.lng,
    origin_lat: geo.lat,
    p_service_type: body.service_type,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_country: country,
    p_max_results: Math.max(
      1,
      Math.min(25, Number(body.max_results) || 5),
    ),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as Array<{
    user_id: string;
    display_name: string | null;
    city: string | null;
    photo_url: string | null;
    rating_avg: number | null;
    hourly_rate_cents: number | null;
    currency: string | null;
    distance_m: number;
    min_notice_minutes: number;
  }> | null) ?? [];

  // Rough ETA: assume 30 km/h average urban driving + a 5-minute buffer.
  // We're not pretending this is a real-time route — it's a friendly hint
  // for the booking card. Carers always confirm exact ETA in chat.
  const matches: InstantMatchCard[] = rows.map((r) => {
    const distance_km = r.distance_m / 1000;
    return {
      ...r,
      distance_m: r.distance_m,
      distance_km: Math.round(distance_km * 10) / 10,
      eta_minutes_estimate: Math.max(5, Math.round((distance_km / 30) * 60) + 5),
    };
  });

  return NextResponse.json({
    ok: true,
    origin: { postcode: normalised, country, lat: geo.lat, lng: geo.lng },
    matches,
  });
}
