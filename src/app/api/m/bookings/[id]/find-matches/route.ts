/**
 * POST /api/m/bookings/[id]/find-matches
 *
 * Seeker-initiated auto-match (gap 17). Computes the top 5 carer matches
 * for an existing booking, stores them as booking_match_offers, pushes each
 * carer a job offer, and returns the offers enriched with carer card data
 * for the "Finding carers…" UI.
 *
 * V1 design choice: this is a MANUAL endpoint (a "Find carers" action on the
 * booking) rather than being wired into the booking-creation flow. Reason:
 * bookings.caregiver_id is NOT NULL in this schema, so the existing flow
 * always creates a booking with a chosen carer; an automatic hook there
 * would require schema surgery. Exposing find-matches as its own action
 * keeps the change surgical and is the smaller diff. Wiring it into the
 * Now/Schedule flow is a documented follow-up.
 *
 * Auth: caller must be the booking's seeker.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAutoMatch } from "@/lib/match/auto-match";
import type { ScoreBreakdown } from "@/lib/match/scoring";

export const dynamic = "force-dynamic";

/** A match offer enriched with carer card data, as returned to the seeker UI. */
export type MatchOfferCard = {
  carer_id: string;
  score: number;
  score_breakdown: ScoreBreakdown;
  display_name: string | null;
  photo_url: string | null;
  city: string | null;
  rating_avg: number | null;
  rating_count: number;
  proximity: number;
  status: "pending" | "accepted" | "declined" | "expired";
};

export type FindMatchesResponse = {
  offers: MatchOfferCard[];
  count: number;
  pool_size: number;
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership: only the booking's seeker can trigger a match.
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, seeker_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.seeker_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let result;
  try {
    result = await runAutoMatch(bookingId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "match_failed";
    const status = msg === "booking_not_found" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // Enrich offers with carer card data for the seeker UI. Admin client is
  // fine here — we only expose carers we just offered on this booking.
  const admin = createAdminClient();
  const carerIds = result.offers.map((o) => o.carer_id);
  const cardById = new Map<
    string,
    {
      display_name: string | null;
      photo_url: string | null;
      city: string | null;
      rating_avg: number | null;
      rating_count: number | null;
    }
  >();
  if (carerIds.length > 0) {
    const { data: profs } = await admin
      .from("caregiver_profiles")
      .select("user_id, display_name, photo_url, city, rating_avg, rating_count")
      .in("user_id", carerIds);
    for (const p of profs ?? []) {
      cardById.set(p.user_id as string, {
        display_name: p.display_name as string | null,
        photo_url: p.photo_url as string | null,
        city: p.city as string | null,
        rating_avg: p.rating_avg != null ? Number(p.rating_avg) : null,
        rating_count: Number(p.rating_count ?? 0),
      });
    }
  }

  const offers = result.offers.map((o) => {
    const card = cardById.get(o.carer_id);
    const distance = o.score_breakdown.distance;
    return {
      carer_id: o.carer_id,
      score: o.score,
      score_breakdown: o.score_breakdown,
      display_name: card?.display_name ?? null,
      photo_url: card?.photo_url ?? null,
      city: card?.city ?? null,
      rating_avg: card?.rating_avg ?? null,
      rating_count: card?.rating_count ?? 0,
      // Surface a coarse proximity hint (0..1) without leaking exact km.
      proximity: Math.round(distance * 100) / 100,
      status: "pending" as const,
    };
  });

  return NextResponse.json({
    offers,
    count: offers.length,
    pool_size: result.poolSize,
  });
}
