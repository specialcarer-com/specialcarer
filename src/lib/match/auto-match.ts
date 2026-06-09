import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankCandidates, type Candidate, type RankedOffer } from "./ranker";

export type { Candidate, RankedOffer } from "./ranker";
export { rankCandidates } from "./ranker";

/**
 * Auto-match top-N carers for a booking (gap 17).
 *
 * Given a booking, build a candidate pool, score each carer with the
 * shared scorer, take the top N, persist them as booking_match_offers, and
 * push each carer a job offer. Returns the created offers (descending score).
 *
 * Distance: uses the existing PostGIS `caregivers_within_radius` RPC
 * (Mapbox-geocoded home_point), not Google Maps. No PostGIS code added.
 */

const TOP_N = 5;
// "Now" bookings expire fast; scheduled get an hour.
const NOW_EXPIRY_MIN = 10;
const SCHEDULED_EXPIRY_MIN = 60;
// Pool radius: online carers cap at their own radius; for scheduled we use
// a generous default since they don't need to be live right now.
const SCHEDULED_DEFAULT_RADIUS_KM = 10;
const NOW_ONLINE_STALE_MIN = 30;

export type AutoMatchBooking = {
  id: string;
  seeker_id: string;
  service_type: string | null;
  starts_at: string;
  origin_lng: number | null;
  origin_lat: number | null;
};

function isNowBooking(startsAt: string, now: number): boolean {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) return false;
  // Treat anything starting within the next 2 hours as a "Now" booking.
  return start - now <= 2 * 60 * 60 * 1000;
}

/**
 * Orchestrates the match: reads the booking, builds + scores the pool,
 * writes offers, and dispatches a push to each matched carer.
 *
 * `dispatchOffer` is injected so the API route (and tests) control push
 * delivery without this module importing the notify chain at module load.
 */
export async function runAutoMatch(
  bookingId: string,
  opts?: {
    now?: number;
    dispatchOffer?: (args: {
      bookingId: string;
      carerId: string;
      startsAt: string;
    }) => Promise<void> | void;
  },
): Promise<{ offers: RankedOffer[]; poolSize: number }> {
  const admin = createAdminClient();
  const now = opts?.now ?? Date.now();

  // 1. Booking row + geocoded origin.
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, service_type, starts_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    throw new Error("booking_not_found");
  }

  // Origin point for distance. caregivers_within_radius takes lng/lat; we
  // read the booking's service_point via the points RPC pattern is overkill,
  // so derive origin from a lightweight RPC over service_point.
  const { data: originRows } = (await admin.rpc("booking_origin_point", {
    p_booking_id: bookingId,
  })) as unknown as {
    data: { lng: number; lat: number }[] | null;
  };
  const origin = originRows && originRows[0] ? originRows[0] : null;

  const nowBooking = isNowBooking(booking.starts_at as string, now);
  const maxRadiusKm = SCHEDULED_DEFAULT_RADIUS_KM;

  // 2. Candidate pool by geography (within default radius of the booking).
  //    Falls back to "all published" when the booking has no geocoded point.
  let poolIds: string[] = [];
  const distanceById = new Map<string, number>();
  if (origin) {
    const { data: near } = (await admin.rpc("caregivers_within_radius", {
      origin_lng: origin.lng,
      origin_lat: origin.lat,
      radius_m: maxRadiusKm * 1000,
    })) as unknown as {
      data: { user_id: string; distance_m: number }[] | null;
    };
    for (const r of near ?? []) {
      poolIds.push(r.user_id);
      distanceById.set(r.user_id, Number(r.distance_m) / 1000);
    }
  } else {
    const { data: published } = await admin
      .from("caregiver_profiles")
      .select("user_id")
      .eq("is_published", true)
      .limit(200);
    poolIds = (published ?? []).map((r) => r.user_id as string);
  }

  if (poolIds.length === 0) return { offers: [], poolSize: 0 };

  // 3. Profile attributes + vertical match + online gating for "Now".
  const { data: profiles } = await admin
    .from("caregiver_profiles")
    .select(
      "user_id, services, rating_avg, is_published, is_online, last_online_at",
    )
    .in("user_id", poolIds)
    .eq("is_published", true);

  const serviceType = booking.service_type as string | null;
  const staleCutoff = now - NOW_ONLINE_STALE_MIN * 60 * 1000;

  const eligible = (profiles ?? []).filter((p) => {
    // Vertical overlap: requested service must be in the carer's services.
    if (serviceType) {
      const services = (p.services ?? []) as string[];
      if (!services.includes(serviceType)) return false;
    }
    // "Now" bookings require a fresh online carer; scheduled ignore presence.
    if (nowBooking) {
      if (p.is_online !== true) return false;
      const last = p.last_online_at
        ? new Date(p.last_online_at as string).getTime()
        : 0;
      if (!(last >= staleCutoff)) return false;
    }
    return true;
  });

  if (eligible.length === 0) return { offers: [], poolSize: poolIds.length };

  const eligibleIds = eligible.map((p) => p.user_id as string);

  // 4. Track-record signals (response_rate, completion_rate, recency) from
  //    caregiver_stats + offer history. Best-effort; missing → null signal.
  const { data: stats } = await admin
    .from("caregiver_stats")
    .select("caregiver_id, completed_bookings, on_time_rate")
    .in("caregiver_id", eligibleIds);
  const statByCarer = new Map(
    (stats ?? []).map((s) => [s.caregiver_id as string, s]),
  );

  const responseRateById = await loadResponseRates(admin, eligibleIds);

  const candidates: Candidate[] = eligible.map((p) => {
    const cid = p.user_id as string;
    const st = statByCarer.get(cid);
    return {
      carer_id: cid,
      distance_km: distanceById.has(cid) ? distanceById.get(cid)! : null,
      rating: p.rating_avg != null ? Number(p.rating_avg) : null,
      response_rate: responseRateById.get(cid) ?? null,
      // Online carers are "active now"; otherwise use last_online_at.
      last_active_at: (p.last_online_at as string | null) ?? null,
      // Proxy completion via on_time_rate when present (completed shifts
      // that started on time). Documented approximation for v1.
      completion_rate:
        st && st.on_time_rate != null ? Number(st.on_time_rate) : null,
    };
  });

  // 5. Rank + take top N.
  const offers = rankCandidates(candidates, maxRadiusKm, TOP_N, now);
  if (offers.length === 0) return { offers: [], poolSize: poolIds.length };

  // 6. Persist offers (idempotent on (booking_id, carer_id)).
  const expiryMin = nowBooking ? NOW_EXPIRY_MIN : SCHEDULED_EXPIRY_MIN;
  const expiresAt = new Date(now + expiryMin * 60 * 1000).toISOString();
  const rows = offers.map((o) => ({
    booking_id: bookingId,
    carer_id: o.carer_id,
    score: o.score,
    score_breakdown: o.score_breakdown,
    status: "pending",
    offered_at: new Date(now).toISOString(),
    expires_at: expiresAt,
  }));
  await admin
    .from("booking_match_offers")
    .upsert(rows, { onConflict: "booking_id,carer_id" });

  // 7. Push each matched carer a job offer (fire-and-forget).
  const dispatchOffer = opts?.dispatchOffer ?? defaultDispatchOffer;
  await Promise.all(
    offers.map((o) =>
      Promise.resolve(
        dispatchOffer({
          bookingId,
          carerId: o.carer_id,
          startsAt: booking.starts_at as string,
        }),
      ).catch(() => {}),
    ),
  );

  return { offers, poolSize: poolIds.length };
}

/**
 * Response rate = accepted / (accepted + declined + expired) across a
 * carer's prior match offers. Carers with no history get null (neutral).
 */
async function loadResponseRates(
  admin: ReturnType<typeof createAdminClient>,
  carerIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data } = await admin
    .from("booking_match_offers")
    .select("carer_id, status")
    .in("carer_id", carerIds)
    .in("status", ["accepted", "declined", "expired"]);
  const tally = new Map<string, { acc: number; total: number }>();
  for (const r of data ?? []) {
    const cid = r.carer_id as string;
    const t = tally.get(cid) ?? { acc: 0, total: 0 };
    t.total += 1;
    if (r.status === "accepted") t.acc += 1;
    tally.set(cid, t);
  }
  for (const [cid, t] of tally) {
    if (t.total > 0) out.set(cid, t.acc / t.total);
  }
  return out;
}

async function defaultDispatchOffer(args: {
  bookingId: string;
  carerId: string;
  startsAt: string;
}): Promise<void> {
  const { dispatch } = await import("@/lib/push/notify");
  await dispatch({
    type: "job.offered",
    bookingId: args.bookingId,
    carerId: args.carerId,
    startsAt: args.startsAt,
  });
}
