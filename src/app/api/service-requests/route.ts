import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodePostcode } from "@/lib/mapbox/server";

export const dynamic = "force-dynamic";

const ALLOWED_VERTICALS = new Set([
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
]);

type CreateBody = {
  service_type?: string;
  starts_at?: string;
  ends_at?: string;
  hourly_rate_cents?: number;
  currency?: string;
  location_city?: string;
  location_country?: string;
  location_postcode?: string;
  notes?: string;
};

function isISOString(s: string | undefined): s is string {
  return (
    typeof s === "string" && !Number.isNaN(Date.parse(s))
  );
}

/**
 * POST /api/service-requests
 *
 * Seeker creates an open request. Geocodes the postcode (when given) so
 * carers can see distance. The row enters the open job board for any
 * carer in range to claim within 24 hours (default `expires_at`).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const service_type = String(body.service_type ?? "").trim();
  if (!ALLOWED_VERTICALS.has(service_type)) {
    return NextResponse.json({ error: "invalid_service_type" }, { status: 400 });
  }
  if (!isISOString(body.starts_at) || !isISOString(body.ends_at)) {
    return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  }
  const startsAt = new Date(body.starts_at);
  const endsAt = new Date(body.ends_at);
  if (endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }
  const hours = Math.round(
    ((endsAt.getTime() - startsAt.getTime()) / 3600_000) * 100,
  ) / 100;

  const hourly = Number(body.hourly_rate_cents);
  if (!Number.isInteger(hourly) || hourly <= 0) {
    return NextResponse.json(
      { error: "invalid_hourly_rate" },
      { status: 400 },
    );
  }

  const currency = String(body.currency ?? "").toLowerCase();
  if (currency !== "gbp" && currency !== "usd") {
    return NextResponse.json({ error: "invalid_currency" }, { status: 400 });
  }

  const country =
    body.location_country === "US" || body.location_country === "GB"
      ? body.location_country
      : null;
  const city =
    typeof body.location_city === "string" && body.location_city.trim()
      ? body.location_city.trim().slice(0, 80)
      : null;
  const postcode =
    typeof body.location_postcode === "string" &&
    body.location_postcode.trim()
      ? body.location_postcode.trim().slice(0, 20)
      : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim().slice(0, 2000)
      : null;

  // Geocode the postcode if we have one — falls back to no service_point.
  let servicePointWkt: string | null = null;
  let resolvedCity: string | null = city;
  if (postcode) {
    const geo = await geocodePostcode(postcode, country ?? "GB");
    if (geo) {
      // PostGIS expects lng,lat order in WKT.
      servicePointWkt = `SRID=4326;POINT(${geo.lng} ${geo.lat})`;
      if (!resolvedCity && geo.city) resolvedCity = geo.city;
    }
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("service_requests")
    .insert({
      seeker_id: user.id,
      service_type,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      hours,
      hourly_rate_cents: hourly,
      currency,
      location_city: resolvedCity,
      location_country: country,
      location_postcode: postcode,
      service_point: servicePointWkt,
      notes,
    })
    .select(
      "id, service_type, starts_at, ends_at, hours, hourly_rate_cents, currency, location_city, location_country, location_postcode, status, expires_at, created_at",
    )
    .single();
  if (error || !inserted) {
    console.error("[service-requests] insert failed", error);
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ request: inserted });
}
