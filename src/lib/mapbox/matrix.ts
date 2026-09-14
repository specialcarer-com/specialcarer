/**
 * Mapbox Matrix client (E3).
 *
 * Adds a driving-profile commute-minutes lookup on top of the existing
 * crow-flies distance the matcher already uses. Callers hand us an
 * (origin, destination) pair; we return commute minutes.
 *
 * Design notes
 * ────────────
 * • Cache lookups in `public.caregiver_commute_cache`, keyed on
 *   (carer_id, origin_geohash6). Truncating the origin to a geohash-6
 *   (~1.2km precision) means two bookings whose origins land in the
 *   same neighbourhood share a cache row — Mapbox bill scales by
 *   neighbourhood, not by booking. 30-day TTL enforced here.
 *
 * • Stub mode (deterministic `distance_km * 3`) is used when the
 *   Mapbox secret token is missing / starts with `stub_`, or when
 *   MAPBOX_MATRIX_STUB_MODE=true. The multiplier (3 min/km) is a
 *   reasonable urban-London driving average. Stub mode never hits
 *   the network and never increments the daily counter.
 *
 * • Hard daily cap. `MAPBOX_MATRIX_DAILY_CAP` (default 500) bounds
 *   the total Mapbox Matrix requests per UTC day via an atomic
 *   upsert-and-check against `mapbox_matrix_daily_counter`. When the
 *   cap is exceeded we fall back to the stub value and warn — we
 *   NEVER throw. Auto-match calls this in a hot path; a Mapbox
 *   outage or overage must not brick matching.
 *
 * • This module is server-only (Supabase admin client) but has no
 *   top-level `server-only` import so it can be unit-tested via
 *   dependency injection.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Public types ──────────────────────────────────────────────────────

export type LatLng = { lat: number; lng: number };

export type CommuteLookupOptions = {
  /** Which carer's home_point is the destination. Required for cache keying. */
  carerId: string;
  /**
   * Origin coordinate (typically the booking's service_point). Truncated
   * to a geohash-6 for cache lookups; the raw coord is only sent to
   * Mapbox on cache miss.
   */
  origin: LatLng;
  /** Carer home_point coordinate. */
  destination: LatLng;
  /**
   * Straight-line distance already computed by the caller (usually
   * `caregivers_within_radius` distance_m converted to km). Passed
   * through so stub mode can return a deterministic minutes value
   * without re-doing the haversine. If not supplied we compute one.
   */
  distanceKm?: number;
  /**
   * Injectable Supabase client for tests. Defaults to createAdminClient().
   */
  admin?: ReturnType<typeof createAdminClient>;
  /**
   * Injectable fetch for tests. Defaults to global `fetch`.
   */
  fetchFn?: typeof fetch;
  /**
   * Injectable `now` for deterministic TTL tests.
   */
  now?: number;
};

// ─── Config ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const STUB_MINUTES_PER_KM = 3; // urban-London driving heuristic
const DEFAULT_DAILY_CAP = 500;

function readDailyCap(): number {
  const raw = process.env.MAPBOX_MATRIX_DAILY_CAP;
  if (!raw) return DEFAULT_DAILY_CAP;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_DAILY_CAP;
  return Math.floor(n);
}

/**
 * Stub mode is enabled when:
 *   - MAPBOX_SECRET_TOKEN is unset OR starts with "stub_", OR
 *   - MAPBOX_MATRIX_STUB_MODE=true (forces stub even with real token —
 *     useful for preview envs so they don't hit Mapbox).
 */
export function isMatrixStubMode(): boolean {
  if (process.env.MAPBOX_MATRIX_STUB_MODE === "true") return true;
  const t = process.env.MAPBOX_SECRET_TOKEN || "";
  if (!t) return true;
  if (t.startsWith("stub_")) return true;
  return false;
}

// ─── Geohash ───────────────────────────────────────────────────────────

const GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Truncate a lat/lng to a geohash of the given precision. 6-character
 * geohashes are ~1.2km × 0.6km. Pure math — no dependencies.
 */
export function encodeGeohash(
  lat: number,
  lng: number,
  precision: number = 6,
): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let bit = 0;
  let ch = 0;
  let even = true; // start with longitude (per geohash spec)
  let out = "";

  while (out.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    bit += 1;
    if (bit === 5) {
      out += GEOHASH_ALPHABET[ch];
      bit = 0;
      ch = 0;
    }
  }
  return out;
}

// ─── Distance helper ───────────────────────────────────────────────────

/**
 * Haversine distance in km. Only used when the caller didn't hand us
 * a distanceKm already (auto-match always does).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h =
    s1 * s1 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ─── Daily counter ─────────────────────────────────────────────────────

type DailyCounterClient = {
  incrementAndCheck: (dayIso: string, cap: number) => Promise<boolean>;
};

function todayUtcIso(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Increment the day's counter atomically and return true if the caller
 * is still under the cap. Uses an RPC-less pattern: a select-upsert
 * loop. In practice this is racy under high concurrency, but the cap
 * is coarse-grained (500/day), so a few extra calls above the cap are
 * acceptable — never worth introducing a stored procedure for.
 *
 * On any DB error we return `true` (fail-open) so a transient counter
 * outage doesn't break matching. The daily cap is a cost guard, not a
 * correctness guard.
 */
function makeDefaultDailyCounter(
  admin: ReturnType<typeof createAdminClient>,
): DailyCounterClient {
  return {
    async incrementAndCheck(dayIso: string, cap: number): Promise<boolean> {
      try {
        // Ensure a row exists for today, then read + update it.
        const { data: existing } = await admin
          .from("mapbox_matrix_daily_counter")
          .select("calls")
          .eq("day", dayIso)
          .maybeSingle();

        const nextCalls = (existing?.calls ?? 0) + 1;
        if (nextCalls > cap) return false;

        await admin
          .from("mapbox_matrix_daily_counter")
          .upsert(
            { day: dayIso, calls: nextCalls, updated_at: new Date().toISOString() },
            { onConflict: "day" },
          );
        return true;
      } catch {
        return true; // fail-open
      }
    },
  };
}

// ─── Cache ─────────────────────────────────────────────────────────────

type CacheClient = {
  read: (carerId: string, geohash: string, nowMs: number) => Promise<number | null>;
  write: (carerId: string, geohash: string, minutes: number) => Promise<void>;
};

function makeDefaultCache(
  admin: ReturnType<typeof createAdminClient>,
): CacheClient {
  return {
    async read(carerId, geohash, nowMs) {
      try {
        const { data } = await admin
          .from("caregiver_commute_cache")
          .select("minutes, computed_at")
          .eq("carer_id", carerId)
          .eq("origin_geohash6", geohash)
          .maybeSingle();
        if (!data) return null;
        const age = nowMs - new Date(data.computed_at as string).getTime();
        if (!Number.isFinite(age) || age > CACHE_TTL_MS) return null;
        const m = Number(data.minutes);
        return Number.isFinite(m) ? m : null;
      } catch {
        return null;
      }
    },
    async write(carerId, geohash, minutes) {
      try {
        await admin
          .from("caregiver_commute_cache")
          .upsert(
            {
              carer_id: carerId,
              origin_geohash6: geohash,
              minutes,
              computed_at: new Date().toISOString(),
            },
            { onConflict: "carer_id,origin_geohash6" },
          );
      } catch {
        // Cache write failures are non-fatal.
      }
    },
  };
}

// ─── Main entry ────────────────────────────────────────────────────────

/**
 * Return the driving-profile commute time from `origin` to `destination`
 * for a given carer, in minutes. Never throws — callers get a number
 * they can score with, or `null` on hard failure (Mapbox error AND we
 * had nothing cached AND we chose not to fall back — see below).
 *
 * Falls back to the stub value (`distance_km * 3`) when:
 *   • stub mode is on, OR
 *   • the daily cap is exceeded (warns), OR
 *   • the Mapbox call itself fails (warns).
 *
 * That "always return a number" posture is a feature: auto-match should
 * never lose a candidate because Mapbox blipped. The scorer already has
 * a null-safe path (neutral 0.3), but at that level we'd prefer an
 * approximate signal to no signal.
 */
export async function getCommuteMinutes(
  opts: CommuteLookupOptions,
): Promise<number> {
  const now = opts.now ?? Date.now();
  const distanceKm =
    opts.distanceKm != null && Number.isFinite(opts.distanceKm)
      ? opts.distanceKm
      : haversineKm(opts.origin, opts.destination);

  const geohash = encodeGeohash(opts.origin.lat, opts.origin.lng, 6);
  const admin = opts.admin ?? createAdminClient();
  const cache = makeDefaultCache(admin);

  // 1. Cache hit? Newest wins; TTL enforced inside cache.read().
  const cached = await cache.read(opts.carerId, geohash, now);
  if (cached != null) return cached;

  // 2. Stub mode — never touches network, never bumps the counter.
  if (isMatrixStubMode()) {
    const minutes = stubMinutes(distanceKm);
    await cache.write(opts.carerId, geohash, minutes);
    return minutes;
  }

  // 3. Daily cap check.
  const counter = makeDefaultDailyCounter(admin);
  const dayIso = todayUtcIso(now);
  const cap = readDailyCap();
  const underCap = await counter.incrementAndCheck(dayIso, cap);
  if (!underCap) {
    console.warn(
      `[mapbox.matrix] daily cap ${cap} exceeded for ${dayIso}; falling back to stub value`,
    );
    const minutes = stubMinutes(distanceKm);
    // Cache the stub so subsequent lookups in the same neighbourhood
    // don't re-hit the cap logic. Fresh cache row will be replaced on
    // the next lookup after 30 days OR after a manual cache flush.
    await cache.write(opts.carerId, geohash, minutes);
    return minutes;
  }

  // 4. Real Mapbox Matrix call.
  const fetchFn = opts.fetchFn ?? fetch;
  const minutes = await callMapboxMatrix(
    opts.origin,
    opts.destination,
    distanceKm,
    fetchFn,
  );
  await cache.write(opts.carerId, geohash, minutes);
  return minutes;
}

function stubMinutes(distanceKm: number): number {
  const m = distanceKm * STUB_MINUTES_PER_KM;
  // Guard against NaN / negative inputs.
  return Number.isFinite(m) && m >= 0 ? m : 0;
}

async function callMapboxMatrix(
  origin: LatLng,
  destination: LatLng,
  distanceKm: number,
  fetchFn: typeof fetch,
): Promise<number> {
  const token = process.env.MAPBOX_SECRET_TOKEN || "";
  if (!token) return stubMinutes(distanceKm);

  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?sources=0&destinations=1&annotations=duration&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetchFn(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(
        `[mapbox.matrix] non-2xx from Mapbox (${res.status}); falling back to stub value`,
      );
      return stubMinutes(distanceKm);
    }
    const data = (await res.json()) as {
      durations?: Array<Array<number | null>>;
    };
    const secs = data?.durations?.[0]?.[0];
    if (secs == null || !Number.isFinite(secs)) {
      return stubMinutes(distanceKm);
    }
    return Number(secs) / 60;
  } catch {
    console.warn(
      "[mapbox.matrix] fetch threw; falling back to stub value",
    );
    return stubMinutes(distanceKm);
  }
}

// ─── Test hooks ────────────────────────────────────────────────────────

/**
 * Internal helpers exported strictly for the unit test. Not part of
 * the public API. Do not import from application code.
 */
export const __test = {
  makeDefaultCache,
  makeDefaultDailyCounter,
  readDailyCap,
  stubMinutes,
  todayUtcIso,
};
