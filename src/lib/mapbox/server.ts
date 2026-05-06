/**
 * Mapbox adapter (server-side helpers).
 *
 * Stub mode (when MAPBOX_PUBLIC_TOKEN is missing or starts with "stub_") returns
 * deterministic fake responses so the integration is testable end-to-end before
 * real Mapbox credentials arrive.
 *
 * Env:
 *   MAPBOX_PUBLIC_TOKEN     (pk.* — used both client-side for map rendering and
 *                            server-side for geocoding. Mapbox no longer requires
 *                            a secret token for geocoding/search.)
 *   MAPBOX_SECRET_TOKEN     (sk.*, optional — only needed for admin APIs like
 *                            uploads, tilesets, downloads. Not needed for tracking.)
 *   MAPBOX_STYLE            (default 'mapbox://styles/mapbox/streets-v12')
 *
 * Docs: https://docs.mapbox.com/
 */

const publicToken = process.env.MAPBOX_PUBLIC_TOKEN || "";
const secretToken = process.env.MAPBOX_SECRET_TOKEN || "";
const style = process.env.MAPBOX_STYLE || "mapbox://styles/mapbox/streets-v12";

export function isStubMode(): boolean {
  return !publicToken || publicToken.startsWith("stub_");
}

export function getPublicToken(): string {
  // Safe to expose. Returns "" if not configured — client falls back to a static map.
  return publicToken;
}

export function getStyle(): string {
  return style;
}

export type ReverseGeocodeResult = {
  place_name: string;
  city?: string;
  country?: string;
};

/**
 * Reverse-geocode a lat/lng to a human-readable address.
 * Used for "Caregiver is near {place}" labels in the seeker UI.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  if (isStubMode()) {
    return {
      place_name: `Stubbed location near ${lat.toFixed(3)}, ${lng.toFixed(3)}`,
      city: "Stubville",
      country: "GB",
    };
  }
  // Mapbox supports geocoding with public tokens — no secret needed.
  const token = publicToken || secretToken;
  if (!token) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&types=address,place&limit=1`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        place_name?: string;
        context?: Array<{ id?: string; text?: string }>;
      }>;
    };
    const f = data.features?.[0];
    if (!f) return null;
    const ctx = f.context || [];
    const city = ctx.find((c) => (c.id || "").startsWith("place"))?.text;
    const country = ctx.find((c) => (c.id || "").startsWith("country"))?.text;
    return { place_name: f.place_name || "", city, country };
  } catch {
    return null;
  }
}

export type GeocodeResult = {
  lat: number;
  lng: number;
  city?: string;
  region?: string;
  country?: string; // ISO short code (e.g. "gb", "us") if Mapbox returns it
  place_name?: string;
};

// In-process cache for geocoded postcodes. Postcodes are stable, so this
// is safe to keep alive for the lifetime of a serverless instance.
const postcodeCache = new Map<string, GeocodeResult | null>();
const POSTCODE_CACHE_LIMIT = 500;

function cacheKey(postcode: string, country?: "GB" | "US" | null): string {
  return `${(country ?? "GB").toUpperCase()}:${postcode.trim().toUpperCase()}`;
}

/**
 * Geocode a UK postcode or US ZIP to lat/lng + admin context.
 *
 * Uses the country-scoped Mapbox endpoint so an outward-code-only postcode
 * like "SW1A" still resolves to the right area rather than colliding with
 * a foreign place name. Stub mode returns deterministic offsets so dev
 * environments behave the same as production.
 */
export async function geocodePostcode(
  postcode: string,
  country: "GB" | "US" | null = "GB",
): Promise<GeocodeResult | null> {
  if (!postcode || !postcode.trim()) return null;
  const ckey = cacheKey(postcode, country);
  if (postcodeCache.has(ckey)) return postcodeCache.get(ckey)!;

  if (isStubMode()) {
    // Map a few well-known postcodes deterministically; otherwise return a
    // small jitter around London/NYC so the UI stays clickable.
    const sample: Record<string, { lat: number; lng: number; city: string }> = {
      "GB:SW1A 1AA": { lat: 51.5014, lng: -0.1419, city: "London" },
      "GB:M1 1AE":   { lat: 53.4794, lng: -2.2453, city: "Manchester" },
      "GB:B1 1AA":   { lat: 52.4814, lng: -1.8998, city: "Birmingham" },
      "US:10001":    { lat: 40.7506, lng: -73.9971, city: "New York" },
      "US:90001":    { lat: 33.9731, lng: -118.2479, city: "Los Angeles" },
    };
    const hit = sample[ckey];
    const fallbackBase = country === "US"
      ? { lat: 40.7128, lng: -74.0060 }
      : { lat: 51.5074, lng: -0.1276 };
    const result: GeocodeResult = hit
      ? { ...hit, country: country?.toLowerCase() }
      : {
          lat: fallbackBase.lat + (Math.random() - 0.5) * 0.05,
          lng: fallbackBase.lng + (Math.random() - 0.5) * 0.05,
          city: country === "US" ? "New York" : "London",
          country: country?.toLowerCase(),
        };
    cachePut(ckey, result);
    return result;
  }

  const token = publicToken || secretToken;
  if (!token) return null;

  // Mapbox postcode lookups: types=postcode,locality so we get area centroids
  // rather than random street-level matches. country= filter removes the
  // "SW1A in another country" risk for partial UK codes.
  const cc = country?.toLowerCase() === "us" ? "us" : "gb";
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    postcode.trim(),
  )}.json?access_token=${encodeURIComponent(
    token,
  )}&country=${cc}&types=postcode,locality,place&limit=1&autocomplete=false`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      cachePut(ckey, null);
      return null;
    }
    const data = (await res.json()) as {
      features?: Array<{
        center?: [number, number];
        place_name?: string;
        context?: Array<{ id?: string; text?: string; short_code?: string }>;
      }>;
    };
    const f = data.features?.[0];
    if (!f || !f.center) {
      cachePut(ckey, null);
      return null;
    }
    const [lng, lat] = f.center;
    if (!isValidCoord(lat, lng)) {
      cachePut(ckey, null);
      return null;
    }
    const ctx = f.context || [];
    const city =
      ctx.find((c) => (c.id || "").startsWith("place"))?.text ??
      ctx.find((c) => (c.id || "").startsWith("locality"))?.text;
    const region = ctx.find((c) => (c.id || "").startsWith("region"))?.text;
    const ctry =
      ctx.find((c) => (c.id || "").startsWith("country"))?.short_code ?? cc;
    const result: GeocodeResult = {
      lat,
      lng,
      city,
      region,
      country: ctry,
      place_name: f.place_name,
    };
    cachePut(ckey, result);
    return result;
  } catch {
    cachePut(ckey, null);
    return null;
  }
}

function cachePut(key: string, value: GeocodeResult | null) {
  if (postcodeCache.size >= POSTCODE_CACHE_LIMIT) {
    // Drop the oldest entry — Map preserves insertion order.
    const first = postcodeCache.keys().next().value;
    if (first) postcodeCache.delete(first);
  }
  postcodeCache.set(key, value);
}

/**
 * Validate that a lat/lng is plausible (not 0/0, not out of range).
 */
export function isValidCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}
