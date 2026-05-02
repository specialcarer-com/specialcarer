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
