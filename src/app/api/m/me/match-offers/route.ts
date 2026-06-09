/**
 * GET /api/m/me/match-offers
 *
 * Lists the caller carer's pending auto-match offers (gap 17), enriched with
 * the booking's schedule + location so the carer can decide. Only pending,
 * unexpired offers are returned. Admin client is used to read the booking
 * rows (RLS would otherwise hide bookings the carer isn't yet party to);
 * scoped strictly to offers that belong to this carer.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export type CarerMatchOffer = {
  offer_id: string;
  booking_id: string;
  score: number;
  expires_at: string;
  service_type: string | null;
  starts_at: string | null;
  ends_at: string | null;
  hours: number | null;
  hourly_rate_cents: number | null;
  currency: string | null;
  location_city: string | null;
  seeker_first_name: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: rawOffers, error } = await admin
    .from("booking_match_offers")
    .select("id, booking_id, score, expires_at, status")
    .eq("carer_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("score", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const offers = rawOffers ?? [];
  if (offers.length === 0) {
    return NextResponse.json({ offers: [] as CarerMatchOffer[] });
  }

  const bookingIds = offers.map((o) => o.booking_id as string);
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, seeker_id, service_type, starts_at, ends_at, hours, hourly_rate_cents, currency, location_city",
    )
    .in("id", bookingIds);
  const bookingById = new Map(
    (bookings ?? []).map((b) => [b.id as string, b]),
  );

  // Seeker first names (best-effort, for a friendlier card).
  const seekerIds = Array.from(
    new Set(
      (bookings ?? [])
        .map((b) => b.seeker_id as string | null)
        .filter((s): s is string => Boolean(s)),
    ),
  );
  const nameById = new Map<string, string | null>();
  if (seekerIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", seekerIds);
    for (const p of profs ?? []) {
      const full = (p.full_name as string | null) ?? null;
      const first = full ? full.trim().split(/\s+/)[0] : null;
      nameById.set(p.id as string, first);
    }
  }

  const enriched: CarerMatchOffer[] = offers.map((o) => {
    const b = bookingById.get(o.booking_id as string);
    const seekerId = (b?.seeker_id as string | null) ?? null;
    return {
      offer_id: o.id as string,
      booking_id: o.booking_id as string,
      score: Number(o.score ?? 0),
      expires_at: o.expires_at as string,
      service_type: (b?.service_type as string | null) ?? null,
      starts_at: (b?.starts_at as string | null) ?? null,
      ends_at: (b?.ends_at as string | null) ?? null,
      hours: b?.hours != null ? Number(b.hours) : null,
      hourly_rate_cents:
        b?.hourly_rate_cents != null ? Number(b.hourly_rate_cents) : null,
      currency: (b?.currency as string | null) ?? null,
      location_city: (b?.location_city as string | null) ?? null,
      seeker_first_name: seekerId ? (nameById.get(seekerId) ?? null) : null,
    };
  });

  return NextResponse.json({ offers: enriched });
}
