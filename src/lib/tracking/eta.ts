/**
 * ETA helpers for the live booking tracker.
 *
 * Caches the most recent Mapbox Directions duration on
 * `shift_tracking_sessions` so we don't hammer the Directions API while
 * the seeker page polls every minute. One fetch per booking per 60 s.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const ETA_FRESH_MS = 60_000;

type Coord = { lng: number; lat: number };

type EtaResult = {
  eta_seconds: number | null;
  eta_calculated_at: string | null;
  refreshed: boolean;
};

function mapboxToken(): string {
  return (
    process.env.MAPBOX_SERVER_TOKEN ||
    process.env.MAPBOX_SECRET_TOKEN ||
    process.env.MAPBOX_PUBLIC_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    ""
  );
}

/**
 * Returns a cached ETA if it was calculated within the last 60 s,
 * otherwise refreshes via Mapbox Directions and updates the session row.
 *
 * Called by `/api/tracking/[bookingId]/eta`. Both the carer's most
 * recent ping and the booking's destination point need to be available;
 * if either is missing we return `eta_seconds = null` instead of
 * erroring so the UI just hides the countdown.
 */
export async function fetchAndCacheETA(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  bookingId: string,
): Promise<EtaResult> {
  const { data: sessionRow } = await admin
    .from("shift_tracking_sessions")
    .select(
      "id, eta_seconds, eta_calculated_at, eta_destination_lng, eta_destination_lat",
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      eta_seconds: number | null;
      eta_calculated_at: string | null;
      eta_destination_lng: number | null;
      eta_destination_lat: number | null;
    }>();

  if (!sessionRow) {
    return { eta_seconds: null, eta_calculated_at: null, refreshed: false };
  }

  // Cache hit?
  if (sessionRow.eta_calculated_at) {
    const ageMs =
      Date.now() - new Date(sessionRow.eta_calculated_at).getTime();
    if (ageMs < ETA_FRESH_MS) {
      return {
        eta_seconds: sessionRow.eta_seconds,
        eta_calculated_at: sessionRow.eta_calculated_at,
        refreshed: false,
      };
    }
  }

  // Need to refresh — find latest position + destination.
  const from = await latestCarerPosition(admin, bookingId);
  const to = await destinationPoint(admin, bookingId, sessionRow);

  const token = mapboxToken();
  if (!from || !to || !token || token.startsWith("stub_")) {
    return {
      eta_seconds: sessionRow.eta_seconds,
      eta_calculated_at: sessionRow.eta_calculated_at,
      refreshed: false,
    };
  }

  let etaSeconds: number | null = null;
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?access_token=${encodeURIComponent(token)}&overview=false`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as {
        routes?: { duration?: number }[];
      };
      const dur = json.routes?.[0]?.duration;
      if (typeof dur === "number" && Number.isFinite(dur)) {
        etaSeconds = Math.round(dur);
      }
    }
  } catch (e) {
    console.error("[eta] mapbox directions failed", e);
  }

  const calculatedAt = new Date().toISOString();
  await admin
    .from("shift_tracking_sessions")
    .update({
      eta_seconds: etaSeconds,
      eta_calculated_at: calculatedAt,
      eta_destination_lng: to.lng,
      eta_destination_lat: to.lat,
    })
    .eq("id", sessionRow.id);

  return {
    eta_seconds: etaSeconds,
    eta_calculated_at: calculatedAt,
    refreshed: true,
  };
}

async function latestCarerPosition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  bookingId: string,
): Promise<Coord | null> {
  const { data } = await admin
    .from("carer_positions")
    .select("lat, lng, recorded_at")
    .eq("booking_id", bookingId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ lat: number; lng: number; recorded_at: string }>();
  if (!data) return null;
  return { lat: Number(data.lat), lng: Number(data.lng) };
}

async function destinationPoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  bookingId: string,
  sessionRow: {
    eta_destination_lng: number | null;
    eta_destination_lat: number | null;
  },
): Promise<Coord | null> {
  if (
    sessionRow.eta_destination_lng != null &&
    sessionRow.eta_destination_lat != null
  ) {
    return {
      lng: Number(sessionRow.eta_destination_lng),
      lat: Number(sessionRow.eta_destination_lat),
    };
  }
  // Read the booking's service_point geometry via the
  // `booking_service_point_lnglat` RPC (declared in
  // 20260509_tracker_v2.sql). Returns 0 rows if service_point is null.
  const { data } = await admin
    .rpc("booking_service_point_lnglat", { p_booking_id: bookingId })
    .returns<{ lng: number; lat: number }[]>();
  const row = Array.isArray(data) ? data[0] : null;
  if (row && Number.isFinite(row.lng) && Number.isFinite(row.lat)) {
    return { lng: Number(row.lng), lat: Number(row.lat) };
  }
  return null;
}

// formatEta moved to ./eta-format so client components can import it
// without pulling in the server-only fetch helpers above.
export { formatEta } from "./eta-format";
