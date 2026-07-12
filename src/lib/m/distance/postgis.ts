/**
 * PostGIS-backed carer radius search (PR-R3).
 *
 * Wraps the `carers_within_radius(p_lat, p_lng, p_meters)` RPC
 * (supabase/migrations/20260617140000_mobile_redesign_r3_distance_postgis.sql),
 * which returns published caregiver_profiles rows whose generated `home_geog`
 * lies within p_meters of the origin, ordered nearest-first by ST_Distance.
 *
 * The RPC's return type is `SETOF caregiver_profiles`, so it cannot itself
 * carry a synthetic distance column. We attach `distance_m` per row here using
 * the same spherical-earth metric PostGIS `ST_Distance(geography)` uses
 * (haversine on the row's home_lat/home_lng), then keep the DB's nearest-first
 * ordering (re-sorted defensively).
 *
 * Flag-aware at the boundary: when NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED is off,
 * `getCarersWithinRadius` returns null so call sites keep using the existing JS
 * haversine path unchanged. When on, it runs the PostGIS path. Call sites
 * therefore branch on a null result rather than reading the flag themselves.
 */

import { isMobileRedesignEnabled } from "@/lib/mobile-redesign/flag";

/** A caregiver_profiles row with its great-circle distance from the origin. */
export type CarerWithDistance = {
  user_id: string;
  home_lat: number | null;
  home_lng: number | null;
  distance_m: number;
  // Pass-through of the rest of the profile row; callers select what they need.
  [key: string]: unknown;
};

type RpcRow = {
  user_id: string;
  home_lat?: number | null;
  home_lng?: number | null;
  [key: string]: unknown;
};

/** Minimal Supabase surface we touch — lets unit tests stub the RPC. */
export type RadiusRpcClient = {
  rpc(
    fn: "carers_within_radius",
    args: { p_lat: number; p_lng: number; p_meters: number },
  ): Promise<{ data: RpcRow[] | null; error: { message: string } | null }>;
};

const EARTH_RADIUS_M = 6371008.8; // mean Earth radius (metres), PostGIS sphere

/** Metres between two WGS84 points (haversine), matching ST_Distance(geography). */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type GetCarersWithinRadiusArgs = {
  client: RadiusRpcClient;
  lat: number;
  lng: number;
  meters: number;
};

/**
 * Returns carers within `meters` of (lat, lng), nearest-first, each tagged with
 * `distance_m`. Returns null when the redesign flag is off (caller falls back
 * to the JS haversine path). Throws on RPC error so callers surface failures.
 */
export async function getCarersWithinRadius({
  client,
  lat,
  lng,
  meters,
}: GetCarersWithinRadiusArgs): Promise<CarerWithDistance[] | null> {
  if (!isMobileRedesignEnabled()) return null;

  const { data, error } = await client.rpc("carers_within_radius", {
    p_lat: lat,
    p_lng: lng,
    p_meters: meters,
  });
  if (error) {
    throw new Error(`carers_within_radius failed: ${error.message}`);
  }

  const rows = data ?? [];
  const withDistance: CarerWithDistance[] = rows.map((r) => {
    const rLat = r.home_lat == null ? null : Number(r.home_lat);
    const rLng = r.home_lng == null ? null : Number(r.home_lng);
    const distance_m =
      rLat != null &&
      rLng != null &&
      Number.isFinite(rLat) &&
      Number.isFinite(rLng)
        ? haversineMeters(lat, lng, rLat, rLng)
        : Number.POSITIVE_INFINITY;
    return { ...r, home_lat: rLat, home_lng: rLng, distance_m };
  });

  // The RPC already orders nearest-first; re-sort defensively so distance_m and
  // ordering are always consistent regardless of RPC guarantees.
  withDistance.sort((a, b) => a.distance_m - b.distance_m);
  return withDistance;
}
